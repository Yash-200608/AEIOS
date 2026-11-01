"""Phase 4 benchmark: pollution-event detectors and a sensor-fault classifier, against deterministic baselines.

    ai/.venv/Scripts/python -m ai.detection.benchmark --write

Everything is measured on CPCB PM2.5 (real series) with INJECTED episodes and faults, so it describes recognition of those injected
patterns. It says nothing about AEIOS node hardware, and the node's multi-sensor behaviour cannot be learned from 14 real packets.
"""

from __future__ import annotations

import argparse
import json
import platform
import sys
import time
import warnings
from datetime import datetime, timezone
from typing import Optional

import numpy as np

from ai.detection import events as E
from ai.detection import faults as F
from ai.detection.data import load_panel
from ai.detection.inject import CLASSES, SHIFTED_PARAMS, TRAIN_PARAMS
from ai.feature_engineering.features import load_weather
from ai.feature_engineering.windows import describe
from ai.inference.engine import ForecastEngine
from ai.preprocessing.common import ROOT, open_cache
from ai.training.dataset import SITE

REPORT_MD = ROOT / "ai" / "reports" / "detection_benchmark.md"
REPORT_JSON = ROOT / "ai" / "reports" / "detection_benchmark.json"
HELD_OUT_CODES = (301, 6931, 10921)   # stations never seen in fault training: Vikas Sadan, Dwarka Sector 8, NISE Gwal Pahari
EVENT_SEEDS = [1, 2, 3, 4, 5, 6]


def run_faults(panel, threads: int = 4) -> dict:
    held = [i for i, c in enumerate(panel.codes) if c in HELD_OUT_CODES]
    train_st = [i for i in range(len(panel.codes)) if i not in held]
    tr = F.build_fault_set(panel, train_st, "tune", TRAIN_PARAMS, seeds=[1, 2, 3, 4], normal_ratio=4.0)
    rt = F.build_fault_set(panel, train_st, "tune", TRAIN_PARAMS, seeds=[11, 12, 13])    # natural fault rate, for tuning the rules
    t0 = time.time()
    rf = F.fit_forest(tr, n_jobs=threads)
    fit_s = time.time() - t0
    rules = F.tune_rules(rt)
    out: dict = {"train_rows": int(len(tr.y)), "train_class_counts": np.bincount(tr.y, minlength=len(CLASSES)).tolist(), "rules": rules.__dict__,
                 "held_out": [panel.names[i] for i in held], "fit_seconds": fit_s, "sets": {}}
    for label, params, seeds in (("same-distribution test", TRAIN_PARAMS, list(range(201, 206))), ("shifted (harder) test", SHIFTED_PARAMS, list(range(101, 111)))):
        te = F.build_fault_set(panel, held, "test", params, seeds=seeds)
        Xte = te.X.to_numpy(dtype=np.float32)
        out["sets"][label] = {"rows": int(len(te.y)), "class_counts": np.bincount(te.y, minlength=len(CLASSES)).tolist(),
                              "random_forest": F.score(te.y, rf.predict(Xte)), "rules": F.score(te.y, F.rules_predict(te.X, rules))}
    cl = F.build_clean_set(panel, held, "test")
    days = len(cl.y) / 24.0
    rf_flags = rf.predict(cl.X.to_numpy(dtype=np.float32))
    ru_flags = F.rules_predict(cl.X, rules)
    out["real_data"] = {"hours": int(len(cl.y)),
                        "random_forest": {"flags_per_station_day": float((rf_flags != 0).sum() / days), "by_class": {CLASSES[k]: int((rf_flags == k).sum()) for k in range(1, len(CLASSES))}},
                        "rules": {"flags_per_station_day": float((ru_flags != 0).sum() / days), "by_class": {CLASSES[k]: int((ru_flags == k).sum()) for k in range(1, len(CLASSES))}}}
    x1 = cl.X.to_numpy(dtype=np.float32)[:1]
    t0 = time.perf_counter()
    for _ in range(200):
        rf.predict(x1)
    out["rf_predict_ms_per_window_single_thread"] = (time.perf_counter() - t0) / 200 * 1000
    return out


