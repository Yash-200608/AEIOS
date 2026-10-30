import { useMemo } from 'react';
import { CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, Area } from 'recharts';
import { formatHour, round } from '../lib/api';
import { dispersionClass, inversion, meanLowWind, ventilation, VENTILATION_POOR } from '../lib/derived';

type Hourly = Record<string, any[]>;

function at(h: Hourly, key: string, i: number): number | null {
  const v = h[key]?.[i];
  return v === null || v === undefined || !Number.isFinite(Number(v)) ? null : Number(v);
}

// Variables the forecast already returns but the dashboard did not show, plus storm and heat indicators.
const EXTRA: Array<{ key: string; label: string; unit: string; digits?: number; scale?: number; hint: string }> = [
  { key: 'visibility', label: 'Visibility', unit: 'km', digits: 1, scale: 0.001, hint: 'Haze and fog indicator' },
  { key: 'wet_bulb_temperature_2m', label: 'Wet-bulb temperature', unit: '°C', digits: 1, hint: 'Heat stress: how well sweat can cool the body' },
  { key: 'vapour_pressure_deficit', label: 'Vapour-pressure deficit', unit: 'kPa', digits: 2, hint: 'Air dryness; high values stress crops' },
  { key: 'cape', label: 'CAPE', unit: 'J/kg', hint: 'Energy available for thunderstorms' },
  { key: 'lifted_index', label: 'Lifted index', unit: '', digits: 1, hint: 'Below 0 means unstable air' },
  { key: 'total_column_integrated_water_vapour', label: 'Column water vapour', unit: 'kg/m²', digits: 1, hint: 'Moisture available for rain' },
  { key: 'soil_temperature_0cm', label: 'Soil surface temperature', unit: '°C', digits: 1, hint: 'Ground heating' },
  { key: 'soil_moisture_0_to_1cm', label: 'Soil moisture 0–1 cm', unit: 'm³/m³', digits: 2, hint: 'Dry topsoil lifts more dust' },
  { key: 'et0_fao_evapotranspiration', label: 'Reference evapotranspiration', unit: 'mm/h', digits: 2, hint: 'Crop water demand (FAO ET₀)' },
  { key: 'wind_speed_120m', label: 'Wind · 120 m', unit: 'm/s', digits: 1, hint: 'Above the campus canopy' },
  { key: 'wind_speed_180m', label: 'Wind · 180 m', unit: 'm/s', digits: 1, hint: 'Top of the near-surface layer' },
  { key: 'freezing_level_height', label: 'Freezing level', unit: 'm', hint: 'Height of 0 °C air' },
];

