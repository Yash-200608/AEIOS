#!/usr/bin/env python3
"""Train the online forecaster on a packets CSV (for now the SYNTHETIC file from synth.py) and save its state.
Every row is handled exactly as live.py handles a packet: predict first, then learn when the true value
arrives. The report compares the model with persistence ("same as now") week by week, so you can see it learn.
Usage: python3 train.py synthetic.csv [--state model_state.json] [--reset]
"""
import argparse, csv, os, time
from online_model import Forecaster, parse_packet, utc_epoch, TARGETS, HORIZONS

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("csv"); ap.add_argument("--state", default="model_state.json")
    ap.add_argument("--reset", action="store_true", help="start from an untrained model instead of the saved state")
    a = ap.parse_args()
    fc = Forecaster() if a.reset or not os.path.exists(a.state) else Forecaster.load(a.state)
    weeks, t_first, n_rows, skipped, flags, t0 = {}, None, 0, 0, 0, time.perf_counter()
    with open(a.csv, newline="") as f:
        for row in csv.DictReader(f):
            t = utc_epoch(row["rx_utc"]); t_first = t_first or t
            out = fc.step(parse_packet(row["raw"]), t, row.get("source") or "unknown")
            n_rows += 1; skipped += out["skipped"] is not None; flags += len(out["anomalies"])
            for s in out["scored"]:
                w = weeks.setdefault(int((t - t_first) // (7 * 86400)) + 1, {})
                acc = w.setdefault((s["target"], s["horizon_min"]), [0, 0.0, 0.0])
                acc[0] += 1; acc[1] += s["err"]; acc[2] += s["err_persistence"]
    dt = time.perf_counter() - t0
    fc.save(a.state)
    print(f"Processed {n_rows} packets in {dt:.1f} s ({1000 * dt / max(n_rows, 1):.2f} ms each); skipped {skipped}; unusual-reading episodes {flags}.")
    print(f"Model has learned from: {fc.learned_from}. State saved to {a.state}.\n")
    cols = [(tg, h * 5) for tg in TARGETS for h in HORIZONS]
    print("Mean absolute error in ug/m3, model vs persistence, and skill (1 - model/persistence; above 0 = better than persistence)")
    print("week  " + "  ".join(f"{tg.upper().replace('_', '.'):>6} {h:>2} min       " for tg, h in cols))
    for wk in sorted(weeks):
        cells = []
        for c in cols:
            n, e, ep = weeks[wk].get(c, [0, 0, 0])
            cells.append(f"{e / n:5.1f} vs {ep / n:5.1f} {1 - e / ep:+5.0%}" if n and ep else " " * 20)
        print(f"{wk:>4}  " + "  ".join(cells))
    print("\nWhole run, per node:")
    for r in fc.summary():
        print(f"  {r['node']} {r['target']:<5} {r['horizon_min']:>2} min  scored {r['scored']:>5}  MAE {r['mae']:5.1f}  "
              f"persistence {r['mae_persistence']:5.1f}  skill {r['skill']:+.0%}")
    if set(fc.learned_from) == {"synthetic"}:
        print("\nThese numbers come from SYNTHETIC data only. They show the pipeline works, not how well it predicts real air.")

if __name__ == "__main__":
    main()
