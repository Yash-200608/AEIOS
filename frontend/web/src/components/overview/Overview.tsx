import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import './overview.css';
import { EmptyState, type OperationalState } from '../../design/primitives';
import { compass, numeric, type WeatherPayload } from '../../lib/api';
import { CALM_WIND_KMH, dispersionClass, inversion, meanLowWind, ventilation, VENTILATION_POOR } from '../../lib/derived';
import { ago, gatewayOnline, MODEL_MATURE_PACKETS, modelWarmingUp, nodeFreshness, siteReading, useAeios } from '../../lib/freshness';
import { RevealControls, RevealGroup, RevealRoot } from '../../motion/reveal';
import { useAlerts } from '../SmokeAlerts';
import AlertSummary from './AlertSummary';
import EnvironmentalAssessment from './EnvironmentalAssessment';
import OutlookRibbon from './OutlookRibbon';
import SituationHeader from './SituationHeader';
import SystemRail, { type FeedCell } from './SystemRail';
import LocalObservations from './LocalObservations';
import OverviewDestinations from './OverviewDestinations';
import RegionalContext from './RegionalContext';
import { istTime, localSlot } from './format';
import {
  alertOutcome, assessmentLimits, dispersionEvidence, feedStatus, healthRows, observationHeadline, observationState,
  packetValues, type Freshness, type HealthRow,
} from './model';
import type { Fixture } from './fixtures.dev';

type Hourly = Record<string, any[]>;
export type OverviewProps = {
  site: 'sgt' | 'chandu'; title: string; subtitle: string; lat: number; lon: number;
  loadState: 'loading' | 'ready' | 'error'; forecastMeta: { stale: boolean; warning?: string } | null; lastUpdated: string;
  current: Record<string, any>; hourly: Hourly; selectedHour: number; selectedTime: string;
  aq: WeatherPayload | null; aqWarning: string; onRetry: () => void; onNavigate: (id: string) => void;
};

const SITE_NAME: Record<string, string> = { sgt: 'SGT University', chandu: 'Chandu village' };
const ALERT_WINDOW_HOURS = 12;
const finiteOrNull = (v: unknown) => { const n = numeric(v, NaN); return Number.isFinite(n) ? n : null; };
const fixed = (v: unknown, d = 0) => { const n = finiteOrNull(v); return n === null ? null : d ? n.toFixed(d) : String(Math.round(n)); };

export default function Overview(p: OverviewProps) {
  const liveAeios = useAeios();
  const liveAlerts = useAlerts();

  // Development only: /?preview&fixture=<name> swaps in illustrative states. Removed from production builds.
  const fixtureName = import.meta.env.DEV ? new URLSearchParams(window.location.search).get('fixture') : null;
  const [fx, setFx] = useState<Fixture | null>(null);
  useEffect(() => {
    if (import.meta.env.DEV && fixtureName) {
      let alive = true;
      import('./fixtures.dev').then((m) => { if (alive) setFx(m.FIXTURES[fixtureName]?.() ?? null); });
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
  }, [data, aeios.error, loaded, p.site]);

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

  return (
    <section id="overview" className="page-section" aria-label="Overview">
      <RevealRoot className="cc">
        {fixtureName && (
          <div className="cc-dev" role="note"><AlertTriangle size={16} aria-hidden="true" /> <span><strong>Development fixture &quot;{fixtureName}&quot;.</strong> Illustrative state for visual checks, not real data. Not present in production builds.</span></div>
        )}
        <RevealControls />
        <SituationHeader
          cls={cls} loadState={loadState} site={p.title} subtitle={p.subtitle} lat={p.lat} lon={p.lon} feed={feed}
          modelFetched={istTime(p.lastUpdated)} modelHour={modelHour} stationNode={reading.node} stationState={stationState}
          stationAgo={!loaded ? 'checking…' : failed ? 'unknown (gateway data unavailable)' : packetAgo}
        />
        {p.forecastMeta?.warning && (
          <div style={{ marginTop: 'var(--aeios-space-6)' }}><EmptyState kind="stale" title="Weather model feed is a cached run">{p.forecastMeta.warning}</EmptyState></div>
        )}
        <div className="cc-band">
          <RevealGroup group="assessment" className="cc-band__main">
            <EnvironmentalAssessment
              loadState={loadState} evidence={evidence} limits={limits} hourLabel={modelHour} column={column} onNavigate={p.onNavigate} onRetry={p.onRetry}
              criteria={{ vc, wind, inv, blh: column.blh, poorAt: VENTILATION_POOR, calmKmh: CALM_WIND_KMH }}
            />
          </RevealGroup>
          <RevealGroup group="evidence" className="cc-band__side">
            <LocalObservations loaded={loaded} failed={failed} state={observation} node={reading.node} headline={headline} values={values} last={reading.packet ? values : null} packetAgo={packetAgo} />
          </RevealGroup>
        </div>
        <SystemRail feeds={feeds} rows={health} onNavigate={p.onNavigate} />
        <div className="cc-band cc-band--b">
          <RevealGroup group="outlook" className="cc-band__alerts"><AlertSummary outcome={outcome} windowHours={ALERT_WINDOW_HOURS} onNavigate={p.onNavigate} /></RevealGroup>
          <RevealGroup group="outlook" className="cc-band__outlook"><OutlookRibbon rows={outlookRows} poorAt={VENTILATION_POOR} loadState={loadState} onNavigate={p.onNavigate} /></RevealGroup>
        </div>
        <div className="cc-grid">
          <div className="cc-span-12">
            <RegionalContext
              weather={{ temp: fixed(p.current.temperature_2m, 1), humidity: fixed(p.current.relative_humidity_2m), wind: fixed(p.current.wind_speed_10m, 1), windDir: compass(p.current.wind_direction_10m) ? `from ${compass(p.current.wind_direction_10m)}` : '', pressure: fixed(p.current.pressure_msl), uv: fixed(p.current.uv_index, 1) }}
              aqi={aqiNumber} aqPm25={fixed((p.aq?.current as any)?.pm2_5)} aqWarning={p.aqWarning} aqAvailable={p.aq !== null}
            />
          </div>
          <div className="cc-span-12"><OverviewDestinations onNavigate={p.onNavigate} /></div>
        </div>
      </RevealRoot>
    </section>
  );
}
