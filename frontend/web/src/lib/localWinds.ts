// Local meteorology for the dispersion twin: a 3 x 3 grid of Open-Meteo points across the box, winds at seven heights above ground
// and the model boundary-layer height, converted into the solver's Forcing. Also a manual-wind alternative for what-if scenarios,
// and terrain elevation for the display layer. Everything here is model output, never a measurement.
import type { Forcing } from '../sim/dispersion';

export const SURFACE_LEVELS = [10, 80, 120, 180];            // m above ground (Open-Meteo native levels)
export const PRESSURE_LEVELS = [950, 925, 850];              // hPa; heights come from the model's geopotential
export const MIN_PRESSURE_AGL = 250;                         // a pressure level lower than this is treated as inside the surface layer

export type Domain = { lat: number; lon: number; halfKm: number };
export type LocalMet = {
  forcing: Forcing; times: number[]; levelLabels: string[]; elevationM: number; blhNow: number; windNow: { speed: number; dirFrom: number };
  source: 'open-meteo' | 'manual';
};

const KM_PER_DEG = 111.32;

/** Coordinates of the 3 x 3 forcing points, ordered south-to-north then west-to-east (matches Forcing's [jF][iF]). */
export function forcingPoints(d: Domain, n = 3): { lat: number; lon: number }[] {
  const dLat = d.halfKm / KM_PER_DEG, dLon = d.halfKm / (KM_PER_DEG * Math.cos((d.lat * Math.PI) / 180));
  const pts: { lat: number; lon: number }[] = [];
  for (let j = 0; j < n; j += 1) for (let i = 0; i < n; i += 1) pts.push({ lat: d.lat - dLat + (2 * dLat * j) / (n - 1), lon: d.lon - dLon + (2 * dLon * i) / (n - 1) });
  return pts;
}

const toUV = (speed: number, dirFrom: number): [number, number] => {
  const r = (dirFrom * Math.PI) / 180;                        // meteorological direction: where the wind blows FROM
  return [-speed * Math.sin(r), -speed * Math.cos(r)];
};

/** Open-Meteo multi-point response -> Forcing starting at the hour containing `startMs`. Exported for tests. */
export function buildForcing(payload: any[], startMs: number, hours: number): LocalMet {
  if (!Array.isArray(payload) || !payload.length) throw new Error('No wind data returned');
  const times: number[] = payload[0].hourly.time.map((t: string) => Date.parse(`${t}:00Z`));
  const s0 = Math.max(0, times.findIndex((t, i) => t <= startMs && (i === times.length - 1 || times[i + 1] > startMs)));
  const nT = Math.max(2, Math.min(hours + 2, times.length - s0));
  const nPts = payload.length;
  const nxF = Math.round(Math.sqrt(nPts));
  if (nxF * nxF !== nPts) throw new Error('Expected a square grid of forcing points');

  // heights of the pressure levels above ground: window-mean geopotential minus the point's own elevation
  const levels: { h: number; speed: string; dir: string; label: string }[] = SURFACE_LEVELS.map((h) => ({ h, speed: `wind_speed_${h}m`, dir: `wind_direction_${h}m`, label: `${h} m` }));
  for (const p of PRESSURE_LEVELS) {
    let sum = 0, cnt = 0;
    payload.forEach((pt) => {
      const g: Array<number | null> = pt.hourly[`geopotential_height_${p}hPa`] || [];
      for (let t = s0; t < s0 + nT; t += 1) if (g[t] !== null && g[t] !== undefined) { sum += g[t]! - (pt.elevation ?? 0); cnt += 1; }
    });
    const agl = cnt ? sum / cnt : NaN;
    if (Number.isFinite(agl) && agl >= MIN_PRESSURE_AGL) levels.push({ h: Math.round(agl), speed: `wind_speed_${p}hPa`, dir: `wind_direction_${p}hPa`, label: `~${Math.round(agl)} m (${p} hPa)` });
  }
  levels.sort((a, b) => a.h - b.h);
  const nLev = levels.length;
  const u = new Float32Array(nT * nLev * nPts), v = new Float32Array(nT * nLev * nPts), blh = new Float32Array(nT * nPts);
  for (let t = 0; t < nT; t += 1) {
    for (let p = 0; p < nPts; p += 1) {
      const hv = payload[p].hourly;
      let prevB = 800;
      const b = hv.boundary_layer_height?.[s0 + t];
      blh[t * nPts + p] = b === null || b === undefined ? prevB : b;
      let last: [number, number] = [0, 0];
      for (let l = 0; l < nLev; l += 1) {
        const sp = hv[levels[l].speed]?.[s0 + t], dr = hv[levels[l].dir]?.[s0 + t];
        if (sp !== null && sp !== undefined && dr !== null && dr !== undefined) last = toUV(sp, dr);   // else keep the level below (copy up)
        u[(t * nLev + l) * nPts + p] = last[0];
        v[(t * nLev + l) * nPts + p] = last[1];
      }
    }
  }
  const mid = Math.floor(nPts / 2);
  const u0 = u[(0 * nLev + 0) * nPts + mid], v0 = v[(0 * nLev + 0) * nPts + mid];
  return {
    forcing: { nT, dtF: 3600, heights: levels.map((l) => l.h), nxF, nyF: nxF, u, v, blh },
    times: times.slice(s0, s0 + nT), levelLabels: levels.map((l) => l.label), elevationM: payload[mid].elevation ?? 0,
    blhNow: blh[mid], windNow: { speed: Math.hypot(u0, v0), dirFrom: (Math.atan2(-u0, -v0) * 180 / Math.PI + 360) % 360 }, source: 'open-meteo',
  };
}

