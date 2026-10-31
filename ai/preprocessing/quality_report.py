"""Data-quality report for the Phase 2 cache: what exists, how gappy it is, and whether the feature rows are leakage-free.

    python -m ai.preprocessing.quality_report            # prints Markdown
    python -m ai.preprocessing.quality_report --write    # also writes ai/reports/data_quality.md

This report gates Phase 3: if the PM stations are too sparse or gappy it says so instead of letting a model be trained on
them. It reads only the local cache, needs no key and no network.
"""

from __future__ import annotations

import argparse
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from ai.feature_engineering.features import HORIZONS, HOUR, build_rows, leakage_audit, load_pm_series, load_weather
from ai.feature_engineering.splits import chronological_split
from ai.preprocessing.common import ROOT, open_cache

REPORT_PATH = ROOT / "ai" / "reports" / "data_quality.md"
MIN_USABLE_HOURS = 24 * 365  # a sensor needs about a year of clean hours before Phase 3 should train on it


def _d(ts: Optional[int]) -> str:
    return datetime.fromtimestamp(ts, timezone.utc).strftime("%Y-%m-%d") if ts else "-"


def gap_stats(hours: list[int]) -> dict:
    """hours: sorted unix hours that have a clean value."""
    if not hours:
        return {"n": 0, "span_h": 0, "gap_pct": 100.0, "longest_gap_h": 0}
    span = (hours[-1] - hours[0]) // HOUR + 1
    longest = max([(b - a) // HOUR - 1 for a, b in zip(hours, hours[1:])] or [0])
    return {"n": len(hours), "span_h": span, "gap_pct": round(100.0 * (1 - len(hours) / span), 1), "longest_gap_h": longest}


def build_report(conn: sqlite3.Connection, site: str = "sgt") -> str:
    out: list[str] = ["# AEIOS data quality (Phase 2)", "",
                      f"_Generated {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')} from the local cache. "
                      "CPCB values are reference-grade measurements by others; weather and CAMS are model output. "
                      "None of this is AEIOS node data._", ""]

    out += ["## Air-quality stations (OpenAQ)", ""]
    stations = conn.execute("SELECT location_id, name, provider, distance_km FROM aq_stations ORDER BY distance_km").fetchall()
    if not stations:
        out += ["**No station data cached yet.** Run `python -m ai.preprocessing.openaq_fetch discover` then `history` "
                "(needs `OPENAQ_API_KEY` in the untracked `.env`). Phase 3 cannot start until this has data.", ""]
    usable: list[tuple[int, str, dict]] = []
    if stations:
        out += ["| station | provider | km | parameter | clean hours | span | gap % | longest gap (h) | verdict |",
                "|---|---|---|---|---|---|---|---|---|"]
        for lid, name, provider, km in stations:
            for sid, param in conn.execute("SELECT sensor_id, parameter FROM aq_sensors WHERE location_id=?", (lid,)).fetchall():
                ser = load_pm_series(conn, sid, param)
                hrs = sorted(ser.data)
                g = gap_stats(hrs)
                ok = g["n"] >= MIN_USABLE_HOURS and g["gap_pct"] <= 30
                if ok and param == "pm25":
                    usable.append((sid, name, g))
                raw = conn.execute("SELECT count(*), sum(value<0), sum(coverage_pct<75) FROM aq_hourly WHERE sensor_id=?", (sid,)).fetchone()
                out.append(f"| {name} | {provider} | {km:.1f} | {param} | {g['n']} | {_d(hrs[0] if hrs else None)}..{_d(hrs[-1] if hrs else None)} "
                           f"| {g['gap_pct']} | {g['longest_gap_h']} | {'usable' if ok else 'insufficient'} |")
        out.append("")

    out += ["## Weather and CAMS (Open-Meteo)", "", "| variable | rows | first | last | null % |", "|---|---|---|---|---|"]
    for var, n, lo, hi, nulls in conn.execute(
            "SELECT var, count(*), min(ts), max(ts), sum(value IS NULL) FROM wx_hourly WHERE site=? GROUP BY var ORDER BY var", (site,)):
        out.append(f"| {var} | {n} | {_d(lo)} | {_d(hi)} | {round(100.0 * nulls / n, 1)} |")
    out.append("")
    dead = conn.execute(
        "SELECT var, strftime('%Y-%m', ts, 'unixepoch') m FROM wx_hourly WHERE site=? GROUP BY var, m "
        "HAVING count(value) = 0 ORDER BY var, m", (site,)).fetchall()
    if dead:
        by_var: dict[str, list[str]] = {}
        for var, m in dead:
            by_var.setdefault(var, []).append(m)
        out += ["**Months with no values at all** (source gaps; features depending on these are missing, not imputed):", ""]
        out += [f"- `{v}`: {months[0]} .. {months[-1]} ({len(months)} months)" for v, months in by_var.items()]
        out.append("")

    out += ["## Feature rows and leakage audit", ""]
    if not usable:
        out += ["No PM2.5 sensor meets the Phase 3 bar (>= 1 year of clean hours, <= 30 % gaps), so no rows were built.", ""]
    wx = load_weather(conn, site)
    for sid, name, _ in usable[:3]:
        pm = load_pm_series(conn, sid, "pm25")
        out += [f"### {name} (sensor {sid})", "", "| horizon | rows | train | calibration | test | leakage audit |", "|---|---|---|---|---|---|"]
        for h in HORIZONS:
            rows = build_rows(pm, wx, horizon=h)
            sp = chronological_split(rows)
            problems = leakage_audit(pm, wx, rows)
            out.append(f"| +{h} h | {len(rows)} | {len(sp['train'])} | {len(sp['calibration'])} | {len(sp['test'])} | "
                       f"{'clean' if not problems else f'{len(problems)} PROBLEMS'} |")
        out.append("")
    return "\n".join(out)


def main(argv: Optional[list[str]] = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--site", default="sgt")
    a = ap.parse_args(argv)
    text = build_report(open_cache(), a.site)
    print(text)
    if a.write:
        Path(REPORT_PATH).parent.mkdir(parents=True, exist_ok=True)
        Path(REPORT_PATH).write_text(text + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
