"""Reproducible forecast benchmark (Phase 3): fits every model on the training window, calibrates on the calibration window,
and scores on the untouched test window against persistence, CAMS, climatology, ridge and XGBoost.

    ai/.venv/Scripts/python -m ai.training.benchmark --kind base --write     # needs the populated cache, no network

Writes ai/reports/forecast_benchmark.md (+ .json) and, with --register, a verified model artifact under
ai/models/registry/. The numbers describe forecasts of CPCB station PM2.5 near Gurugram, not AEIOS node measurements.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import platform
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import numpy as np

from ai.feature_engineering.features import HORIZONS
from ai.preprocessing.common import ROOT, open_cache
from ai.training import dataset as D
from ai.training import metrics as M
from ai.training import train_forecast as T

REPORT_MD = ROOT / "ai" / "reports" / "forecast_benchmark.md"
REPORT_JSON = ROOT / "ai" / "reports" / "forecast_benchmark.json"
REGISTRY = ROOT / "ai" / "models" / "registry"
MODEL_NAME = "pm25_lgbm_cqr"


def _winter(t: np.ndarray, horizon: int) -> np.ndarray:
    months = np.array([datetime.fromtimestamp(int(x) + horizon * 3600 + 19800, timezone.utc).month for x in t])
    return np.isin(months, (11, 12, 1, 2))


def point_scores(y: np.ndarray, preds: dict[str, np.ndarray], ref: str = "persistence") -> dict[str, dict]:
    out = {}
    base_mae = M.mae(y, preds[ref])
    for name, p in preds.items():
        ok = np.isfinite(p)
        out[name] = {"n": int(ok.sum()), "mae": M.mae(y, p), "rmse": M.rmse(y, p), "bias": M.bias(y, p),
                     # skill compares like with like: persistence restricted to the rows this method can score
                     "skill_vs_persistence": M.skill(M.mae(y[ok], p[ok]), M.mae(y[ok], preds[ref][ok])) if ok.any() else float("nan")}
    return out


def interval_scores(y: np.ndarray, lo: np.ndarray, med: np.ndarray, hi: np.ndarray) -> dict:
    return {"coverage80": M.coverage(y, lo, hi), "width": M.width(lo, hi),
            "pinball10": M.pinball(y, lo, 0.1), "pinball50": M.pinball(y, med, 0.5), "pinball90": M.pinball(y, hi, 0.9)}


def run_horizon(conn, kind: str, h: int, threads: int) -> tuple[dict, T.QuantileModel, D.Matrix]:
    full = D.build_matrix(conn, h, kind=kind)
    tr, ca, te = full.subset("train"), full.subset("calibration"), full.subset("test")
    t0 = time.time()
    qm = T.fit_quantiles(tr, ca, threads=threads)
    train_s = time.time() - t0
    xg, _ = T.fit_xgb_point(tr, threads=threads)
    ridge = T.fit_ridge(tr)

    q_raw = qm.predict(te.X, calibrated=False)
    q_cal = qm.predict(te.X, calibrated=True)
    preds = {
        "persistence": te.pm_now.astype(np.float64),
        "climatology": T.climatology(tr, te).astype(np.float64),
        "cams": te.cams_target.astype(np.float64),
        "ridge": np.expm1(ridge.predict(te.X)).clip(min=0),
        "xgboost": np.expm1(xg.predict(te.X)).clip(min=0),
        "lightgbm_q50": q_cal["q50"],
    }
    # persistence + an empirical residual band from the calibration window: the fair interval comparator
    r = np.log1p(ca.y) - np.log1p(ca.pm_now)
    rlo, rhi = np.quantile(r, 0.1), np.quantile(r, 0.9)
    p_lo = np.expm1(np.log1p(te.pm_now) + rlo).clip(min=0)
    p_hi = np.expm1(np.log1p(te.pm_now) + rhi)

    win = _winter(te.t, h)
    high = te.pm_now >= 100
    subsets = {"all": np.ones(len(te.y), bool), "winter (Nov-Feb)": win, "other months": ~win, "origin PM2.5 >= 100": high}
    res: dict = {"horizon": h, "n_train": int(len(tr.y)), "n_calibration": int(len(ca.y)), "n_test": int(len(te.y)),
                 "train_seconds": train_s, "conformal_log": qm.conformal, "best_iters": {str(k): v for k, v in qm.best_iters.items()},
                 "subsets": {}}
    for name, m in subsets.items():
        if m.sum() < 30:
            res["subsets"][name] = {"n": int(m.sum()), "note": "too few rows"}
            continue
        y = te.y[m].astype(np.float64)
        res["subsets"][name] = {
            "n": int(m.sum()),
            "point": point_scores(y, {k: v[m] for k, v in preds.items()}),
            "interval": {
                "lightgbm_raw": interval_scores(y, q_raw["q10"][m], q_raw["q50"][m], q_raw["q90"][m]),
                "lightgbm_cqr": interval_scores(y, q_cal["q10"][m], q_cal["q50"][m], q_cal["q90"][m]),
                "persistence_band": interval_scores(y, p_lo[m], te.pm_now[m].astype(np.float64), p_hi[m]),
            },
        }
    # per-row latency of the calibrated three-quantile prediction (single row, one thread), as the Pi service would call it
    x1 = te.X[:1]
    t0 = time.perf_counter()
    for _ in range(200):
        qm.predict(x1)
    res["predict_ms_per_row"] = (time.perf_counter() - t0) / 200 * 1000
    return res, qm, te


def fmt(x: Optional[float], d: int = 1) -> str:
    return "-" if x is None or (isinstance(x, float) and not np.isfinite(x)) else f"{x:.{d}f}"


def render(results: list[dict], meta: dict) -> str:
    L = ["# PM2.5 forecast benchmark", "",
         f"_Generated {meta['generated']} on {meta['platform']}; feature set `{meta['kind']}`; stations: {', '.join(n for _, n in meta['stations'])}._", "",
         "Forecasts of **CPCB station PM2.5** near Gurugram. They are not AEIOS node measurements, and no field-accuracy claim is "
         "made about the nodes. Windows: " + "; ".join(f"{k} {v}" for k, v in meta["windows"].items()) + ".", ""]
    verdict = []
    for r in results:
        h = r["horizon"]
        a = r["subsets"]["all"]
        if "point" not in a:
            continue
        pt = a["point"]
        best_base = min(("persistence", "climatology", "cams", "ridge"), key=lambda k: pt[k]["mae"] if np.isfinite(pt[k]["mae"]) else 1e9)
        verdict.append((h, pt["lightgbm_q50"]["mae"], pt[best_base]["mae"], best_base, pt["lightgbm_q50"]["skill_vs_persistence"]))
    L += ["## Summary", "", "| horizon | LightGBM MAE | best baseline | baseline MAE | skill vs persistence | verdict |", "|---|---|---|---|---|---|"]
    for h, m, b, name, sk in verdict:
        L.append(f"| +{h} h | {fmt(m)} | {name} | {fmt(b)} | {fmt(sk * 100)} % | {'beats all baselines' if m < b else 'does NOT beat ' + name} |")
    L.append("")
    for r in results:
        h = r["horizon"]
        L += [f"## +{h} h", "",
              f"rows: train {r['n_train']}, calibration {r['n_calibration']}, test {r['n_test']}; CQR widening {fmt(r['conformal_log'], 3)} (log units); "
              f"best iterations {r['best_iters']}; single-row predict {fmt(r['predict_ms_per_row'], 2)} ms on this machine.", ""]
        for name, s in r["subsets"].items():
            if "point" not in s:
                L += [f"**{name}**: n={s['n']} ({s['note']})", ""]
                continue
            L += [f"### {name} (n={s['n']})", "", "| method | n | MAE | RMSE | bias | skill vs persistence |", "|---|---|---|---|---|---|"]
            for k, v in s["point"].items():
                L.append(f"| {k} | {v['n']} | {fmt(v['mae'])} | {fmt(v['rmse'])} | {fmt(v['bias'])} | {fmt(v['skill_vs_persistence'] * 100)} % |")
            L += ["", "| interval | 80 % coverage | mean width | pinball q10 | pinball q50 | pinball q90 |", "|---|---|---|---|---|---|"]
            for k, v in s["interval"].items():
                L.append(f"| {k} | {fmt(v['coverage80'] * 100)} % | {fmt(v['width'])} | {fmt(v['pinball10'], 2)} | {fmt(v['pinball50'], 2)} | {fmt(v['pinball90'], 2)} |")
            L.append("")
    L += ["## Caveats", "",
          "- Weather is ERA5 reanalysis at the forecast origin only; no future weather is used, so these are not weather-forecast-assisted numbers.",
          "- `cams` is the CAMS PM2.5 analysis/forecast at the target hour and exists only from Aug 2022; its row count is smaller.",
          "- The 2023 to Jan 2025 CPCB gap on OpenAQ means training mixes a 2018-2022 feed and a 2025+ feed; sensor and reporting changes between them are not modelled.",
          "- Stations are pooled; the test window is one year of one region. Skill elsewhere or in other years is unproven.", ""]
    return "\n".join(L)


def register(qm: T.QuantileModel, version: str, registry: Path = REGISTRY) -> Path:
    """Write one horizon's boosters and conformal constant."""
    d = registry / MODEL_NAME / version / f"h{qm.horizon}"
    d.mkdir(parents=True, exist_ok=True)
    for q, b in qm.boosters.items():
        b.save_model(str(d / f"q{int(round(q * 100))}.txt"), num_iteration=b.best_iteration or -1)
    (d / "conformal.json").write_text(json.dumps({"conformal_log": qm.conformal, "alpha": T.ALPHA, "feature_names": qm.feature_names}, indent=1))
    return d


