// Kinematic back-trajectories: "where was this air N hours ago?"
// Winds come from Open-Meteo on a 1° grid over north-west India, for the past 3 days. Each parcel is stepped backwards
// in 10-minute steps using wind interpolated in space (bilinear) and time (linear). Horizontal motion only, no vertical
// motion or turbulence, so treat the path as a corridor (errors grow to roughly 20% of the distance travelled), not a line.

export const GRID = { lat0: 25, lon0: 71, nLat: 8, nLon: 11, step: 1 }; // 25–32 °N, 71–81 °E

export type Level = { key: string; label: string; speed: string; dir: string; color: string };
export const LEVELS: Level[] = [
  { key: '120m', label: '~120 m', speed: 'wind_speed_120m', dir: 'wind_direction_120m', color: '#ec8b74' },
  { key: '950', label: '~350 m (950 hPa)', speed: 'wind_speed_950hPa', dir: 'wind_direction_950hPa', color: '#e8b16c' },
  { key: '925', label: '~650 m (925 hPa)', speed: 'wind_speed_925hPa', dir: 'wind_direction_925hPa', color: '#c095f0' },
];

export type WindGrid = { times: number[]; u: Record<string, Float32Array>; v: Record<string, Float32Array>; fetchedAt: number };
export type PathPoint = { lat: number; lon: number; t: number };

const STEP_S = 600;
const M_PER_DEG = 111320;
let gridCache: WindGrid | null = null;

export async function fetchWindGrid(): Promise<WindGrid> {
  if (gridCache && Date.now() - gridCache.fetchedAt < 30 * 60 * 1000) return gridCache;
  const lats: number[] = [];
  const lons: number[] = [];
  for (let i = 0; i < GRID.nLat; i += 1) for (let j = 0; j < GRID.nLon; j += 1) { lats.push(GRID.lat0 + i * GRID.step); lons.push(GRID.lon0 + j * GRID.step); }
  const vars = LEVELS.flatMap((l) => [l.speed, l.dir]).join(',');
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lats.join(',')}&longitude=${lons.join(',')}&hourly=${vars}`
    + '&past_days=3&forecast_days=1&wind_speed_unit=ms&timezone=GMT';
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Wind grid unavailable (HTTP ${r.status})`);
  const data: any[] = await r.json();
  const times: number[] = data[0].hourly.time.map((t: string) => Date.parse(`${t}:00Z`));
  const nT = times.length, nP = data.length;
  const u: Record<string, Float32Array> = {}, v: Record<string, Float32Array> = {};
  for (const l of LEVELS) {
    u[l.key] = new Float32Array(nT * nP).fill(NaN);
    v[l.key] = new Float32Array(nT * nP).fill(NaN);
    data.forEach((pt, p) => {
      for (let k = 0; k < nT; k += 1) {
        const s = pt.hourly[l.speed][k], d = pt.hourly[l.dir][k];
        if (s === null || d === null) continue;
        const rad = (d * Math.PI) / 180; // meteorological direction: where the wind blows FROM
        u[l.key][k * nP + p] = -s * Math.sin(rad);
        v[l.key][k * nP + p] = -s * Math.cos(rad);
      }
    });
  }
  gridCache = { times, u, v, fetchedAt: Date.now() };
  return gridCache;
}

