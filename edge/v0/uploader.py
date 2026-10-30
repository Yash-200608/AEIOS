#!/usr/bin/env python3
"""AEIOS cloud uploader for the gateway Pi.

Reads new rows from ~/gateway/gateway.db (packets, predictions, anomalies) and pushes them over HTTPS to the
Supabase 'ingest' edge function. Only real radio packets (source 'lora') and the model output derived from
them are sent unless --sources says otherwise, so invented data never reaches the website by accident.

Delivery is at-least-once and idempotent (the cloud de-duplicates on device_id + row id), and progress is kept
in uploader_state.json, so a dropped Wi-Fi link or a restart just resumes where it stopped.

Config (environment, normally from ~/.config/aeios/uploader.env):
  AEIOS_INGEST_URL     https://<project>.supabase.co/functions/v1/ingest
  AEIOS_DEVICE_TOKEN   long random secret shared with the edge function
  AEIOS_DEVICE_ID      name of this gateway (default: hostname)
Standard library only.
"""
import argparse, json, os, signal, socket, sqlite3, sys, time, urllib.error, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
BATCH = 200
TABLES = {
    "packets": "id,rx_utc,source,node,boot,node_time,temp,rh,pressure,gas_kohm,pm1,pm2_5,pm10,mq_mv,lat,lon,fix,sats,rssi,snr",
    "predictions": "id,packet_id,source,node,target,horizon_min,made_utc,due_utc,now_value,p50,p10,p90,model,model_updates",
    "anomalies": "id,packet_id,source,node,utc,signal,value,median_24h,z",
    "smoke_alerts": "id,utc,site,level,hours_ahead,fires,frp_mw,origin_km,origin_dir,height,local_pm25,stale_h,message",
}
NO_SOURCE_FILTER = {"smoke_alerts"}      # these rows have no 'source' column (they are derived from real packets and NASA data)


def log(msg):
    print(f"{time.strftime('%H:%M:%S')}  {msg}", flush=True)


def load_state(path):
    try:
        with open(path) as f:
            s = json.load(f)
    except (OSError, ValueError):
        s = {}
    return {t: int(s.get(t, 0)) for t in TABLES}


def save_state(path, state):
    tmp = path + ".tmp"
    with open(tmp, "w") as f:
        json.dump(state, f)
    os.replace(tmp, path)


def post(url, token, body, timeout=20):
    req = urllib.request.Request(url, data=json.dumps(body).encode(), method="POST",
                                 headers={"Content-Type": "application/json", "X-AEIOS-Device-Token": token})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.load(r)


def fetch_rows(db, table, after, sources):
    cols = TABLES[table]
    q = f"SELECT {cols} FROM {table} WHERE id > ?"
    args = [after]
    if sources and table not in NO_SOURCE_FILTER:
        q += f" AND source IN ({','.join('?' * len(sources))})"
        args += sources
    q += " ORDER BY id LIMIT ?"
    args.append(BATCH)
    cur = db.execute(q, args)
    names = [d[0] for d in cur.description]
    return [dict(zip(names, r)) for r in cur.fetchall()]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--db", default=os.path.join(HERE, "gateway.db"))
    ap.add_argument("--state", default=os.path.join(HERE, "uploader_state.json"))
    ap.add_argument("--sources", default="lora", help="comma-separated packet sources to upload (default: lora = real radio only)")
    ap.add_argument("--poll", type=float, default=10.0, help="seconds between checks")
    ap.add_argument("--once", action="store_true", help="upload what is pending and exit")
    ap.add_argument("--dry-run", action="store_true", help="print what would be sent, send nothing")
    a = ap.parse_args()

    url = os.environ.get("AEIOS_INGEST_URL", "").strip()
    token = os.environ.get("AEIOS_DEVICE_TOKEN", "").strip()
    device = os.environ.get("AEIOS_DEVICE_ID", socket.gethostname())
    if not a.dry_run and (not url or not token):
        sys.exit("Set AEIOS_INGEST_URL and AEIOS_DEVICE_TOKEN (see ~/.config/aeios/uploader.env).")
    sources = [s.strip() for s in a.sources.split(",") if s.strip()]
    if not os.path.exists(a.db):
        sys.exit(f"{a.db} does not exist yet.")

    stop = []
    signal.signal(signal.SIGTERM, lambda *_: stop.append(1))
    state = load_state(a.state)
    log(f"uploader started: device {device}, db {a.db}, sources {sources}, resume {state}")
    backoff = 5

    while not stop:
        sent_any = False
        failed = False
        db = sqlite3.connect(f"file:{a.db}?mode=ro", uri=True, timeout=10)
        try:
            for table in TABLES:
                # predictions/anomalies carry the source of the packet they were made from, so the same filter applies.
                while not stop:
                    try:
                        rows = fetch_rows(db, table, state[table], sources)
                    except sqlite3.OperationalError:     # table not created yet (model has not run)
                        break
                    if not rows:
                        break
                    if a.dry_run:
                        log(f"[dry-run] {table}: {len(rows)} rows, ids {rows[0]['id']}..{rows[-1]['id']}")
                        state[table] = rows[-1]["id"]
                        continue
                    try:
                        res = post(url, token, {"device_id": device, "table": table, "rows": rows})
                    except urllib.error.HTTPError as e:
                        detail = e.read().decode(errors="replace")[:200]
                        log(f"{table}: server rejected batch ({e.code}) {detail}")
                        failed = True
                        if e.code in (400, 401, 403, 413, 422):    # not a network problem; retrying will not help quickly
                            backoff = 300
                        break
                    except (urllib.error.URLError, OSError, ValueError) as e:
                        log(f"{table}: network problem ({e}); will retry")
                        failed = True
                        break
                    state[table] = rows[-1]["id"]
                    save_state(a.state, state)
                    sent_any = True
                    log(f"{table}: sent {len(rows)} rows (up to id {state[table]}), cloud stored {res.get('stored', '?')}")
                if failed:
                    break
            if not failed and not a.dry_run:
                try:
                    post(url, token, {"device_id": device, "table": "heartbeat", "rows": [{"info": {"state": state}}]})
                except (urllib.error.URLError, OSError, ValueError, urllib.error.HTTPError):
                    pass
        finally:
            db.close()
        if a.once:
            break
        if failed:
            time.sleep(min(backoff, 300)); backoff = min(backoff * 2, 300)
        else:
            backoff = 5
            time.sleep(a.poll)


if __name__ == "__main__":
    main()