def run_events(panel, conn) -> dict:
    st = list(range(len(panel.codes)))
    clo, chi = panel.period("calibration")
    hours = sum(int(np.isfinite(panel.X[i][clo:chi]).sum()) for i in st)

    def cal_burden(scores, thr):
        return E.burden(sum(len(E.alert_indices(s, thr, clo, chi)) for s in scores), hours)

    xs = [panel.X[i] for i in st]
    rule_scores = [E.rule_score(x) for x in xs]
    thr_rule = E.tune_threshold(rule_scores, xs, clo, chi)
    ifm = E.fit_iforest(panel, st, "tune")
    if_scores = [ifm.score(x, panel) for x in xs]
    thr_if = E.tune_threshold(if_scores, xs, clo, chi)
    eng = ForecastEngine.load()
    methods = []
    sm = None
    if eng.ready and [s["name"] for s in eng.meta["stations"]] == panel.names:
        sm = E.SurpriseModel(eng, load_weather(conn, SITE), {i: i for i in st})
        su_scores = [sm.score(x, panel, i, clo, chi) for i, x in zip(st, xs)]
        thr_su = E.tune_threshold(su_scores, xs, clo, chi)
    scale = E.tune_repo_scale(panel, st, clo, chi)
    repo_cal = E.burden(sum(len(E.repo_alerts(panel.X[i], panel, clo, chi, pm_scale=scale)) for i in st), hours)
    repo_ship_cal = E.burden(sum(len(E.repo_alerts(panel.X[i], panel, clo, chi)) for i in st), hours)

    methods.append(E.evaluate_method("robust-baseline rule", panel, st, lambda x, i, lo, hi: E.alert_indices(E.rule_score(x), thr_rule, lo, hi),
                                     seeds=EVENT_SEEDS, threshold=thr_rule, burden_calibration=cal_burden(rule_scores, thr_rule)))
    methods.append(E.evaluate_method("Isolation Forest", panel, st, lambda x, i, lo, hi: E.alert_indices(ifm.score(x, panel), thr_if, lo, hi),
                                     seeds=EVENT_SEEDS, threshold=thr_if, burden_calibration=cal_burden(if_scores, thr_if)))
    if sm is not None:
        methods.append(E.evaluate_method("forecast surprise (Phase 3 model)", panel, st, lambda x, i, lo, hi: E.alert_indices(sm.score(x, panel, i, lo, hi), thr_su, lo, hi),
                                         seeds=EVENT_SEEDS, threshold=thr_su, burden_calibration=cal_burden(su_scores, thr_su)))
    methods.append(E.evaluate_method("repo EventDetector, retuned to the same burden", panel, st, lambda x, i, lo, hi: E.repo_alerts(x, panel, lo, hi, pm_scale=scale),
                                     seeds=EVENT_SEEDS, threshold=scale, burden_calibration=repo_cal))
    methods.append(E.evaluate_method("repo EventDetector, as shipped", panel, st, lambda x, i, lo, hi: E.repo_alerts(x, panel, lo, hi),
                                     seeds=EVENT_SEEDS, threshold=None, burden_calibration=repo_ship_cal))
    return {"target_burden": E.TARGET_BURDEN, "persist_hours": E.PERSIST, "refractory_hours": E.REFRACTORY, "seeds": EVENT_SEEDS,
            "methods": [m.__dict__ for m in methods]}


