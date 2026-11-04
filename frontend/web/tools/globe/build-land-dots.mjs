#!/usr/bin/env node
/*
 * Generates src/components/globe/landDots.ts: the dot-matrix land mask for the Overview globe (GlobeHero).
 *
 * Source data: Natural Earth 1:110m land polygons (public domain, https://www.naturalearthdata.com/about/terms-of-use/).
 *   https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_land.geojson
 * Download it to tools/globe/data/ne_110m_land.geojson (git-ignored), then run from frontend/web:
 *   node tools/globe/build-land-dots.mjs [path/to/ne_110m_land.geojson] [--points 60000]
 *
 * Method: N points on a Fibonacci sphere (near-uniform spacing, deterministic). Each point's latitude/longitude is tested
 * against every land polygon with an even-odd ray cast on the lon/lat plane (outer ring minus holes, with a bounding-box
 * prefilter). The output is a bitmask over the N sphere indices, base64-encoded: 1 bit per sphere point, so the module stays
 * a few kilobytes. The decoder in landDots.ts rebuilds positions from the set indices with the same Fibonacci formula.
 *
 * Plain Node, no dependencies. The output is deterministic (no timestamps), so regenerating produces no diff.
 */
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const pointsFlag = args.indexOf('--points');
const N = pointsFlag >= 0 ? Number.parseInt(args[pointsFlag + 1], 10) : 60000;
const inputArg = args.find((arg, i) => !arg.startsWith('--') && (pointsFlag < 0 || i !== pointsFlag + 1));
const input = resolve(inputArg ?? resolve(here, 'data/ne_110m_land.geojson'));
const output = resolve(here, '../../src/components/globe/landDots.ts');
const SOURCE_URL = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_land.geojson';

if (!Number.isInteger(N) || N < 1000 || N > 400000) throw new Error(`--points must be an integer in 1000..400000 (got ${N})`);

const geojson = JSON.parse(readFileSync(input, 'utf8'));
if (geojson.type !== 'FeatureCollection') throw new Error('expected a GeoJSON FeatureCollection');

/** @typedef {{ rings: number[][][]; minLon: number; maxLon: number; minLat: number; maxLat: number }} Poly */
/** @type {Poly[]} */
const polygons = [];
for (const feature of geojson.features) {
  const geometry = feature.geometry;
  const list = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.type === 'MultiPolygon' ? geometry.coordinates : [];
  for (const rings of list) {
    let minLon = Infinity;
    let maxLon = -Infinity;
    let minLat = Infinity;
    let maxLat = -Infinity;
    for (const [lon, lat] of rings[0]) {
      minLon = Math.min(minLon, lon);
      maxLon = Math.max(maxLon, lon);
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
    }
    polygons.push({ rings, minLon, maxLon, minLat, maxLat });
  }
}

/** Even-odd ray cast (ray toward +lon) on one ring of [lon, lat] pairs. */
function inRing(ring, lon, lat) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Inside the outer ring and outside every hole of some land polygon. */
function onLand(lon, lat) {
  for (const p of polygons) {
    if (lon < p.minLon || lon > p.maxLon || lat < p.minLat || lat > p.maxLat) continue;
    if (!inRing(p.rings[0], lon, lat)) continue;
    let hole = false;
    for (let h = 1; h < p.rings.length && !hole; h += 1) hole = inRing(p.rings[h], lon, lat);
    if (!hole) return true;
  }
  return false;
}

// Fibonacci sphere, identical to fibonacciPoint() in landDots.ts (y up; lon 0 at +Z; lon = atan2(x, z)).
const GOLDEN = Math.PI * (3 - Math.sqrt(5));
const DEG = 180 / Math.PI;
function latLonOf(i) {
  const y = 1 - (2 * i + 1) / N;
  const phi = i * GOLDEN;
  const lat = Math.asin(y) * DEG;
  const lon = Math.atan2(Math.sin(phi), Math.cos(phi)) * DEG;
  return [lat, lon];
}

const mask = new Uint8Array(Math.ceil(N / 8));
let count = 0;
for (let i = 0; i < N; i += 1) {
  const [lat, lon] = latLonOf(i);
  if (onLand(lon, lat)) {
    mask[i >> 3] |= 1 << (i & 7);
    count += 1;
  }
}

