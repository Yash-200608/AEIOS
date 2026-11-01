/*
 * Motion Lab data: the cached regional model run (api.forecast, localStorage cache first) plus development fixtures for the
 * gateway and alerts. Every value the Lab shows comes from the same selectors and model helpers as the Overview
 * (derived.ts, freshness.ts, overview/model.ts); nothing here re-implements a threshold or formula, and nothing is invented.
 */
import { useEffect, useState } from 'react';
import { api, compass, numeric, type AeiosOverview, type WeatherPayload } from '../lib/api';
import { CALM_WIND_KMH, dispersionClass, inversion, meanLowWind, ventilation, VENTILATION_POOR } from '../lib/derived';
import { ago, gatewayOnline, MODEL_MATURE_PACKETS, modelWarmingUp, nodeFreshness, siteReading } from '../lib/freshness';
import type { OperationalState } from '../design/primitives';
import type { SceneWeather } from '../components/WeatherScene';
import type { ColumnLevel, ColumnTemp } from '../components/overview/AtmosphericColumn';
import type { FeedCell } from '../components/overview/SystemRail';
import { istTime, localSlot } from '../components/overview/format';
import {
  alertOutcome,
  assessmentLimits,
  dispersionEvidence,
  feedStatus,
  healthRows,
  observationHeadline,
  observationState,
  packetValues,
  type AlertOutcome,
  type AlertRow,
  type DispersionClass,
  type EvidenceRow,
  type Freshness,
  type HealthRow,
  type HealthState,
  type ObservationState,
  type PacketValues,
} from '../components/overview/model';

export type LoadState = 'loading' | 'ready' | 'error';

// Same site anchor as App.tsx SITES.sgt (that table is not exported).
export const LAB_SITE = {
  id: 'sgt',
  code: 'SGT',
  title: 'SGT University',
  subtitle: 'Budhera campus · Gurugram',
  lat: 28.4782417,
  lon: 76.9040528,
} as const;
export const ALERT_WINDOW_HOURS = 12; // same window as the Overview
const SITE_NAME: Record<string, string> = { sgt: 'SGT University', chandu: 'Chandu village' };

/* ---------- The regional model run (cache first; the Lab never forces a network fetch) ---------- */
export type WeatherRun = {
  loadState: LoadState;
  payload: WeatherPayload | null;
  stale: boolean;
  cached: boolean;
  fetchedAt: string | null;
  warning: string;
  error: string;
};

export function useWeatherRun(): WeatherRun {
  const [run, setRun] = useState<WeatherRun>({
    loadState: 'loading',
    payload: null,
    stale: false,
    cached: false,
    fetchedAt: null,
    warning: '',
    error: '',
  });
  useEffect(() => {
    let alive = true;
    api
      .forecast(LAB_SITE.id, 15)
      .then((env) => {
        if (alive)
          setRun({
            loadState: 'ready',
            payload: env.data,
            stale: env.stale,
            cached: env.cached,
            fetchedAt: env.fetched_at,
            warning: env.warning ?? '',
            error: '',
          });
      })
      .catch((e: unknown) => {
        if (alive) setRun((r) => ({ ...r, loadState: 'error', error: e instanceof Error ? e.message : String(e) }));
      });
    return () => {
      alive = false;
    };
  }, []);
  return run;
}

/** Index of the hourly slot nearest the model run's own "current" time (same rule as App.tsx). */
export function currentHourIndex(payload: WeatherPayload | null): number {
  const times = payload?.hourly?.time ?? [];
  const now = String((payload?.current as Record<string, unknown> | undefined)?.time ?? '');
  if (!now || !times.length) return 0;
  let best = 0,
    distance = Number.POSITIVE_INFINITY;
  times.forEach((t, i) => {
    const d = Math.abs(new Date(String(t)).getTime() - new Date(now).getTime());
    if (Number.isFinite(d) && d < distance) {
      best = i;
      distance = d;
    }
  });
  return best;
}

const finiteOrNull = (v: unknown): number | null => {
  const n = numeric(v, Number.NaN);
  return Number.isFinite(n) ? n : null;
};

/* ---------- Gateway / alert snapshot (fixtures) ---------- */
export type Telemetry = { aeios: AeiosOverview | null; aeiosError: string; alerts: AlertRow[] | null; alertsError: string };

const HEALTH_TO_STATE: Record<HealthState, OperationalState> = {
  // same mapping as SystemRail
  online: 'online',
  offline: 'offline',
  fresh: 'fresh',
  stale: 'stale',
  nodata: 'nodata',
  warming: 'warming',
  active: 'active',
  unknown: 'checking',
  error: 'unavailable',
};

