import { useEffect, useState } from 'react';
import { supabase } from './supabase';

export type Driver = { feature: string; value: number | null; contribution_log: number; effect_pct: number | null };
export type ForecastRow = {
  id: number; station: string; location_id: number; horizon_h: number; made_utc: string; origin_utc: string | null; due_utc: string | null;
  source: 'lightgbm_cqr' | 'fallback_persistence' | 'no_input'; model_version: string | null; input_source: string; weather_source: string | null;
  stale_h: number | null; pm_now: number | null; q10: number | null; q50: number | null; q90: number | null; interval: string | null;
  drivers: Driver[] | null; reason: string | null;
};

// Distance of each CPCB station from the SGT reference point (km), from the station list the model was trained with.
// Used only to order and label the station picker; an unknown station sorts last.
export const STATION_DISTANCE_KM: Record<number, number> = {
  10488: 10.6, 301: 12.4, 6953: 13.4, 10825: 17.1, 5622: 19.2, 6931: 19.4, 6936: 21.4, 5570: 22.2, 5650: 22.9, 10921: 24.7,
};

export const HORIZONS = [1, 3, 6, 12, 24] as const;
export const FORECAST_STALE_MS = 3 * 3600_000;   // the Pi issues one run an hour; older than three hours means it stopped

const LABEL: Record<string, string> = {
  pm_now: 'PM2.5 now', pm_lag1: 'PM2.5 1 h ago', pm_lag2: 'PM2.5 2 h ago', pm_lag3: 'PM2.5 3 h ago', pm_lag6: 'PM2.5 6 h ago',
  pm_lag12: 'PM2.5 12 h ago', pm_lag24: 'PM2.5 yesterday, same hour', pm_mean3: 'Average of last 3 h', pm_mean6: 'Average of last 6 h',
  pm_mean24: 'Average of last 24 h', pm_std6: 'Recent swings (6 h)', pm_max24: 'Highest in last 24 h', pm_delta1: 'Change over 1 h',
  pm_delta3: 'Change over 3 h', hour_sin: 'Time of day', hour_cos: 'Time of day', dow_sin: 'Day of week', dow_cos: 'Day of week',
  month_sin: 'Time of year', month_cos: 'Time of year', stubble_season: 'Stubble-burning season', diwali_window: 'Diwali period',
  winter_fog_season: 'Winter fog season', temperature_2m: 'Temperature', relative_humidity_2m: 'Humidity', dew_point_2m: 'Dew point',
  surface_pressure: 'Pressure', precipitation: 'Rain', wind_speed_10m: 'Wind speed (10 m)', wind_speed_100m: 'Wind speed (100 m)',
  wind_dir_sin: 'Wind direction', wind_dir_cos: 'Wind direction', cloud_cover: 'Cloud cover', boundary_layer_height: 'Mixing height',
  ventilation: 'Ventilation (mixing x wind)', station_code: 'Which station',
};
export const featureLabel = (f: string) => LABEL[f] ?? f.replace(/_/g, ' ');

// Local development only (`?preview&mockforecasts`): sample rows to check the layout. Stripped from production builds.
const MOCK: ForecastRow[] = import.meta.env.DEV ? (() => {
  const made = new Date(Date.now() - 25 * 60000).toISOString();
  const origin = Date.now() - 85 * 60000;
  const q: Record<number, [number, number, number]> = { 1: [88, 104, 124], 3: [76, 112, 168], 6: [62, 118, 190], 12: [55, 109, 201], 24: [51, 97, 188] };
  return HORIZONS.map((h, i) => ({
    id: i + 1, station: 'Najafgarh, Delhi - DPCC', location_id: 10488, horizon_h: h, made_utc: made, origin_utc: new Date(origin).toISOString(),
    due_utc: new Date(origin + h * 3600000).toISOString(), source: 'lightgbm_cqr' as const, model_version: 'SAMPLE LAYOUT DATA',
    input_source: 'CPCB Najafgarh, Delhi - DPCC (OpenAQ hourly mean, not an AEIOS node)', weather_source: 'Open-Meteo analysis (training used ERA5 reanalysis)',
    stale_h: 1, pm_now: 98, q10: q[h][0], q50: q[h][1], q90: q[h][2], interval: '80% conformal', reason: null,
    drivers: [
      { feature: 'pm_now', value: 98, contribution_log: 0.21, effect_pct: 23.4 }, { feature: 'boundary_layer_height', value: 140, contribution_log: 0.14, effect_pct: 15.0 },
      { feature: 'hour_sin', value: -0.97, contribution_log: 0.1, effect_pct: 10.5 }, { feature: 'pm_mean24', value: 71, contribution_log: -0.09, effect_pct: -8.6 },
      { feature: 'wind_speed_10m', value: 1.1, contribution_log: 0.05, effect_pct: 5.1 }, { feature: '(baseline)', value: null, contribution_log: 4.0, effect_pct: null },
    ],
  }));
})() : [];
const mock = import.meta.env.DEV && new URLSearchParams(window.location.search).has('mockforecasts');

/** Latest forecast per (station, horizon) from the Pi, newest runs first. Refreshes every five minutes. */
export function useForecasts() {
  const [rows, setRows] = useState<ForecastRow[] | null>(mock ? MOCK : null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (mock) return;
    let alive = true;
    const load = () => supabase.from('forecasts').select('*').order('made_utc', { ascending: false }).limit(400)
      .then(({ data, error: e }) => {
        if (!alive) return;
        if (e) setError(e.message); else { setRows((data || []) as ForecastRow[]); setError(''); }
      });
    load();
    const t = setInterval(load, 300_000);
    return () => { alive = false; clearInterval(t); };
  }, []);
  return { rows, error };
}

/** The newest row for each horizon of one station (rows arrive newest first). */
export function latestByHorizon(rows: ForecastRow[], locationId: number): Map<number, ForecastRow> {
  const out = new Map<number, ForecastRow>();
  for (const r of rows) if (r.location_id === locationId && !out.has(r.horizon_h)) out.set(r.horizon_h, r);
  return out;
}
