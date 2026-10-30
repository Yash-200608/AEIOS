import { useEffect, useMemo, useState } from 'react';
import { CircleMarker, MapContainer, Polyline, TileLayer, Tooltip } from 'react-leaflet';
import type { SiteId } from '../lib/api';
import { SmokeAlertHistory } from './SmokeAlerts';
import { supabase } from '../lib/supabase';
import {
  backTrajectory, bearing, fetchWindGrid, km, LEVELS, MATCH, matchFires,
  type Fire, type FireMatch, type PathPoint, type WindGrid,
} from '../lib/trajectory';

const FIRES_URL = 'https://xqsuuhgakodtlpcyletx.supabase.co/functions/v1/fires?hours=72';
const AIR_URL = 'https://air-quality-api.open-meteo.com/v1/air-quality';
const SITES: Record<SiteId, { name: string; lat: number; lon: number }> = {
  sgt: { name: 'SGT University', lat: 28.4782417, lon: 76.9040528 },
  chandu: { name: 'Chandu village', lat: 28.475, lon: 76.9167 },
};
const HOUR = 3600000;

const ist = (t: number, withDay = true) => new Date(t).toLocaleString('en-IN', {
  timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', ...(withDay ? { day: 'numeric', month: 'short' } : {}),
});

type Arrival = { node: { pm2_5: number | null; node: string; t: string } | null; cams: number | null };