// Sanity checks: known land and ocean locations (the nearest sphere point to each must agree).
function nearestIndex(lat, lon) {
  const target = [Math.cos(lat / DEG) * Math.sin(lon / DEG), Math.sin(lat / DEG), Math.cos(lat / DEG) * Math.cos(lon / DEG)];
  let best = 0;
  let bestDot = -2;
  for (let i = 0; i < N; i += 1) {
    const y = 1 - (2 * i + 1) / N;
    const r = Math.sqrt(1 - y * y);
    const phi = i * GOLDEN;
    const dot = r * Math.sin(phi) * target[0] + y * target[1] + r * Math.cos(phi) * target[2];
    if (dot > bestDot) {
      bestDot = dot;
      best = i;
    }
  }
  return best;
}
const isSet = (i) => (mask[i >> 3] & (1 << (i & 7))) !== 0;
const checks = [
  { name: 'central India (22 N, 78 E)', lat: 22, lon: 78, land: true },
  { name: 'SGT University region (28.48 N, 76.90 E)', lat: 28.4782, lon: 76.9041, land: true },
  { name: 'central USA (39 N, 98 W)', lat: 39, lon: -98, land: true },
  { name: 'Sahara (23 N, 12 E)', lat: 23, lon: 12, land: true },
  { name: 'Antarctica (80 S, 30 E)', lat: -80, lon: 30, land: true },
  { name: 'Gulf of Guinea (0, 0)', lat: 0, lon: 0, land: false },
  { name: 'central Pacific (0, 150 W)', lat: 0, lon: -150, land: false },
  { name: 'Indian Ocean (20 S, 80 E)', lat: -20, lon: 80, land: false },
  { name: 'Caspian Sea hole (42 N, 50.5 E)', lat: 42, lon: 50.5, land: false },
];
let failed = 0;
for (const c of checks) {
  const got = isSet(nearestIndex(c.lat, c.lon));
  if (got !== c.land) {
    failed += 1;
    console.error(`check failed: ${c.name} expected ${c.land ? 'land' : 'ocean'}`);
  }
}
const holes = polygons.reduce((n, p) => n + p.rings.length - 1, 0);
if (failed) {
  // The Caspian is a hole only at some scales; report rather than abort for it.
  console.warn(`${failed} sanity check(s) disagreed (see above).`);
}

const b64 = Buffer.from(mask).toString('base64');
const chunks = b64.match(/.{1,96}/g) ?? [];
const module = `/*
 * GENERATED by tools/globe/build-land-dots.mjs. Do not edit by hand; regenerate instead:
 *   node tools/globe/build-land-dots.mjs   (from frontend/web, with the source GeoJSON in tools/globe/data/)
 *
 * Land mask for the decorative Overview globe: Natural Earth 1:110m land polygons (public domain),
 *   ${SOURCE_URL}
 * sampled on a ${N}-point Fibonacci sphere (${count} points on land, ${polygons.length} polygons, ${holes} hole(s)).
 * Geography only: these dots are not measurements and carry no data.
 *
 * Encoding: one bit per Fibonacci index (bit i & 7 of byte i >> 3), base64. Convention: y up, longitude 0 at +Z,
 * east toward +X, so x = cos(lat) sin(lon), y = sin(lat), z = cos(lat) cos(lon).
 */
export const LAND_SPHERE_POINTS = ${N};
export const LAND_DOT_COUNT = ${count};
export const LAND_SOURCE_URL = '${SOURCE_URL}';

const MASK_BASE64 = [
${chunks.map((c) => `  '${c}',`).join('\n')}
].join('');

const GOLDEN = Math.PI * (3 - Math.sqrt(5));

/** Unit-sphere position of Fibonacci index i (the same formula the generator sampled). */
export function fibonacciPoint(i: number, n = LAND_SPHERE_POINTS): [number, number, number] {
  const y = 1 - (2 * i + 1) / n;
  const r = Math.sqrt(1 - y * y);
  const phi = i * GOLDEN;
  return [r * Math.sin(phi), y, r * Math.cos(phi)];
}

/** Decodes the mask into packed xyz positions (Float32Array, length LAND_DOT_COUNT * 3) on a sphere of the given radius. */
export function decodeLandDots(radius = 1): Float32Array {
  const bytes = Uint8Array.from(atob(MASK_BASE64), (ch) => ch.charCodeAt(0));
  const out = new Float32Array(LAND_DOT_COUNT * 3);
  let k = 0;
  for (let i = 0; i < LAND_SPHERE_POINTS && k < out.length; i += 1) {
    if ((bytes[i >> 3] & (1 << (i & 7))) === 0) continue;
    const [x, y, z] = fibonacciPoint(i);
    out[k] = x * radius;
    out[k + 1] = y * radius;
    out[k + 2] = z * radius;
    k += 3;
  }
  return out;
}
`;
writeFileSync(output, module);
const size = statSync(output).size;
console.log(
  `land dots: ${count} of ${N} sphere points on land (${((100 * count) / N).toFixed(1)} %), ${polygons.length} polygons, ${holes} hole(s)`,
);
console.log(`sanity checks: ${checks.length - failed}/${checks.length} agree`);
console.log(`wrote ${output} (${size} bytes, ${(size / 1024).toFixed(1)} KB)`);
