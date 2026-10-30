import { useEffect, useState } from 'react';
import { api, type AeiosOverview } from './api';

// "Connected" is not "current": gateway link, node packets and local-model maturity are three separate states.
export const GATEWAY_ONLINE_MS = 120_000;
export const NODE_STALE_MS = 30 * 60_000;
// The local model learns online and needs roughly a week of real packets. At the nominal one packet per minute that is ~10,000.
export const MODEL_MATURE_PACKETS = 10_000;

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

/** Newest node packet for a site, with its freshness. PM2.5 below zero is the node's "no reading" marker. */
export function siteReading(data: AeiosOverview | null, site: string) {
  const node = data?.nodes.find((n) => n.site_id === site)?.node;
  const packet = node ? data?.latest.find((l) => l.node === node) : undefined;
  const pm25 = packet && Number.isFinite(Number(packet.pm2_5)) && Number(packet.pm2_5) >= 0 ? Number(packet.pm2_5) : null;
  return { node, packet, pm25, freshness: nodeFreshness(packet?.rx_utc) };
}

// One shared poll for every consumer (status hero, sensor panel, alert panel).
type State = { data: AeiosOverview | null; error: string };
let state: State = { data: null, error: '' };
const listeners = new Set<(s: State) => void>();
let timer: ReturnType<typeof setInterval> | undefined;

function refresh() {
  api.aeios()
    .then((data) => { state = { data, error: '' }; })
    .catch((e) => { state = { data: state.data, error: String(e?.message || e) }; })
    .finally(() => listeners.forEach((l) => l(state)));
}

export function useAeios(): State {
  const [s, setS] = useState(state);
  useEffect(() => {
    listeners.add(setS);
    if (listeners.size === 1) { refresh(); timer = setInterval(refresh, 30_000); } else setS(state);
    return () => {
      listeners.delete(setS);
      if (!listeners.size && timer) { clearInterval(timer); timer = undefined; }
    };
  }, []);
  return s;
}