export default function SmokeTracerPanel({ site }: { site: SiteId }) {
  const [grid, setGrid] = useState<WindGrid | null>(null);
  const [fires, setFires] = useState<Fire[] | null>(null);
  const [error, setError] = useState('');
  const [hoursAgo, setHoursAgo] = useState(0);
  const [duration, setDuration] = useState(24);
  const [arrivalPm, setArrivalPm] = useState<Arrival | null>(null);
  const s = SITES[site];

  useEffect(() => {
    let alive = true;
    fetchWindGrid().then((g) => alive && setGrid(g)).catch((e) => alive && setError(String(e.message || e)));
    fetch(FIRES_URL).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`Fire data HTTP ${r.status}`))))
      .then((d) => alive && setFires(d.fires)).catch((e) => alive && setError(String(e.message || e)));
    return () => { alive = false; };
  }, []);

  const arrival = Math.floor((Date.now() - hoursAgo * HOUR) / HOUR) * HOUR;

  const results = useMemo(() => {
    if (!grid || !fires) return null;
    return LEVELS.map((l) => {
      const path = backTrajectory(grid, l.key, s.lat, s.lon, arrival, duration);
      const matches = matchFires(path, fires, arrival);
      return { level: l, path, matches };
    });
  }, [grid, fires, arrival, duration, s.lat, s.lon]);

  const windowFires = useMemo(() => (fires || []).filter((f) => {
    const t = Date.parse(f.t);
    return t >= arrival - (duration + MATCH.beforeH) * HOUR && t <= arrival;
  }), [fires, arrival, duration]);

  const matchedKeys = useMemo(() => new Set((results || []).flatMap((r) => r.matches.map((m) => `${m.fire.lat},${m.fire.lon},${m.fire.t}`))), [results]);
  const allMatches = useMemo(() => {
    const seen = new Map<string, FireMatch>();
    for (const r of results || []) for (const m of r.matches) seen.set(`${m.fire.lat},${m.fire.lon},${m.fire.t}`, m);
    return [...seen.values()];
  }, [results]);

  // What was measured or modelled at the site when the air arrived.
  useEffect(() => {
    let alive = true;
    setArrivalPm(null);
    const from = new Date(arrival - 1.5 * HOUR).toISOString(), to = new Date(arrival + 1.5 * HOUR).toISOString();
    const node = supabase.from('packets').select('node,rx_utc,pm2_5').gte('rx_utc', from).lte('rx_utc', to).gte('pm2_5', 0)
      .then(({ data }) => {
        const best = (data || []).sort((a, b) => Math.abs(Date.parse(a.rx_utc) - arrival) - Math.abs(Date.parse(b.rx_utc) - arrival))[0];
        return best ? { pm2_5: best.pm2_5, node: best.node, t: best.rx_utc } : null;
      });
    const cams = fetch(`${AIR_URL}?latitude=${s.lat}&longitude=${s.lon}&hourly=pm2_5&past_days=3&forecast_days=1&timezone=GMT`)
      .then((r) => r.json()).then((d) => {
        const i = (d.hourly?.time || []).findIndex((t: string) => Date.parse(`${t}:00Z`) === arrival);
        return i >= 0 ? d.hourly.pm2_5[i] : null;
      }).catch(() => null);
    Promise.all([node, cams]).then(([n, c]) => alive && setArrivalPm({ node: n, cams: c }));
    return () => { alive = false; };
  }, [arrival, s.lat, s.lon]);

  // When the satellites actually look: detections per hour of the day (IST) over the last 72 h.
  const byHour = useMemo(() => {
    const counts = new Array(24).fill(0);
    for (const f of fires || []) counts[(new Date(Date.parse(f.t) + 5.5 * HOUR).getUTCHours())] += 1;
    return counts;
  }, [fires]);
  const maxHour = Math.max(1, ...byHour);
  const blindHours = byHour.filter((c) => c === 0).length;

  const loading = !error && (!grid || !fires);

  return (
    <section id="smoke" className="page-section">
      <div className="section-title">
        <div><div className="eyebrow">SMOKE ORIGIN · BACK-TRAJECTORIES × NASA FIRES</div><h2>Where did this air come from?</h2></div>
        <span className="source-badge">OPEN-METEO WINDS · NASA FIRMS</span>
      </div>
      <div className="panel">
        <div className="sat-controls">
          <div className="range-field tracer-slider">
            <div><label htmlFor="arrival-range">AIR ARRIVING AT {s.name.toUpperCase()}</label><b>{ist(arrival)} IST{hoursAgo === 0 ? ' · now' : ` · ${hoursAgo} h ago`}</b></div>
            <input id="arrival-range" type="range" min={0} max={48} value={hoursAgo} onChange={(e) => setHoursAgo(Number(e.target.value))} />
          </div>
          <div className="sat-group" role="group" aria-label="Look-back period">
            {[12, 24].map((h) => <button key={h} className={duration === h ? 'active' : ''} onClick={() => setDuration(h)}>{h} h back</button>)}
          </div>
        </div>

        {error && <div className="aq-warning" style={{ marginTop: 10 }}>Could not load tracer data: {error}</div>}
        {loading && <div className="panel-subtitle" style={{ marginTop: 10 }}>Loading winds for 88 grid points and the latest NASA fire detections…</div>}

        <div className="tracer-layout">
          <MapContainer center={[29.3, 76.4]} zoom={7} minZoom={5} maxZoom={11} scrollWheelZoom={false} preferCanvas className="satellite-map tracer-map">
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · Fires: NASA FIRMS' />
            {windowFires.map((f, i) => {
              const hit = matchedKeys.has(`${f.lat},${f.lon},${f.t}`);
              return hit ? null : <CircleMarker key={i} center={[f.lat, f.lon]} radius={2} pathOptions={{ color: '#b0413e', weight: 0, fillOpacity: 0.55 }} />;
            })}
            {allMatches.map((m, i) => (
              <CircleMarker key={`m${i}`} center={[m.fire.lat, m.fire.lon]} radius={5} pathOptions={{ color: '#3b0d05', weight: 1, fillColor: '#ff7a1a', fillOpacity: 0.95 }}>
                <Tooltip>Fire seen {ist(Date.parse(m.fire.t))} IST · {m.fire.frp.toFixed(1)} MW · air passed {m.distKm.toFixed(0)} km away, {m.hoursBefore.toFixed(0)} h before arrival</Tooltip>
              </CircleMarker>
            ))}
            {(results || []).map((r) => (
              <Polyline key={r.level.key} positions={r.path.map((p: PathPoint) => [p.lat, p.lon] as [number, number])} pathOptions={{ color: r.level.color, weight: 3, opacity: 0.9 }} />
            ))}
            {(results || []).flatMap((r) => r.path.filter((_, i) => i > 0 && i % 36 === 0).map((p) => (
              <CircleMarker key={`${r.level.key}-${p.t}`} center={[p.lat, p.lon]} radius={3} pathOptions={{ color: r.level.color, fillColor: '#050505', fillOpacity: 1, weight: 2 }}>
                <Tooltip>{r.level.label} · {((arrival - p.t) / HOUR).toFixed(0)} h before arrival ({ist(p.t)} IST)</Tooltip>
              </CircleMarker>
            )))}
            <CircleMarker center={[s.lat, s.lon]} radius={7} pathOptions={{ color: '#ffffff', fillColor: '#00e5ff', fillOpacity: 1, weight: 2 }}>
              <Tooltip permanent direction="right">{s.name}</Tooltip>
            </CircleMarker>
          </MapContainer>

          <div className="tracer-side">
            {(results || []).map((r) => {
              const end = r.path[r.path.length - 1];
              const reached = (arrival - end.t) / HOUR;
              const frp = r.matches.reduce((a, m) => a + m.fire.frp, 0);
              const hrs = r.matches.map((m) => m.hoursBefore);
              return (
                <div className="tracer-card" key={r.level.key}>
                  <div className="tracer-card-head"><i style={{ background: r.level.color }} /> {r.level.label}</div>
                  <div className="tracer-origin">{km(s.lat, s.lon, end.lat, end.lon).toFixed(0)} km {bearing(s.lat, s.lon, end.lat, end.lon)}<small> {reached.toFixed(0)} h ago</small></div>
                  <div className="tracer-fires"><b>{r.matches.length}</b> fires on the path{r.matches.length ? ` · ${frp.toFixed(0)} MW` : ''}</div>
                  {r.matches.length > 0 && <em>Passed them {Math.min(...hrs).toFixed(0)}–{Math.max(...hrs).toFixed(0)} h before arriving</em>}
                  {reached < duration - 0.5 && <em>Left the wind grid early</em>}
                </div>
              );
            })}
            <div className="tracer-card">
              <div className="tracer-card-head">PM2.5 at arrival</div>
              {arrivalPm === null ? <em>Checking…</em> : (
                <>
                  <div className="tracer-fires">AEIOS node: <b>{arrivalPm.node ? `${Math.round(arrivalPm.node.pm2_5 ?? 0)} µg/m³` : 'no reading'}</b></div>
                  {arrivalPm.node && <em>{arrivalPm.node.node} · {ist(Date.parse(arrivalPm.node.t))} IST</em>}
                  <div className="tracer-fires">CAMS model: <b>{arrivalPm.cams === null ? '—' : `${Math.round(arrivalPm.cams)} µg/m³`}</b></div>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="tracer-blind">
          <div className="panel-subtitle">NASA fire detections by hour of day, IST (last 72 h, {(fires || []).length.toLocaleString('en-IN')} detections) · satellites see nothing in {blindHours} of 24 hours</div>
          <div className="hour-bars" aria-label="Fire detections per hour of day">
            {byHour.map((c, h) => (
              <div key={h} className="hour-bar" title={`${String(h).padStart(2, '0')}:00 IST · ${c} detections`}>
                <div style={{ height: `${c ? Math.max(6, (c / maxHour) * 100) : 0}%` }} className={c ? '' : 'empty'} /><span>{h % 3 === 0 ? h : ''}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="aq-note">
          Each line is a kinematic back-trajectory: the wind at that height (Open-Meteo, 1° grid, past 3 days) stepped backwards every 10 minutes from
          the site. It ignores vertical motion and turbulence, so read it as a corridor whose width grows to about 20% of the distance. A fire counts
          when the air passed within {MATCH.radiusKm} km of it between {MATCH.beforeH} h before and {MATCH.afterH} h after the satellite saw it. Fires burning
          outside the satellite passes are not in the data, so the true number is higher. A match shows the air passed over burning fields; it does
          not by itself prove how much of the PM came from them.
        </p>
      </div>
      <SmokeAlertHistory />
    </section>
  );
}
