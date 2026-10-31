/*
 * DEVELOPMENT-ONLY fixtures for visually checking Overview states: /?preview&fixture=<name>
 * Loaded through a dynamic import behind import.meta.env.DEV, so Vite removes this file from production builds.
 * Every value is illustrative. None of it is real data, and none of it is ever sent anywhere.
 */
import type { AeiosOverview } from '../../lib/api';
import type { AlertRow } from './model';

export type Fixture = {
  aeios: AeiosOverview | null; aeiosError?: string;
  alerts: AlertRow[] | null; alertsError?: string;
  loadState?: 'loading' | 'ready' | 'error';
};

const iso = (msAgo: number) => new Date(Date.now() - msAgo).toISOString();
const SEC = 1000, MIN = 60 * SEC, HOUR = 60 * MIN, DAY = 24 * HOUR;

const nodes = [
  { node: 'N1', site_id: 'sgt', label: 'SGT University' },
  { node: 'N2', site_id: 'chandu', label: 'Chandu village' },
];
const packet = (node: string, msAgo: number, o: Record<string, unknown> = {}) => ({
  node, rx_utc: iso(msAgo), temp: 21.4, rh: 62, pressure: 1008, pm1: 40, pm2_5: 64, pm10: 92, mq_mv: 412, rssi: -61, snr: 8.5, fix: 1, ...o,
});
const base = (o: Partial<AeiosOverview> = {}): AeiosOverview => ({
  gateway: { device_id: 'node-gateway', last_seen: iso(8 * SEC) }, nodes,
  latest: [packet('N1', 20 * SEC), packet('N2', 40 * SEC, { pm2_5: 31, pm10: 52 })], predictions: [], anomalies: [], totalPackets: 12400, ...o,
});
const alertRow = (o: Partial<AlertRow> = {}): AlertRow => ({
  id: 1, utc: iso(40 * MIN), site: 'SGT', level: 'WARNING',
  message: 'WARNING: air reaching SGT University now at ~350 m (950 hPa) passed 6 fires (28.3 MW) earlier; it came from 128 km NE. (ILLUSTRATIVE FIXTURE TEXT)', ...o,
});

export const FIXTURES: Record<string, () => Fixture> = {
  normal: () => ({ aeios: base(), alerts: [] }),
  stale: () => ({ aeios: base({ latest: [packet('N1', 3 * DAY), packet('N2', 4 * DAY)], totalPackets: 14 }), alerts: [] }),
  noreading: () => ({ aeios: base({ latest: [packet('N1', 20 * SEC, { pm2_5: -1, pm10: -1 }), packet('N2', 40 * SEC)] }), alerts: [] }),
  nopacket: () => ({ aeios: base({ latest: [], totalPackets: 0 }), alerts: [] }),
  gatewayoffline: () => ({ aeios: base({ gateway: { device_id: 'node-gateway', last_seen: iso(2 * HOUR) }, latest: [packet('N1', 2 * HOUR), packet('N2', 2 * HOUR)] }), alerts: [] }),
  warming: () => ({ aeios: base({ totalPackets: 14 }), alerts: [] }),
  alert: () => ({ aeios: base(), alerts: [alertRow(), alertRow({ id: 2, level: 'WATCH', utc: iso(5 * HOUR), message: 'WATCH: example (ILLUSTRATIVE FIXTURE TEXT)' })] }),
  alertwhilestale: () => ({ aeios: base({ latest: [packet('N1', 3 * DAY)], totalPackets: 14 }), alerts: [alertRow()] }),
  alerterror: () => ({ aeios: base(), alerts: null, alertsError: 'permission denied (fixture)' }),
  loading: () => ({ aeios: null, alerts: null }),
  error: () => ({ aeios: null, aeiosError: 'network error (fixture)', alerts: null, alertsError: 'network error (fixture)' }),
  feederror: () => ({ aeios: base(), alerts: [], loadState: 'error' }),
};
