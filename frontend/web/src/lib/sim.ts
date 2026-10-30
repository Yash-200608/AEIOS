// TypeScript port of the reference backend's deterministic scenario engine (backend/app/services/simulator.py).
// Scenario output is a what-if perturbation of model fields. It is not a forecast, an observation or an AEIOS prediction.

export const SCENARIO_META: Record<string, { label: string; summary: string }> = {
  baseline: { label: 'Baseline replay', summary: 'Replays the forecast baseline without scenario perturbation.' },
  dust_event: { label: 'Dust / particulate episode', summary: 'Illustrates dry, windy conditions and a hypothetical particulate-loading event.' },
  heat_stress: { label: 'Heat stress episode', summary: 'Illustrates elevated near-surface temperature and reduced relative humidity.' },
  convective_storm: { label: 'Convective storm', summary: 'Illustrates cloud build-up, rainfall and gust response.' },
  gust_front: { label: 'Gust front', summary: 'Illustrates a rapid wind-speed increase and directional shift.' },
};

const FIELDS = [
  'temperature_2m', 'relative_humidity_2m', 'precipitation', 'precipitation_probability',
  'wind_speed_10m', 'wind_direction_10m', 'wind_gusts_10m', 'cloud_cover',
  'cloud_cover_low', 'cloud_cover_mid', 'cloud_cover_high', 'pressure_msl',
];
const PCT = new Set(['relative_humidity_2m', 'precipitation_probability', 'cloud_cover', 'cloud_cover_low', 'cloud_cover_mid', 'cloud_cover_high']);
const NONNEG = new Set(['precipitation', 'wind_speed_10m', 'wind_gusts_10m']);

// Per-scenario, per-field additive coefficients (multiplied by intensity while the event is active).
const DELTAS: Record<string, Record<string, number>> = {
  dust_event: { wind_speed_10m: 2.0, relative_humidity_2m: -8.0, cloud_cover: -12.0 },
  heat_stress: { temperature_2m: 7.0, relative_humidity_2m: -14.0, pressure_msl: -2.0 },
  convective_storm: {
    precipitation: 8.0, precipitation_probability: 35.0, wind_speed_10m: 8.0, wind_gusts_10m: 12.0, cloud_cover: 35.0,
    cloud_cover_low: 45.0, cloud_cover_mid: 30.0, cloud_cover_high: 12.0, relative_humidity_2m: 12.0, pressure_msl: -2.5,
  },
  gust_front: { wind_speed_10m: 14.0, wind_gusts_10m: 20.0, pressure_msl: -4.0, wind_direction_10m: 35.0 },
};

const r2 = (v: number) => Math.round(v * 100) / 100;
const r1 = (v: number) => Math.round(v * 10) / 10;

export function runScenario(
  forecast: any,
  opts: { scenario: string; intensity: number; duration_hours: number; start_hour: number; airQuality?: any },
) {
  const { scenario, intensity, duration_hours, start_hour } = opts;
  if (!SCENARIO_META[scenario]) throw new Error(`Unknown scenario '${scenario}'`);
  const hourly: Record<string, any[]> = forecast?.hourly || {};
  const times: string[] = hourly.time || [];
  if (!times.length) throw new Error('Forecast has no hourly timeline to simulate against');

  const aqHourly: Record<string, any[]> = opts.airQuality?.hourly || {};
  const aqIndex = new Map<string, number>((aqHourly.time || []).map((t: string, i: number) => [String(t), i]));
  const endHour = start_hour + duration_hours;
  const timeline: any[] = [];

  times.slice(0, 72).forEach((timestamp, idx) => {
    const active = idx >= start_hour && idx < endHour;
    const weight = active ? intensity : 0;
    const row: Record<string, any> = { time: timestamp, scenario_active: active };

    for (const field of FIELDS) {
      const values = hourly[field] || [];
      const base = idx < values.length ? values[idx] : null;
      if (base === null || base === undefined) { row[field] = null; continue; }
      const value = Number(base);
      const delta = (DELTAS[scenario]?.[field] ?? 0) * weight;
      let sim = value + delta;
      if (PCT.has(field)) sim = Math.max(0, Math.min(100, sim));
      if (NONNEG.has(field)) sim = Math.max(0, sim);
      if (field === 'wind_direction_10m') sim = ((sim % 360) + 360) % 360;
      row[field] = r2(sim);
      row[`baseline_${field}`] = r2(value);
    }

    // The external air-quality model stays a separate baseline plane; no concentrations are invented where it has none.
    const aqIdx = aqIndex.get(String(timestamp));
    for (const f of ['pm2_5', 'pm10', 'dust', 'us_aqi']) {
      const v = aqIdx !== undefined ? (aqHourly[f] || [])[aqIdx] : null;
      const base = v === null || v === undefined ? null : r2(Number(v));
      row[`baseline_${f}`] = base;
      row[f] = base;
    }

    if (scenario === 'dust_event') {
      row.dust_scenario_index = r1(100 * weight);
      row.pm2_5_scenario_delta = r1(40 * weight);
      row.pm10_scenario_delta = r1(85 * weight);
      if (row.pm2_5 !== null) row.pm2_5 = r2(row.pm2_5 + 40 * weight);
      if (row.pm10 !== null) row.pm10 = r2(row.pm10 + 85 * weight);
      if (row.dust !== null) row.dust = r2(row.dust + 100 * weight);
    } else {
      row.dust_scenario_index = 0;
      row.pm2_5_scenario_delta = 0;
      row.pm10_scenario_delta = 0;
    }
    timeline.push(row);
  });

  return {
    data_class: 'SCENARIO_SIMULATION',
    is_forecast: false,
    is_observation: false,
    scenario,
    scenario_label: SCENARIO_META[scenario].label,
    description: SCENARIO_META[scenario].summary,
    intensity,
    duration_hours,
    start_hour,
    baseline_provider: 'OPEN_METEO_MODEL_FORECAST',
    air_quality_baseline_provider: Object.keys(aqHourly).length ? 'CAMS_MODEL' : null,
    method:
      'Deterministic scenario perturbation of model fields. Coefficients are illustrative assumptions, not a validated numerical weather prediction or CFD solver.',
    pollution_note:
      'Dust and particulate increments are illustrative scenario deltas. They are not physical AEIOS sensor readings or calibrated concentration predictions.',
    timeline,
  };
}
