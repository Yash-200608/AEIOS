import { AlertTriangle, CheckCircle2, CircleHelp, Clock, ShieldAlert } from 'lucide-react';
import { ago, siteReading, useAeios } from '../lib/freshness';
import { useAlerts } from './SmokeAlerts';
import { dispersionClass, inversion, meanLowWind, ventilation } from '../lib/derived';
import { round } from '../lib/api';

type Hourly = Record<string, any[]>;
const SITE_CODE: Record<string, string> = { sgt: 'SGT', chandu: 'CHANDU' };
const TONE_ICON = { good: CheckCircle2, fair: AlertTriangle, poor: ShieldAlert } as const;

/** First-screen decision: dispersion verdict, local PM2.5 evidence and alert state, each with its own provenance. */
export default function SiteStatus({ site, siteTitle, hourly, index }: { site: string; siteTitle: string; hourly: Hourly; index: number }) {
  const { data } = useAeios();
  const { alerts } = useAlerts();
  const vc = ventilation(hourly, index);
  const wind = meanLowWind(hourly, index);
  const inv = inversion(hourly, index);
  const cls = dispersionClass(vc, wind, inv);
  const Icon = TONE_ICON[cls.tone];
  const reading = siteReading(data, site);
  const siteAlerts = (alerts || []).filter((a) => a.site === SITE_CODE[site] && !(a.message || '').startsWith('TEST ROW') && Date.now() - Date.parse(a.utc) < 12 * 3600000);
  const worst = siteAlerts.find((a) => a.level === 'WARNING') || siteAlerts[0];

  const reasons = [
    vc === null ? null : `ventilation ${Math.round(vc).toLocaleString('en-IN')} m²/s`,
    wind === null ? null : `mean wind ${round(wind, 1)} m/s`,
    inv === null ? null : `${inv > 0 ? 'inversion' : 'no inversion'} (${inv > 0 ? '+' : ''}${round(inv, 1)} °C)`,
  ].filter(Boolean).join(' · ');

  return (
    <div className="site-status" aria-label={`Site status for ${siteTitle}`}>
      <div className={`status-panel status-verdict tone-${cls.tone}`}>
        <div className="sp-label">POLLUTION DISPERSION · REGIONAL WEATHER MODEL</div>
        <div className="sp-main"><Icon size={26} /><b>{cls.label.toUpperCase()}</b></div>
        <p>{cls.detail}. {reasons}.</p>
        <a href="#dispersion">See the evidence</a>
      </div>

      <div className={`status-panel ${reading.pm25 !== null && reading.freshness === 'fresh' ? '' : 'status-muted'}`}>
        <div className="sp-label">LOCAL PM2.5 · AEIOS NODE MEASUREMENT</div>
        {reading.pm25 !== null && reading.freshness === 'fresh' ? (
          <div className="sp-main"><b>{round(reading.pm25, 0)}</b><small>µg/m³</small></div>
        ) : (
          <div className="sp-main"><CircleHelp size={22} /><b className="sp-none">{reading.packet ? 'No current reading' : 'No local reading'}</b></div>
        )}
        <p>
          {reading.packet
            ? <><Clock size={12} /> Node {reading.node} last packet {ago(reading.packet.rx_utc)}{reading.freshness === 'stale' ? ` · STALE${reading.pm25 !== null ? `; last value was ${round(reading.pm25, 0)} µg/m³` : ''}` : ''}.</>
            : 'No node is reporting for this site. Regional model PM2.5 is in Air quality and is not a measurement here.'}
        </p>
      </div>

      <div className={`status-panel ${worst ? `tone-${worst.level === 'WARNING' ? 'poor' : 'fair'}` : ''}`}>
        <div className="sp-label">SMOKE ALERT · AEIOS GATEWAY</div>
        {worst ? (
          <div className="sp-main"><AlertTriangle size={22} /><b>{worst.level}</b></div>
        ) : (
          <div className="sp-main"><b className="sp-none">No alerts raised</b></div>
        )}
        <p>
          {worst ? worst.message
            : reading.freshness === 'fresh' ? 'No WATCH or WARNING in the last 12 h.'
            : 'No WATCH or WARNING in the last 12 h, but node PM2.5 is not current, so this cannot rule out a local episode.'}
        </p>
      </div>
    </div>
  );
}
