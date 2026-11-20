/*
 * Local particulate quality checks and an indicative AQI from the node's own PMS5003 readings.
 * Pure functions only (no runtime imports, no Date.now()): callers pass packets and the current time.
 *
 * Why this exists: a node can send readings that must not be shown or averaged as air quality. The v0 firmware sends -1
 * when no PMS frame arrived (Chandu's N1 has done this on every packet since 14 Nov 2026), and a loose UART or a failing
 * sensor can also produce values outside the sensor's range, PM fractions in the wrong order, or one-off spikes.
 *
 * The AQI is on the US EPA scale (PM2.5 breakpoints revised Feb 2024), the same scale as the regional CAMS gauge, so the
 * two can sit side by side. It is INDICATIVE: the official index uses 24-hour averages from calibrated monitors; this one
 * uses the median of the last hour of valid readings from an uncalibrated low-cost sensor.
 */

export type PmReject = 'no-frame' | 'out-of-range' | 'inconsistent' | 'spike';

export type PmCheck =
  | { ok: true; pm1: number; pm25: number; pm10: number }
  | { ok: false; reason: PmReject };

/** PMS5003 maximum range (datasheet: 0–1000 µg/m³; effective range 0–500). */
export const PM_MAX_UGM3 = 1000;
/** PMS5003 reports whole µg/m³, so PM1 ≤ PM2.5 ≤ PM10 may break by rounding; allow this much before calling it wrong. */
export const PM_ORDER_TOLERANCE = 2;

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** One packet on its own: is its particulate reading usable? */
export function checkPm(p: Record<string, unknown> | null | undefined): PmCheck {
  const pm1 = num(p?.pm1), pm25 = num(p?.pm2_5), pm10 = num(p?.pm10);
  // The firmware's "no PMS frame" marker is a negative number; a missing column is treated the same way.
  if (pm25 === null || pm10 === null || pm25 < 0 || pm10 < 0 || (pm1 !== null && pm1 < 0)) return { ok: false, reason: 'no-frame' };
  if (pm25 > PM_MAX_UGM3 || pm10 > PM_MAX_UGM3 || (pm1 !== null && pm1 > PM_MAX_UGM3)) return { ok: false, reason: 'out-of-range' };
  // Smaller particles are a subset of larger ones: PM1 ≤ PM2.5 ≤ PM10 always holds for a working sensor.
  if (pm25 > pm10 + PM_ORDER_TOLERANCE || (pm1 !== null && pm1 > pm25 + PM_ORDER_TOLERANCE)) return { ok: false, reason: 'inconsistent' };
  return { ok: true, pm1: pm1 ?? pm25, pm25, pm10 };
}

export const PM_REJECT_TEXT: Record<PmReject, string> = {
  'no-frame': 'the particulate sensor sent no data',
  'out-of-range': 'the value is outside the sensor’s 0–1000 µg/m³ range',
  inconsistent: 'PM2.5 is higher than PM10, which a working sensor cannot report',
  spike: 'a one-off spike far above the other readings in the hour',
};

/* ---------- US AQI (EPA, PM2.5 breakpoints revised 2024) ---------- */
type Bp = [cLo: number, cHi: number, iLo: number, iHi: number];
const PM25_BP: Bp[] = [[0, 9.0, 0, 50], [9.1, 35.4, 51, 100], [35.5, 55.4, 101, 150], [55.5, 125.4, 151, 200], [125.5, 225.4, 201, 300], [225.5, 325.4, 301, 500]];
const PM10_BP: Bp[] = [[0, 54, 0, 50], [55, 154, 51, 100], [155, 254, 101, 150], [255, 354, 151, 200], [355, 424, 201, 300], [425, 604, 301, 500]];

function subIndex(c: number, table: Bp[]): number {
  const top = table[table.length - 1];
  if (c > top[1]) return 500; // beyond the scale: reported as the scale maximum
  const row = table.find(([lo, hi]) => c >= lo && c <= hi) ?? table.find(([, hi]) => c <= hi)!;
  const [cLo, cHi, iLo, iHi] = row;
  return Math.round(((iHi - iLo) / (cHi - cLo)) * (c - cLo) + iLo);
}
/** PM2.5 is truncated to 0.1 µg/m³ and PM10 to whole µg/m³ before lookup, as EPA specifies. */
export const usAqiPm25 = (c: number) => subIndex(Math.floor(c * 10) / 10, PM25_BP);
export const usAqiPm10 = (c: number) => subIndex(Math.floor(c), PM10_BP);

export function usAqiCategory(aqi: number): string {
  if (aqi <= 50) return 'Good';
  if (aqi <= 100) return 'Moderate';
  if (aqi <= 150) return 'Unhealthy for sensitive groups';
  if (aqi <= 200) return 'Unhealthy';
  if (aqi <= 300) return 'Very unhealthy';
  return 'Hazardous';
}

