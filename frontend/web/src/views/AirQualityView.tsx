import { useMemo } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from 'recharts';
import { RevealOnScroll } from '../motion/scroll';
import { formatHour, numeric, round, type WeatherPayload } from '../lib/api';
import { CHART_TOOLTIP_STYLE, Hero, SectionTitle, ViewRoot } from './shared';

const POLLUTANTS = [
  ['carbon_monoxide', 'Carbon monoxide (CO)', 'µg/m³', 'Combustion and smoke tracer'],
  ['nitrogen_dioxide', 'Nitrogen dioxide (NO₂)', 'µg/m³', 'Traffic and industry'],
  ['sulphur_dioxide', 'Sulphur dioxide (SO₂)', 'µg/m³', 'Coal and diesel burning'],
  ['ozone', 'Ozone (O₃)', 'µg/m³', 'Forms in afternoon sunlight'],
  ['dust', 'Dust', 'µg/m³', 'Wind-blown mineral dust'],
  ['aerosol_optical_depth', 'Aerosol optical depth', '', 'Column haze (compare with Satellite)'],
] as const;

export default function AirQualityView({ aq, aqWarning }: { aq: WeatherPayload | null; aqWarning: string }) {
  const airChart = useMemo(() => {
    const airHourly = aq?.hourly as any;
    if (!airHourly?.time) return [];
    // Keys must match the chart dataKeys; hours past the CAMS horizon come back null and are dropped.
    return airHourly.time.slice(0, 72).map((time: string, i: number) => ({
      time: formatHour(time),
      pm2_5: airHourly.pm2_5?.[i] ?? null,
      pm10: airHourly.pm10?.[i] ?? null,
      aqi: airHourly.us_aqi?.[i] ?? null,
    })).filter((row: { pm2_5: number | null; pm10: number | null }) => row.pm2_5 !== null || row.pm10 !== null);
  }, [aq]);
  const aqiCurrent = numeric((aq?.current as any)?.us_aqi, NaN);

  return (
    <ViewRoot id="air-quality" className="page-section">
      <Hero id="air-quality" />
      <SectionTitle kicker="ATMOSPHERIC COMPOSITION" title="Air quality intelligence" right={<span className="source-badge">CAMS GLOBAL MODEL · ~45 KM · ABOUT 5 DAYS</span>} />
      <RevealOnScroll className="air-grid">
        <div className="panel aqi-panel">
          <span className="provenance-tag prov-model">REGIONAL MODEL ESTIMATE</span><div className="panel-title">Regional air quality · CAMS · ~45 km grid · 3-hourly</div><div className="panel-subtitle">Not a station observation and not measured at this site</div>
          <div className="aqi-score-row"><div className="aqi-score">{Number.isFinite(aqiCurrent) ? Math.round(aqiCurrent) : '—'}</div><div><b>US AQI (modelled)</b><span>{Number.isFinite(aqiCurrent) ? (aqiCurrent <= 50 ? 'Good' : aqiCurrent <= 100 ? 'Moderate' : aqiCurrent <= 150 ? 'Unhealthy for sensitive groups' : aqiCurrent <= 200 ? 'Unhealthy' : 'Very unhealthy') : 'Model data unavailable'}</span></div></div>
          <div className="aqi-scale"><i /><i /><i /><i /><i /></div><div className="aqi-scale-labels"><span>Good</span><span>Moderate</span><span>US AQI scale</span></div>
          {aqWarning && <div className="aq-warning"><AlertTriangle size={13} /> {aqWarning}</div>}
          <div className="local-compare"><span className="provenance-tag prov-local">AEIOS STATION MEASUREMENT</span><span>Local PM2.5 is reported in Site status and in AEIOS sensors. If it says "No current reading", nothing on this panel replaces it.</span></div><div className="aq-note">MQ135 is a relative gas-response sensor, not a calibrated pollutant analyser; do not read its output as ppm of any gas.</div>
        </div>
        <div className="panel aq-chart-panel">
          <div className="panel-header"><div><div className="panel-title">Particulate forecast profile</div><div className="panel-subtitle">PM2.5 and PM10 · µg/m³ · first 72 hours</div></div><span className="legend-inline"><i className="legend-pm25" /> PM2.5 <i className="legend-pm10" /> PM10</span></div>
          {airChart.length ? <div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={airChart} margin={{ top: 12, right: 4, left: -20, bottom: 2 }}>
            <defs><linearGradient id="pm25Fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#00e5ff" stopOpacity={0.24} /><stop offset="100%" stopColor="#00e5ff" stopOpacity={0} /></linearGradient></defs>
            <CartesianGrid stroke="#443753" strokeDasharray="3 5" vertical={false} /><XAxis dataKey="time" tick={{ fill: '#9c8baf', fontSize: 10 }} axisLine={false} tickLine={false} interval={11} /><YAxis tick={{ fill: '#9c8baf', fontSize: 10 }} axisLine={false} tickLine={false} /><ChartTooltip contentStyle={CHART_TOOLTIP_STYLE} />
            <Area dataKey="pm2_5" type="monotone" stroke="#00e5ff" fill="url(#pm25Fill)" strokeWidth={2} name="PM2.5" /><Line dataKey="pm10" type="monotone" stroke="#a77bf0" strokeWidth={1.7} dot={false} name="PM10" />
          </ComposedChart></ResponsiveContainer></div> : <div className="empty-chart">Waiting for external air-quality model feed…</div>}
        </div>
      </RevealOnScroll>
      <RevealOnScroll>
        <div className="panel" style={{ marginTop: 12 }}>
          <div className="panel-header"><div><div className="panel-title">Other pollutants · model now</div><div className="panel-subtitle">CAMS global estimates for this grid cell · µg/m³ unless noted</div></div><span className="source-badge">EXTERNAL_AIR_QUALITY_MODEL</span></div>
          <div className="extra-grid">
            {POLLUTANTS.map(([key, label, unit, hint]) => {
              const v = (aq?.current as any)?.[key];
              return <div key={key} className="extra-item"><span>{label}</span><b>{v === null || v === undefined ? '—' : round(v, key === 'aerosol_optical_depth' ? 2 : 0)}<small>{unit}</small></b><em>{hint}</em></div>;
            })}
          </div>
        </div>
      </RevealOnScroll>
    </ViewRoot>
  );
}
