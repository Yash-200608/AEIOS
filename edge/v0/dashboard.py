#!/usr/bin/env python3
"""Gateway dashboard (standard library only, works offline). Open http://<pi>:8080
JSON: /api/overview /api/history?hours=24 /api/predictions /api/accuracy /api/anomalies /api/recent /api/latest
      /api/fc (PM2.5 forecasts: nodes first, CPCB fallback) /api/intel (intelligence pipeline results)
Usage: dashboard.py [--db PATH] [--forecast-db PATH] [--intel-db PATH] [--port 8080]
       e.g. --db ml/demo.db --port 8081 for the SYNTHETIC demo
"""
import argparse, bisect, calendar, json, os, sqlite3, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs
import gwdb
COLS = "id,rx_utc,source,node,boot,node_time,temp,rh,pressure,gas_kohm,pm1,pm2_5,pm10,mq_mv,lat,lon,fix,sats,rssi,snr"
PERIOD_S = 300
# India CPCB National AQI breakpoints for PM2.5 (defined for 24 h averages of reference instruments; shown as indicative only)
BANDS = [(30, "Good"), (60, "Satisfactory"), (90, "Moderate"), (120, "Poor"), (250, "Very poor"), (float("inf"), "Severe")]

def q(sql, args=()):
    db = sqlite3.connect(gwdb.DB_PATH, timeout=10); db.row_factory = sqlite3.Row
    try: return [dict(r) for r in db.execute(sql, args)]
    finally: db.close()

FC_DB = None      # the forecast service's forecasts.db (read-only here)
INTEL_DB = None   # the intelligence pipeline's aeios.db (read-only here)

def q_db(path, sql, args=()):
    if not path or not os.path.exists(path): return []
    db = sqlite3.connect(f"file:{path}?mode=ro", uri=True, timeout=10); db.row_factory = sqlite3.Row
    try: return [dict(r) for r in db.execute(sql, args)]
    finally: db.close()

def forecasts():
    """Latest run per (station, horizon). Node forecasts are the main picture; CPCB stations are the fallback."""
    rows = q_db(FC_DB, """SELECT f.station, f.location_id, f.horizon_h, f.made_utc, f.due_utc, f.source, f.model_version, f.input_source,
                          f.stale_h, f.pm_now, f.q10, f.q50, f.q90, f.reason FROM forecasts f
                          WHERE f.id IN (SELECT MAX(id) FROM forecasts GROUP BY location_id, horizon_h) ORDER BY f.location_id, f.horizon_h""")
    v = q_db(FC_DB, "SELECT count(*) AS n FROM outcomes")
    return {"present": bool(FC_DB and os.path.exists(FC_DB)), "nodes": [r for r in rows if r["location_id"] >= 900000],
            "cpcb": [r for r in rows if r["location_id"] < 900000], "verified": v[0]["n"] if v else 0}

def intel():
    """What the Pi's intelligence pipeline has stored from the receiver's packets."""
    if not (INTEL_DB and os.path.exists(INTEL_DB)): return {"present": False}
    latest = q_db(INTEL_DB, """SELECT r.wire_id, r.measurement_time, r.pm1, r.pm25, r.pm10, r.temperature, r.humidity, r.quality_flags, r.provenance
                               FROM sensor_readings r WHERE r.id IN (SELECT MAX(id) FROM sensor_readings GROUP BY wire_id) ORDER BY r.wire_id""")
    totals = q_db(INTEL_DB, "SELECT (SELECT count(*) FROM sensor_readings) AS readings, (SELECT count(*) FROM events) AS events, "
                            "(SELECT count(*) FROM system_logs) AS logs")
    events = q_db(INTEL_DB, "SELECT event_id, wire_id, started_at, ended_at, event_type, severity, status, event_confidence "
                            "FROM events ORDER BY event_id DESC LIMIT 10")
    logs = q_db(INTEL_DB, "SELECT timestamp, component, level, code, message FROM system_logs ORDER BY id DESC LIMIT 10")
    return {"present": True, "latest": latest, "totals": totals[0] if totals else {}, "events": events, "logs": logs}

