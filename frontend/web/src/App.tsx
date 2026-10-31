import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Activity, AlertTriangle, ArrowDownRight, ArrowUpRight, BarChart3, CalendarDays,
  Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudRain, CloudSun, Compass,
  Box, Droplets, Flame, Gauge, Globe2, Layers3, MapPin, Play, RadioTower, RefreshCw, Satellite,
  ShieldCheck, Sun, Thermometer, Wind, Zap,
} from 'lucide-react';
import {
  Area, AreaChart, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer,
  Tooltip as ChartTooltip, XAxis, YAxis,
} from 'recharts';
import WeatherScene, { type SceneWeather } from './components/WeatherScene';
import AreaMap from './components/AreaMap';
import AeiosPanel from './components/AeiosPanel';
import ForecastPanel from './components/ForecastPanel';
import SiteStatus from './components/SiteStatus';
import { ventilation, VENTILATION_POOR } from './lib/derived';
import DispersionPanel from './components/DispersionPanel';
import DispersionTwin from './components/DispersionTwin';
import SatellitePanel from './components/SatellitePanel';
import SmokeTracerPanel from './components/SmokeTracerPanel';
import { SmokeAlertHistory, SmokeBanner } from './components/SmokeAlerts';
import { api, compass, formatDay, formatHour, numeric, round, weatherLabel, type SiteId, type WeatherPayload } from './lib/api';

type LoadState = 'loading' | 'ready' | 'error';
type Layer = SceneWeather['layer'];

const SITES: Record<SiteId, { title: string; subtitle: string; lat: number; lon: number; code: string }> = {
  sgt: { title: 'SGT University', subtitle: 'Budhera campus · Gurugram', lat: 28.4782417, lon: 76.9040528, code: 'AEIOS-SGT-01' },
  chandu: { title: 'Chandu village', subtitle: 'Gurugram · Haryana', lat: 28.475, lon: 76.9167, code: 'AEIOS-CHD-01' },
};

const DAY_OPTIONS = [3, 4, 5, 7, 10, 15];
const SCENARIOS = [
  { value: 'dust_event', label: 'Dust / particulate episode', note: 'Elevated dust response and dry-air conditions' },
  { value: 'heat_stress', label: 'Heat stress episode', note: 'Temperature increase and humidity reduction' },
  { value: 'convective_storm', label: 'Convective storm', note: 'Cloud build-up, rainfall and gust response' },
  { value: 'gust_front', label: 'Gust front', note: 'Rapid wind speed increase and direction shift' },
  { value: 'baseline', label: 'Baseline replay', note: 'Replay the weather-model baseline without perturbation' },
];

function hourlyAt(hourly: Record<string, any[]> | undefined, key: string, index: number, fallback = 0): number {
  const values = hourly?.[key];
  return values && index >= 0 && index < values.length ? numeric(values[index], fallback) : fallback;
}

function buildDailyRows(daily: Record<string, any[]> | undefined, days: number) {
  if (!daily?.time) return [];
  return daily.time.slice(0, days).map((time, i) => ({
    date: String(time),
    label: formatDay(String(time)),
    max: numeric(daily.temperature_2m_max?.[i], 0),
    min: numeric(daily.temperature_2m_min?.[i], 0),
    rain: numeric(daily.precipitation_sum?.[i], 0),
    rainChance: numeric(daily.precipitation_probability_max?.[i], 0),
    wind: numeric(daily.wind_speed_10m_max?.[i], 0),
    gust: numeric(daily.wind_gusts_10m_max?.[i], 0),
    direction: numeric(daily.wind_direction_10m_dominant?.[i], 0),
    uv: numeric(daily.uv_index_max?.[i], 0),
    code: numeric(daily.weather_code?.[i], 3),
    sunrise: String(daily.sunrise?.[i] || ''),
    sunset: String(daily.sunset?.[i] || ''),
  }));
}

function WeatherGlyph({ code, size = 18 }: { code: unknown; size?: number }) {
  const c = numeric(code, 3);
  if (c === 0) return <Sun size={size} className="weather-sun" />;
  if ([1, 2].includes(c)) return <CloudSun size={size} className="weather-sun" />;
  if ([45, 48].includes(c)) return <CloudFog size={size} />;
  if ([51, 53, 55, 56, 57].includes(c)) return <CloudDrizzle size={size} />;
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(c)) return <CloudRain size={size} className="weather-rain" />;
  if ([95, 96, 99].includes(c)) return <CloudLightning size={size} className="weather-rain" />;
  return <Cloud size={size} />;
}

function MetricCard({ icon: Icon, label, value, unit, hint, accent = '' }: any) {
  return (
    <div className="metric-card">
      <div className="metric-top"><span className={`metric-icon ${accent}`}><Icon size={16} /></span><span>{label}</span></div>
      <div className="metric-value">{value}<small>{unit}</small></div>
      <div className="metric-hint">{hint}</div>
    </div>
  );
}

function SectionTitle({ kicker, title, right }: { kicker: string; title: string; right?: ReactNode }) {
  return <div className="section-title"><div><div className="eyebrow">{kicker}</div><h2>{title}</h2></div>{right}</div>;
}

