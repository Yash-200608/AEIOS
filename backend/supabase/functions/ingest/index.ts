// AEIOS ingest: the only write path into the cloud database.
// The Pi sends batches with a shared device token; this function validates them and upserts with the service role,
// so the Pi never holds a database key. Rows are de-duplicated on (device_id, pi_id).
import { createClient } from "jsr:@supabase/supabase-js@2";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

const MAX_ROWS = 500;
const COLS: Record<string, string[]> = {
  packets: ["rx_utc", "source", "node", "boot", "node_time", "temp", "rh", "pressure", "gas_kohm", "pm1", "pm2_5", "pm10",
    "mq_mv", "lat", "lon", "fix", "sats", "rssi", "snr"],
  predictions: ["packet_id", "source", "node", "target", "horizon_min", "made_utc", "due_utc", "now_value", "p50", "p10", "p90",
    "model", "model_updates"],
  anomalies: ["packet_id", "source", "node", "utc", "signal", "value", "median_24h", "z"],
  smoke_alerts: ["utc", "site", "level", "hours_ahead", "fires", "frp_mw", "origin_km", "origin_dir", "height", "local_pm25", "stale_h", "message"],
  forecasts: ["station", "location_id", "horizon_h", "made_utc", "origin_utc", "due_utc", "source", "model_version", "input_source",
    "weather_source", "stale_h", "pm_now", "q10", "q50", "q90", "interval", "drivers", "reason"],
};
const TS = new Set(["rx_utc", "made_utc", "due_utc", "utc", "origin_utc"]);
const NULLABLE_TS = new Set(["origin_utc", "due_utc"]);   // a no_input forecast has no origin or due time
const SOURCES = new Set(["lightgbm_cqr", "fallback_persistence", "no_input"]);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
// The database stores only the SHA-256 of each device token (table device_tokens), never the token itself.
async function tokenValid(token: string) {
  if (token.length < 32 || token.length > 200) return false;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  const hex = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
  const { data } = await db.from("device_tokens").select("token_sha256").eq("token_sha256", hex).maybeSingle();
  return !!data;
}
// Pi stores UTC timestamps as 'YYYY-MM-DD HH:MM:SS' without a zone; make them explicit UTC.
function toUtc(v: unknown) {
  if (typeof v !== "string") return null;
  const s = v.includes("T") ? v : v.replace(" ", "T");
  const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : s + "Z");
  return isNaN(d.getTime()) ? null : d.toISOString();
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  if (!(await tokenValid(req.headers.get("X-AEIOS-Device-Token") ?? ""))) return json({ error: "invalid device token" }, 401);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "invalid JSON" }, 400); }
  const device = String(body?.device_id ?? "").slice(0, 60);
  const table = String(body?.table ?? "");
  const rows = body?.rows;
  if (!device || !Array.isArray(rows)) return json({ error: "device_id and rows required" }, 400);
  if (rows.length > MAX_ROWS) return json({ error: `max ${MAX_ROWS} rows per batch` }, 413);

  if (table === "heartbeat") {
    const info = rows[0]?.info ?? {};
    const { error } = await db.from("gateway_status").upsert({ device_id: device, last_seen: new Date().toISOString(), info });
    return error ? json({ error: error.message }, 500) : json({ ok: true });
  }

  const cols = COLS[table];
  if (!cols) return json({ error: "unknown table" }, 422);

  const out: Record<string, unknown>[] = [];
  for (const r of rows) {
    const key = table === "smoke_alerts" ? "site" : table === "forecasts" ? "station" : "node";
    if (!Number.isInteger(r?.id) || typeof r?.[key] !== "string") return json({ error: `each row needs integer id and ${key}` }, 422);
    const o: Record<string, unknown> = { device_id: device, pi_id: r.id };
    for (const c of cols) {
      let v = r[c] ?? null;
      if (c === "packet_id") { o["packet_pi_id"] = v; continue; }
      if (TS.has(c)) {
        if (v === null && table === "forecasts" && NULLABLE_TS.has(c)) { o[c] = null; continue; }
        v = toUtc(v);
        if (v === null) return json({ error: `bad timestamp in ${c}` }, 422);
      }
      if (c === "drivers") {
        // JSON column: accept only an array of small objects (TreeSHAP drivers), never arbitrary payloads
        if (v !== null && (!Array.isArray(v) || v.length > 12 || JSON.stringify(v).length > 4000)) return json({ error: "bad drivers" }, 422);
        o[c] = v; continue;
      }
      if (c === "source" && table === "forecasts" && !SOURCES.has(String(v))) return json({ error: "bad forecast source" }, 422);
      if (typeof v === "string") v = v.slice(0, 300);
      o[c] = v;
    }
    out.push(o);
  }
  if (out.length === 0) return json({ ok: true, stored: 0 });

  const { error } = await db.from(table).upsert(out, { onConflict: "device_id,pi_id", ignoreDuplicates: true });
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true, stored: out.length });
});