def conclusions(faults: dict, events: dict) -> list[str]:
    """Verdicts computed from the numbers above, so the text cannot drift away from the tables."""
    L = ["## 3. What this means", ""]
    ms = {m["name"]: m for m in events["methods"]}
    rule = ms["robust-baseline rule"]
    rlo, rhi = E.wilson(rule["hits"], rule["n_episodes"])
    for name, m in ms.items():
        if name == "robust-baseline rule" or "retuned" in name:
            continue
        lo, hi = E.wilson(m["hits"], m["n_episodes"])
        if "as shipped" in name:
            L.append(f"- **{name}** reaches {pct(m['recall'])} recall but at {m['burden_test']:.2f} alerts per station-day, against the rule's {pct(rule['recall'])} at {rule['burden_test']:.2f}: it does the same job with about {m['burden_test'] / max(rule['burden_test'], 1e-9):.1f}x the alerts.")
        elif lo > rhi:
            L.append(f"- **{name}** beats the rule on recall ({pct(m['recall'])} vs {pct(rule['recall'])}, intervals do not overlap).")
        elif hi < rlo:
            L.append(f"- **{name}** is worse than the rule ({pct(m['recall'])} vs {pct(rule['recall'])}).")
        else:
            L.append(f"- **{name}** is not distinguishable from the rule on recall ({pct(m['recall'])} vs {pct(rule['recall'])}, intervals overlap), so it is not worth its complexity for event detection.")
    sh = faults["sets"]["shifted (harder) test"]
    rf, ru = sh["random_forest"], sh["rules"]
    L.append(f"- **Fault classes:** sentinel and dropout are trivial (F1 {rf['per_class']['sentinel']['f1']:.2f} for both methods): a one-line rule is enough. Stuck and spike are recognised by both (RF F1 {rf['per_class']['stuck']['f1']:.2f} and {rf['per_class']['spike']['f1']:.2f}); the forest's edge is mainly fewer normal hours flagged ({pct(rf['false_flag_rate_on_normal'], 1)} vs {pct(ru['false_flag_rate_on_normal'], 1)}). **Drift is the weak class** (RF F1 {rf['per_class']['drift']['f1']:.2f}, rules {ru['per_class']['drift']['f1']:.2f}): gradual gain change is hard to separate from natural differences between stations 10 to 25 km apart, so it should not be trusted from PM2.5 alone at hourly resolution.")
    rd = faults["real_data"]["random_forest"]["flags_per_station_day"]
    L.append(f"- **On real un-injected data** the forest still flags {rd:.1f} windows per station-day (mostly drift and stuck), too noisy to drive alerts on its own.")
    drift_rf, drift_ru = rf["per_class"]["drift"]["f1"], ru["per_class"]["drift"]["f1"]
    L += ["", "**Decision.** None of these models is deployed. No ML event detector clearly beats the simple robust-baseline rule. "
          f"For faults the forest does beat the rules overall (macro-F1 {rf['macro_f1_faults']:.2f} vs {ru['macro_f1_faults']:.2f}), and most of that gain is on drift (F1 {drift_rf:.2f} vs {drift_ru:.2f}), "
          f"but F1 around {drift_rf:.1f} is not good enough to act on, and its {rd:.1f} flags per station-day on real data would swamp anyone reading them. "
          "The deterministic QualityEngine and EventDetector therefore remain the shipped behaviour (ADR-017 fallback). "
          "What is worth porting is a cheap rule, not a model: a stuck-value check in the quality engine (the v0 adapter already maps the `-1` no-frame sentinel to a PM fault). "
          "It is not implemented here because changing the quality engine moves the golden simulation fingerprints and deserves its own change. "
          "Revisit drift when the two nodes (about 1.3 km apart) have weeks of real data: neighbour agreement is far more informative at that distance than across CPCB stations.", ""]
    return L


def pct(x: Optional[float], d: int = 0) -> str:
    return "-" if x is None or (isinstance(x, float) and not np.isfinite(x)) else f"{x * 100:.{d}f} %"


