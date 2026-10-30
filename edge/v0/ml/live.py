#!/usr/bin/env python3
"""Live forecaster: follows the packets table, predicts PM2.5 and PM10 5, 15 and 30 min ahead for each node,
keeps learning from every new packet, and writes to 'predictions' and 'anomalies' tables in the same database.
Usage:
  python3 live.py                                     real LoRa packets in ../gateway.db (source 'lora')
  python3 live.py --db demo.db --sources synthetic    the SYNTHETIC stream from synth.py --live
  add --once to process what is there and exit
"""
import argparse, os, signal, sqlite3, sys, time
from online_model import Forecaster, parse_packet, utc_epoch, MODEL_NAME

HERE = os.path.dirname(os.path.abspath(__file__))

def ts(e): return time.strftime("%Y-%m-%d %H:%M:%S", time.gmtime(e))

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--db", default=os.path.join(os.path.dirname(HERE), "gateway.db"))
    ap.add_argument("--sources", default="lora", help="comma-separated packet sources to learn from")
    ap.add_argument("--state", default=os.path.join(HERE, "model_state.json"))
    ap.add_argument("--poll", type=float, default=2.0); ap.add_argument("--once", action="store_true")
    a = ap.parse_args()
    sources = [s.strip() for s in a.sources.split(",") if s.strip()]
    fc = Forecaster.load(a.state) if os.path.exists(a.state) else Forecaster()
    print(f"Model state: {a.state} (learned from {fc.learned_from or 'nothing yet'}). Following {a.db}, sources {sources}.", flush=True)
    if "lora" in sources and "synthetic" in fc.learned_from:
        print("Note: this model was trained on SYNTHETIC data. To learn from real packets only, delete the state file first.", flush=True)
    if not os.path.exists(a.db): sys.exit(f"{a.db} does not exist yet (start the receiver, or synth.py --live, first).")
    db = sqlite3.connect(a.db, timeout=10)
    if not db.execute("SELECT 1 FROM sqlite_master WHERE name='packets'").fetchone(): sys.exit(f"{a.db} has no packets table.")
    db.execute("PRAGMA journal_mode=WAL")
    db.execute("""CREATE TABLE IF NOT EXISTS predictions(id INTEGER PRIMARY KEY, packet_id INTEGER, source TEXT, node TEXT,
        target TEXT, horizon_min INTEGER, made_utc TEXT, due_utc TEXT, now_value REAL, p50 REAL, p10 REAL, p90 REAL,
        model TEXT, model_updates INTEGER)""")
    db.execute("""CREATE TABLE IF NOT EXISTS anomalies(id INTEGER PRIMARY KEY, packet_id INTEGER, source TEXT, node TEXT,
        utc TEXT, signal TEXT, value REAL, median_24h REAL, z REAL)""")
    db.execute("CREATE INDEX IF NOT EXISTS predictions_node_packet ON predictions(node, packet_id)")   # dashboard: latest per node
    db.execute("CREATE INDEX IF NOT EXISTS predictions_due ON predictions(due_utc)")                   # dashboard: accuracy window
    stop = []
    signal.signal(signal.SIGTERM, lambda *_: stop.append(1))
    q = f"SELECT id, rx_utc, raw, source FROM packets WHERE id > ? AND source IN ({','.join('?' * len(sources))}) ORDER BY id"
    since_save = 0
    try:
        while not stop:
            rows = db.execute(q, (fc.last_packet_id, *sources)).fetchall()
            for pid, rx, raw, src in rows:
                t, r = utc_epoch(rx), parse_packet(raw)
                out = fc.step(r, t, src); fc.last_packet_id = pid
                if out["skipped"]: print(f"{rx}  packet {pid} skipped: {out['skipped']}", flush=True); continue
                db.executemany("INSERT INTO predictions(packet_id,source,node,target,horizon_min,made_utc,due_utc,now_value,p50,p10,p90,model,model_updates) "
                               "VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
                               [(pid, src, p["node"], p["target"], p["horizon_min"], ts(p["made"]), ts(p["due"]), p["now"], p["p50"],
                                 p["p10"], p["p90"], MODEL_NAME, p["updates"]) for p in out["predictions"]])
                db.executemany("INSERT INTO anomalies(packet_id,source,node,utc,signal,value,median_24h,z) VALUES(?,?,?,?,?,?,?,?)",
                               [(pid, src, x["node"], rx, x["signal"], x["value"], x["median_24h"], x["z"]) for x in out["anomalies"]])
                db.commit()
                p30 = {p["target"]: p for p in out["predictions"] if p["horizon_min"] == 30}
                line = "  ".join(f"{tg.upper().replace('_', '.')} {p['now']:.0f} -> {p['p50']:.0f}" +
                                 (f" ({p['p10']:.0f}-{p['p90']:.0f})" if p["p10"] is not None else "") for tg, p in p30.items())
                flags = "  UNUSUAL: " + ", ".join(f"{x['signal']} z={x['z']}" for x in out["anomalies"]) if out["anomalies"] else ""
                tag = " [SYNTHETIC]" if src == "synthetic" else ""
                print(f"{rx}  {r['node']}  in 30 min: {line or 'no PM reading'}{flags}{tag}", flush=True)
                since_save += 1
                if since_save >= 12: fc.save(a.state); since_save = 0
            if a.once: break
            time.sleep(a.poll)
    except KeyboardInterrupt:
        pass
    finally:
        fc.save(a.state); db.close()
        print(f"Saved model state (last packet id {fc.last_packet_id}).", flush=True)

if __name__ == "__main__":
    main()
