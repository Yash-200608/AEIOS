import { supabase } from './supabase';
import { runScenario } from './sim';

export type SiteId = 'sgt' | 'chandu';
export type Site = {
  id: SiteId;
  name: string;
  label: string;
  latitude: number;
  longitude: number;
  elevation_m: number;
  station_code: string;
  type: string;
};

export type ApiEnvelope<T> = {
  data: T;
  source: string;
  cached: boolean;
  stale: boolean;
  fetched_at: string | null;
  warning?: string;
  site?: Site;
  data_class?: string;
};

export type WeatherPayload = {
  current?: Record<string, unknown>;
  hourly?: Record<string, Array<string | number | null>>;
  daily?: Record<string, Array<string | number | null>>;
  timezone?: string;
  timezone_abbreviation?: string;
  utc_offset_seconds?: number;
  elevation?: number;
  generationtime_ms?: number;
};

// Reference points (see docs/DATA_PROVENANCE.md of the reference package). These are site anchors, not sensor positions.
const SITE_COORDS: Record<SiteId, { latitude: number; longitude: number; station_code: string }> = {
  sgt: { latitude: 28.4782417, longitude: 76.9040528, station_code: 'AEIOS-SGT-01' },
  chandu: { latitude: 28.475, longitude: 76.9167, station_code: 'AEIOS-CHD-01' },
};
const TIMEZONE = 'Asia/Kolkata';
const WEATHER_URL = 'https://api.open-meteo.com/v1/forecast';
const AIR_URL = 'https://air-quality-api.open-meteo.com/v1/air-quality';

const HOURLY = [
  'temperature_2m', 'relative_humidity_2m', 'apparent_temperature', 'dew_point_2m', 'precipitation_probability', 'precipitation',
  'rain', 'showers', 'weather_code', 'pressure_msl', 'surface_pressure', 'cloud_cover', 'cloud_cover_low', 'cloud_cover_mid',
  'cloud_cover_high', 'visibility', 'wind_speed_10m', 'wind_direction_10m', 'wind_gusts_10m', 'wind_speed_80m', 'wind_direction_80m',
  'wind_speed_120m', 'wind_direction_120m', 'wind_speed_180m', 'wind_direction_180m', 'temperature_80m', 'temperature_120m',
  'temperature_180m', 'boundary_layer_height', 'shortwave_radiation', 'uv_index', 'soil_temperature_0cm', 'soil_moisture_0_to_1cm',
  'vapour_pressure_deficit', 'wet_bulb_temperature_2m', 'cape', 'lifted_index', 'convective_inhibition', 'freezing_level_height',
  'total_column_integrated_water_vapour', 'evapotranspiration', 'soil_moisture_1_to_3cm',
  ...['950', '925', '850', '700', '500'].flatMap((p) => [
    `temperature_${p}hPa`, `relative_humidity_${p}hPa`, `cloud_cover_${p}hPa`, `wind_speed_${p}hPa`, `wind_direction_${p}hPa`,
    `geopotential_height_${p}hPa`,
  ]),
];
const DAILY = [
  'weather_code', 'temperature_2m_max', 'temperature_2m_min', 'apparent_temperature_max', 'apparent_temperature_min', 'sunrise', 'sunset',
  'daylight_duration', 'sunshine_duration', 'uv_index_max', 'precipitation_sum', 'rain_sum', 'showers_sum', 'precipitation_probability_max',
  'wind_speed_10m_max', 'wind_gusts_10m_max', 'wind_direction_10m_dominant', 'shortwave_radiation_sum', 'et0_fao_evapotranspiration',
];
const AIR_HOURLY = ['pm10', 'pm2_5', 'carbon_monoxide', 'nitrogen_dioxide', 'sulphur_dioxide', 'ozone', 'dust', 'aerosol_optical_depth', 'uv_index', 'us_aqi'];
// Over India only the CAMS global domain applies: ~0.4° (~45 km), 3-hourly, about 5 days ahead. Asking for 6 days covers its full
// horizon; anything later comes back empty.
export const AIR_FORECAST_DAYS = 6;