/** Health rows exactly as the Overview builds them (gateway, every node with its own freshness, local model maturity). */
export function healthFor(t: Telemetry, site: string): HealthRow[] {
  const data = t.aeios;
  const loaded = data !== null || t.aeiosError !== '';
  if (t.aeiosError && !data)
    return [{ id: 'gateway', scope: 'Gateway', name: 'Gateway', state: 'error', detail: `Could not load gateway data: ${t.aeiosError}` }];
  const names = Array.from(new Set([...(data?.nodes || []).map((n) => n.node), ...(data?.latest || []).map((l) => String(l.node))])).sort();
  const siteOf = (node: string) => data?.nodes.find((n) => n.node === node)?.site_id ?? null;
  const rows = names
    .map((node) => {
      const rx = data?.latest.find((l) => l.node === node)?.rx_utc ?? null;
      const freshness: Freshness = nodeFreshness(rx);
      const s = siteOf(node);
      return { node, site: s ? (SITE_NAME[s] ?? s) : 'Site not assigned', lastPacket: rx ? String(rx) : null, freshness, here: s === site };
    })
    .sort((a, b) => Number(b.here) - Number(a.here));
  return healthRows({
    loaded,
    gateway: data?.gateway ? { id: data.gateway.device_id, lastSeen: data.gateway.last_seen, online: gatewayOnline(data) } : null,
    nodes: rows,
    totalPackets: data?.totalPackets ?? 0,
    matureAt: MODEL_MATURE_PACKETS,
    warming: modelWarmingUp(data),
    fmtAgo: ago,
  });
}

/** Local observation for the site, decided by the Overview state model. */
export function observationFor(t: Telemetry, site: string) {
  const data = t.aeios;
  const loaded = data !== null || t.aeiosError !== '';
  const reading = siteReading(data, site);
  const observation = observationState({ hasPacket: Boolean(reading.packet), freshness: reading.freshness, pm25: reading.pm25 });
  const rx = reading.packet ? String(reading.packet.rx_utc) : null;
  const packetAgo = rx ? ago(rx) : 'never';
  const failed = t.aeiosError !== '' && data === null;
  const headline = failed
    ? {
        title: 'Local data unavailable',
        detail: 'The gateway data could not be loaded, so local readings are unknown. This is not the same as no reading.',
      }
    : observationHeadline(observation, reading.node, packetAgo);
  const stationState: OperationalState = !loaded
    ? 'checking'
    : failed
      ? 'unavailable'
      : observation === 'stale'
        ? 'stale'
        : observation === 'no-packet'
          ? 'nodata'
          : 'fresh';
  return {
    loaded,
    failed,
    node: reading.node,
    rx,
    packetAgo,
    observation,
    headline,
    stationState,
    values: packetValues(reading.packet),
    hasPacket: Boolean(reading.packet),
  };
}

export function alertFor(t: Telemetry, observation: ObservationState): AlertOutcome {
  return alertOutcome({
    alerts: t.alerts,
    error: t.alertsError,
    siteCode: LAB_SITE.code,
    nowMs: Date.now(),
    windowHours: ALERT_WINDOW_HOURS,
    observation,
  });
}

/* ---------- Everything a prototype renders, for one model hour and one telemetry snapshot ---------- */
export type LabModel = {
  loadState: LoadState;
  stale: boolean;
  warning: string;
  error: string;
  hourly: Record<string, Array<string | number | null>>;
  idx: number;
  validTime: string;
  modelHour: string;
  fetched: string;
  cls: DispersionClass;
  evidence: EvidenceRow[];
  limits: string[];
  criteria: { vc: number | null; wind: number | null; inv: number | null; blh: number | null; poorAt: number; calmKmh: number };
  column: { blh: number | null; temps: ColumnTemp[]; winds: ColumnLevel[] };
  feed: ReturnType<typeof feedStatus>;
  feedCells: FeedCell[];
  railCells: FeedCell[];
  obs: ReturnType<typeof observationFor> & { values: PacketValues };
  health: HealthRow[];
  outcome: AlertOutcome;
  outlookRows: Array<{ time: string; vc: number | null; inv: number | null }>;
  scene: SceneWeather;
};

