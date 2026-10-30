import { useMemo, useState } from 'react';
import { Circle, CircleMarker, MapContainer, TileLayer, Tooltip, WMSTileLayer } from 'react-leaflet';
import type { SiteId } from '../lib/api';

// NASA GIBS imagery (no key needed). Tile matrix sets, formats and legends come from the GIBS WMTS capabilities.
const GIBS = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best';
const GIBS_WMS = 'https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi';
const LEGENDS = 'https://gibs.earthdata.nasa.gov/legends';

type Overlay = {
  id: string; label: string; level: number; lagDays: number; legend?: string; note: string;
  time: 'day' | 'halfhour' | 'fixed'; fixed?: string;
};

const OVERLAYS: Overlay[] = [
  { id: 'MODIS_Combined_MAIAC_L2G_AerosolOpticalDepth', label: 'Haze (AOD)', level: 7, lagDays: 1, time: 'day', legend: 'MODIS_VIIRS_AOD_H.svg',
    note: 'Aerosol optical depth from MODIS (MAIAC, 1 km): how much particulate haze is in the whole air column. Gaps are cloud or no retrieval.' },
  { id: 'OMPS_Aerosol_Index', label: 'Smoke & dust', level: 6, lagDays: 1, time: 'day', legend: 'OMPS_Aerosol_Index_H.svg',
    note: 'OMPS absorbing aerosol index: high values mean smoke or dust aloft. Coarse (~50 km).' },
  { id: 'OMI_Nitrogen_Dioxide_Tropo_Column', label: 'NO₂', level: 6, lagDays: 5, time: 'day', legend: 'OMI_Nitrogen_Dioxide_Tropo_Column_H.svg',
    note: 'Tropospheric NO₂ column from OMI (~13 × 24 km): traffic, industry and combustion. Usually 3–5 days behind.' },
  { id: 'IMERG_Precipitation_Rate_30min', label: 'Rain rate', level: 6, lagDays: 0, time: 'halfhour', legend: 'GPM_Precipitation_Rate_H.svg',
    note: 'GPM IMERG 30-minute rain rate (early run, roughly 4–6 hours behind real time).' },
  { id: 'VIIRS_NOAA20_Land_Surface_Temp_Day', label: 'Ground heat', level: 7, lagDays: 1, time: 'day', legend: 'MODIS_Land_Surface_Temp_H.svg',
    note: 'Daytime land surface (skin) temperature from VIIRS. Hotter than the air on sunny days; shows heat islands.' },
  { id: 'VIIRS_Black_Marble', label: 'Night lights', level: 8, lagDays: 0, time: 'fixed', fixed: '2016-01-01',
    note: 'VIIRS Black Marble 2016: where people and activity are concentrated.' },
];

const SITES = [
  { id: 'sgt' as SiteId, name: 'SGT University', pos: [28.4782417, 76.9040528] as [number, number], color: '#00e5ff' },
  { id: 'chandu' as SiteId, name: 'Chandu village', pos: [28.475, 76.9167] as [number, number], color: '#efbd76' },
];

const utcDate = (d: Date) => d.toISOString().slice(0, 10);
function shiftDate(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return utcDate(d);
}
// Latest IMERG half-hour slot that is usually published (~5 h behind).
function latestHalfHour() {
  const t = new Date(Date.now() - 5 * 3600 * 1000);
  return { date: utcDate(t), slot: t.getUTCHours() * 2 + (t.getUTCMinutes() >= 30 ? 1 : 0) };
}
function slotLabel(date: string, slot: number) {
  const utc = new Date(`${date}T00:00:00Z`);
  utc.setUTCMinutes(slot * 30);
  return utc.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) + ' IST';
}

