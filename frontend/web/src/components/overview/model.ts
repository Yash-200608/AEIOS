/*
 * Overview state model. Pure functions only: NO runtime imports (so `node --test` can run it), no fetching, no Date.now().
 * Callers pass in the results of the existing selectors (freshness.ts, derived.ts) and the current time; this module only
 * decides which state to show and what to say. It never re-implements a threshold or the dispersion formula.
 * Rules enforced here: a missing value is null (never 0); a gateway heartbeat never makes a node current; "no alerts" and
 * "cannot assess" are different outcomes. Spec: docs/design/PHASE_2_COMMAND_CENTER_SPEC.md.
 */

export type Freshness = 'fresh' | 'stale' | 'never';
export type Packet = Record<string, unknown> | null | undefined;

const finite = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
/** Particulate columns use a negative number for "the sensor sent no frame". That is no reading, never zero. */
export const particulate = (v: unknown): number | null => {
  const n = finite(v);
  return n !== null && n >= 0 ? n : null;
};

/* ---------- Local observation ---------- */
export type ObservationState = 'valid' | 'stale' | 'no-reading' | 'no-packet';

export function observationState(input: { hasPacket: boolean; freshness: Freshness; pm25: number | null }): ObservationState {
  if (!input.hasPacket || input.freshness === 'never') return 'no-packet';
  if (input.freshness === 'stale') return 'stale';
  return input.pm25 === null ? 'no-reading' : 'valid';
}

export type PacketValues = {
  pm25: number | null; pm10: number | null; temp: number | null; rh: number | null; pressure: number | null; mqMv: number | null;
};
export function packetValues(p: Packet): PacketValues {
  return {
    pm25: particulate(p?.pm2_5), pm10: particulate(p?.pm10),
    temp: finite(p?.temp), rh: finite(p?.rh), pressure: finite(p?.pressure), mqMv: finite(p?.mq_mv),
  };
}

export function observationHeadline(state: ObservationState, node: string | undefined, packetAgo: string): { title: string; detail: string } {
  const n = node ? `Node ${node}` : 'The node';
  switch (state) {
    case 'valid': return { title: 'Current local reading', detail: `${n}, last packet ${packetAgo}.` };
    case 'stale': return { title: 'No current reading', detail: `${n} last transmitted ${packetAgo}. Its old values are not shown as current.` };
    case 'no-reading': return { title: 'No PM reading in the latest packet', detail: `${n} reported ${packetAgo} but its particulate sensor sent no value.` };
    default: return { title: 'No local reading', detail: node ? `${n} has not sent a packet yet.` : 'No node is assigned to this site.' };
  }
}

/* ---------- Assessment ---------- */
export type DispersionClass = { label: string; tone: 'good' | 'fair' | 'poor'; detail: string };

export function verdictView(cls: DispersionClass): { headline: string; known: boolean } {
  const known = cls.label !== 'Unknown';
  return { headline: known ? `${cls.label} dispersion` : 'Dispersion unknown', known };
}

export type EvidenceRow = { id: string; label: string; value: string | null; unit: string; note: string };
const fmt = (n: number, d = 0) => n.toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d });

export function dispersionEvidence(i: {
  vc: number | null; wind: number | null; inv: number | null; blh: number | null; poorAt: number; calmKmh: number;
}): EvidenceRow[] {
  const rows: EvidenceRow[] = [];
  rows.push(i.vc === null
    ? { id: 'vc', label: 'Ventilation coefficient', value: null, unit: 'm²/s', note: 'Not available from the model for this hour.' }
    : { id: 'vc', label: 'Ventilation coefficient', value: fmt(i.vc), unit: 'm²/s', note: `${i.vc < i.poorAt ? 'Below' : 'At or above'} the ${fmt(i.poorAt)} m²/s poor-dispersion threshold.` });
  rows.push(i.blh === null
    ? { id: 'blh', label: 'Mixing height', value: null, unit: 'm', note: 'Not available from the model for this hour.' }
    : { id: 'blh', label: 'Mixing height', value: fmt(i.blh), unit: 'm', note: 'Depth the air can mix pollutants through.' });
  rows.push(i.wind === null
    ? { id: 'wind', label: 'Mean wind, 10 to 180 m', value: null, unit: 'm/s', note: 'Not available from the model for this hour.' }
    : { id: 'wind', label: 'Mean wind, 10 to 180 m', value: fmt(i.wind, 1), unit: 'm/s', note: `${i.wind * 3.6 < i.calmKmh ? 'Calm' : 'Not calm'}: ${fmt(i.wind * 3.6)} km/h against a ${fmt(i.calmKmh)} km/h calm limit.` });
  rows.push(i.inv === null
    ? { id: 'inv', label: 'Inversion, 180 m minus 2 m', value: null, unit: '°C', note: 'Not available from the model for this hour.' }
    : { id: 'inv', label: 'Inversion, 180 m minus 2 m', value: `${i.inv > 0 ? '+' : ''}${fmt(i.inv, 1)}`, unit: '°C', note: i.inv > 0 ? 'Warmer air above cooler surface air: a lid that traps pollution near the ground.' : 'No lid: air can rise.' });
  return rows;
}

/** What the verdict cannot tell the operator. Deterministic text from real states only. */
export function assessmentLimits(i: { observation: ObservationState; modelStale: boolean; verdictKnown: boolean }): string[] {
  const out: string[] = [];
  if (!i.verdictKnown) out.push('The regional model fields needed for this verdict are not available right now.');
  if (i.observation !== 'valid') out.push('There is no current local PM2.5 reading, so this interpretation cannot be checked against a measurement at this site.');
  if (i.modelStale) out.push('The weather model feed is a cached run, not a fresh one.');
  out.push('Inputs are regional weather-model fields (Open-Meteo), not AEIOS sensor data.');
  return out;
}