def write_registry(models: list[T.QuantileModel], *, version: str, kind: str, stations: list, windows: dict, created: str,
                   results: Optional[list[dict]] = None, registry: Path = REGISTRY) -> Path:
    """Save every horizon, then metadata.json with the sha256 of each file. Returns the version directory."""
    root = registry / MODEL_NAME / version
    files: dict[str, str] = {}
    for qm in models:
        d = register(qm, version, registry)
        for f in sorted(d.iterdir()):
            files[str(f.relative_to(root)).replace("\\", "/")] = sha256_file(f)
    md = {"model": MODEL_NAME, "version": version, "feature_kind": kind, "created": created,
          "target": "log1p(PM2.5 ug/m3), quantiles 0.1/0.5/0.9, 80% CQR", "horizons": [m.horizon for m in models],
          "feature_names": models[0].feature_names, "stations": [{"location_id": i, "name": n} for i, n in stations],
          "windows": windows, "trained_on": "CPCB PM2.5 (OpenAQ) + ERA5; NOT AEIOS node data", "files": files,
          "seed": T.SEED, "lightgbm_params": T.LGB_PARAMS}
    if results:
        md["metrics_all_test"] = {str(r["horizon"]): r["subsets"].get("all") for r in results}
    (root / "metadata.json").write_text(json.dumps(md, indent=1, default=float), encoding="utf-8")
    return root