/** Open-Meteo's free tier limits calls per minute as well as per day, and this dashboard issues many at once. A per-minute refusal is
 *  retried after the cooldown; a daily limit or any other error is returned immediately. */
export async function withMinuteRetry<T>(fn: () => Promise<T>, tries = 3, waitMs = 20000, sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try { return await fn(); } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (attempt >= tries || !/minutely/i.test(msg)) throw e;
      await sleep(waitMs);
    }
  }
}

export async function fetchLocalMet(d: Domain, startMs = Date.now(), hours = 12): Promise<LocalMet> {
  const pts = forcingPoints(d);
  const vars = [
    ...SURFACE_LEVELS.flatMap((h) => [`wind_speed_${h}m`, `wind_direction_${h}m`]),
    ...PRESSURE_LEVELS.flatMap((p) => [`wind_speed_${p}hPa`, `wind_direction_${p}hPa`, `geopotential_height_${p}hPa`]),
    'boundary_layer_height',
  ].join(',');
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${pts.map((p) => p.lat.toFixed(4)).join(',')}&longitude=${pts.map((p) => p.lon.toFixed(4)).join(',')}`
    + `&hourly=${vars}&past_days=1&forecast_days=3&wind_speed_unit=ms&timezone=GMT`;
  const r = await fetch(url);
  const body = await r.json().catch(() => null);
  if (!r.ok || !Array.isArray(body)) throw new Error(body?.reason ? `Wind data unavailable: ${body.reason}` : `Wind data unavailable (HTTP ${r.status})`);
  return buildForcing(body, startMs, hours);
}

/** A uniform wind and boundary-layer height held constant for the whole run: a what-if, clearly not a forecast. */
export function manualMet(speed: number, dirFrom: number, blh: number, startMs = Date.now(), hours = 12): LocalMet {
  const nT = hours + 2, [u, v] = toUV(speed, dirFrom);
  const heights = [10, 2000];
  const arr = (x: number) => Float32Array.from({ length: nT * heights.length }, () => x);
  return {
    forcing: { nT, dtF: 3600, heights, nxF: 1, nyF: 1, u: arr(u), v: arr(v), blh: Float32Array.from({ length: nT }, () => blh) },
    times: Array.from({ length: nT }, (_, i) => Math.floor(startMs / 3600000) * 3600000 + i * 3600000), levelLabels: ['all levels'], elevationM: 0, blhNow: blh,
    windNow: { speed, dirFrom }, source: 'manual',
  };
}

/** Terrain heights (m above sea level) on an n x n grid over the box, south-to-north then west-to-east; flat fallback if unavailable. */
export async function fetchTerrain(d: Domain, n = 20): Promise<{ z: Float32Array; n: number; real: boolean }> {
  const key = `aeios-terrain:${d.lat.toFixed(3)},${d.lon.toFixed(3)},${d.halfKm},${n}`;
  try {
    const hit = localStorage.getItem(key);
    if (hit) return { z: Float32Array.from(JSON.parse(hit)), n, real: true };
  } catch { /* storage blocked: fetch instead */ }
  const pts = forcingPoints(d, n);
  const z = new Float32Array(n * n);
  try {
    for (let a = 0; a < pts.length; a += 90) {
      const chunk = pts.slice(a, a + 90);
      const r = await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${chunk.map((p) => p.lat.toFixed(4)).join(',')}&longitude=${chunk.map((p) => p.lon.toFixed(4)).join(',')}`);
      const body = await r.json();
      if (!r.ok || !Array.isArray(body?.elevation)) throw new Error('elevation unavailable');
      body.elevation.forEach((e: number, i: number) => { z[a + i] = e; });
    }
    try { localStorage.setItem(key, JSON.stringify(Array.from(z))); } catch { /* ignore */ }
    return { z, n, real: true };
  } catch {
    return { z: new Float32Array(n * n).fill(0), n, real: false };
  }
}
