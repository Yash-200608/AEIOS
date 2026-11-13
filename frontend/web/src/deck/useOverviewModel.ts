import { useEffect, useMemo, useState } from 'react';
import type { OperationalState } from '../design/primitives';
import { compass, numeric, type WeatherPayload } from '../lib/api';
import { CALM_WIND_KMH, dispersionClass, inversion, meanLowWind, ventilation, VENTILATION_POOR } from '../lib/derived';
import { ago, gatewayOnline, MODEL_MATURE_PACKETS, modelWarmingUp, nodeFreshness, siteReading, useAeios } from '../lib/freshness';
import { useAlerts } from '../components/SmokeAlerts';
import type { FeedCell } from '../components/overview/SystemRail';
import { istTime, localSlot } from '../components/overview/format';
import {
  alertOutcome, assessmentLimits, dispersionEvidence, feedStatus, healthRows, observationHeadline, observationState,
  packetValues, type Freshness, type HealthRow,
} from '../components/overview/model';
import type { Fixture } from '../components/overview/fixtures.dev';

/*
 * Everything the Overview derives from the weather model, the AEIOS gateway data and the alerts, in one place.
 * Used by the Briefing view (components/overview/Overview.tsx) and the command deck (deck/CommandDeck.tsx), so the two can
 * never disagree. It contains no formula of its own: every value comes from lib/derived, lib/freshness and overview/model.
 */
type Hourly = Record<string, any[]>;
export type OverviewProps = {
  site: 'sgt' | 'chandu'; title: string; subtitle: string; lat: number; lon: number;
  loadState: 'loading' | 'ready' | 'error'; forecastMeta: { stale: boolean; warning?: string } | null; lastUpdated: string;
  current: Record<string, any>; hourly: Hourly; selectedHour: number; selectedTime: string;
  aq: WeatherPayload | null; aqWarning: string; onRetry: () => void; onNavigate: (id: string) => void;
};

const SITE_NAME: Record<string, string> = { sgt: 'SGT University', chandu: 'Chandu village' };
export const ALERT_WINDOW_HOURS = 12;
export const finiteOrNull = (v: unknown) => { const n = numeric(v, NaN); return Number.isFinite(n) ? n : null; };
export const fixed = (v: unknown, d = 0) => { const n = finiteOrNull(v); return n === null ? null : d ? n.toFixed(d) : String(Math.round(n)); };