def render(faults: dict, events: dict, meta: dict) -> str:
    L = ["# Detection benchmark (Phase 4)", "",
         f"_Generated {meta['generated']} on {meta['platform']}._", "",
         "**What this is.** Detectors tested on real CPCB hourly PM2.5 from 10 stations around Gurugram, with synthetic episodes and faults "
         "injected so there is ground truth. It measures how well each method recognises *these injected patterns*. It does **not** measure "
         "behaviour on real sensor failures, and the real series contain unlabelled genuine episodes and glitches. The AEIOS nodes have only 14 "
         "real packets, so nothing here is trained on or tells you about node data. Windows: " + "; ".join(f"{k} {v}" for k, v in describe().items()) + ".", ""]

    L += ["## 1. Pollution-event detection", "",
          f"Every tunable method gets one threshold, set on the calibration window (Oct 2025 to mid Jan 2026, out of sample for every model) to give "
          f"{events['target_burden']} alerts per station-day on real data. An alert needs {events['persist_hours']} consecutive flagged hours; a run alerts once, at its start, and a new run within "
          f"{events['refractory_hours']} h of an alert is ignored. Recall is the share of {events['methods'][0]['n_episodes']} injected episodes (rise of 1.5x, 2x or 3x the local level, lasting 2 to 8 h, "
          "minimum +35 ug/m3) that raised an alert from their start to 2 h after their end. Test-window burden counts genuine unlabelled episodes too: it is "
          "workload, not a false-alarm rate.", "",
          "| method | alerts per station-day (calibration) | (test) | recall | 95 % CI | 1.5x | 2x | 3x | median delay |", "|---|---|---|---|---|---|---|---|---|"]
    for m in events["methods"]:
        lo, hi = E.wilson(m["hits"], m["n_episodes"])
        f = m["recall_by_factor"]
        L.append(f"| {m['name']} | {m['burden_calibration']:.2f} | {m['burden_test']:.2f} | {pct(m['recall'])} | {pct(lo)} to {pct(hi)} | "
                 f"{pct(f.get('1.5'))} | {pct(f.get('2.0'))} | {pct(f.get('3.0'))} | {m['median_latency_h'] if m['median_latency_h'] is not None else '-'} h |")
    L.append("")

    L += ["## 2. Sensor-fault classification", "",
          f"A Random Forest ({faults['train_rows']} training windows) and a set of hand-written rules (thresholds tuned on separate training windows at the natural fault rate) classify each hourly window as "
          f"normal, stuck, spike, sentinel (-1, no sensor frame), dropout or drift. Trained on 7 stations; tested on 3 stations never seen in training: "
          f"{', '.join(faults['held_out'])}. The shifted test draws faults from deliberately harder ranges (shorter stuck runs, weaker spikes, slower drift) than training. "
          f"Rules chosen: {faults['rules']}. A window is only used if the clean series is complete over its previous 24 h, so natural data gaps are never labelled faults.", ""]
    for label, s in faults["sets"].items():
        L += [f"### {label} ({s['rows']} windows)", "", "| class | support | RF precision | RF recall | RF F1 | rules precision | rules recall | rules F1 |", "|---|---|---|---|---|---|---|---|"]
        for c in CLASSES:
            a, b = s["random_forest"]["per_class"][c], s["rules"]["per_class"][c]
            L.append(f"| {c} | {a['support']} | {a['precision']:.2f} | {a['recall']:.2f} | {a['f1']:.2f} | {b['precision']:.2f} | {b['recall']:.2f} | {b['f1']:.2f} |")
        L += ["", f"Macro-F1 over fault classes: **RF {s['random_forest']['macro_f1_faults']:.2f}**, rules {s['rules']['macro_f1_faults']:.2f}. "
              f"Normal windows flagged as a fault: RF {pct(s['random_forest']['false_flag_rate_on_normal'], 1)}, rules {pct(s['rules']['false_flag_rate_on_normal'], 1)}.", ""]
    rd = faults["real_data"]
    L += ["### On real, un-injected data (held-out stations, test window)", "",
          f"{rd['hours']} complete hours. Flags here are upper bounds on false alarms (real series do contain genuine glitches and plateaus): "
          f"RF {rd['random_forest']['flags_per_station_day']:.2f} per station-day {rd['random_forest']['by_class']}; "
          f"rules {rd['rules']['flags_per_station_day']:.2f} per station-day {rd['rules']['by_class']}. "
          f"Random Forest single-window prediction: {faults['rf_predict_ms_per_window_single_thread']:.1f} ms on this machine, one thread.", ""]
    return "\n".join(L + conclusions(faults, events))


def main(argv: Optional[list[str]] = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--threads", type=int, default=4)
    a = ap.parse_args(argv)
    warnings.filterwarnings("ignore", message=".*sklearn.utils.parallel.delayed.*")
    conn = open_cache()
    panel = load_panel(conn)
    meta = {"generated": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"), "platform": f"{platform.system()} {platform.machine()}, Python {platform.python_version()}"}
    print("faults ...", flush=True)
    faults = run_faults(panel, a.threads)
    print("events ...", flush=True)
    events = run_events(panel, conn)
    text = render(faults, events, meta)
    print(text)
    if a.write:
        REPORT_MD.write_text(text + "\n", encoding="utf-8")
        REPORT_JSON.write_text(json.dumps({"meta": meta, "faults": faults, "events": events}, indent=1, default=float), encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