export default function SatellitePanel({ site }: { site: SiteId }) {
  const today = utcDate(new Date());
  const [date, setDate] = useState(shiftDate(today, -1));
  const [base, setBase] = useState<'truecolor' | 'map'>('truecolor');
  const [overlayId, setOverlayId] = useState<string>('none');
  const [opacity, setOpacity] = useState(0.75);
  const [fires, setFires] = useState(true);
  const [labels, setLabels] = useState(true);
  const [slot, setSlot] = useState(latestHalfHour().slot);

  const overlay = OVERLAYS.find((o) => o.id === overlayId);
  const center = SITES.find((s) => s.id === site)?.pos || SITES[0].pos;
  const tooRecent = overlay && overlay.time === 'day' && date > shiftDate(today, -overlay.lagDays);

  const overlayTime = useMemo(() => {
    if (!overlay) return '';
    if (overlay.time === 'fixed') return overlay.fixed!;
    if (overlay.time === 'halfhour') {
      const t = new Date(`${date}T00:00:00Z`);
      t.setUTCMinutes(slot * 30);
      return t.toISOString().replace('.000', '');
    }
    return date;
  }, [overlay, date, slot]);

  const pickOverlay = (id: string) => {
    setOverlayId(id);
    if (id === 'IMERG_Precipitation_Rate_30min') {
      const l = latestHalfHour();
      setDate(l.date); setSlot(l.slot);
    }
  };

  return (
    <section id="satellite" className="page-section">
      <div className="section-title">
        <div><div className="eyebrow">EARTH OBSERVATION · NASA GIBS</div><h2>Satellite view</h2></div>
        <span className="source-badge">NASA EOSDIS · NO KEY</span>
      </div>
      <div className="panel">
        <div className="sat-controls">
          <div className="sat-group" role="group" aria-label="Base imagery">
            <button className={base === 'truecolor' ? 'active' : ''} onClick={() => setBase('truecolor')}>True colour</button>
            <button className={base === 'map' ? 'active' : ''} onClick={() => setBase('map')}>Street map</button>
          </div>
          <div className="sat-date">
            <button aria-label="Previous day" onClick={() => setDate(shiftDate(date, -1))}>‹</button>
            <input type="date" aria-label="Imagery date (UTC)" value={date} max={today} min="2018-01-01" onChange={(e) => e.target.value && setDate(e.target.value)} />
            <button aria-label="Next day" onClick={() => setDate(shiftDate(date, 1))} disabled={date >= today}>›</button>
          </div>
          <label className="sat-toggle"><input type="checkbox" checked={fires} onChange={(e) => setFires(e.target.checked)} /> Fires (VIIRS 375 m)</label>
          <label className="sat-toggle"><input type="checkbox" checked={labels} onChange={(e) => setLabels(e.target.checked)} /> Place names</label>
        </div>
        <div className="sat-group sat-overlays" role="group" aria-label="Overlay">
          <button className={overlayId === 'none' ? 'active' : ''} onClick={() => pickOverlay('none')}>No overlay</button>
          {OVERLAYS.map((o) => <button key={o.id} className={overlayId === o.id ? 'active' : ''} onClick={() => pickOverlay(o.id)}>{o.label}</button>)}
        </div>
        {overlay?.time === 'halfhour' && (
          <div className="range-field sat-slot"><div><label htmlFor="imerg-slot">RAIN TIME</label><b>{slotLabel(date, slot)}</b></div>
            <input id="imerg-slot" type="range" min={0} max={47} value={slot} onChange={(e) => setSlot(Number(e.target.value))} /></div>
        )}

        <div className="state-box state-info" role="status"><span><b>Observation:</b> imagery {date} UTC · {base === 'truecolor' ? 'VIIRS NOAA-20 true colour' : 'OpenStreetMap street map'}{overlay ? ` · ${overlay.label} layer${overlayTime ? ` (${overlayTime.slice(0, 16).replace('T', ' ')})` : ''}` : ''}{fires ? ' · VIIRS fire detections on' : ''}. An empty area can mean no detection, no satellite pass or cloud cover; this map cannot tell them apart.</span></div>
        <MapContainer center={center} zoom={7} minZoom={4} maxZoom={12} scrollWheelZoom={false} className="satellite-map">
          {base === 'truecolor' ? (
            <TileLayer key={`tc-${date}`} maxNativeZoom={9} maxZoom={12}
              url={`${GIBS}/VIIRS_NOAA20_CorrectedReflectance_TrueColor/default/${date}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`}
              attribution='Imagery: NASA EOSDIS GIBS · VIIRS NOAA-20' />
          ) : (
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' />
          )}
          {overlay && (
            <TileLayer key={`${overlay.id}-${overlayTime}`} opacity={opacity} maxNativeZoom={overlay.level} maxZoom={12}
              url={`${GIBS}/${overlay.id}/default/${overlayTime}/GoogleMapsCompatible_Level${overlay.level}/{z}/{y}/{x}.png`}
              attribution="NASA EOSDIS GIBS" />
          )}
          {fires && (
            <WMSTileLayer key={`fires-${date}`} url={GIBS_WMS}
              params={{ layers: 'VIIRS_NOAA20_Thermal_Anomalies_375m_All,VIIRS_SNPP_Thermal_Anomalies_375m_All', format: 'image/png', transparent: true, version: '1.3.0', time: date } as any}
              attribution="Fires: NASA VIIRS 375 m" />
          )}
          {/* GIBS label tiles are light text on an opaque black background; the screen blend keeps the text and drops the black. */}
          {labels && <TileLayer className="sat-labels" maxNativeZoom={13} maxZoom={12} url={`${GIBS}/Reference_Labels_15m/default/GoogleMapsCompatible_Level13/{z}/{y}/{x}.png`} />}
          <Circle center={SITES[0].pos} radius={50000} pathOptions={{ color: '#00e5ff', weight: 1, dashArray: '4 6', fillOpacity: 0 }} />
          {SITES.map((s) => (
            <CircleMarker key={s.id} center={s.pos} radius={6} pathOptions={{ color: s.color, fillColor: s.color, fillOpacity: 0.9, weight: 2 }}>
              <Tooltip direction="top" offset={[0, -6]}>{s.name}</Tooltip>
            </CircleMarker>
          ))}
        </MapContainer>

        <div className="sat-footer">
          {overlay && (
            <div className="sat-legend">
              {fires && <div className="legend-line"><i className="fire-dot" /> Red squares: VIIRS thermal anomalies (fire detections), shown only for passes on the chosen date</div>}
              {overlay.legend && <img src={`${LEGENDS}/${overlay.legend}`} alt={`${overlay.label} colour scale`} />}
              <div className="range-field"><div><label htmlFor="sat-opacity">OVERLAY OPACITY</label><b>{Math.round(opacity * 100)}%</b></div>
                <input id="sat-opacity" type="range" min={20} max={100} value={Math.round(opacity * 100)} onChange={(e) => setOpacity(Number(e.target.value) / 100)} /></div>
              <p>{overlay.note}</p>
              {tooRecent && <p className="sat-warn">This date may not be processed yet for this layer; it usually runs about {overlay.lagDays} day{overlay.lagDays > 1 ? 's' : ''} behind.</p>}
            </div>
          )}
          <p className="aq-note">
            Dates are UTC. Polar satellites pass over Gurugram around 1:30 pm and 1:30 am local time, so fires lit later in the afternoon
            are often missed, and cloud hides the surface. Satellites measure the whole air column or the ground skin, not the air people breathe;
            the AEIOS nodes measure that. Dashed ring: 50 km around SGT.
          </p>
        </div>
      </div>
    </section>
  );
}