export function buildModel(run: WeatherRun, t: Telemetry): LabModel {
  const hourly = (run.payload?.hourly ?? {}) as Record<string, Array<string | number | null>>;
  const current = (run.payload?.current ?? {}) as Record<string, unknown>;
  const len = hourly.time?.length ?? 0;
  const idx = Math.max(0, Math.min(currentHourIndex(run.payload), Math.max(0, len - 1)));
  const validTime = String(hourly.time?.[idx] ?? current.time ?? '');
  const modelHour = validTime ? localSlot(validTime) : '—';
  const at = (key: string): number | null => finiteOrNull(hourly[key]?.[idx]);

  // Assessment: existing derived.ts calculations only.
  const vc = ventilation(hourly, idx),
    wind = meanLowWind(hourly, idx),
    inv = inversion(hourly, idx);
  const cls = dispersionClass(vc, wind, inv);
  const blh = at('boundary_layer_height');
  const obs = observationFor(t, LAB_SITE.id);
  const evidence = dispersionEvidence({ vc, wind, inv, blh, poorAt: VENTILATION_POOR, calmKmh: CALM_WIND_KMH });
  const limits = assessmentLimits({ observation: obs.observation, modelStale: run.stale, verdictKnown: cls.label !== 'Unknown' });

  // Atmospheric column: the same model fields the Overview column uses.
  const column = {
    blh,
    temps: [2, 80, 120, 180].map((h) => ({ h, t: at(`temperature_${h}m`) })),
    winds: [10, 80, 120, 180].map((h) => {
      const dir = at(`wind_direction_${h}m`);
      return { h, speed: at(`wind_speed_${h}m`), dir, from: dir === null ? '' : compass(dir) };
    }),
  };

  const feed = feedStatus({ loadState: run.loadState, stale: run.stale });
  const feedCells: FeedCell[] = [
    {
      id: 'feed-weather',
      scope: 'Weather model',
      name: 'Open-Meteo',
      state: run.loadState === 'error' ? 'unavailable' : run.loadState === 'loading' ? 'checking' : run.stale ? 'stale' : 'online',
      detail: run.loadState === 'ready' ? `Valid ${modelHour}; fetched ${istTime(run.fetchedAt)}.` : `${feed.label}.`,
    },
  ];
  const health = healthFor(t, LAB_SITE.id);
  const railCells: FeedCell[] = [
    ...feedCells,
    ...health.map((r) => ({ id: r.id, scope: r.scope, name: r.name, state: HEALTH_TO_STATE[r.state], detail: r.detail })),
  ];

  const outlookRows: LabModel['outlookRows'] = [];
  for (let i = idx; i < Math.min(len, idx + 48); i += 1)
    outlookRows.push({ time: String(hourly.time?.[i]), vc: ventilation(hourly, i), inv: inversion(hourly, i) });

  // 3D scene input built like App.tsx (no simulation row in the Lab): missing values stay null, never 0.
  const cur = (key: string) => finiteOrNull(current[key]);
  const pressureLayer = (hPa: number, nominal: number) => {
    const geopotential = at(`geopotential_height_${hPa}hPa`);
    return {
      label: `${hPa} hPa`,
      speed: at(`wind_speed_${hPa}hPa`),
      direction: at(`wind_direction_${hPa}hPa`),
      altitude: geopotential ?? nominal,
      geopotential,
      temperature: at(`temperature_${hPa}hPa`),
      humidity: at(`relative_humidity_${hPa}hPa`),
      cloud: at(`cloud_cover_${hPa}hPa`),
    };
  };
  const scene: SceneWeather = {
    windSpeed: at('wind_speed_10m') ?? cur('wind_speed_10m'),
    windDirection: at('wind_direction_10m') ?? cur('wind_direction_10m'),
    gust: at('wind_gusts_10m') ?? cur('wind_gusts_10m'),
    temperature: at('temperature_2m') ?? cur('temperature_2m'),
    cloudCover: at('cloud_cover') ?? cur('cloud_cover'),
    cloudLow: at('cloud_cover_low'),
    cloudMid: at('cloud_cover_mid'),
    cloudHigh: at('cloud_cover_high'),
    precipitation: at('precipitation') ?? cur('precipitation'),
    layer: 'wind',
    scenarioActive: false,
    dustLoading: 0,
    windLayers: [
      {
        label: '10 m AGL',
        speed: at('wind_speed_10m'),
        direction: at('wind_direction_10m'),
        altitude: 10,
        temperature: at('temperature_2m'),
        humidity: at('relative_humidity_2m'),
        cloud: at('cloud_cover'),
      },
      {
        label: '80 m AGL',
        speed: at('wind_speed_80m'),
        direction: at('wind_direction_80m'),
        altitude: 80,
        temperature: at('temperature_80m'),
      },
      pressureLayer(950, 500),
      pressureLayer(925, 800),
      pressureLayer(850, 1500),
      pressureLayer(700, 3000),
      pressureLayer(500, 5600),
    ],
  };

  return {
    loadState: run.loadState,
    stale: run.stale,
    warning: run.warning,
    error: run.error,
    hourly,
    idx,
    validTime,
    modelHour,
    fetched: istTime(run.fetchedAt),
    cls,
    evidence,
    limits,
    criteria: { vc, wind, inv, blh, poorAt: VENTILATION_POOR, calmKmh: CALM_WIND_KMH },
    column,
    feed,
    feedCells,
    railCells,
    obs,
    health,
    outcome: alertFor(t, obs.observation),
    outlookRows,
    scene,
  };
}

/* ---------- once-per-session flags (sessionStorage may be blocked: then the reveal simply plays) ---------- */
export function playedThisSession(key: string): boolean {
  try {
    return window.sessionStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}
export function markPlayed(key: string): void {
  try {
    window.sessionStorage.setItem(key, '1');
  } catch {
    /* storage blocked */
  }
}
