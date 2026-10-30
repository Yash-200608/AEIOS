import { useEffect, useState } from 'react';
import { AlertTriangle, Flame } from 'lucide-react';
import { supabase } from '../lib/supabase';

type Alert = {
  id: number; utc: string; site: string; level: 'WATCH' | 'WARNING'; hours_ahead: number | null; fires: number | null; frp_mw: number | null;
  origin_km: number | null; origin_dir: string | null; height: string | null; local_pm25: number | null; stale_h: number | null; message: string | null;
};

const SITE_NAME: Record<string, string> = { SGT: 'SGT University', CHANDU: 'Chandu village' };
const BANNER_HOURS = 12;

const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const isTest = (a: Alert) => (a.message || '').startsWith('TEST ROW');

// Local development only (`?preview&mockalerts`): sample rows to check the layout. Removed from production builds.
const MOCK: Alert[] = import.meta.env.DEV ? [
  { id: 2, utc: new Date(Date.now() - 40 * 60000).toISOString(), site: 'SGT', level: 'WARNING', hours_ahead: 0, fires: 6, frp_mw: 28.3, origin_km: 128, origin_dir: 'NE', height: '~350 m (950 hPa)', local_pm25: 120, stale_h: 0,
    message: 'WARNING: air reaching SGT University now at ~350 m (950 hPa) passed 6 fires (28.3 MW) 14+ h earlier; it came from 128 km NE. Local PM2.5 120 ug/m3 (N1, 10 min ago).' },
  { id: 1, utc: new Date(Date.now() - 5 * 3600000).toISOString(), site: 'CHANDU', level: 'WATCH', hours_ahead: 2, fires: 7, frp_mw: 27, origin_km: 151, origin_dir: 'E', height: '~120 m', local_pm25: null, stale_h: 6,
    message: 'WATCH: example' },
] : [];
const mock = import.meta.env.DEV && new URLSearchParams(window.location.search).has('mockalerts');

function useAlerts() {
  const [alerts, setAlerts] = useState<Alert[] | null>(mock ? MOCK : null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (mock) return;
    let alive = true;
    const load = () => supabase.from('smoke_alerts').select('*').order('utc', { ascending: false }).limit(30)
      .then(({ data, error: e }) => { if (!alive) return; if (e) setError(e.message); else { setAlerts((data || []) as Alert[]); setError(''); } });
    load();
    const t = setInterval(load, 60000);
    return () => { alive = false; clearInterval(t); };
  }, []);
  return { alerts, error };
}

/** Top-of-page banner: shown only while a WATCH or WARNING raised by the Pi in the last 12 hours is on record. */
export function SmokeBanner() {
  const { alerts } = useAlerts();
  const recent = (alerts || []).filter((a) => !isTest(a) && Date.now() - Date.parse(a.utc) < BANNER_HOURS * 3600000);
  if (!recent.length) return null;
  const worst = recent.find((a) => a.level === 'WARNING') || recent[0];
  const sites = [...new Set(recent.map((a) => SITE_NAME[a.site] || a.site))].join(' and ');
  return (
    <div className={`smoke-banner smoke-${worst.level.toLowerCase()}`} role="alert">
      <AlertTriangle size={16} />
      <div>
        <b>{worst.level} · smoke-influenced air at {sites}</b>
        <span>{worst.message} <em>Raised by the AEIOS gateway at {when(worst.utc)} IST.</em></span>
      </div>
      <a href="#smoke" onClick={(e) => { e.preventDefault(); document.getElementById('smoke')?.scrollIntoView({ behavior: 'smooth' }); }}>See origin</a>
    </div>
  );
}

/** History of alerts the Pi has raised. */
export function SmokeAlertHistory() {
  const { alerts, error } = useAlerts();
  const rows = (alerts || []).filter((a) => !isTest(a));
  return (
    <div className="panel" style={{ marginTop: 12 }}>
      <div className="panel-header">
        <div><div className="panel-title"><Flame size={13} style={{ verticalAlign: '-2px' }} /> Alerts raised by the gateway</div>
          <div className="panel-subtitle">Computed on the Raspberry Pi every 10 minutes, also while the internet is down; uploaded when the link returns</div></div>
        <span className="source-badge">AEIOS EDGE</span>
      </div>
      {error && <div className="aq-warning">Could not load alerts: {error}</div>}
      {!error && alerts && rows.length === 0 && (
        <div className="panel-subtitle" style={{ marginTop: 10 }}>No alerts yet. A WATCH needs air that passed 5 or more fires (or 10 MW); a WARNING needs 20 fires (or 50 MW), or a WATCH with node PM2.5 above 90 µg/m³.</div>
      )}
      {rows.length > 0 && (
        <div className="smoke-history">
          {rows.map((a) => (
            <div key={a.id} className={`smoke-row smoke-${a.level.toLowerCase()}`}>
              <span className="smoke-pill">{a.level}</span>
              <div>
                <b>{SITE_NAME[a.site] || a.site} · {when(a.utc)} IST</b>
                <small>{a.fires} fires · {a.frp_mw} MW at {a.height} · from {a.origin_km} km {a.origin_dir}{a.hours_ahead ? ` · expected in ${a.hours_ahead} h` : ''}
                  {a.local_pm25 !== null ? ` · node PM2.5 ${Math.round(a.local_pm25)} µg/m³` : ''}{a.stale_h && a.stale_h > 3 ? ` · data ${Math.round(a.stale_h)} h old` : ''}</small>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