// ---- Browser cache so the last model run is still shown (marked stale) if Open-Meteo is unreachable ----
const CACHE_PREFIX = 'aeios-cache:';
function cacheGet(key: string): { payload: any; fetchedAt: number } | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function cachePut(key: string, payload: any) {
  try { localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ payload, fetchedAt: Date.now() })); } catch { /* storage full or blocked */ }
}

async function fetchModel<T>(key: string, url: string, params: Record<string, string | number>, ttlSeconds: number): Promise<ApiEnvelope<T>> {
  const cached = cacheGet(key);
  if (cached && Date.now() - cached.fetchedAt < ttlSeconds * 1000) {
    return { data: cached.payload, source: 'OPEN_METEO', cached: true, stale: false, fetched_at: new Date(cached.fetchedAt).toISOString() };
  }
  try {
    const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
    const response = await fetch(`${url}?${qs}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    cachePut(key, payload);
    return { data: payload, source: 'OPEN_METEO', cached: false, stale: false, fetched_at: new Date().toISOString() };
  } catch (error) {
    if (cached) {
      return {
        data: cached.payload, source: 'OPEN_METEO_CACHE', cached: true, stale: true, fetched_at: new Date(cached.fetchedAt).toISOString(),
        warning: 'Weather provider unreachable; showing the last cached model run.',
      };
    }
    throw new Error(`Weather provider unavailable and no cached response exists (${error instanceof Error ? error.message : 'error'})`);
  }
}

function withSite<T>(envelope: ApiEnvelope<T>, site: SiteId, dataClass: string): ApiEnvelope<T> {
  const c = SITE_COORDS[site];
  return {
    ...envelope,
    data_class: dataClass,
    site: { id: site, name: site === 'sgt' ? 'SGT University' : 'Chandu village', label: '', elevation_m: 0, type: '', ...c },
  };
}

// ---- Station telemetry: real node packets from the Pi gateway (Supabase) ----
const clean = (v: unknown) => (typeof v === 'number' && v >= 0 ? v : null); // firmware sends -1 for "no PMS frame"

export type AeiosOverview = {
  gateway: { device_id: string; last_seen: string } | null;
  nodes: Array<{ node: string; site_id: string | null; label: string | null }>;
  latest: Array<Record<string, any>>;
  predictions: Array<Record<string, any>>;
  anomalies: Array<Record<string, any>>;
  totalPackets: number;
};

export const api = {
  forecast: async (site: SiteId, days: number) => {
    const c = SITE_COORDS[site];
    const env = await fetchModel<WeatherPayload>(
      `forecast:v2:${site}:${days}`, WEATHER_URL,
      {
        latitude: c.latitude, longitude: c.longitude, timezone: TIMEZONE, forecast_days: days,
        current: 'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,rain,showers,weather_code,cloud_cover,pressure_msl,surface_pressure,wind_speed_10m,wind_direction_10m,wind_gusts_10m,uv_index',
        hourly: HOURLY.join(','), daily: DAILY.join(','), wind_speed_unit: 'ms', temperature_unit: 'celsius', precipitation_unit: 'mm',
      },
      1800,
    );
    return withSite(env, site, 'NUMERICAL_WEATHER_MODEL');
  },

  airQuality: async (site: SiteId) => {
    const c = SITE_COORDS[site];
    const env = await fetchModel<WeatherPayload>(
      `air:v2:${site}`, AIR_URL,
      {
        latitude: c.latitude, longitude: c.longitude, timezone: TIMEZONE, forecast_days: AIR_FORECAST_DAYS,
        current: 'pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone,dust,aerosol_optical_depth,uv_index,us_aqi', hourly: AIR_HOURLY.join(','),
      },
      3600,
    );
    return withSite(env, site, 'EXTERNAL_AIR_QUALITY_MODEL');
  },

  observations: async (site: SiteId) => {
    const { data: nodes, error: nErr } = await supabase.from('nodes').select('node').eq('site_id', site);
    if (nErr) throw new Error(nErr.message);
    const ids = (nodes || []).map((n) => n.node);
    const waiting = (note: string) => ({ status: 'WAITING_FOR_TELEMETRY', count: 0, observations: [] as any[], note });
    if (!ids.length) return waiting('No gateway node is assigned to this site yet. Model data is not substituted.');
    const { data, error } = await supabase.from('packets').select('*').in('node', ids).order('rx_utc', { ascending: false }).limit(24);
    if (error) throw new Error(error.message);
    if (!data?.length) return waiting('An empty response means no live station packet has been ingested; model data is not substituted.');
    const observations = data.map((p) => ({
      id: p.id,
      observed_at: p.rx_utc,
      station_code: `${p.node}`,
      temperature_c: p.temp,
      humidity_pct: p.rh,
      pressure_hpa: p.pressure,
      bme680_gas_resistance_ohm: p.gas_kohm === null ? null : p.gas_kohm * 1000,
      pm1_ugm3: clean(p.pm1),
      pm25_ugm3: clean(p.pm2_5),
      pm10_ugm3: clean(p.pm10),
      mq135_mv: p.mq_mv,
      gps_fix: !!p.fix,
    }));
    return { status: 'LIVE', count: observations.length, observations, note: 'Real LoRa packets relayed by the gateway.' };
  },

  simulate: async (body: { site_id: SiteId; scenario: string; intensity: number; duration_hours: number; start_hour: number }) => {
    const wx = await api.forecast(body.site_id, 4);
    let aq: any = null;
    try { aq = (await api.airQuality(body.site_id)).data; } catch { /* scenario stays usable without the CAMS feed */ }
    const result = runScenario(wx.data, {
      scenario: body.scenario, intensity: body.intensity, duration_hours: body.duration_hours, start_hour: body.start_hour, airQuality: aq,
    });
    return { generated_at: new Date().toISOString(), ...result };
  },

  // AEIOS gateway + local model output (real packets only; the Pi never uploads simulated rows).
  aeios: async (): Promise<AeiosOverview> => {
    const [gw, nodes, packets, preds, anoms, count] = await Promise.all([
      supabase.from('gateway_status').select('device_id,last_seen').order('last_seen', { ascending: false }).limit(1),
      supabase.from('nodes').select('node,site_id,label').order('node'),
      supabase.from('packets').select('*').order('rx_utc', { ascending: false }).limit(60),
      supabase.from('predictions').select('*').order('made_utc', { ascending: false }).limit(240),
      supabase.from('anomalies').select('*').order('utc', { ascending: false }).limit(12),
      supabase.from('packets').select('id', { count: 'exact', head: true }),
    ]);
    for (const r of [gw, nodes, packets, preds, anoms]) if (r.error) throw new Error(r.error.message);
    const latest: Record<string, any> = {};
    for (const p of packets.data || []) if (!latest[p.node]) latest[p.node] = p;
    // Newest forecast per node / target / horizon.
    const seen = new Set<string>();
    const predictions: any[] = [];
    for (const p of preds.data || []) {
      const k = `${p.node}|${p.target}|${p.horizon_min}`;
      if (!seen.has(k)) { seen.add(k); predictions.push(p); }
    }
    return {
      gateway: gw.data?.[0] || null,
      nodes: nodes.data || [],
      latest: Object.values(latest),
      predictions,
      anomalies: anoms.data || [],
      totalPackets: count.count || 0,
    };
  },
};

export function numeric(value: unknown, fallback = 0): number {
  if (value === null || value === undefined || value === '') return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function round(value: unknown, digits = 0): string {
  if (value === null || value === undefined || value === '') return '—';
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return number.toFixed(digits);
}

export function formatHour(value?: string): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value.slice(11, 16) : date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

export function formatDay(value?: string, options: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' }): string {
  if (!value) return '—';
  const date = new Date(`${value}T12:00:00+05:30`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('en-IN', options);
}

export function weatherLabel(code: unknown): string {
  const value = numeric(code, -1);
  if (value === 0) return 'Clear sky';
  if ([1, 2].includes(value)) return 'Mainly clear / partly cloudy';
  if (value === 3) return 'Overcast';
  if ([45, 48].includes(value)) return 'Fog';
  if ([51, 53, 55, 56, 57].includes(value)) return 'Drizzle';
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(value)) return 'Rain';
  if ([71, 73, 75, 77, 85, 86].includes(value)) return 'Snow';
  if ([95, 96, 99].includes(value)) return 'Thunderstorm';
  return 'Weather model output';
}

export function compass(degrees: unknown): string {
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const deg = numeric(degrees, -1);
  return deg < 0 ? '—' : dirs[Math.round(deg / 22.5) % 16];
}
