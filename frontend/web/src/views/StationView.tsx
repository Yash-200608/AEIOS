import { RadioTower } from 'lucide-react';
import AreaMap from '../components/AreaMap';
import { RevealOnScroll } from '../motion/scroll';
import type { SiteId } from '../lib/api';
import { Hero, SectionTitle, ViewRoot, type StationState } from './shared';

export default function StationView({ station, site, onSite }: { station: StationState; site: SiteId; onSite: (site: SiteId) => void }) {
  return (
    <ViewRoot id="station" className="page-section">
      <Hero id="station" />
      <SectionTitle kicker="GROUND-TRUTH NETWORK" title="Station observations & site map" right={<span className={`status-chip ${station?.status === 'LIVE' ? 'status-live' : ''}`}><span className="status-led" /> {station?.status || 'CHECKING STATION'}</span>} />
      <RevealOnScroll className="station-layout">
        <div className="panel station-map-panel">
          <div className="panel-header"><div><div className="panel-title">SGT · Chandu observation area</div><div className="panel-subtitle">Reference locations · approx. 1.29 km apart</div></div><span className="source-badge">OSM BASE MAP</span></div>
          <AreaMap selected={site} onSelect={onSite} />
          <div className="map-legend"><span><i className="site-dot sgt-dot" /> SGT University</span><span><i className="site-dot chandu-dot" /> Chandu village</span></div>
        </div>
        <div className="panel station-data-panel">
          <div className="panel-title">Physical station telemetry</div><div className="panel-subtitle">Live node values only · no model substitution</div>
          {station?.count ? <div className="telemetry-list">{station.observations.slice(0, 6).map((row: any) => <div className="telemetry-row" key={row.id}><b>{new Date(row.observed_at).toLocaleString('en-IN')} · {row.station_code}</b><span>Temp {row.temperature_c ?? '—'}°C</span><span>RH {row.humidity_pct ?? '—'}%</span><span>Pressure {row.pressure_hpa ?? '—'} hPa</span><span>PM2.5 {row.pm25_ugm3 ?? '—'} µg/m³</span><span>PM10 {row.pm10_ugm3 ?? '—'} µg/m³</span><span>BME gas {row.bme680_gas_resistance_ohm ?? '—'} Ω</span><span>MQ135 {row.mq135_mv ?? '—'} mV</span><span>GPS {row.gps_fix ? 'FIX' : 'NO FIX'}</span></div>)}</div> : <div className="station-waiting"><div className="waiting-icon"><RadioTower size={23} /></div><b>Waiting for physical station telemetry</b><span>The configured sensors are PMS5003, MQ135 and BME680. When the node/gateway posts readings, this panel will show actual field observations.</span><small>GPS + RTC metadata · LoRa transport integration pending</small></div>}
          <div className="sensor-strip"><div><span>PMS5003</span><b>PM1 · PM2.5 · PM10</b></div><div><span>BME680</span><b>T · RH · Pressure · Gas Ω</b></div><div><span>MQ135</span><b>Relative gas response</b></div><div><span>GPS / RTC</span><b>Position · Time</b></div></div>
        </div>
      </RevealOnScroll>
    </ViewRoot>
  );
}