function windAt(g: WindGrid, level: string, lat: number, lon: number, t: number): [number, number] | null {
  const fi = (lat - GRID.lat0) / GRID.step, fj = (lon - GRID.lon0) / GRID.step;
  if (fi < 0 || fj < 0 || fi > GRID.nLat - 1 || fj > GRID.nLon - 1) return null;
  const n = g.times.length;
  if (t < g.times[0] || t > g.times[n - 1]) return null;
  let k = Math.min(n - 2, Math.floor((t - g.times[0]) / 3600000));
  const ft = (t - g.times[k]) / (g.times[k + 1] - g.times[k]);
  const i = Math.min(GRID.nLat - 2, Math.floor(fi)), j = Math.min(GRID.nLon - 2, Math.floor(fj));
  const di = fi - i, dj = fj - j, nP = GRID.nLat * GRID.nLon;
  const sample = (arr: Float32Array, kk: number) => {
    const at = (ii: number, jj: number) => arr[kk * nP + ii * GRID.nLon + jj];
    return (at(i, j) * (1 - di) * (1 - dj) + at(i + 1, j) * di * (1 - dj) + at(i, j + 1) * (1 - di) * dj + at(i + 1, j + 1) * di * dj);
  };
  const uu = sample(g.u[level], k) * (1 - ft) + sample(g.u[level], k + 1) * ft;
  const vv = sample(g.v[level], k) * (1 - ft) + sample(g.v[level], k + 1) * ft;
  return Number.isFinite(uu) && Number.isFinite(vv) ? [uu, vv] : null; // NaN where the level is below ground (hills)
}

/** Steps a parcel backwards from (lat, lon) at arrival time for `hours`. Stops early if it leaves the wind grid. */
export function backTrajectory(g: WindGrid, level: string, lat: number, lon: number, arrival: number, hours: number): PathPoint[] {
  const path: PathPoint[] = [{ lat, lon, t: arrival }];
  let t = arrival;
  const end = arrival - hours * 3600000;
  while (t > end) {
    const w = windAt(g, level, lat, lon, t);
    if (!w) break;
    lat -= (w[1] * STEP_S) / M_PER_DEG;
    lon -= (w[0] * STEP_S) / (M_PER_DEG * Math.cos((lat * Math.PI) / 180));
    t -= STEP_S * 1000;
    path.push({ lat, lon, t });
  }
  return path;
}

export function km(aLat: number, aLon: number, bLat: number, bLon: number) {
  const x = (bLon - aLon) * Math.cos(((aLat + bLat) / 2) * Math.PI / 180);
  return Math.sqrt(x * x + (bLat - aLat) ** 2) * 111.32;
}

export function bearing(aLat: number, aLon: number, bLat: number, bLon: number) {
  const deg = (Math.atan2((bLon - aLon) * Math.cos((aLat * Math.PI) / 180), bLat - aLat) * 180) / Math.PI;
  return ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(((deg + 360) % 360) / 45) % 8];
}

export type Fire = { lat: number; lon: number; t: string; frp: number; conf: string; sat: string; dn: string };
export type FireMatch = { fire: Fire; hoursBefore: number; distKm: number };

// A fire counts as a likely smoke contributor when the parcel passed within `radiusKm` of it between 3 h before and
// 12 h after the satellite saw it (fires burn for hours and their smoke lingers; the satellite sees only one moment).
export const MATCH = { radiusKm: 15, beforeH: 3, afterH: 12 };

export function matchFires(path: PathPoint[], fires: Fire[], arrival: number): FireMatch[] {
  const out: FireMatch[] = [];
  const latMin = Math.min(...path.map((p) => p.lat)) - 0.2, latMax = Math.max(...path.map((p) => p.lat)) + 0.2;
  const lonMin = Math.min(...path.map((p) => p.lon)) - 0.2, lonMax = Math.max(...path.map((p) => p.lon)) + 0.2;
  for (const f of fires) {
    if (f.lat < latMin || f.lat > latMax || f.lon < lonMin || f.lon > lonMax) continue;
    const tf = Date.parse(f.t);
    let best: FireMatch | null = null;
    for (const p of path) {
      if (p.t < tf - MATCH.beforeH * 3600000 || p.t > tf + MATCH.afterH * 3600000) continue;
      const d = km(p.lat, p.lon, f.lat, f.lon);
      if (d <= MATCH.radiusKm && (!best || d < best.distKm)) best = { fire: f, distKm: d, hoursBefore: (arrival - p.t) / 3600000 };
    }
    if (best) out.push(best);
  }
  return out;
}