export default function App({ userEmail = '', onSignOut }: { userEmail?: string; onSignOut?: () => void }) {
  const [site, setSite] = useState<SiteId>('sgt');
  const [days, setDays] = useState(15);
  const [weather, setWeather] = useState<WeatherPayload | null>(null);
  const [aq, setAq] = useState<WeatherPayload | null>(null);
  const [forecastMeta, setForecastMeta] = useState<{ cached: boolean; stale: boolean; source: string; warning?: string } | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [aqWarning, setAqWarning] = useState('');
  const [station, setStation] = useState<{ status: string; count: number; observations: any[]; note: string } | null>(null);
  const [hourIndex, setHourIndex] = useState(0);
  const [layer, setLayer] = useState<Layer>('wind');
  const [selectedDate, setSelectedDate] = useState('');
  const [simulation, setSimulation] = useState<any>(null);
  const [scenario, setScenario] = useState('dust_event');
  const [intensity, setIntensity] = useState(0.6);
  const [duration, setDuration] = useState(6);
  const [scenarioStart, setScenarioStart] = useState(3);
  const [simBusy, setSimBusy] = useState(false);
  const [simError, setSimError] = useState('');
  const [lastUpdated, setLastUpdated] = useState('');
  const [nav, setNav] = useState('overview');
  const [sceneKey, setSceneKey] = useState(0);

  const siteConfig = SITES[site];

  const load = useCallback(async (showLoading = true) => {
    if (showLoading) setLoadState('loading');
    try {
      const [forecastResult, stationResult] = await Promise.all([
        api.forecast(site, days),
        api.observations(site).catch(() => null),
      ]);
      setWeather(forecastResult.data);
      setForecastMeta({ cached: forecastResult.cached, stale: forecastResult.stale, source: forecastResult.source, warning: forecastResult.warning });
      setStation(stationResult);
      setLastUpdated(forecastResult.fetched_at || new Date().toISOString());
      setLoadState('ready');
      const hourlyTimes = forecastResult.data.hourly?.time || [];
      const currentTime = String((forecastResult.data.current as any)?.time || '');
      if (currentTime && hourlyTimes.length) {
        let nearest = 0;
        let distance = Number.POSITIVE_INFINITY;
        hourlyTimes.forEach((time, i) => {
          const d = Math.abs(new Date(String(time)).getTime() - new Date(currentTime).getTime());
          if (Number.isFinite(d) && d < distance) { nearest = i; distance = d; }
        });
        setHourIndex(nearest);
      }
      const firstDate = String(forecastResult.data.daily?.time?.[0] || '');
      setSelectedDate((old) => old || firstDate);
    } catch (error) {
      setLoadState('error');
      console.error(error);
    }
    try {
      const air = await api.airQuality(site);
      setAq(air.data);
      setAqWarning(air.warning || (air.stale ? 'Showing a cached air-quality model run.' : ''));
    } catch (error) {
      setAq(null);
      setAqWarning(error instanceof Error ? error.message : 'Air-quality model feed unavailable.');
    }
  }, [site, days]);

  useEffect(() => { void load(); }, [load]);

  const dailyRows = useMemo(() => buildDailyRows(weather?.daily as any, days), [weather, days]);
  const current = (weather?.current || {}) as Record<string, any>;
  const hourly = (weather?.hourly || {}) as Record<string, any[]>;
  const simulationMetric = useMemo(() => {
    if (!simulation) return null;
    const first = simulation.timeline?.find((row: any) => row.scenario_active) || simulation.timeline?.[0];
    if (simulation.scenario === 'dust_event') {
      if (first?.baseline_pm2_5 != null) return { key: 'pm2_5', baseline: 'baseline_pm2_5', label: 'PM2.5 concentration · illustrative scenario', unit: 'µg/m³' };
      return { key: 'dust_scenario_index', baseline: null, label: 'Dust scenario intensity · unitless', unit: 'index' };
    }
    if (simulation.scenario === 'convective_storm') return { key: 'precipitation', baseline: 'baseline_precipitation', label: 'Hourly precipitation response', unit: 'mm' };
    if (simulation.scenario === 'gust_front') return { key: 'wind_speed_10m', baseline: 'baseline_wind_speed_10m', label: '10 m wind response', unit: 'm/s' };
    return { key: 'temperature_2m', baseline: 'baseline_temperature_2m', label: '2 m temperature response', unit: '°C' };
  }, [simulation]);
  const simulationPeak = useMemo(() => {
    if (!simulation || !simulationMetric) return null;
    const values = simulation.timeline.map((row: any) => numeric(row[simulationMetric.key], 0));
    return values.length ? Math.max(...values) : null;
  }, [simulation, simulationMetric]);
  const selectedHour = Math.max(0, Math.min(hourIndex, (hourly.time?.length || 1) - 1));
  const selectedTime = String(hourly.time?.[selectedHour] || current.time || '');
  const sceneRow = simulation?.timeline?.[Math.min(selectedHour, (simulation.timeline.length || 1) - 1)];
  const getValue = (key: string, fallback = 0) => sceneRow && sceneRow[key] != null
    ? numeric(sceneRow[key], fallback) : hourlyAt(hourly, key, selectedHour, fallback);

  const sceneWeather: SceneWeather = {
    windSpeed: getValue('wind_speed_10m', numeric(current.wind_speed_10m, 0)),
    windDirection: getValue('wind_direction_10m', numeric(current.wind_direction_10m, 0)),
    gust: getValue('wind_gusts_10m', numeric(current.wind_gusts_10m, 0)),
    temperature: getValue('temperature_2m', numeric(current.temperature_2m, 25)),
    cloudCover: getValue('cloud_cover', numeric(current.cloud_cover, 30)),
    cloudLow: getValue('cloud_cover_low', hourlyAt(hourly, 'cloud_cover_low', selectedHour, 25)),
    cloudMid: getValue('cloud_cover_mid', hourlyAt(hourly, 'cloud_cover_mid', selectedHour, 35)),
    cloudHigh: getValue('cloud_cover_high', hourlyAt(hourly, 'cloud_cover_high', selectedHour, 45)),
    precipitation: getValue('precipitation', numeric(current.precipitation, 0)),
    layer,
    scenarioActive: Boolean(sceneRow?.scenario_active),
    dustLoading: numeric(sceneRow?.dust_scenario_index, 0),
    windLayers: [
      { label: '10 m AGL', speed: getValue('wind_speed_10m', 0), direction: getValue('wind_direction_10m', 0), altitude: 10,
        temperature: getValue('temperature_2m', 0), humidity: getValue('relative_humidity_2m', 0), cloud: getValue('cloud_cover', 0) },
      { label: '80 m AGL', speed: getValue('wind_speed_80m', 0), direction: getValue('wind_direction_80m', getValue('wind_direction_10m', 0)), altitude: 80,
        temperature: getValue('temperature_80m', 0) },
      { label: '950 hPa', speed: getValue('wind_speed_950hPa', 0), direction: getValue('wind_direction_950hPa', 0), altitude: hourlyAt(hourly, 'geopotential_height_950hPa', selectedHour, 500),
        temperature: getValue('temperature_950hPa', 0), humidity: getValue('relative_humidity_950hPa', 0), cloud: getValue('cloud_cover_950hPa', 0) },
      { label: '925 hPa', speed: getValue('wind_speed_925hPa', 0), direction: getValue('wind_direction_925hPa', 0), altitude: hourlyAt(hourly, 'geopotential_height_925hPa', selectedHour, 800),
        temperature: getValue('temperature_925hPa', 0), humidity: getValue('relative_humidity_925hPa', 0), cloud: getValue('cloud_cover_925hPa', 0) },
      { label: '850 hPa', speed: getValue('wind_speed_850hPa', 0), direction: getValue('wind_direction_850hPa', 0), altitude: hourlyAt(hourly, 'geopotential_height_850hPa', selectedHour, 1500),
        temperature: getValue('temperature_850hPa', 0), humidity: getValue('relative_humidity_850hPa', 0), cloud: getValue('cloud_cover_850hPa', 0) },
      { label: '700 hPa', speed: getValue('wind_speed_700hPa', 0), direction: getValue('wind_direction_700hPa', 0), altitude: hourlyAt(hourly, 'geopotential_height_700hPa', selectedHour, 3000),
        temperature: getValue('temperature_700hPa', 0), humidity: getValue('relative_humidity_700hPa', 0), cloud: getValue('cloud_cover_700hPa', 0) },
      { label: '500 hPa', speed: getValue('wind_speed_500hPa', 0), direction: getValue('wind_direction_500hPa', 0), altitude: hourlyAt(hourly, 'geopotential_height_500hPa', selectedHour, 5600),
        temperature: getValue('temperature_500hPa', 0), humidity: getValue('relative_humidity_500hPa', 0), cloud: getValue('cloud_cover_500hPa', 0) },
    ],
  };

  const next72 = useMemo(() => {
    const n = Math.min(72, hourly.time?.length || 0);
    const col = (k: string) => Array.from({ length: n }, (_, i) => numeric(hourly[k]?.[i], NaN)).filter(Number.isFinite);
    const t = col('temperature_2m'), ch = col('precipitation_probability'), w = col('wind_speed_10m');
    let poor = 0;
    for (let i = 0; i < n; i += 1) { const v = ventilation(hourly, i); if (v !== null && v < VENTILATION_POOR) poor += 1; }
    return {
      hours: n, poor,
      minT: t.length ? Math.round(Math.min(...t)) : '—', maxT: t.length ? Math.round(Math.max(...t)) : '—',
      rain: round(col('precipitation').reduce((a, b) => a + b, 0), 1), chance: ch.length ? Math.round(Math.max(...ch)) : '—',
      wind: w.length ? round(Math.max(...w), 1) : '—',
    };
  }, [hourly]);

  const hourlyChart = useMemo(() => {
    if (!hourly.time) return [];
    return hourly.time.map((time, i) => ({
      time: String(time),
      hour: formatHour(String(time)),
      temperature: numeric(hourly.temperature_2m?.[i], 0),
      feels: numeric(hourly.apparent_temperature?.[i], 0),
      rain: numeric(hourly.precipitation?.[i], 0),
      rainChance: numeric(hourly.precipitation_probability?.[i], 0),
      wind: numeric(hourly.wind_speed_10m?.[i], 0),
      gust: numeric(hourly.wind_gusts_10m?.[i], 0),
    })).filter((row) => !selectedDate || row.time.startsWith(selectedDate)).slice(0, 24);
  }, [hourly, selectedDate]);

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

  const runSimulation = async () => {
    setSimBusy(true); setSimError('');
    try {
      const result = await api.simulate({ site_id: site, scenario, intensity, duration_hours: duration, start_hour: scenarioStart });
      setSimulation(result);
      setHourIndex(scenarioStart);
      document.getElementById('simulation')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) {
      setSimError(error instanceof Error ? error.message : 'Scenario run failed.');
    } finally { setSimBusy(false); }
  };

  const clearSimulation = () => setSimulation(null);

  const navigate = (section: string) => {
    setNav(section);
    document.getElementById(section)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const aqiCurrent = numeric((aq?.current as any)?.us_aqi, NaN);
  const weatherUpdatedLabel = lastUpdated ? new Date(lastUpdated).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—';
  const dailyChart = dailyRows.map((d) => ({ date: d.label, max: d.max, min: d.min, rain: d.rain }));
  const currentDescription = weatherLabel(current.weather_code);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup">
          <div className="brand-mark"><span /><span /><span /></div>
          <div><div className="brand-name">AEIOS<span> / SENTINEL</span></div><div className="brand-caption">ENVIRONMENTAL INTELLIGENCE</div></div>
        </div>
        <div className="side-group-label">MONITOR</div>
        <nav className="side-nav" aria-label="Monitor">
          <button className={nav === 'overview' ? 'active' : ''} aria-current={nav === 'overview' ? 'page' : undefined} onClick={() => navigate('overview')}><Activity size={17} /> Overview</button>
          <button className={nav === 'air-quality' ? 'active' : ''} aria-current={nav === 'air-quality' ? 'page' : undefined} onClick={() => navigate('air-quality')}><Wind size={17} /> Air quality</button>
          <button className={nav === 'dispersion' ? 'active' : ''} aria-current={nav === 'dispersion' ? 'page' : undefined} onClick={() => navigate('dispersion')}><CloudFog size={17} /> Pollution dispersion</button>
          <button className={nav === 'twin' ? 'active' : ''} aria-current={nav === 'twin' ? 'page' : undefined} onClick={() => navigate('twin')}><Box size={17} /> 3D dispersion twin</button>
        </nav>
        <div className="side-group-label">EXPLORE</div>
        <nav className="side-nav" aria-label="Explore">
          <button className={nav === 'forecast' ? 'active' : ''} aria-current={nav === 'forecast' ? 'page' : undefined} onClick={() => navigate('forecast')}><CalendarDays size={17} /> Forecast</button>
          <button className={nav === 'smoke' ? 'active' : ''} aria-current={nav === 'smoke' ? 'page' : undefined} onClick={() => navigate('smoke')}><Flame size={17} /> Smoke origin</button>
          <button className={nav === 'satellite' ? 'active' : ''} aria-current={nav === 'satellite' ? 'page' : undefined} onClick={() => navigate('satellite')}><Satellite size={17} /> Satellite</button>
          <button className={nav === 'atmosphere' ? 'active' : ''} aria-current={nav === 'atmosphere' ? 'page' : undefined} onClick={() => navigate('atmosphere')}><Globe2 size={17} /> 3D atmosphere</button>
        </nav>
        <div className="side-group-label">TOOLS</div>
        <nav className="side-nav" aria-label="Tools">
          <button className={nav === 'simulation' ? 'active' : ''} aria-current={nav === 'simulation' ? 'page' : undefined} onClick={() => navigate('simulation')}><Layers3 size={17} /> Simulation lab</button>
        </nav>
        <div className="side-group-label">INFRASTRUCTURE</div>
        <nav className="side-nav" aria-label="Infrastructure">
          <button className={nav === 'aeios' ? 'active' : ''} aria-current={nav === 'aeios' ? 'page' : undefined} onClick={() => navigate('aeios')}><Zap size={17} /> AEIOS model</button>
          <button className={nav === 'station' ? 'active' : ''} aria-current={nav === 'station' ? 'page' : undefined} onClick={() => navigate('station')}><RadioTower size={17} /> Station network</button>
        </nav>
        <div className="sidebar-divider" />
        <div className="side-group-label">OBSERVATION ZONES</div>
        <button className={`site-link ${site === 'sgt' ? 'selected' : ''}`} onClick={() => setSite('sgt')}><span className="site-dot sgt-dot" /><span><b>SGT University</b><small>Budhera campus</small></span></button>
        <button className={`site-link ${site === 'chandu' ? 'selected' : ''}`} onClick={() => setSite('chandu')}><span className="site-dot chandu-dot" /><span><b>Chandu village</b><small>Gurugram, Haryana</small></span></button>
        <div className="sidebar-bottom">
          <div className="node-health-card">
            <div className="node-health-head"><span className="pulse-dot" /> LOCAL EDGE NODE</div>
            <b>Raspberry Pi 5 · node-gateway</b>
            <small>Local model inference · syncs to cloud</small>
            <div className="health-foot"><span><ShieldCheck size={12} /> Real data only</span><span className="health-pip">SYNC</span></div>
          </div>
          <div className="side-footer">AEIOS WEATHER SYSTEM <span>v0.1.0</span></div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumb"><span>AEIOS</span><i>/</i><b>Weather intelligence</b></div>
          <div className="topbar-actions">
            <span className="timezone-chip">IST · UTC+05:30</span>
            <button className="icon-button" onClick={() => void load(false)} title="Refresh weather data"><RefreshCw size={16} className={loadState === 'loading' ? 'spin' : ''} /></button>
            <button className="avatar-chip" onClick={onSignOut} title={userEmail ? `${userEmail} — click to sign out` : 'Sign out'}>{(userEmail[0] || 'A').toUpperCase()}</button>
          </div>
        </header>

        <SmokeBanner />

        <section id="overview" className="page-section overview-section">
          <div className="page-heading-row">
            <div>
              <div className="eyebrow">LOCAL WEATHER INTELLIGENCE · HARYANA, INDIA</div>
              <h1>{siteConfig.title}<span className="heading-dot">.</span></h1>
              <div className="location-sub"><MapPin size={14} /> {siteConfig.subtitle} <span className="coord-text">{siteConfig.lat.toFixed(4)}° N, {siteConfig.lon.toFixed(4)}° E</span></div>
            </div>
            <div className="heading-status">
              <div className={`status-chip ${loadState === 'ready' ? 'status-live' : loadState === 'error' ? 'status-error' : ''}`}>
                <span className="status-led" /> {loadState === 'ready' ? (forecastMeta?.stale ? 'CACHED MODEL FEED' : 'MODEL FEED CONNECTED') : loadState === 'error' ? 'FEED UNAVAILABLE' : 'CONNECTING MODEL FEED'}
              </div>
              <div className="last-refresh">Updated {weatherUpdatedLabel} IST</div>
            </div>
          </div>

          {loadState === 'error' && <div className="error-banner"><AlertTriangle size={16} /> Weather feed unavailable. The forecast comes straight from Open-Meteo, so check this device's internet connection. <button onClick={() => void load()}>Retry</button></div>}
          {forecastMeta?.warning && <div className="notice-banner"><AlertTriangle size={15} /> {forecastMeta.warning}</div>}

          <SiteStatus site={site} siteTitle={siteConfig.title} hourly={hourly} index={selectedHour} />

          <div className="current-weather-banner weather-secondary">
            <div className="current-main">
              <div className="current-kicker">WEATHER · REGIONAL MODEL ESTIMATE</div>
              <div className="current-temp">{round(current.temperature_2m)}<span>°</span></div>
              <div className="current-condition"><WeatherGlyph code={current.weather_code} size={21} /> {currentDescription}</div>
              <div className="current-feels">Feels like {round(current.apparent_temperature)}°C · {selectedTime ? formatDay(selectedTime.slice(0, 10), { weekday: 'long', day: 'numeric', month: 'long' }) : 'Local forecast'}</div>
            </div>
            <div className="current-divider" />
            <div className="current-stat-grid">
              <div><span><Droplets size={14} /> Humidity</span><b>{round(current.relative_humidity_2m)}<small>%</small></b></div>
              <div><span><Wind size={14} /> Wind</span><b>{round(current.wind_speed_10m, 1)}<small>m/s</small></b><em>{compass(current.wind_direction_10m)}</em></div>
              <div><span><Gauge size={14} /> Pressure</span><b>{round(current.pressure_msl)}<small>hPa</small></b></div>
              <div><span><CloudRain size={14} /> Rain now</span><b>{round(current.precipitation, 1)}<small>mm</small></b></div>
            </div>
            <div className="current-right">
              <div className="sun-orbit"><div className="sun-core"><Sun size={28} /></div><div className="orbit-dot" /></div>
              <div className="sun-times"><span>UV INDEX</span><b>{round(current.uv_index, 1)}</b></div>
              <div className="sun-times"><span>CLOUD COVER</span><b>{round(current.cloud_cover)}%</b></div>
            </div>
          </div>

          <div className="metric-grid">
            <MetricCard icon={Thermometer} label="Air temperature" value={round(current.temperature_2m)} unit="°C" hint={`Feels like ${round(current.apparent_temperature)}°C`} accent="mint" />
            <MetricCard icon={Droplets} label="Relative humidity" value={round(current.relative_humidity_2m)} unit="%" hint={`Dew point ${round(hourlyAt(hourly, 'dew_point_2m', selectedHour))}°C`} accent="blue" />
            <MetricCard icon={Wind} label="Wind speed · 10 m" value={round(current.wind_speed_10m, 1)} unit="m/s" hint={`Gusts ${round(current.wind_gusts_10m, 1)} m/s · ${compass(current.wind_direction_10m)}`} accent="amber" />
            <MetricCard icon={Gauge} label="Sea-level pressure" value={round(current.pressure_msl)} unit="hPa" hint={`Surface ${round(current.surface_pressure)} hPa`} accent="violet" />
            <MetricCard icon={Sun} label="Solar / UV" value={round(current.uv_index, 1)} unit=" UV" hint={`Radiation ${round(hourlyAt(hourly, 'shortwave_radiation', selectedHour))} W/m²`} accent="orange" />
          </div>
        </section>

        <DispersionPanel hourly={hourly} index={selectedHour} />

        <DispersionTwin />

        <section id="atmosphere" className="page-section">
          <SectionTitle kicker="ATMOSPHERIC FIELD VISUALIZATION" title="3D weather environment" right={<div className="model-status"><span className="status-led" /> REGIONAL MODEL FIELD</div>} />
          <div className="atmosphere-card">
            <div className="atmosphere-head">
              <div><div className="panel-title">Atmospheric volume · {siteConfig.title}</div><div className="panel-subtitle">Wind vectors, cloud layers and surface conditions · forecast-derived</div></div>
              <div className="layer-switcher" role="group" aria-label="Atmospheric layer">
                {([{ value: 'wind', label: 'Wind' }, { value: 'cloud', label: 'Cloud' }, { value: 'temperature', label: 'Thermal' }, { value: 'rain', label: 'Rain' }] as const).map((item) => <button key={item.value} onClick={() => setLayer(item.value)} className={layer === item.value ? 'selected' : ''}>{item.label}</button>)}
              </div>
            </div>
            <div className="scene-frame">
              <WeatherScene key={sceneKey} weather={sceneWeather} />
              <div className="scene-tag scene-tag-top"><span className="status-led" /> 3D MODEL VIEW · {simulation ? 'SCENARIO OVERLAY' : 'FORECAST FIELD'}</div>
              <div className="scene-tag scene-tag-bottom"><span className="scene-key"><i className="key-wind" /> WIND PARTICLES</span><span className="scene-key"><i className="key-cloud" /> CLOUD LAYERS</span><span className="scene-key"><i className="key-site" /> STATION SITES</span><span className="scene-gesture">DRAG / SWIPE TO ROTATE · SCROLL / PINCH TO ZOOM</span></div>
              <button className="scene-reset" onClick={() => setSceneKey((k) => k + 1)}>Reset view</button>
              <div className="scene-altitude" aria-hidden="true">500 hPa<br /><span>700 hPa</span><br /><span>850 hPa</span><br /><span>925 hPa</span><br /><span>10–80 m AGL</span></div>
            </div>
            <div className="scene-controls">
              <div className="timeline-label"><b>{selectedTime ? formatDay(selectedTime.slice(0, 10), { weekday: 'short', day: 'numeric', month: 'short' }) : 'Forecast'}</b><span>{formatHour(selectedTime)}</span></div>
              <input aria-label="Forecast hour" type="range" min={0} max={Math.min(71, Math.max(0, (hourly.time?.length || 1) - 1))} value={selectedHour} onChange={(e) => setHourIndex(Number(e.target.value))} />
              <div className="timeline-actions"><span>+0h</span><span>+24h</span><span>+48h</span><span>+72h</span><button onClick={clearSimulation} disabled={!simulation}>Clear scenario</button></div>
            </div>
            {simulation && <div className="scenario-active-note"><Zap size={14} /> Scenario overlay active: {simulation.scenario_label}. These are controlled perturbations, not forecast updates. <button onClick={clearSimulation}>Return to model</button></div>}
            <div className="profile-heading"><b>VERTICAL WIND PROFILE</b><span>m AGL = metres above ground level. hPa = air-pressure level, not a height; its geopotential height is the model's height for that pressure surface.</span></div>
            <div className="vertical-profile-grid">
              {sceneWeather.windLayers.map((windLayer) => <div key={windLayer.label}><span>{windLayer.label.toUpperCase()}</span><b>{round(windLayer.speed, 1)} <small>m/s</small></b><em>{round(windLayer.temperature, 1)}°C · {round(windLayer.humidity)}% RH</em>{windLayer.label.includes('hPa') && <em>Geopotential {round(windLayer.altitude)} m</em>}</div>)}
            </div>
            <div className="visualization-disclaimer"><AlertTriangle size={13} /> 3D view uses forecast wind vectors at near-surface heights and 950–500 hPa pressure levels, cloud-layer coverage and precipitation. Pressure-level heights vary with weather; geopotential height is used when returned. This is a model-field visualization, not a CFD solver, radar or direct upper-air sounding.</div>
          </div>
        </section>

        <section id="forecast" className="page-section">
          <SectionTitle kicker="NUMERICAL WEATHER PREDICTION" title="Extended forecast" right={<div className="range-switch">{DAY_OPTIONS.map((d) => <button key={d} onClick={() => setDays(d)} className={days === d ? 'active' : ''}>{d}d</button>)}</div>} />
          <div className="next72" aria-label="Next 72 hours summary">
            <div className="sp-label">NEXT 72 HOURS · REGIONAL MODEL</div>
            <div className="next72-grid">
              <div><span>Temperature</span><b>{next72.minT}–{next72.maxT}<small>°C</small></b></div>
              <div><span>Rain amount</span><b>{next72.rain}<small>mm</small></b></div>
              <div><span>Peak rain chance</span><b>{next72.chance}<small>%</small></b></div>
              <div><span>Peak wind</span><b>{next72.wind}<small>m/s</small></b></div>
              <div><span>Poor-dispersion hours</span><b>{next72.poor}<small>of {next72.hours} h</small></b></div>
            </div>
          </div>
          <div className="forecast-layout">
            <div className="panel forecast-chart-panel">
              <div className="panel-header"><div><div className="panel-title">Temperature outlook</div><div className="panel-subtitle">Daily maximum and minimum · °C</div></div><span className="legend-inline"><i className="legend-max" /> High <i className="legend-min" /> Low</span></div>
              {dailyChart.length ? <div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={dailyChart} margin={{ top: 12, right: 4, left: -20, bottom: 2 }}>
                <defs><linearGradient id="tempHigh" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#e9ad69" stopOpacity={0.23} /><stop offset="100%" stopColor="#e9ad69" stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid stroke="#443753" strokeDasharray="3 5" vertical={false} />
                <XAxis dataKey="date" tick={{ fill: '#9c8baf', fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fill: '#9c8baf', fontSize: 10 }} axisLine={false} tickLine={false} />
                <ChartTooltip contentStyle={{ background: '#100a17', border: '1px solid #473a57', borderRadius: 10, color: '#f1eff4' }} />
                <Area dataKey="max" type="monotone" stroke="#efb36e" fill="url(#tempHigh)" strokeWidth={2.1} name="Maximum" />
                <Line dataKey="min" type="monotone" stroke="#00e5ff" strokeWidth={2} dot={false} name="Minimum" />
              </ComposedChart></ResponsiveContainer></div> : <div className="empty-chart">Waiting for forecast values…</div>}
            </div>
            <div className="panel precipitation-panel">
              <div className="panel-title">Rain chance vs amount</div><div className="panel-subtitle">Bars: highest chance of rain that day (%). This is not how much will fall; amounts are in the table below.</div>
              <div className="rain-bars">{dailyRows.slice(0, 8).map((d) => <div className="rain-bar-item" key={d.date}><div className="rain-bar-track"><div className="rain-bar-fill" style={{ height: `${Math.max(2, d.rainChance)}%` }} /></div><b>{Math.round(d.rainChance)}%</b><span>{d.date.slice(5).replace('-', '/')}</span></div>)}</div>
              <div className="rain-total"><CloudRain size={17} /><span>Forecast rainfall</span><b>{round(dailyRows.slice(0, 3).reduce((sum, d) => sum + d.rain, 0), 1)} mm</b><small>Next 72 hours · total amount, a different measure from chance</small></div>
            </div>
          </div>
          <div className="panel hourly-panel">
            <div className="panel-header"><div><div className="panel-title">Hourly conditions</div><div className="panel-subtitle">{selectedDate ? formatDay(selectedDate, { weekday: 'long', day: 'numeric', month: 'long' }) : 'Select a forecast day'} · 24-hour profile</div></div><div className="day-select">{dailyRows.slice(0, 5).map((d) => <button key={d.date} className={selectedDate === d.date ? 'active' : ''} onClick={() => setSelectedDate(d.date)}>{formatDay(d.date, { weekday: 'short', day: 'numeric' })}</button>)}</div></div>
            {hourlyChart.length ? <div className="chart-wrap hourly-chart"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={hourlyChart} margin={{ top: 10, right: 8, left: -20, bottom: 2 }}>
              <CartesianGrid stroke="#443753" strokeDasharray="3 5" vertical={false} />
              <XAxis dataKey="hour" tick={{ fill: '#9c8baf', fontSize: 10 }} axisLine={false} tickLine={false} interval={3} />
              <YAxis yAxisId="temp" tick={{ fill: '#9c8baf', fontSize: 10 }} axisLine={false} tickLine={false} label={{ value: 'Temperature (°C)', angle: -90, position: 'insideLeft', fill: '#b3a8c0', fontSize: 10, dx: 22 }} />
              <YAxis yAxisId="rain" orientation="right" domain={[0, 100]} tick={{ fill: '#9c8baf', fontSize: 10 }} axisLine={false} tickLine={false} label={{ value: 'Rain chance (%)', angle: 90, position: 'insideRight', fill: '#b3a8c0', fontSize: 10, dx: -22 }} />
              <ChartTooltip contentStyle={{ background: '#100a17', border: '1px solid #473a57', borderRadius: 10, color: '#f1eff4' }} />
              <Area yAxisId="temp" dataKey="temperature" type="monotone" stroke="#eab16e" fill="#eab16e" fillOpacity={0.1} name="Temperature °C" />
              <Line yAxisId="temp" dataKey="feels" type="monotone" stroke="#00e5ff" strokeWidth={1.8} dot={false} name="Feels like °C" />
              <Line yAxisId="rain" dataKey="rainChance" type="monotone" stroke="#b889ed" strokeWidth={1.5} strokeDasharray="5 3" dot={false} name="Rain chance %" /><Legend verticalAlign="top" height={24} iconType="plainline" wrapperStyle={{ fontSize: 11, color: '#b3a8c0' }} />
            </ComposedChart></ResponsiveContainer></div> : <div className="empty-chart">Hourly profile unavailable.</div>}
          </div>
          <div className="panel outlook-panel">
            <div className="panel-header"><div><div className="panel-title">{days}-day weather outlook</div><div className="panel-subtitle">Regional numerical model · daily summary</div></div><span className="source-badge">OPEN-METEO MODEL</span></div>
            <div className="outlook-table-wrap"><table className="outlook-table"><thead><tr><th>DAY</th><th>CONDITIONS</th><th>TEMP RANGE</th><th>RAIN CHANCE</th><th>RAIN</th><th>WIND MAX</th><th>UV MAX</th></tr></thead><tbody>
              {dailyRows.map((d, i) => <tr key={d.date} className={selectedDate === d.date ? 'selected-row' : ''} onClick={() => { setSelectedDate(d.date); const idx = (hourly.time || []).findIndex((t: string) => t.startsWith(d.date)); if (idx >= 0) setHourIndex(idx); }}>
                <td><b>{i === 0 ? 'Today' : d.label}</b><small>{d.date}</small></td><td><span className="condition-cell"><WeatherGlyph code={d.code} size={17} /> {weatherLabel(d.code)}</span></td><td><b>{Math.round(d.max)}°</b><span className="muted-temp"> / {Math.round(d.min)}°</span></td><td>{Math.round(d.rainChance)}%</td><td>{d.rain.toFixed(1)} mm</td><td>{d.wind.toFixed(1)} m/s</td><td>{d.uv.toFixed(1)}</td>
              </tr>)}
            </tbody></table></div>
            <div className="table-footnote">Weather forecast available up to 16 days. Daily model values are estimates and can change as forecast runs update.</div>
          </div>
        </section>

        <section id="air-quality" className="page-section">
          <SectionTitle kicker="ATMOSPHERIC COMPOSITION" title="Air quality intelligence" right={<span className="source-badge">CAMS GLOBAL MODEL · ~45 KM · ABOUT 5 DAYS</span>} />
          <div className="air-grid">
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
                <CartesianGrid stroke="#443753" strokeDasharray="3 5" vertical={false} /><XAxis dataKey="time" tick={{ fill: '#9c8baf', fontSize: 10 }} axisLine={false} tickLine={false} interval={11} /><YAxis tick={{ fill: '#9c8baf', fontSize: 10 }} axisLine={false} tickLine={false} /><ChartTooltip contentStyle={{ background: '#100a17', border: '1px solid #473a57', borderRadius: 10, color: '#f1eff4' }} />
                <Area dataKey="pm2_5" type="monotone" stroke="#00e5ff" fill="url(#pm25Fill)" strokeWidth={2} name="PM2.5" /><Line dataKey="pm10" type="monotone" stroke="#a77bf0" strokeWidth={1.7} dot={false} name="PM10" />
              </ComposedChart></ResponsiveContainer></div> : <div className="empty-chart">Waiting for external air-quality model feed…</div>}
            </div>
          </div>
          <div className="panel" style={{ marginTop: 12 }}>
            <div className="panel-header"><div><div className="panel-title">Other pollutants · model now</div><div className="panel-subtitle">CAMS global estimates for this grid cell · µg/m³ unless noted</div></div><span className="source-badge">EXTERNAL_AIR_QUALITY_MODEL</span></div>
            <div className="extra-grid">
              {([
                ['carbon_monoxide', 'Carbon monoxide (CO)', 'µg/m³', 'Combustion and smoke tracer'],
                ['nitrogen_dioxide', 'Nitrogen dioxide (NO₂)', 'µg/m³', 'Traffic and industry'],
                ['sulphur_dioxide', 'Sulphur dioxide (SO₂)', 'µg/m³', 'Coal and diesel burning'],
                ['ozone', 'Ozone (O₃)', 'µg/m³', 'Forms in afternoon sunlight'],
                ['dust', 'Dust', 'µg/m³', 'Wind-blown mineral dust'],
                ['aerosol_optical_depth', 'Aerosol optical depth', '', 'Column haze (compare with Satellite)'],
              ] as const).map(([key, label, unit, hint]) => {
                const v = (aq?.current as any)?.[key];
                return <div key={key} className="extra-item"><span>{label}</span><b>{v === null || v === undefined ? '—' : round(v, key === 'aerosol_optical_depth' ? 2 : 0)}<small>{unit}</small></b><em>{hint}</em></div>;
              })}
            </div>
          </div>
        </section>

        <SatellitePanel site={site} />

        <SmokeTracerPanel site={site} />

        <section id="simulation" className="page-section">
          <SectionTitle kicker="DIGITAL TWIN · WHAT-IF ANALYSIS" title="Weather scenario laboratory" right={<span className="simulation-badge"><Zap size={12} /> SIMULATION ONLY</span>} />
          <div className="sim-banner" role="note"><Zap size={14} /> <b>Simulation only.</b> A deterministic what-if perturbation. It is not a new observation or a validated forecast, and it never changes official forecast data, sensor observations or trained-model predictions.</div>
          <div className="simulation-layout">
            <div className="panel simulation-controls">
              <div className="panel-title">Configure an event</div><div className="panel-subtitle">Perturb the numerical forecast baseline to explore environmental response.</div>
              <label className="field-label" htmlFor="scenario-select">SCENARIO TYPE</label>
              <select id="scenario-select" value={scenario} onChange={(e) => setScenario(e.target.value)}>{SCENARIOS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select>
              <div className="field-description">{SCENARIOS.find((s) => s.value === scenario)?.note}</div>
              <div className="range-field"><div><label htmlFor="intensity-range">EVENT INTENSITY</label><b>{Math.round(intensity * 100)}%</b></div><input id="intensity-range" type="range" min="10" max="100" value={Math.round(intensity * 100)} onChange={(e) => setIntensity(Number(e.target.value) / 100)} /></div>
              <div className="range-field"><div><label htmlFor="duration-range">EVENT DURATION</label><b>{duration} hours</b></div><input id="duration-range" type="range" min="1" max="24" value={duration} onChange={(e) => setDuration(Number(e.target.value))} /></div>
              <div className="range-field"><div><label htmlFor="start-range">START AFTER</label><b>{scenarioStart} hours</b></div><input id="start-range" type="range" min="0" max="48" value={scenarioStart} onChange={(e) => setScenarioStart(Number(e.target.value))} /></div>
              <button className="primary-button" onClick={() => void runSimulation()} disabled={simBusy || loadState !== 'ready'}><Play size={15} fill="currentColor" /> {simBusy ? 'Running scenario…' : 'Run scenario simulation'}</button>
              {simError && <div className="error-text">{simError}</div>}
              <div className="simulation-method"><ShieldCheck size={14} /><span>Deterministic scenario perturbation. Does not alter official forecast data, sensor observations or trained-model predictions.</span></div>
            </div>
            <div className="panel simulation-output">
              <div className="panel-header"><div><div className="panel-title">Scenario response · simulated</div><div className="panel-subtitle">Model baseline vs perturbed scenario · not an official forecast</div></div>{simulation && <span className="simulation-badge">RESULT GENERATED</span>}</div>
              {simulation ? <>
                <div className="simulation-result-head"><div><span>ACTIVE SCENARIO</span><b>{simulation.scenario_label}</b></div><div><span>EVENT WINDOW</span><b>{simulation.duration_hours} h · +{simulation.start_hour} h</b></div><div><span>PEAK {simulationMetric?.unit?.toUpperCase()}</span><b>{simulationPeak == null ? '—' : round(simulationPeak, 1)}</b></div></div>
                <div className="sim-metric-label">{simulationMetric?.label}</div>
                <div className="chart-wrap sim-chart"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={simulation.timeline.slice(0, 36)} margin={{ top: 12, right: 8, left: -18, bottom: 2 }}><CartesianGrid stroke="#443753" strokeDasharray="3 5" vertical={false} /><XAxis dataKey="time" tickFormatter={(v) => formatHour(v)} tick={{ fill: '#9c8baf', fontSize: 10 }} axisLine={false} tickLine={false} interval={5} /><YAxis tick={{ fill: '#9c8baf', fontSize: 10 }} axisLine={false} tickLine={false} /><ChartTooltip contentStyle={{ background: '#100a17', border: '1px solid #473a57', borderRadius: 10, color: '#f1eff4' }} labelFormatter={(v) => String(v)} />{simulationMetric?.baseline && <Line dataKey={simulationMetric.baseline} name="Model baseline" stroke="#a797b9" strokeDasharray="4 4" dot={false} /> }<Line dataKey={simulationMetric?.key || 'temperature_2m'} name="Scenario" stroke="#eab16e" strokeWidth={2} dot={false} /></ComposedChart></ResponsiveContainer></div>
                <div className="simulation-method"><AlertTriangle size={14} /> {simulation.method} {simulation.pollution_note ? ` ${simulation.pollution_note}` : ''}</div>
              </> : <div className="simulation-empty"><div className="simulation-orbit"><Layers3 size={32} /></div><b>Not run yet</b><span>Choose an event, intensity, duration and start time, then press Run. You will see the simulated response against the model baseline, plus a peak value for the event window.</span><div className="scenario-pills"><span>DUST</span><span>HEAT</span><span>STORM</span><span>GUST FRONT</span></div></div>}
            </div>
          </div>
        </section>

        <AeiosPanel />

        <ForecastPanel />

        <section id="station" className="page-section">
          <SectionTitle kicker="GROUND-TRUTH NETWORK" title="Station observations & site map" right={<span className={`status-chip ${station?.status === 'LIVE' ? 'status-live' : ''}`}><span className="status-led" /> {station?.status || 'CHECKING STATION'}</span>} />
          <div className="station-layout">
            <div className="panel station-map-panel">
              <div className="panel-header"><div><div className="panel-title">SGT · Chandu observation area</div><div className="panel-subtitle">Reference locations · approx. 1.29 km apart</div></div><span className="source-badge">OSM BASE MAP</span></div>
              <AreaMap selected={site} onSelect={setSite} />
              <div className="map-legend"><span><i className="site-dot sgt-dot" /> SGT University</span><span><i className="site-dot chandu-dot" /> Chandu village</span></div>
            </div>
            <div className="panel station-data-panel">
              <div className="panel-title">Physical station telemetry</div><div className="panel-subtitle">Live node values only · no model substitution</div>
              {station?.count ? <div className="telemetry-list">{station.observations.slice(0, 6).map((row: any) => <div className="telemetry-row" key={row.id}><b>{new Date(row.observed_at).toLocaleString('en-IN')} · {row.station_code}</b><span>Temp {row.temperature_c ?? '—'}°C</span><span>RH {row.humidity_pct ?? '—'}%</span><span>Pressure {row.pressure_hpa ?? '—'} hPa</span><span>PM2.5 {row.pm25_ugm3 ?? '—'} µg/m³</span><span>PM10 {row.pm10_ugm3 ?? '—'} µg/m³</span><span>BME gas {row.bme680_gas_resistance_ohm ?? '—'} Ω</span><span>MQ135 {row.mq135_mv ?? '—'} mV</span><span>GPS {row.gps_fix ? 'FIX' : 'NO FIX'}</span></div>)}</div> : <div className="station-waiting"><div className="waiting-icon"><RadioTower size={23} /></div><b>Waiting for physical station telemetry</b><span>The configured sensors are PMS5003, MQ135 and BME680. When the node/gateway posts readings, this panel will show actual field observations.</span><small>GPS + RTC metadata · LoRa transport integration pending</small></div>}
              <div className="sensor-strip"><div><span>PMS5003</span><b>PM1 · PM2.5 · PM10</b></div><div><span>BME680</span><b>T · RH · Pressure · Gas Ω</b></div><div><span>MQ135</span><b>Relative gas response</b></div><div><span>GPS / RTC</span><b>Position · Time</b></div></div>
            </div>
          </div>
        </section>

        <footer className="app-footer"><div><b>AEIOS SENTINEL</b><span>Local environmental intelligence for SGT University and Chandu village.</span></div><div className="footer-provenance"><span>WEATHER: OPEN-METEO</span><span>AIR QUALITY: CAMS</span><span>TIMEZONE: ASIA/KOLKATA</span></div><div className="footer-disclaimer">External model data is regional context. Local station data, model forecasts and scenario simulations are always identified separately.</div></footer>
      </main>
    </div>
  );
}