export default function DispersionPanel({ hourly, index }: { hourly: Hourly; index: number }) {
  const vc = ventilation(hourly, index);
  const wind = meanLowWind(hourly, index);
  const inv = inversion(hourly, index);
  const blh = at(hourly, 'boundary_layer_height', index);
  const cls = dispersionClass(vc, wind, inv);

  const chart = useMemo(() => {
    const times = hourly.time || [];
    const rows = [];
    for (let i = index; i < Math.min(times.length, index + 48); i += 1) {
      const v = ventilation(hourly, i);
      const d = inversion(hourly, i);
      rows.push({ hour: formatHour(String(times[i])), vc: v === null ? null : Math.round(v), inv: d === null ? null : Math.round(d * 10) / 10 });
    }
    return rows;
  }, [hourly, index]);
  const poorHours = chart.filter((r) => r.vc !== null && r.vc < VENTILATION_POOR).length;
  const invHours = chart.filter((r) => r.inv !== null && r.inv > 0).length;

  return (
    <section id="dispersion" className="page-section">
      <div className="section-title">
        <div><div className="eyebrow">BOUNDARY LAYER · DISPERSION</div><h2>Can the air clear pollution?</h2></div>
        <span className={`status-chip dispersion-${cls.tone}`}><span className="status-led" /> {cls.label.toUpperCase()} DISPERSION</span>
      </div>
      <div className="metric-grid dispersion-grid">
        <div className="metric-card">
          <div className="metric-top"><span>Ventilation coefficient</span></div>
          <div className="metric-value">{vc === null ? '—' : Math.round(vc).toLocaleString('en-IN')}<small>m²/s</small></div>
          <div className="metric-hint">{cls.detail}</div>
        </div>
        <div className="metric-card">
          <div className="metric-top"><span>Mixing (boundary-layer) height</span></div>
          <div className="metric-value">{round(blh)}<small>m</small></div>
          <div className="metric-hint">Depth the smoke can spread into</div>
        </div>
        <div className="metric-card">
          <div className="metric-top"><span>Mean wind · 10–180 m</span></div>
          <div className="metric-value">{round(wind, 1)}<small>m/s</small></div>
          <div className="metric-hint">{wind === null ? '—' : `${round(wind * 3.6, 0)} km/h · calm below 10 km/h`}</div>
        </div>
        <div className="metric-card">
          <div className="metric-top"><span>Inversion · 180 m minus 2 m</span></div>
          <div className="metric-value">{inv === null ? '—' : `${inv > 0 ? '+' : ''}${round(inv, 1)}`}<small>°C</small></div>
          <div className="metric-hint">{inv === null ? '—' : inv > 0 ? 'Warm lid: smoke trapped near the ground' : 'No lid: air can rise'}</div>
        </div>
      </div>

      <div className="panel" style={{ marginTop: 12 }}>
        <div className="panel-header">
          <div><div className="panel-title">Next 48 hours</div>
            <div className="panel-subtitle">{poorHours} h below {VENTILATION_POOR.toLocaleString('en-IN')} m²/s · {invHours} h with a surface inversion</div></div>
          <span className="legend-inline"><i className="legend-pm25" /> Ventilation <i className="legend-pm10" /> Inversion °C</span>
        </div>
        {chart.length ? (
          <div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={chart} margin={{ top: 12, right: 4, left: -6, bottom: 2 }}>
            <CartesianGrid stroke="#443753" strokeDasharray="3 5" vertical={false} />
            <XAxis dataKey="hour" tick={{ fill: '#9c8baf', fontSize: 10 }} axisLine={false} tickLine={false} interval={5} />
            <YAxis yAxisId="vc" tick={{ fill: '#9c8baf', fontSize: 10 }} axisLine={false} tickLine={false} width={48} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
            <YAxis yAxisId="inv" orientation="right" tick={{ fill: '#9c8baf', fontSize: 10 }} axisLine={false} tickLine={false} width={30} />
            <Tooltip contentStyle={{ background: '#100a17', border: '1px solid #473a57', borderRadius: 10, color: '#f1eff4' }} />
            <ReferenceLine yAxisId="vc" y={VENTILATION_POOR} stroke="#ec8b74" strokeDasharray="4 4" label={{ value: 'IMD poor < 6,000', fill: '#ec8b74', fontSize: 9, position: 'insideTopLeft' }} />
            <ReferenceLine yAxisId="inv" y={0} stroke="#5b4a6f" />
            <Area yAxisId="vc" dataKey="vc" type="monotone" stroke="#00e5ff" fill="#00e5ff" fillOpacity={0.12} strokeWidth={2} name="Ventilation m²/s" />
            <Line yAxisId="inv" dataKey="inv" type="monotone" stroke="#a77bf0" strokeWidth={1.6} dot={false} name="Inversion °C" />
          </ComposedChart></ResponsiveContainer></div>
        ) : <div className="empty-chart">Waiting for forecast values…</div>}
        <div className="aq-note">
          Ventilation coefficient = mixing height × mean wind in the lowest 180 m. IMD treats values below 6,000 m²/s with wind under 10 km/h as
          unfavourable for dispersion. Both come from the regional weather model, not from AEIOS sensors; together with node PM readings they explain
          why a smoke episode builds up or clears.
        </div>
      </div>

      <div className="panel" style={{ marginTop: 12 }}>
        <div className="panel-header"><div><div className="panel-title">More model variables</div><div className="panel-subtitle">Selected forecast hour · Open-Meteo</div></div><span className="source-badge">OPEN-METEO MODEL</span></div>
        <div className="extra-grid">
          {EXTRA.map((x) => {
            const v = at(hourly, x.key, index);
            return (
              <div key={x.key} className="extra-item">
                <span>{x.label}</span>
                <b>{v === null ? '—' : round(v * (x.scale ?? 1), x.digits ?? 0)}<small>{x.unit}</small></b>
                <em>{x.hint}</em>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