export function useOverviewModel(p: OverviewProps) {
  const liveAeios = useAeios();
  const liveAlerts = useAlerts();
  // Freshness is a function of time, not only of new data: re-derive the health rows every 30 s, so a node whose packets stop
  // goes from fresh to stale on screen even while the gateway poll keeps returning the same thing (or the same error).
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);

  // Development only: /?preview&fixture=<name> swaps in illustrative states. Removed from production builds.
  const fixtureName = import.meta.env.DEV ? new URLSearchParams(window.location.search).get('fixture') : null;
  const [fx, setFx] = useState<Fixture | null>(null);
  useEffect(() => {
    if (import.meta.env.DEV && fixtureName) {
      let alive = true;
      import('../components/overview/fixtures.dev').then((m) => { if (alive) setFx(m.FIXTURES[fixtureName]?.() ?? null); });
      return () => { alive = false; };
    }
  }, [fixtureName]);

  const aeios = fx ? { data: fx.aeios, error: fx.aeiosError ?? '' } : liveAeios;
  const alerts = fx ? { alerts: fx.alerts, error: fx.alertsError ?? '' } : liveAlerts;
  const loadState = fx?.loadState ?? p.loadState;
  const data = aeios.data;
  const loaded = data !== null || aeios.error !== '';

  // --- local observation (existing selector; the model decides the state) ---
  const reading = siteReading(data, p.site);
  const observation = observationState({ hasPacket: Boolean(reading.packet), freshness: reading.freshness, pm25: reading.pm25 });
  const packetRx = reading.packet ? String(reading.packet.rx_utc) : null;
  const packetAgo = packetRx ? ago(packetRx) : 'never';
  const values = packetValues(reading.packet);
  const failed = aeios.error !== '' && data === null; // the gateway data could not be loaded: readings are unknown, not absent
  const headline = failed
    ? { title: 'Local data unavailable', detail: 'The gateway data could not be loaded, so local readings are unknown. This is not the same as no reading.' }
    : observationHeadline(observation, reading.node, packetAgo);
  const stationState: OperationalState = !loaded ? 'checking' : failed ? 'unavailable' : observation === 'stale' ? 'stale' : observation === 'no-packet' ? 'nodata' : 'fresh';

  // --- assessment (existing derived.ts calculations; no formula here) ---
  const idx = p.selectedHour;
  const vc = ventilation(p.hourly, idx), wind = meanLowWind(p.hourly, idx), inv = inversion(p.hourly, idx);
  const cls = dispersionClass(vc, wind, inv);
  const evidence = dispersionEvidence({ vc, wind, inv, blh: finiteOrNull(p.hourly.boundary_layer_height?.[idx]), poorAt: VENTILATION_POOR, calmKmh: CALM_WIND_KMH });
  const limits = assessmentLimits({ observation, modelStale: Boolean(p.forecastMeta?.stale), verdictKnown: cls.label !== 'Unknown' });

  // --- operational health: gateway, each node, model maturity ---
  const health: HealthRow[] = useMemo(() => {
    if (aeios.error && !data) return [{ id: 'gateway', scope: 'Gateway', name: 'Gateway', state: 'error', detail: `Could not load gateway data: ${aeios.error}` }];
    const names = Array.from(new Set([...(data?.nodes || []).map((n) => n.node), ...(data?.latest || []).map((l) => String(l.node))])).sort();
    const siteOf = (node: string) => data?.nodes.find((n) => n.node === node)?.site_id ?? null;
    const rows = names.map((node) => {
      const rx = data?.latest.find((l) => l.node === node)?.rx_utc ?? null;
      const freshness: Freshness = nodeFreshness(rx);
      const site = siteOf(node);
      return { node, site: site ? SITE_NAME[site] ?? site : 'Site not assigned', lastPacket: rx ? String(rx) : null, freshness, here: site === p.site };
    }).sort((a, b) => Number(b.here) - Number(a.here));
    return healthRows({
      loaded, gateway: data?.gateway ? { id: data.gateway.device_id, lastSeen: data.gateway.last_seen, online: gatewayOnline(data) } : null,
      nodes: rows, totalPackets: data?.totalPackets ?? 0, matureAt: MODEL_MATURE_PACKETS, warming: modelWarmingUp(data), fmtAgo: ago,
    });
    // `data` identity changes on each poll, which is when freshness must be recomputed.
  }, [data, aeios.error, loaded, p.site, tick]);

  const outcome = alertOutcome({
    alerts: alerts.alerts, error: alerts.error, siteCode: p.site === 'sgt' ? 'SGT' : 'CHANDU', nowMs: Date.now(), windowHours: ALERT_WINDOW_HOURS, observation,
  });

  // --- outlook: ventilation for the next 48 hours (regional model) ---
  const outlookRows = useMemo(() => {
    const times = p.hourly.time || [];
    const rows: Array<{ time: string; vc: number | null; inv: number | null }> = [];
    for (let i = idx; i < Math.min(times.length, idx + 48); i += 1) rows.push({ time: String(times[i]), vc: ventilation(p.hourly, i), inv: inversion(p.hourly, i) });
    return rows;
  }, [p.hourly, idx]);

  // --- atmospheric column: existing hourly model fields at the selected hour ---
  const column = {
    blh: finiteOrNull(p.hourly.boundary_layer_height?.[idx]),
    temps: [2, 80, 120, 180].map((h) => ({ h, t: finiteOrNull(p.hourly[`temperature_${h}m`]?.[idx]) })),
    winds: [10, 80, 120, 180].map((h) => {
      const dir = finiteOrNull(p.hourly[`wind_direction_${h}m`]?.[idx]);
      return { h, speed: finiteOrNull(p.hourly[`wind_speed_${h}m`]?.[idx]), dir, from: dir === null ? '' : compass(dir) };
    }),
  };

  // --- data feeds the assessment depends on, shown beside the AEIOS edge in the telemetry strip ---
  const feed = feedStatus({ loadState, stale: Boolean(p.forecastMeta?.stale) });
  const feeds: FeedCell[] = [
    { id: 'feed-weather', scope: 'Weather model', name: 'Open-Meteo', state: loadState === 'error' ? 'unavailable' : loadState === 'loading' ? 'checking' : p.forecastMeta?.stale ? 'stale' : 'online',
      detail: loadState === 'ready' ? `Valid ${p.selectedTime ? localSlot(p.selectedTime) : '—'}; fetched ${istTime(p.lastUpdated)}.` : feed.label + '.' },
    { id: 'feed-aq', scope: 'Air-quality model', name: 'CAMS · ~45 km', state: p.aq ? (p.aqWarning ? 'stale' : 'online') : 'unavailable',
      detail: p.aq ? (p.aqWarning || 'Regional estimate, 3-hourly.') : (p.aqWarning || 'Not available.') },
  ];

  const aqiNumber = finiteOrNull((p.aq?.current as any)?.us_aqi);
  const modelHour = p.selectedTime ? localSlot(p.selectedTime) : '—';

  return {
    loadState, loaded, failed, reading, observation, packetAgo, values, headline, stationState, cls, evidence, limits, health,
    outcome, outlookRows, column, feeds, feed, aqiNumber, modelHour, vc, wind, inv, fixtureName,
  };
}

export type OverviewModel = ReturnType<typeof useOverviewModel>;