/* ---------- Feed status (masthead) ---------- */
export function feedStatus(i: { loadState: 'loading' | 'ready' | 'error'; stale: boolean }): { label: string; tone: 'good' | 'warning' | 'critical' | 'neutral' } {
  if (i.loadState === 'error') return { label: 'Model feed unavailable', tone: 'critical' };
  if (i.loadState === 'loading') return { label: 'Connecting to model feed', tone: 'neutral' };
  return i.stale ? { label: 'Cached model run', tone: 'warning' } : { label: 'Model feed connected', tone: 'good' };
}

/* ---------- Operational health: three separate dimensions ---------- */
export type HealthState = 'online' | 'offline' | 'fresh' | 'stale' | 'nodata' | 'warming' | 'active' | 'unknown' | 'error';
export type HealthRow = { id: string; scope: 'Gateway' | 'Node' | 'Local model'; name: string; state: HealthState; detail: string };

export function healthRows(i: {
  loaded: boolean;
  gateway: { id: string; lastSeen: string; online: boolean } | null;
  nodes: Array<{ node: string; site: string; lastPacket: string | null; freshness: Freshness }>;
  totalPackets: number; matureAt: number; warming: boolean;
  fmtAgo: (iso?: string | null) => string;
}): HealthRow[] {
  const rows: HealthRow[] = [];
  if (!i.loaded) {
    return [{ id: 'gateway', scope: 'Gateway', name: 'Gateway', state: 'unknown', detail: 'Checking…' }];
  }
  rows.push(i.gateway
    ? { id: 'gateway', scope: 'Gateway', name: i.gateway.id, state: i.gateway.online ? 'online' : 'offline', detail: `Seen ${i.fmtAgo(i.gateway.lastSeen)}. Says nothing about the nodes.` }
    : { id: 'gateway', scope: 'Gateway', name: 'Gateway', state: 'offline', detail: 'Not seen yet.' });
  if (i.nodes.length === 0) {
    rows.push({ id: 'nodes', scope: 'Node', name: 'Nodes', state: 'nodata', detail: 'No node has reported to the cloud.' });
  }
  for (const n of i.nodes) {
    rows.push({
      id: `node-${n.node}`, scope: 'Node', name: `${n.node} · ${n.site}`,
      state: n.freshness === 'fresh' ? 'fresh' : n.freshness === 'stale' ? 'stale' : 'nodata',
      detail: n.lastPacket ? `Last packet ${i.fmtAgo(n.lastPacket)}.` : 'No packet received.',
    });
  }
  rows.push({
    id: 'model', scope: 'Local model', name: 'AEIOS local model', state: i.warming ? 'warming' : 'active',
    detail: i.warming
      ? `Warming up, not validated: ${i.totalPackets.toLocaleString('en-IN')} of about ${i.matureAt.toLocaleString('en-IN')} real packets.`
      : `${i.totalPackets.toLocaleString('en-IN')} real packets stored.`,
  });
  return rows;
}

/* ---------- Alerts ---------- */
export type AlertRow = { id: number; utc: string; site: string; level: 'WATCH' | 'WARNING'; message: string | null };
export type AlertOutcome =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'active'; alert: AlertRow; more: number }
  | { kind: 'none' }
  | { kind: 'cannot-assess'; reason: string };

export function alertOutcome(i: {
  alerts: AlertRow[] | null; error: string; siteCode: string; nowMs: number; windowHours: number; observation: ObservationState;
}): AlertOutcome {
  if (i.alerts === null) return i.error ? { kind: 'error', message: i.error } : { kind: 'loading' };
  const recent = i.alerts.filter((a) =>
    a.site === i.siteCode && !(a.message || '').startsWith('TEST ROW') && i.nowMs - Date.parse(a.utc) < i.windowHours * 3600000);
  if (recent.length) {
    const worst = recent.find((a) => a.level === 'WARNING') || recent[0];
    return { kind: 'active', alert: worst, more: recent.length - 1 };
  }
  if (i.observation !== 'valid') {
    return { kind: 'cannot-assess', reason: 'No WATCH or WARNING was raised, but there is no current node PM2.5, so a local episode cannot be ruled out.' };
  }
  return { kind: 'none' };
}

/* ---------- Outlook ---------- */
export function outlookSummary(series: Array<number | null>, poorAt: number): { hours: number; valid: number; poor: number; takeaway: string } {
  const valid = series.filter((v): v is number => v !== null).length;
  const poor = series.filter((v) => v !== null && v < poorAt).length;
  const limit = poorAt.toLocaleString('en-IN');
  let takeaway: string;
  if (valid === 0) takeaway = 'No model values are available for the next 48 hours.';
  else if (poor === valid) takeaway = `Ventilation is forecast to stay below ${limit} m²/s for all ${valid} hours, so dispersion stays poor.`;
  else if (poor === 0) takeaway = `Ventilation is forecast to stay at or above ${limit} m²/s for all ${valid} hours.`;
  else takeaway = `Ventilation is below ${limit} m²/s for ${poor} of the next ${valid} hours.`;
  return { hours: series.length, valid, poor, takeaway };
}

/* ---------- Regional air quality (CAMS, US AQI scale) ---------- */
export function aqiCategory(aqi: number | null): string | null {
  if (aqi === null || !Number.isFinite(aqi)) return null;
  if (aqi <= 50) return 'Good';
  if (aqi <= 100) return 'Moderate';
  if (aqi <= 150) return 'Unhealthy for sensitive groups';
  if (aqi <= 200) return 'Unhealthy';
  return 'Very unhealthy';
}
