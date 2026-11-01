import { useMemo } from 'react';
import VentilationChart, { type VentilationRow } from './VentilationChart';
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
  { key: 'wet_bulb_temperature_2m', label: 'Wet-bulb temperature', unit: '°C', digits: 1, hint: 'Temperature including evaporative cooling; relevant to heat stress' },
  { key: 'vapour_pressure_deficit', label: 'Vapour-pressure deficit', unit: 'kPa', digits: 2, hint: 'Air dryness; high values stress crops' },
  { key: 'cape', label: 'CAPE', unit: 'J/kg', hint: 'Energy available to rising air; high values mean storm potential' },
  { key: 'lifted_index', label: 'Lifted index', unit: '', digits: 1, hint: 'Rising-air vs surroundings temperature; negative means unstable air' },
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
    const rows: VentilationRow[] = [];
    for (let i = index; i < Math.min(times.length, index + 48); i += 1) {
      const v = ventilation(hourly, i);
      const d = inversion(hourly, i);
      rows.push({ time: formatHour(String(times[i])), vc: v, inv: d });
    }
    return rows;
  }, [hourly, index]);

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

      <div style={{ marginTop: 12 }}>
        <VentilationChart
          rows={chart}
          poorAt={VENTILATION_POOR}
          footer={(
            <details className="how-it-works">
              <summary>How this is calculated</summary>
              <ul>
                <li><b>Ventilation coefficient</b> = mixing height × mean wind in the lowest 180 m. It indicates how well the air can carry pollutants away.</li>
                <li><b>Inversion</b>: warmer air above cooler surface air suppresses vertical mixing and traps pollution near the ground.</li>
                <li><b>Unfavourable</b> means ventilation below {VENTILATION_POOR.toLocaleString('en-IN')} m²/s with mean wind under 10 km/h (IMD criterion).</li>
              </ul>
              <p>Both inputs come from the regional weather model, not from AEIOS sensors.</p>
            </details>
          )}
        />
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
