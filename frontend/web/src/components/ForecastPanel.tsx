import { useEffect, useMemo, useState } from 'react';
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, Info } from 'lucide-react';
import { round } from '../lib/api';
import { ago } from '../lib/freshness';
import {
  FORECAST_STALE_MS, HORIZONS, STATION_DISTANCE_KM, featureLabel, isNodeForecast, latestByHorizon, useForecasts, type ForecastRow,
} from '../lib/forecasts';

const ist = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

// Forecasts of what the CPCB reference stations around Gurugram will read. They are NOT readings or forecasts for the AEIOS nodes:
// the model was trained on CPCB hourly PM2.5 and weather, and the input is always labelled with its source.
export default function ForecastPanel() {
  const { rows, error } = useForecasts();
  // AEIOS nodes come first (they are the main forecast); CPCB reference stations follow as the fallback, nearest first.
  const stations = useMemo(() => {
    const seen = new Map<number, string>();
    for (const r of rows || []) if (!seen.has(r.location_id)) seen.set(r.location_id, r.station);
    return [...seen.entries()].sort((a, b) => {
      const na = a[0] >= 900000, nb = b[0] >= 900000;
      if (na !== nb) return na ? -1 : 1;
      return na ? a[1].localeCompare(b[1]) : (STATION_DISTANCE_KM[a[0]] ?? 999) - (STATION_DISTANCE_KM[b[0]] ?? 999);
    });
  }, [rows]);
  const [sel, setSel] = useState<number | null>(null);
  const [driverH, setDriverH] = useState<number>(6);
  useEffect(() => { if (sel === null && stations.length) setSel(stations[0][0]); }, [stations, sel]);

  const byH = useMemo(() => (rows && sel !== null ? latestByHorizon(rows, sel) : new Map<number, ForecastRow>()), [rows, sel]);
  const first = byH.get(1) ?? [...byH.values()][0];
  const noInput = first?.source === 'no_input';
  const issued = first ? Date.parse(first.made_utc.includes('T') ? first.made_utc : first.made_utc.replace(' ', 'T') + 'Z') : NaN;
  const old = Number.isFinite(issued) && Date.now() - issued > FORECAST_STALE_MS;
  const node = first ? isNodeForecast(first) : false;
  const fallback = [...byH.values()].some((r) => r.source === 'fallback_persistence');
  const degraded = [...byH.values()].some((r) => (r.reason || '').includes('weather unavailable'));

  const chart = useMemo(() => {
    if (!first || noInput || first.pm_now === null) return [];
    const pts = [{ h: 0, base: first.pm_now, band: 0, q50: first.pm_now }];
    for (const h of HORIZONS) {
      const r = byH.get(h);
      if (r && r.q50 !== null) {
        const lo = r.q10 ?? r.q50; const hi = r.q90 ?? r.q50;
        pts.push({ h, base: lo, band: Math.max(0, hi - lo), q50: r.q50 });
      }
    }
    return pts;
  }, [byH, first, noInput]);

  const drivers = (byH.get(driverH)?.drivers || []).filter((d) => d.feature !== '(baseline)' && d.effect_pct !== null);
  const maxEff = Math.max(10, ...drivers.map((d) => Math.abs(d.effect_pct as number)));

  return (
    <section id="pm-forecast" className="page-section">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <div><div className="eyebrow">EDGE INTELLIGENCE · LOCAL FORECAST MODEL</div>
          <h2 style={{ margin: '4px 0 0' }}>PM2.5 forecast · next 24 hours</h2></div>
        {first && <span className={`status-chip ${!old && !noInput ? 'status-live' : ''}`}><span className="status-led" /> {noInput ? 'NO FRESH INPUT' : old ? 'FORECAST OLD' : 'FORECAST CURRENT'} · issued {ago(Number.isFinite(issued) ? new Date(issued).toISOString() : null)}</span>}
      </div>
      <div className="state-box state-info"><Info size={14} /><span>{node
        ? <><b>Forecast from this AEIOS node's own readings.</b> The Pi forecasts from the node's PM2.5 as it reports. The model was trained on CPCB reference stations, not on nodes, so these numbers are <b>not validated on node data</b> yet. Intervals are 80% bands from CPCB winters.</>
        : <><b>Forecast for a CPCB reference station, not for an AEIOS node.</b> This is the fallback picture: the model run on CPCB hourly PM2.5 around Gurugram. It is not a measurement. Intervals are 80% bands calibrated on past winters.</>}</span></div>
      {error && <div className="panel"><div className="panel-subtitle">Could not load forecasts: {error}</div></div>}
      {!error && rows && rows.length === 0 && (
        <div className="panel"><div className="panel-title">No forecasts yet</div>
          <div className="panel-subtitle">The gateway has not uploaded any forecast run. Nothing is simulated or filled in here.</div></div>
      )}
      {rows && rows.length > 0 && sel !== null && (
        <>
          <div className="fc-toolbar">
            <label className="fc-select">Station
              <select value={sel} onChange={(e) => setSel(Number(e.target.value))}>
                {stations.map(([id, name]) => <option key={id} value={id}>{id >= 900000 ? `AEIOS node · ${name}` : `CPCB fallback · ${name}${STATION_DISTANCE_KM[id] ? ` · ${STATION_DISTANCE_KM[id]} km from SGT` : ''}`}</option>)}
              </select>
            </label>
            <span className="source-badge">{node ? 'AEIOS_NODE_FORECAST' : 'CPCB_FALLBACK_FORECAST'} · {first?.model_version ?? 'no model'}</span>
          </div>
          {old && <div className="state-box state-warm" role="status"><AlertTriangle size={14} /><span><b>This forecast is old.</b> The newest run was issued {ago(new Date(issued).toISOString())}; the gateway normally issues one every hour. Treat it as history, not as a current forecast.</span></div>}
          {noInput && <div className="state-box state-warm" role="status"><AlertTriangle size={14} /><span><b>No forecast for this station.</b> {first?.reason || 'No fresh reading was available.'}</span></div>}
          {fallback && <div className="state-box state-warm" role="status"><AlertTriangle size={14} /><span><b>Model unavailable: showing "same as now".</b> The gateway could not load a verified model, so these numbers are just the latest reading repeated, with no uncertainty band.</span></div>}
          {degraded && <div className="state-box state-warm" role="status"><AlertTriangle size={14} /><span><b>Weather input was missing</b> for this run, so the forecast is less reliable and its band is wider than usual.</span></div>}
          {!noInput && chart.length > 1 && (
            <div className="panel">
              <div className="panel-header"><div><div className="panel-title">PM2.5 µg/m³ · median and 80% band</div>
                <div className="panel-subtitle">Input: {first?.input_source} · latest reading {first?.stale_h === 0 ? 'this hour' : `${first?.stale_h ?? '?'} h old`} · origin {ist(first?.origin_utc ?? null)} IST</div></div></div>
              <div className="chart-wrap" style={{ height: 260 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chart} margin={{ top: 12, right: 12, left: -12, bottom: 2 }}>
                    <CartesianGrid stroke="#443753" strokeDasharray="3 5" vertical={false} />
                    <XAxis dataKey="h" type="number" domain={[0, 24]} ticks={[0, 1, 3, 6, 12, 24]} tickFormatter={(v) => (v === 0 ? 'now' : `+${v} h`)} tick={{ fill: '#9c8baf', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#9c8baf', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <ChartTooltip contentStyle={{ background: '#100a17', border: '1px solid #473a57', borderRadius: 10, color: '#f1eff4' }}
                      formatter={(v: number, n: string) => [round(v, 0), n === 'base' ? 'Band start (q10)' : n === 'band' ? 'Band width' : 'Median']} labelFormatter={(v) => (v === 0 ? 'now' : `+${v} h`)} />
                    <Area dataKey="base" stackId="b" stroke="none" fill="transparent" isAnimationActive={false} />
                    <Area dataKey="band" stackId="b" stroke="none" fill="#00e5ff" fillOpacity={0.16} isAnimationActive={false} />
                    <Line dataKey="q50" stroke="#00e5ff" strokeWidth={2} dot={{ r: 3, fill: '#00e5ff' }} isAnimationActive={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
          <div className="panel" style={{ marginTop: 12 }}>
            <table className="aeios-table">
              <thead><tr><th>Ahead</th><th>For (IST)</th><th>Median</th><th>80% band</th><th>Kind</th></tr></thead>
              <tbody>
                {HORIZONS.map((h) => {
                  const r = byH.get(h);
                  if (!r) return <tr key={h}><td>+{h} h</td><td colSpan={4}>—</td></tr>;
                  return (
                    <tr key={h}><td>+{h} h</td><td>{ist(r.due_utc)}</td><td>{r.q50 !== null ? round(r.q50, 0) : '—'}</td>
                      <td>{r.q10 !== null && r.q90 !== null ? `${round(r.q10, 0)}–${round(r.q90, 0)}` : '—'}</td>
                      <td>{r.source === 'lightgbm_cqr' ? 'model' : r.source === 'fallback_persistence' ? 'same as now' : 'no input'}</td></tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {drivers.length > 0 && (
            <div className="panel" style={{ marginTop: 12 }}>
              <div className="panel-header"><div><div className="panel-title">Why this forecast</div>
                <div className="panel-subtitle">Largest effects on the +{driverH} h median (TreeSHAP; approximate % change). Bars show influence on the model, not cause in the atmosphere.</div></div>
                <div className="fc-pills">{HORIZONS.map((h) => <button key={h} className={h === driverH ? 'active' : ''} onClick={() => setDriverH(h)}>+{h} h</button>)}</div></div>
              <div className="fc-drivers">
                {drivers.map((d) => {
                  const e = d.effect_pct as number;
                  return (
                    <div className="fc-driver" key={d.feature}>
                      <span className="fc-driver-name">{featureLabel(d.feature)}{d.value !== null ? <small> {round(d.value, 1)}</small> : null}</span>
                      <span className="fc-bar"><i className={e >= 0 ? 'up' : 'down'} style={{ width: `${Math.min(100, (Math.abs(e) / maxEff) * 100)}%` }} /></span>
                      <span className="fc-driver-val">{e >= 0 ? '+' : ''}{round(e, 0)}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          <div className="panel-subtitle" style={{ marginTop: 8 }}>Weather input: {first?.weather_source ?? '—'} · interval method: {first?.interval ?? '—'}</div>
        </>
      )}
    </section>
  );
}
