// AEIOS fires: NASA FIRMS VIIRS 375 m active-fire detections for north India, trimmed for the dashboard.
// FIRMS publishes these 7-day CSVs openly (no key) but without CORS headers, so the browser cannot read them directly.
// Public satellite data only; nothing from the AEIOS database is read or returned.

const SOURCES = [
  'https://firms.modaps.eosdis.nasa.gov/data/active_fire/suomi-npp-viirs-c2/csv/SUOMI_VIIRS_C2_South_Asia_7d.csv',
  'https://firms.modaps.eosdis.nasa.gov/data/active_fire/noaa-20-viirs-c2/csv/J1_VIIRS_C2_South_Asia_7d.csv',
  'https://firms.modaps.eosdis.nasa.gov/data/active_fire/noaa-21-viirs-c2/csv/J2_VIIRS_C2_South_Asia_7d.csv',
];
// North-west India: Punjab, Haryana, Delhi NCR, west UP, north Rajasthan.
const BOX = { south: 24, north: 33, west: 70, east: 82 };
const CACHE_MS = 15 * 60 * 1000;

type Fire = { lat: number; lon: number; t: string; frp: number; conf: string; sat: string; dn: string };
let cache: { at: number; fires: Fire[]; errors: string[] } | null = null;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
};

function parse(csv: string): Fire[] {
  const lines = csv.trim().split('\n');
  const head = lines.shift()?.split(',') ?? [];
  const ix = (name: string) => head.indexOf(name);
  const [iLat, iLon, iDate, iTime, iSat, iConf, iFrp, iDn] =
    ['latitude', 'longitude', 'acq_date', 'acq_time', 'satellite', 'confidence', 'frp', 'daynight'].map(ix);
  const out: Fire[] = [];
  for (const line of lines) {
    const f = line.split(',');
    const lat = Number(f[iLat]), lon = Number(f[iLon]);
    if (!(lat >= BOX.south && lat <= BOX.north && lon >= BOX.west && lon <= BOX.east)) continue;
    const hhmm = (f[iTime] ?? '').padStart(4, '0');
    out.push({
      lat, lon, t: `${f[iDate]}T${hhmm.slice(0, 2)}:${hhmm.slice(2)}:00Z`, frp: Number(f[iFrp]) || 0,
      conf: f[iConf] ?? '', sat: f[iSat] ?? '', dn: f[iDn] ?? '',
    });
  }
  return out;
}

async function load() {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache;
  const errors: string[] = [];
  const results = await Promise.all(SOURCES.map(async (url) => {
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return parse(await r.text());
    } catch (e) {
      errors.push(`${url.split('/').pop()}: ${e instanceof Error ? e.message : 'failed'}`);
      return [];
    }
  }));
  cache = { at: Date.now(), fires: results.flat(), errors };
  return cache;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'GET') return new Response(JSON.stringify({ error: 'GET only' }), { status: 405, headers: { ...CORS, 'Content-Type': 'application/json' } });
  const hours = Math.min(168, Math.max(1, Number(new URL(req.url).searchParams.get('hours')) || 72));
  const { at, fires, errors } = await load();
  const since = Date.now() - hours * 3600 * 1000;
  const recent = fires.filter((f) => f.conf !== 'low' && Date.parse(f.t) >= since);
  return new Response(JSON.stringify({
    source: 'NASA FIRMS VIIRS 375 m (S-NPP, NOAA-20, NOAA-21), near real time',
    box: BOX, hours, fetched_at: new Date(at).toISOString(), count: recent.length, errors, fires: recent,
  }), { headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=600' } });
});