/* ---------- Window: filter the last hour of one node's packets, then index the median ---------- */
export const AQI_WINDOW_MIN = 60;
/** Fewer valid readings than this in the window and no AQI is given: one packet is not an air-quality index. */
export const AQI_MIN_VALID = 3;
/** Spike rule (needs at least this many valid readings): a reading above SPIKE_FACTOR × the median of the hour AND more than
 *  SPIKE_MARGIN µg/m³ above it is dropped. Both conditions keep real rises at low or high concentrations. */
const SPIKE_MIN_N = 5, SPIKE_FACTOR = 3, SPIKE_MARGIN = 100;

export type RejectCounts = Record<PmReject, number>;
export type LocalAqi = {
  aqi: number | null;
  category: string | null;
  dominant: 'PM2.5' | 'PM10' | null;
  pm25: number | null; // median of valid readings, µg/m³
  pm10: number | null;
  used: number;        // valid readings that went into the median
  total: number;       // packets from this node in the window
  rejected: RejectCounts;
  windowMin: number;
  /** Time of the node's newest packet: the window is the hour before it. Null when the node has no packets. */
  asOf: string | null;
  /** True while that newest packet is younger than the staleness limit. A silent node keeps its last AQI with current=false. */
  current: boolean;
  /** Why there is no AQI, when there is none. */
  reason: 'no-packets' | 'too-few-valid' | null;
};

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Same 30 min limit as the node freshness badge (lib/freshness NODE_STALE_MS); duplicated so this module stays import-free. */
export const AQI_STALE_MS = 30 * 60_000;

/**
 * The window is the hour ending at the node's newest packet, not at "now". While the node is sending that is the last hour;
 * when it goes silent the last AQI it supported is kept and marked current=false with asOf, instead of disappearing.
 */
export function localAqi(packets: Array<Record<string, unknown>>, node: string, nowMs: number, windowMin = AQI_WINDOW_MIN, staleMs = AQI_STALE_MS): LocalAqi {
  const t = (p: Record<string, unknown>) => Date.parse(String(p.rx_utc));
  const all = packets.filter((p) => String(p.node) === node && Number.isFinite(t(p)) && t(p) <= nowMs);
  const anchor = all.reduce((a, p) => Math.max(a, t(p)), -Infinity);
  const asOf = Number.isFinite(anchor) ? new Date(anchor).toISOString() : null;
  const current = asOf !== null && nowMs - anchor <= staleMs;
  const from = anchor - windowMin * 60_000;
  const mine = all.filter((p) => t(p) >= from);
  const rejected: RejectCounts = { 'no-frame': 0, 'out-of-range': 0, inconsistent: 0, spike: 0 };
  let valid: Array<{ pm25: number; pm10: number }> = [];
  for (const p of mine) {
    const c = checkPm(p);
    if (c.ok) valid.push({ pm25: c.pm25, pm10: c.pm10 }); else rejected[c.reason] += 1;
  }
  if (valid.length >= SPIKE_MIN_N) {
    const m25 = median(valid.map((v) => v.pm25)), m10 = median(valid.map((v) => v.pm10));
    const isSpike = (v: number, m: number) => v > SPIKE_FACTOR * m && v > m + SPIKE_MARGIN;
    const kept = valid.filter((v) => !isSpike(v.pm25, m25) && !isSpike(v.pm10, m10));
    rejected.spike += valid.length - kept.length;
    valid = kept;
  }
  const base = { rejected, total: mine.length, used: valid.length, windowMin, asOf, current };
  if (!mine.length) return { ...base, aqi: null, category: null, dominant: null, pm25: null, pm10: null, reason: 'no-packets' };
  if (valid.length < AQI_MIN_VALID) return { ...base, aqi: null, category: null, dominant: null, pm25: null, pm10: null, reason: 'too-few-valid' };
  const pm25 = median(valid.map((v) => v.pm25)), pm10 = median(valid.map((v) => v.pm10));
  const a25 = usAqiPm25(pm25), a10 = usAqiPm10(pm10);
  const aqi = Math.max(a25, a10);
  return { ...base, aqi, category: usAqiCategory(aqi), dominant: a25 >= a10 ? 'PM2.5' : 'PM10', pm25, pm10, reason: null };
}

const REJECT_SHORT: Record<PmReject, string> = { 'no-frame': 'no sensor data', 'out-of-range': 'out of range', inconsistent: 'PM2.5 > PM10', spike: 'spike' };

/** One-line explanation of the filtering, for under the number. */
export function aqiBasis(a: LocalAqi): string {
  const parts = (Object.keys(a.rejected) as PmReject[]).filter((k) => a.rejected[k] > 0).map((k) => `${a.rejected[k]} ${REJECT_SHORT[k]}`);
  const rej = parts.length ? `; rejected ${parts.join(', ')}` : '; none rejected';
  const span = a.current ? `the last ${a.windowMin} min` : `the ${a.windowMin} min before its last packet`;
  if (a.reason === 'no-packets') return 'No packets from this node yet.';
  if (a.reason === 'too-few-valid') return `Only ${a.used} valid PM reading${a.used === 1 ? '' : 's'} of ${a.total} in ${span} (needs ${AQI_MIN_VALID})${rej}.`;
  return `Median of ${a.used} valid reading${a.used === 1 ? '' : 's'} of ${a.total} in ${span}${rej}.`;
}