def sha256_file(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def main(argv: Optional[list[str]] = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--kind", choices=("base", "cams"), default="base")
    ap.add_argument("--horizons", default=",".join(map(str, HORIZONS)))
    ap.add_argument("--threads", type=int, default=4)
    ap.add_argument("--write", action="store_true", help="write ai/reports/forecast_benchmark.{md,json}")
    ap.add_argument("--register", action="store_true", help="save the models under ai/models/registry/")
    a = ap.parse_args(argv)
    conn = open_cache()
    stations = D.usable_stations(conn)
    results, models = [], []
    for h in [int(x) for x in a.horizons.split(",")]:
        print(f"horizon +{h} h ...", flush=True)
        res, qm, te = run_horizon(conn, a.kind, h, a.threads)
        results.append(res)
        models.append(qm)
    meta = {"generated": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"), "platform": f"{platform.system()} {platform.machine()}, Python {platform.python_version()}",
            "kind": a.kind, "stations": stations,
            "windows": {"train targets until": datetime.fromtimestamp(D.TRAIN_END, timezone.utc).date().isoformat(),
                        "calibration origins": f"{datetime.fromtimestamp(D.CALIB_START, timezone.utc).date()}..{datetime.fromtimestamp(D.CALIB_END, timezone.utc).date()}",
                        "test origins from": datetime.fromtimestamp(D.TEST_START, timezone.utc).date().isoformat()}}
    text = render(results, meta)
    print(text)
    if a.write:
        suffix = "" if a.kind == "base" else f"_{a.kind}"  # the challenger never overwrites the primary report
        md_path = REPORT_MD.with_name(f"forecast_benchmark{suffix}.md")
        json_path = REPORT_JSON.with_name(f"forecast_benchmark{suffix}.json")
        md_path.parent.mkdir(parents=True, exist_ok=True)
        md_path.write_text(text + "\n", encoding="utf-8")
        json_path.write_text(json.dumps({"meta": meta, "results": results}, indent=1, default=float), encoding="utf-8")
    if a.register:
        version = "v" + datetime.now(timezone.utc).strftime("%Y%m%d")
        root = write_registry(models, version=version, kind=a.kind, stations=stations, windows=meta["windows"],
                              created=meta["generated"], results=results)
        print(f"registered {root}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
