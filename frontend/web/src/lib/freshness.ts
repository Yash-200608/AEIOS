import { useEffect, useState } from 'react';
import { api, type AeiosOverview } from './api';
import { checkPm, localAqi, type LocalAqi } from './pmQuality';

// "Connected" is not "current": gateway link, node packets and local-model maturity are three separate states.
export const GATEWAY_ONLINE_MS = 120_000;
export const NODE_STALE_MS = 30 * 60_000;
// The local model learns online. A week of packets (~10,000 at one per minute) would give a trustworthy forecast;
// the gate is deliberately lowered to 100 so predictions show early, accepting lower accuracy. Nodes report every 300 s
// (csv_v0 sampling_interval_s), so 100 packets is roughly 8 h from one node, less when several nodes report.
export const MODEL_MATURE_PACKETS = 100;

export function ago(iso?: string | null): string {
  if (!iso) return 'never';
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 90) return `${s}s ago`;
  if (s < 5400) return `${Math.round(s / 60)} min ago`;
  if (s < 172800) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} days ago`;
}

export type NodeFreshness = 'fresh' | 'stale' | 'never';

export function nodeFreshness(rxUtc?: string | null): NodeFreshness {
  if (!rxUtc) return 'never';
  return Date.now() - new Date(rxUtc).getTime() > NODE_STALE_MS ? 'stale' : 'fresh';
}

export function gatewayOnline(data: AeiosOverview | null): boolean {
  return Boolean(data?.gateway && Date.now() - new Date(data.gateway.last_seen).getTime() < GATEWAY_ONLINE_MS);
}

export function modelWarmingUp(data: AeiosOverview | null): boolean {
  return (data?.totalPackets ?? 0) < MODEL_MATURE_PACKETS;
}

/**
 * Newest node packet for a site, with its freshness. Its PM is only used when it passes checkPm (no "-1" no-frame marker,
 * within the sensor range, PM2.5 ≤ PM10); otherwise pm25 is null and pmCheck says why.
 */
export function siteReading(data: AeiosOverview | null, site: string) {
  const node = data?.nodes.find((n) => n.site_id === site)?.node;
  const packet = node ? data?.latest.find((l) => l.node === node) : undefined;
  const pmCheck = packet ? checkPm(packet) : null;
  const pm25 = pmCheck?.ok ? pmCheck.pm25 : null;
  return { node, packet, pm25, pmCheck, freshness: nodeFreshness(packet?.rx_utc) };
}

/** Indicative local AQI for a node from the last hour of its packets (filtered). Null when there is no node. */
export function nodeAqi(data: AeiosOverview | null, node: string | undefined, nowMs = Date.now()): LocalAqi | null {
  if (!data || !node) return null;
  return localAqi(data.recent ?? data.latest, node, nowMs);
}

// One shared poll for every consumer (status hero, sensor panel, alert panel).
type State = { data: AeiosOverview | null; error: string };
let state: State = { data: null, error: '' };
const listeners = new Set<(s: State) => void>();
let timer: ReturnType<typeof setInterval> | undefined;

/*
 * Poll rate. Normally 30 s. Open the dashboard with ?live (for a demo) and it re-reads the gateway data every second, so a node's
 * packets show up as they arrive. Only the node data is read this fast; weather and air-quality models keep their own cadence.
 */
export const POLL_MS = new URLSearchParams(window.location.search).has('live') ? 1_000 : 30_000;

let inFlight = false; // a slow request is never overlapped by the next tick
function refresh() {
  if (inFlight) return;
  inFlight = true;
  api.aeios()
    .then((data) => { state = { data, error: '' }; })
    .catch((e) => { state = { data: state.data, error: String(e?.message || e) }; })
    .finally(() => { inFlight = false; listeners.forEach((l) => l(state)); });
}

export function useAeios(): State {
  const [s, setS] = useState(state);
  useEffect(() => {
    listeners.add(setS);
    if (listeners.size === 1) { refresh(); timer = setInterval(refresh, POLL_MS); } else setS(state);
    return () => {
      listeners.delete(setS);
      if (!listeners.size && timer) { clearInterval(timer); timer = undefined; }
    };
  }, []);
  return s;
}