def epoch(s): return calendar.timegm(time.strptime(s, "%Y-%m-%d %H:%M:%S"))
def utc(e): return time.strftime("%Y-%m-%d %H:%M:%S", time.gmtime(e))
def has(table): return bool(q("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (table,)))
def clean(r):                                          # firmware sends -1 for "no PMS frame"
    for k in ("pm1", "pm2_5", "pm10"):
        if r.get(k) is not None and r[k] < 0: r[k] = None
    return r

NODE_OK = "(node GLOB 'N[0-9]' OR node GLOB 'N[0-9][0-9]')"   # radio noise can decode as a "packet"; only real node IDs are shown

def newest():
    r = q(f"SELECT source, rx_utc FROM packets WHERE {NODE_OK} ORDER BY id DESC LIMIT 1")
    return r[0] if r else None
def mode():
    """The source on show: that of the newest packet, so old test packets never mix into live data."""
    n = newest(); return n["source"] if n else None
def ref_time():
    """'Now' for ages and windows: the wall clock, except in the SYNTHETIC demo, whose clock runs fast."""
    n = newest()
    return epoch(n["rx_utc"]) if n and n["source"] == "synthetic" else time.time()

def latest(): return [clean(r) for r in q(f"SELECT {COLS} FROM packets WHERE id IN (SELECT MAX(id) FROM packets WHERE {NODE_OK} AND source=? GROUP BY node) ORDER BY node", (mode(),))]
def recent(n=30): return [clean(r) for r in q(f"SELECT {COLS} FROM packets WHERE {NODE_OK} AND source=? ORDER BY id DESC LIMIT ?", (mode(), n))]

def overview():
    ref, src = ref_time(), mode(); nodes = []
    for r in latest():
        age = ref - epoch(r["rx_utc"])
        status = "online" if age <= 1.5 * PERIOD_S else "late" if age <= 3 * PERIOD_S else "silent"
        pm = sorted(x["pm2_5"] for x in q("SELECT pm2_5 FROM packets WHERE node=? AND source=? AND rx_utc>=? AND pm2_5>=0", (r["node"], src, utc(ref - 86400))))
        band = None
        if len(pm) >= 48:
            med = pm[len(pm) // 2]
            band = {"median": med, "label": next(l for lim, l in BANDS if med <= lim), "index": next(i for i, (lim, _) in enumerate(BANDS) if med <= lim)}
        nodes.append({"latest": r, "age_s": age, "status": status, "band": band, "points_24h": len(pm)})
    return {"mode": src, "ref_utc": utc(ref), "wall_utc": utc(time.time()), "db": os.path.basename(gwdb.DB_PATH), "nodes": nodes}

def history(hours=24):
    ref = ref_time(); out = {}
    for r in q(f"SELECT node,rx_utc,pm1,pm2_5,pm10,temp,rh,pressure,gas_kohm,mq_mv FROM packets WHERE {NODE_OK} AND source=? AND rx_utc>=? AND rx_utc<=? ORDER BY rx_utc",
               (mode(), utc(ref - hours * 3600), utc(ref + 60))):
        out.setdefault(r["node"], []).append(clean(r))
    return {"ref_utc": utc(ref), "hours": hours, "nodes": out}

def predictions():
    if not has("predictions"): return []
    return q("SELECT node,target,horizon_min,made_utc,due_utc,now_value,p50,p10,p90,model,model_updates,source FROM predictions "
             "WHERE packet_id IN (SELECT MAX(packet_id) FROM predictions WHERE source=? GROUP BY node) ORDER BY node,target,horizon_min", (mode(),))

def accuracy(hours=24):
    """Forecasts that came due in the last `hours`, checked against the packet that arrived closest to the due time."""
    if not has("predictions"): return []
    ref, src = ref_time(), mode(); act = {}
    for r in q(f"SELECT node,rx_utc,pm2_5,pm10 FROM packets WHERE {NODE_OK} AND source=? AND rx_utc>=? ORDER BY rx_utc", (src, utc(ref - hours * 3600 - 600))):
        a = act.setdefault(r["node"], ([], [])); a[0].append(epoch(r["rx_utc"])); a[1].append(clean(r))
    acc = {}
    for p in q("SELECT node,target,horizon_min,due_utc,now_value,p50,p10,p90 FROM predictions WHERE source=? AND due_utc>=? AND due_utc<=?",
               (src, utc(ref - hours * 3600), utc(ref))):
        ts, rows = act.get(p["node"], ([], [])); d = epoch(p["due_utc"]); i = bisect.bisect_left(ts, d)
        j = min((k for k in (i - 1, i) if 0 <= k < len(ts)), key=lambda k: abs(ts[k] - d), default=None)
        if j is None or abs(ts[j] - d) > PERIOD_S / 2 or rows[j][p["target"]] is None: continue
        y = rows[j][p["target"]]; s = acc.setdefault((p["target"], p["horizon_min"]), [0, 0.0, 0.0, 0, 0])
        s[0] += 1; s[1] += abs(p["p50"] - y); s[2] += abs(p["now_value"] - y)
        if p["p10"] is not None: s[3] += 1; s[4] += p["p10"] <= y <= p["p90"]
    return [{"target": t, "horizon_min": h, "n": n, "mae": e / n, "mae_persistence": ep / n, "skill": 1 - e / ep if ep else None,
             "coverage": c / nb if nb else None} for (t, h), (n, e, ep, nb, c) in sorted(acc.items(), key=lambda kv: (kv[0][0] != "pm2_5", kv[0][1]))]

def anomalies(n=20):
    if not has("anomalies"): return []
    return q("SELECT utc,node,signal,value,median_24h,z,source FROM anomalies WHERE source=? ORDER BY id DESC LIMIT ?", (mode(), n))

PAGE = r"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sensing gateway</title>
<style>
/* One column of panels: nodes, forecast, accuracy, unusual readings, packets. Node colour is the only accent; PM band colours are semantic. */
:root{
  --bg:#f3f5f4; --surface:#ffffff; --sunk:#f7f9f8; --fg:#15201b; --muted:#5d6d66; --line:#dbe3df; --grid:#e9efec;
  --n1:#1b7a52; --n2:#2f5fb3; --n3:#8a4fb3; --ok:#1b7a52; --warn:#a26200; --bad:#b3261e;
  --b0:#1b7a52; --b1:#5f8f1d; --b2:#a27a00; --b3:#c25a00; --b4:#b3261e; --b5:#7a1430;
  --amber-bg:#fff4d6; --amber-fg:#6b4b00;
  --sans:system-ui,-apple-system,"Segoe UI",Roboto,"Noto Sans",sans-serif; --mono:ui-monospace,"Cascadia Mono",Consolas,monospace;
}
@media (prefers-color-scheme: dark){:root{
  --bg:#0d1311; --surface:#151d1a; --sunk:#111816; --fg:#e3ece7; --muted:#93a59c; --line:#25322c; --grid:#1d2823;
  --n1:#4fc08d; --n2:#7fa8ff; --n3:#c99bff; --ok:#4fc08d; --warn:#e7a94a; --bad:#ff8a80;
  --b0:#4fc08d; --b1:#a5cf5b; --b2:#e7c74a; --b3:#f19a4a; --b4:#ff7a70; --b5:#ff6b9a;
  --amber-bg:#3a2b07; --amber-fg:#ffd98a; color-scheme:dark}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 var(--sans);-webkit-font-smoothing:antialiased}
.top{position:sticky;top:0;z-index:5;background:var(--bg);border-bottom:1px solid var(--line)}
.top .in,main{max-width:1180px;margin:0 auto;padding-inline:max(16px,env(safe-area-inset-left))}
.top .in{display:flex;flex-wrap:wrap;align-items:center;gap:8px 16px;padding-block:12px}
h1{font-size:1.15rem;margin:0;letter-spacing:-.01em} h2{font-size:1rem;margin:0} h3{font-size:.95rem;margin:0}
.muted{color:var(--muted)} .sp{flex:1}
.pill{font-size:.75rem;font-weight:650;padding:2px 10px;border-radius:999px;border:1px solid currentColor;white-space:nowrap}
.pill.live{color:var(--ok)} .pill.demo{color:var(--warn)} .pill.none{color:var(--muted)}
.banner{background:var(--amber-bg);color:var(--amber-fg);border-radius:8px;padding:10px 14px;font-size:.9rem;margin-top:16px}
main{display:flex;flex-direction:column;gap:28px;padding-block:20px 48px}
.sh{display:flex;flex-wrap:wrap;align-items:baseline;gap:6px 12px;margin-bottom:10px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,360px),1fr));gap:14px}
.card{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:14px 16px;min-width:0}
.ch{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;margin-bottom:10px}
.sw{width:10px;height:10px;border-radius:3px;background:var(--c)}
.st{font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;padding:1px 8px;border-radius:4px}
.st.online{color:var(--ok);background:color-mix(in srgb,var(--ok) 14%,transparent)}
.st.late{color:var(--warn);background:color-mix(in srgb,var(--warn) 16%,transparent)}
.st.silent{color:var(--bad);background:color-mix(in srgb,var(--bad) 14%,transparent)}
.hero{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;margin-bottom:12px}
.big{font-size:2.4rem;font-weight:700;line-height:1;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.unit{font-size:.8rem;font-weight:500;color:var(--muted);margin-left:3px}
.spark{width:150px;max-width:45%;height:44px}
dl.rd{display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:8px 12px;margin:0 0 12px}
dl.rd div{min-width:0} dt{font-size:.72rem;color:var(--muted);text-transform:uppercase;letter-spacing:.05em} dd{margin:0;font-variant-numeric:tabular-nums;font-weight:600}
.cf{display:flex;flex-wrap:wrap;gap:6px 14px;align-items:center;justify-content:space-between;border-top:1px solid var(--line);padding-top:10px;font-size:.85rem}
.band{font-weight:700;color:var(--bc);border:1px solid var(--bc);border-radius:4px;padding:0 7px;font-size:.78rem}
.seg{display:inline-flex;border:1px solid var(--line);border-radius:8px;overflow:hidden;margin-left:auto}
.seg button{font:inherit;font-size:.85rem;border:0;background:var(--surface);color:var(--muted);padding:4px 14px;cursor:pointer}
.seg button[aria-pressed="true"]{background:var(--fg);color:var(--bg)}
button:focus-visible,summary:focus-visible{outline:2px solid var(--fg);outline-offset:2px}
svg.chart{width:100%;height:auto;display:block}
svg text{fill:var(--muted);font:11px var(--sans)}
.tr{font-size:.78rem;font-weight:700}.tr.up{color:var(--bad)}.tr.down{color:var(--ok)}.tr.flat{color:var(--muted)}
.hz{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:10px}
.hz div{background:var(--sunk);border-radius:8px;padding:8px 10px;display:flex;flex-direction:column;min-width:0}
.hz b{font-size:1.25rem;font-variant-numeric:tabular-nums}.hz span{font-size:.78rem}
.tw{overflow-x:auto;background:var(--surface);border:1px solid var(--line);border-radius:10px}
table{border-collapse:collapse;width:100%;font-size:.87rem;font-variant-numeric:tabular-nums}
th,td{padding:8px 12px;border-bottom:1px solid var(--line);text-align:right;white-space:nowrap}
th:first-child,td:first-child{text-align:left} th{font-size:.7rem;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);font-weight:600}
tr:last-child td{border-bottom:0}
.bar{display:inline-block;vertical-align:middle;width:60px;height:6px;border-radius:3px;background:var(--grid);margin-left:8px;position:relative;overflow:hidden}
.bar i{position:absolute;left:0;top:0;bottom:0;background:var(--ok)} .bar i.neg{background:var(--bad)}
ul.an{list-style:none;margin:0;padding:0;background:var(--surface);border:1px solid var(--line);border-radius:10px}
ul.an li{display:flex;flex-wrap:wrap;gap:4px 12px;align-items:baseline;padding:10px 14px;border-bottom:1px solid var(--line)}
ul.an li:last-child{border-bottom:0}
.tm{font-family:var(--mono);font-size:.82rem;color:var(--muted)}
.chip{font-size:.75rem;font-weight:700;color:var(--c)}
.empty{background:var(--surface);border:1px dashed var(--line);border-radius:10px;padding:18px;color:var(--muted)}
details>summary{cursor:pointer;font-weight:600;margin-bottom:10px}
footer{font-size:.82rem;color:var(--muted);border-top:1px solid var(--line);padding-top:14px}
footer p{margin:0 0 6px;max-width:80ch}
@media (max-width:520px){.top{position:static}.big{font-size:2rem}.hz b{font-size:1.1rem}}
@media (prefers-reduced-motion:no-preference){.card{transition:border-color .2s}}
</style></head><body>
<div class="top"><div class="in"><h1>Sensing gateway</h1><span id="db" class="muted"></span><span class="sp"></span><span id="mode" class="pill none">Loading</span><span id="updated" class="muted"></span></div></div>
<main>
<div id="banner" class="banner" hidden></div>
<section><div class="sh"><h2>Nodes</h2><span class="muted">latest packet from each node</span></div><div id="nodes" class="grid"></div></section>
<section><div class="sh"><h2>Forecast</h2><span class="muted">last 6 h and the next 30 min, with an 80 % band</span>
  <div class="seg" role="group" aria-label="Pollutant"><button id="t-pm2_5" data-t="pm2_5" aria-pressed="true">PM2.5</button><button id="t-pm10" data-t="pm10" aria-pressed="false">PM10</button></div></div>
  <div id="fc" class="grid"></div></section>
<section><div class="sh"><h2>Forecast accuracy</h2><span class="muted">forecasts that came due in the last 24 h, checked against what arrived</span></div><div id="acc"></div></section>
<section><div class="sh"><h2>Unusual readings</h2><span class="muted">far from that signal's own last 24 h; a flag is not a hazard by itself</span></div><div id="anom"></div></section>
<section><div class="sh"><h2>Forecast · node first</h2><span class="muted">PM2.5 from each node's own readings; CPCB stations are the fallback when nodes are silent</span></div><div id="fc2"></div></section>
<section><div class="sh"><h2>Intelligence pipeline</h2><span class="muted">quality checks, baselines and detections run on every packet received</span></div><div id="intel"></div></section>
<section><details><summary>Recent packets</summary><div id="pk" class="tw"></div></details></section>
<footer>
  <p>PM values come from uncalibrated PMS5003 sensors; MQ135 and gas resistance are relative signals, not concentrations.</p>
  <p>The indicative band applies India's CPCB PM2.5 breakpoints to each node's 24 h median. CPCB defines them for reference instruments, so treat it as a rough guide.</p>
  <p>Forecasts come from <code>ml/live.py</code>, which keeps learning from each packet. Accuracy compares them with assuming "no change" (persistence).</p>
</footer>
</main>
<script>
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ms=s=>Date.parse(String(s).replace(' ','T')+'Z');
const ist=(t,sec)=>new Date(t).toLocaleTimeString('en-GB',Object.assign({timeZone:'Asia/Kolkata',hour:'2-digit',minute:'2-digit'},sec?{second:'2-digit'}:{}));
const f=(v,d=0)=>v==null||isNaN(v)?'–':Number(v).toFixed(d);
const pct=v=>v==null?'–':(v>0?'+':'')+Math.round(v*100)+'%';
const NAMES={pm1:'PM1',pm2_5:'PM2.5',pm10:'PM10',temp:'Temperature',rh:'Humidity',pressure:'Pressure',gas_kohm:'Gas',mq_mv:'MQ135'};
const UNITS={pm1:'µg/m³',pm2_5:'µg/m³',pm10:'µg/m³',temp:'°C',rh:'%',pressure:'hPa',gas_kohm:'kΩ',mq_mv:'mV'};
const DEC={temp:1,gas_kohm:1};
const STATUS={online:'Online',late:'Late',silent:'Silent'};
const color=n=>n==='N1'?'var(--n1)':n==='N2'?'var(--n2)':'var(--n3)';
const label=n=>/^N\d+$/.test(n)?'Node '+n.slice(1):String(n);
const empty=t=>`<div class="empty">${t}</div>`;
const ago=s=>s<0?'just now':s<90?Math.round(s)+' s ago':s<5400?Math.round(s/60)+' min ago':s<172800?Math.round(s/3600)+' h ago':Math.round(s/86400)+' days ago';
let target='pm2_5', D=null;
try{target=localStorage.getItem('gw-target')||'pm2_5'}catch(e){}

function spark(rows,k,c){
  const p=rows.filter(r=>r[k]!=null).map(r=>[ms(r.rx_utc),r[k]]); if(p.length<2) return '';
  const x0=p[0][0],x1=p[p.length-1][0]||x0+1,mx=Math.max(...p.map(v=>v[1]),1),W=150,H=44;
  const pts=p.map(([t,v])=>`${(4+(t-x0)/(x1-x0||1)*(W-8)).toFixed(1)},${(4+(1-v/mx)*(H-8)).toFixed(1)}`).join(' ');
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" role="img" aria-label="PM2.5 over the last 24 hours"><polyline points="${pts}" fill="none" stroke="${c}" stroke-width="1.6" stroke-linejoin="round"/><text x="${W-4}" y="${H-2}" text-anchor="end">24 h</text></svg>`;
}
function nice(v){const e=Math.pow(10,Math.floor(Math.log10(v))),m=v/e;return ([1,1.2,1.6,2,2.4,3,4,5,6,8,10].find(s=>m<=s))*e}   // each splits into 4 round ticks
function chart(rows,ps,c,k,anchor,stale){
  const narrow=innerWidth<640,W=narrow?360:640,H=narrow?210:230,L=34,R=8,T=10,B=24,x0=anchor-6*3600e3,x1=anchor+36*60e3,step=(narrow?2:1)*3600e3;
  const hist=rows.filter(r=>r[k]!=null).map(r=>[ms(r.rx_utc),r[k]]).filter(p=>p[0]>=x0&&p[0]<=anchor+1000);
  const fc=ps.map(p=>({t:ms(p.due_utc),m:p.p50,lo:p.p10,hi:p.p90})).sort((a,b)=>a.t-b.t);
  const now=ps[0].now_value;
  const ymax=nice(Math.max(10,...hist.map(p=>p[1]),...fc.map(p=>p.hi??p.m))*1.08);
  const sx=t=>L+(t-x0)/(x1-x0)*(W-L-R), sy=v=>T+(1-v/ymax)*(H-T-B);
  let g='';
  for(let i=0;i<=4;i++){const v=ymax*i/4,y=sy(v).toFixed(1);g+=`<line x1="${L}" x2="${W-R}" y1="${y}" y2="${y}" stroke="var(--grid)"/><text x="${L-6}" y="${(+y+4)}" text-anchor="end">${Math.round(v)}</text>`}
  const h0=Math.ceil((x0-1800e3)/step)*step+1800e3;   // IST is UTC+5:30, so whole local hours fall on :30 UTC
  for(let t=h0;t<=x1;t+=step){const x=sx(t).toFixed(1);g+=`<line x1="${x}" x2="${x}" y1="${T}" y2="${H-B}" stroke="var(--grid)"/><text x="${x}" y="${H-6}" text-anchor="middle">${ist(t)}</text>`}
  let d='',prev=null;for(const [t,v] of hist){d+=(prev===null||t-prev>450e3?'M':'L')+sx(t).toFixed(1)+','+sy(v).toFixed(1);prev=t}
  const ax=sx(anchor).toFixed(1),ay=sy(now).toFixed(1);
  let band='';const bf=fc.filter(p=>p.lo!=null);
  if(bf.length) band=`<polygon points="${ax},${ay} ${bf.map(p=>sx(p.t).toFixed(1)+','+sy(p.hi).toFixed(1)).join(' ')} ${bf.slice().reverse().map(p=>sx(p.t).toFixed(1)+','+sy(p.lo).toFixed(1)).join(' ')}" fill="${c}" opacity=".16"/>`;
  const med=`<polyline points="${ax},${ay} ${fc.map(p=>sx(p.t).toFixed(1)+','+sy(p.m).toFixed(1)).join(' ')}" fill="none" stroke="${c}" stroke-width="2" stroke-dasharray="4 3"/>`;
  const dots=fc.map(p=>`<circle cx="${sx(p.t).toFixed(1)}" cy="${sy(p.m).toFixed(1)}" r="3" fill="var(--surface)" stroke="${c}" stroke-width="2"/>`).join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${NAMES[k]} history and forecast">${g}
    <line x1="${ax}" x2="${ax}" y1="${T}" y2="${H-B}" stroke="var(--muted)" stroke-dasharray="2 3"/><text x="${(+ax)-4}" y="${T+10}" text-anchor="end">${stale?'last packet':'now'}</text>
    ${band}<path d="${d}" fill="none" stroke="${c}" stroke-width="2" stroke-linejoin="round"/>${med}${dots}
    <circle cx="${ax}" cy="${ay}" r="4" fill="${c}"/></svg>`;
}
function trend(now,p){const d=p-now,th=Math.max(3,now*.1);return d>=th?{k:'up',t:'Rising'}:d<=-th?{k:'down',t:'Falling'}:{k:'flat',t:'Steady'}}

function renderHead(){
  const o=D.ov,m=o.mode;
  const pill=$('#mode');
  pill.className='pill '+(m==='lora'?'live':m?'demo':'none');
  pill.textContent=m==='lora'?'Live · LoRa':m==='synthetic'?'Synthetic demo':m==='simulated'?'Test packets':m?esc(m):'No data';
  $('#db').textContent=o.db;
  $('#updated').textContent='Updated '+ist(ms(o.wall_utc),true)+' IST'+(m==='synthetic'?' · demo clock '+ist(ms(o.ref_utc)):'');
  const b=$('#banner');
  if(m==='synthetic'){b.hidden=false;b.textContent='Synthetic demo: every reading, forecast and flag on this page is invented test data, not from the sensors. The demo clock runs faster than real time.'}
  else if(m==='simulated'){b.hidden=false;b.textContent='These are test packets from simulate.py, not sensor readings.'}
  else b.hidden=true;
}
function renderNodes(){
  const H=D.hi.nodes;
  $('#nodes').innerHTML=D.ov.nodes.map(n=>{const r=n.latest,c=color(r.node);
    const band=n.band?`<span><span class="band" style="--bc:var(--b${n.band.index})">${n.band.label}</span> <span class="muted">indicative, 24 h median ${f(n.band.median)} µg/m³</span></span>`
                     :`<span class="muted">Indicative band after 4 h of data (${n.points_24h} of 48 readings)</span>`;
    return `<article class="card" style="--c:${c}"><div class="ch"><span class="sw"></span><h3>${esc(label(r.node))}</h3><span class="st ${n.status}">${STATUS[n.status]}</span><span class="muted">${ago(n.age_s)} · ${esc(r.source)}</span></div>
      <div class="hero"><div><div class="big">${f(r.pm2_5)}<span class="unit">µg/m³</span></div><div class="muted">PM2.5 now</div></div>${spark(H[r.node]||[],'pm2_5',c)}</div>
      <dl class="rd">${['pm10','pm1','temp','rh','pressure','gas_kohm','mq_mv'].map(k=>`<div><dt>${NAMES[k]}</dt><dd>${f(r[k],DEC[k]||0)}<span class="unit">${UNITS[k]}</span></dd></div>`).join('')}</dl>
      <div class="cf">${band}<span class="muted">RSSI ${f(r.rssi)} dBm · SNR ${f(r.snr,1)} dB</span></div></article>`}).join('')||empty('No packets yet. Start receiver.py, or the synthetic demo.');
}
function renderForecast(){
  document.querySelectorAll('.seg button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.t===target));
  const nodes=[...new Set(D.pr.map(p=>p.node))].sort();
  $('#fc').innerHTML=nodes.map(node=>{const ps=D.pr.filter(p=>p.node===node&&p.target===target);if(!ps.length)return '';
    const c=color(node),p30=ps[ps.length-1],tr=trend(ps[0].now_value,p30.p50),anchor=ms(ps[0].made_utc);
    const stale=ms(D.ov.ref_utc)-ms(p30.due_utc)>0;   // even the 30 min forecast is in the past: the node has gone quiet
    const head=stale?`<span class="st late">Out of date</span><span class="muted">made ${ist(anchor)} from ${f(ps[0].now_value)} µg/m³; no packet since</span>`
                    :`<span class="tr ${tr.k}">${tr.t}</span><span class="muted">from ${ist(anchor)} · now ${f(ps[0].now_value)} µg/m³</span>`;
    return `<article class="card" style="--c:${c}"><div class="ch"><span class="sw"></span><h3>${esc(label(node))}</h3>${head}</div>
      ${chart(D.hi.nodes[node]||[],ps,c,target,anchor,stale)}
      <div class="hz">${ps.map(p=>`<div><span class="muted">${stale?'was due':'in'} ${p.horizon_min} min</span><b>${f(p.p50)}<span class="unit">µg/m³</span></b><span class="muted">${p.p10!=null?f(p.p10)+'–'+f(p.p90)+' likely':`band after 50 checks (${p.model_updates} so far)`}</span></div>`).join('')}</div>
      <div class="muted" style="font-size:.8rem;margin-top:8px">Each horizon learns on its own, starting from "no change", as its forecasts are checked against the readings that arrive${p30.source==='synthetic'?' (synthetic)':''}.</div></article>`}).join('')||empty('No forecasts yet. Start <code>ml/live.py</code> to add them.');
}
function renderAcc(){
  const a=D.ac;
  if(!a.length){$('#acc').innerHTML=empty('No forecasts have come due yet.');return}
  const best=a.find(r=>r.target==='pm2_5'&&r.horizon_min===30);
  const lead=best&&best.skill!=null?`<p style="margin:0 0 10px">At 30 minutes, PM2.5 forecasts were off by ${f(best.mae,1)} µg/m³ on average, against ${f(best.mae_persistence,1)} for assuming no change: <b>${best.skill>=0?Math.round(best.skill*100)+' % closer':Math.round(-best.skill*100)+' % worse'}</b>.</p>`:'';
  $('#acc').innerHTML=lead+`<div class="tw"><table><tr><th>Forecast</th><th>Checked</th><th>Model error</th><th>No-change error</th><th>Improvement</th><th>Inside 80 % band</th></tr>${
    a.map(r=>{const w=Math.min(Math.abs(r.skill||0),0.5)/0.5*100;
      return `<tr><td>${NAMES[r.target]} · ${r.horizon_min} min</td><td>${r.n}</td><td>${f(r.mae,1)}</td><td>${f(r.mae_persistence,1)}</td>
      <td>${pct(r.skill)}<span class="bar"><i class="${r.skill<0?'neg':''}" style="width:${w}%"></i></span></td><td>${r.coverage==null?'–':Math.round(r.coverage*100)+' %'}</td></tr>`}).join('')}</table></div>
    <p class="muted" style="font-size:.8rem;margin:6px 0 0">Errors in µg/m³. A well-calibrated band holds about 80 % of outcomes.</p>`;
}
function renderAnom(){
  const a=D.an;
  $('#anom').innerHTML=a.length?`<ul class="an">${a.map(x=>`<li><span class="tm">${ist(ms(x.utc))}</span><span class="chip" style="--c:${color(x.node)}">${esc(label(x.node))}</span>
    <b>${NAMES[x.signal]||esc(x.signal)} ${x.z>0?'high':'low'}</b><span>${f(x.value,DEC[x.signal]||0)} ${UNITS[x.signal]||''}</span>
    <span class="muted">24 h median ${f(x.median_24h,DEC[x.signal]||0)} · ${f(Math.abs(x.z),1)} robust deviations${x.source==='synthetic'?' · synthetic':''}</span></li>`).join('')}</ul>`:empty('Nothing unusual so far.');
}
function renderFc2(){
  const fc=D.fc||{};
  if(!fc.present){$('#fc2').innerHTML='<div class="empty">Forecast service not connected on this device.</div>';return}
  const block=(title,rows,note)=>{
    if(!rows.length)return `<div class="empty">${esc(title)}: no forecast yet.</div>`;
    const by={};rows.forEach(r=>{(by[r.location_id]=by[r.location_id]||[]).push(r)});
    return `<h3 style="margin:10px 0 4px">${esc(title)}</h3><div class="muted" style="font-size:.8rem;margin-bottom:6px">${esc(note)}</div>`+
      Object.values(by).map(rs=>{const r0=rs[0],off=r0.source==='no_input';
        const badge=r0.source==='lightgbm_cqr'?'model':r0.source==='fallback_persistence'?'same as now':'no input';
        return `<article class="card"><div class="ch"><h3>${esc(r0.station)}</h3><span class="st ${off?'late':''}">${badge}</span>${off?`<span class="muted">${esc(r0.reason||'')}</span>`:`<span class="muted">made ${esc(r0.made_utc)} UTC · latest reading ${f(r0.pm_now)} µg/m³</span>`}</div>
        ${off?'':`<div class="hz">${rs.map(p=>`<div><span class="muted">+${p.horizon_h} h</span><b>${f(p.q50)}<span class="unit">µg/m³</span></b><span class="muted">${f(p.q10)}–${f(p.q90)} · 80 % band</span></div>`).join('')}</div>`}
        <div class="muted" style="font-size:.78rem;margin-top:6px">${esc(r0.input_source||'')}${r0.reason&&!off?' · '+esc(r0.reason):''}</div></article>`}).join('');
  };
  $('#fc2').innerHTML=block('AEIOS nodes',fc.nodes,"Main forecast: the model applied to each node's PM2.5. Not validated on node data yet.")+
    block('CPCB reference stations (fallback)',fc.cpcb,'Model run on CPCB station data around Gurugram; shown while nodes are silent.')+
    `<div class="muted" style="margin-top:8px">${fc.verified} forecasts have been checked against what was observed.</div>`;
}
function renderIntel(){
  const it=D.it||{};
  if(!it.present){$('#intel').innerHTML='<div class="empty">Intelligence pipeline database not connected on this device.</div>';return}
  const t=it.totals||{};
  const latest=it.latest.length?`<table><tr><th>node</th><th>last reading (IST)</th><th>PM2.5</th><th>PM10</th><th>temp</th><th>RH</th><th>flags</th><th>source</th></tr>${
    it.latest.map(r=>`<tr><td>${esc(r.wire_id)}</td><td>${ist(r.measurement_time*1000,true)}</td><td>${f(r.pm25)}</td><td>${f(r.pm10)}</td><td>${f(r.temperature,1)}</td><td>${f(r.humidity)}</td><td>${esc(r.quality_flags)}</td><td>${esc(r.provenance)}</td></tr>`).join('')}</table>`:'<div class="empty">No node readings stored yet.</div>';
  const ev=it.events.length?`<h3 style="margin:10px 0 4px">Detected events</h3><table><tr><th>started (IST)</th><th>node</th><th>type</th><th>status</th><th>confidence</th></tr>${
    it.events.map(e=>`<tr><td>${ist(e.started_at*1000,true)}</td><td>${esc(e.wire_id)}</td><td>${esc(e.event_type)}</td><td>${esc(e.status)}</td><td>${f(e.event_confidence,2)}</td></tr>`).join('')}</table>`:'<div class="muted" style="margin-top:8px">No events detected in the stored readings.</div>';
  const lg=it.logs.length?`<h3 style="margin:10px 0 4px">Recent pipeline messages</h3><table><tr><th>time (IST)</th><th>level</th><th>code</th><th>message</th></tr>${
    it.logs.map(l=>`<tr><td>${ist(l.timestamp*1000,true)}</td><td>${esc(l.level)}</td><td>${esc(l.code)}</td><td>${esc(l.message)}</td></tr>`).join('')}</table>`:'';
  $('#intel').innerHTML=`<div class="muted">${f(t.readings,0)} readings · ${f(t.events,0)} events · ${f(t.logs,0)} pipeline messages stored</div>${latest}${ev}${lg}`;
}
function renderPackets(){
  const k=['rx_utc','node','boot','temp','rh','pressure','gas_kohm','pm1','pm2_5','pm10','mq_mv','rssi','snr','source'];
  $('#pk').innerHTML=D.re.length?`<table><tr>${k.map(x=>`<th>${x==='rx_utc'?'received (IST)':NAMES[x]||x}</th>`).join('')}</tr>${
    D.re.map(r=>`<tr>${k.map(x=>`<td>${x==='rx_utc'?ist(ms(r[x]),true):typeof r[x]==='number'?f(r[x],DEC[x]||(x==='snr'?1:0)):esc(r[x])}</td>`).join('')}</tr>`).join('')}</table>`:'<div class="empty">No packets yet.</div>';
}
async function load(){
  try{
    const [ov,hi,pr,ac,an,re,fc,it]=await Promise.all(['overview','history?hours=24','predictions','accuracy','anomalies','recent','fc','intel']
      .map(p=>fetch('/api/'+p,{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error(r.status);return r.json()})));
    D={ov,hi,pr,ac,an,re,fc,it};
    renderHead();renderNodes();renderForecast();renderFc2();renderIntel();renderAcc();renderAnom();renderPackets();
  }catch(e){$('#updated').textContent='Gateway not answering, retrying…'}
}
document.querySelectorAll('.seg button').forEach(b=>b.addEventListener('click',()=>{target=b.dataset.t;try{localStorage.setItem('gw-target',target)}catch(e){}if(D)renderForecast()}));
let wasNarrow=innerWidth<640;addEventListener('resize',()=>{const n=innerWidth<640;if(n!==wasNarrow&&D){wasNarrow=n;renderForecast()}});
load();setInterval(load,15000);
</script></body></html>"""

class H(BaseHTTPRequestHandler):
    def do_GET(self):
        u = urlparse(self.path); qs = parse_qs(u.query)
        routes = {"/api/latest": latest, "/api/recent": recent, "/api/overview": overview, "/api/predictions": predictions,
                  "/api/accuracy": accuracy, "/api/anomalies": anomalies, "/api/fc": forecasts, "/api/intel": intel,
                  "/api/history": lambda: history(min(max(float(qs.get("hours", ["24"])[0]), 1), 72))}
        try:
            if u.path in routes: body, ct, code = json.dumps(routes[u.path]()), "application/json", 200
            elif u.path in ("/", "/index.html"): body, ct, code = PAGE, "text/html; charset=utf-8", 200
            else: body, ct, code = "not found", "text/plain", 404
        except Exception as e:
            body, ct, code = json.dumps({"error": str(e)}), "application/json", 500
        self.send_response(code); self.send_header("Content-Type", ct); self.send_header("Cache-Control", "no-store"); self.end_headers()
        self.wfile.write(body.encode())
    def log_message(self, *a): pass

if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("--db"); ap.add_argument("--port", type=int, default=8080)
    ap.add_argument("--forecast-db"); ap.add_argument("--intel-db")
    a = ap.parse_args()
    if a.db: gwdb.DB_PATH = os.path.abspath(a.db)
    FC_DB = os.path.abspath(os.path.expanduser(a.forecast_db)) if a.forecast_db else None
    INTEL_DB = os.path.abspath(os.path.expanduser(a.intel_db)) if a.intel_db else None
    gwdb.connect().close()
    print(f"dashboard on http://0.0.0.0:{a.port} ({gwdb.DB_PATH})", flush=True)
    ThreadingHTTPServer(("0.0.0.0", a.port), H).serve_forever()
