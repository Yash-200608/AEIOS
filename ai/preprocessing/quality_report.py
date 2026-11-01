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

from ai.feature_engineering.features import HORIZONS, HOUR, build_rows, leakage_audit, load_station_pm, load_weather
from ai.feature_engineering.windows import describe, split_of
from ai.preprocessing.common import ROOT, open_cache

REPORT_PATH = ROOT / "ai" / "reports" / "data_quality.md"
MIN_USABLE_HOURS = 24 * 365  # a station needs about a year of clean hours before Phase 3 should train on it
MIN_WINTER_HOURS = 2000      # ...and enough Nov-Feb hours (about 83 days) to have seen the pollution season at all


def _d(ts: Optional[int]) -> str:
    return datetime.fromtimestamp(ts, timezone.utc).strftime("%Y-%m-%d") if ts else "-"


HOLE_H = 24 * 30  # a silence longer than 30 days is a feed outage, not ordinary gappiness


def gap_stats(hours: list[int]) -> dict:
    """hours: sorted unix hours that have a clean value. Besides the overall gap share it reports the share *inside active
    segments* (stretches separated by outages longer than HOLE_H), because a multi-year feed outage would otherwise make
    every station look 50 % gappy even when the data on either side is good."""
    if not hours:
        return {"n": 0, "span_h": 0, "gap_pct": 100.0, "longest_gap_h": 0, "segments": 0, "seg_gap_pct": 100.0, "holes": []}
    span = (hours[-1] - hours[0]) // HOUR + 1
    gaps = [(b - a) // HOUR - 1 for a, b in zip(hours, hours[1:])]
    holes = [(a, b) for a, b in zip(hours, hours[1:]) if (b - a) // HOUR - 1 > HOLE_H]
    seg_span = span - sum((b - a) // HOUR - 1 for a, b in holes)
    inner = [g for g in gaps if g <= HOLE_H]
    return {"n": len(hours), "span_h": span, "gap_pct": round(100.0 * (1 - len(hours) / span), 1),
            "longest_gap_h": max(inner or [0]), "segments": len(holes) + 1,
            "seg_gap_pct": round(100.0 * (1 - len(hours) / seg_span), 1) if seg_span > 0 else 100.0,
            "holes": [(_d(a), _d(b)) for a, b in holes], "winter_n": winter_hours(hours)}


def winter_hours(hours: list[int]) -> int:
    """Clean hours falling in Nov-Feb (IST), the season that matters for Delhi-NCR PM2.5."""
    return sum(1 for h in hours if datetime.fromtimestamp(h + 19800, timezone.utc).month in (11, 12, 1, 2))


def is_usable(g: dict) -> bool:
    """Gate for Phase 3 training. Deliberately NOT a continuity test: lag features tolerate gaps (they are NaN), a row only
    needs its own origin and target. What matters is enough data overall and enough of the winter season."""
    return g["n"] >= MIN_USABLE_HOURS and g.get("winter_n", 0) >= MIN_WINTER_HOURS


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
        out += ["Each station's legacy and live sensors are merged (the newer feed wins on overlap). The legacy feed is patchy: "
                "many stations have outages of months. Gaps do not disqualify a station because lag features tolerate them (they "
                "are missing, never filled), but they are listed so nobody assumes continuous data.", "",
                "| station | provider | km | parameter | clean hours | winter hours | span | gap % between outages | longest gap (h) | outages > 30 d | verdict |",
                "|---|---|---|---|---|---|---|---|---|---|---|"]
        for lid, name, provider, km in stations:
            for (param,) in conn.execute("SELECT DISTINCT parameter FROM aq_sensors WHERE location_id=? ORDER BY parameter", (lid,)).fetchall():
                n_raw = conn.execute("SELECT count(*) FROM aq_hourly h JOIN aq_sensors s USING(sensor_id) "
                                     "WHERE s.location_id=? AND s.parameter=?", (lid, param)).fetchone()[0]
                if n_raw == 0:
                    continue  # never downloaded (e.g. PM10 when only PM2.5 was fetched)
                hrs = sorted(load_station_pm(conn, lid, param).data)
                g = gap_stats(hrs)
                ok = is_usable(g)
                if ok and param == "pm25":
                    usable.append((lid, name, g))
                out.append(f"| {name} | {provider} | {km:.1f} | {param} | {g['n']} | {g['winter_n']} | {_d(hrs[0] if hrs else None)}..{_d(hrs[-1] if hrs else None)} "
                           f"| {g['seg_gap_pct']} | {g['longest_gap_h']} | {'; '.join(f'{a}..{b}' for a, b in g['holes']) or '-'} | "
                           f"{'usable' if ok else 'insufficient'} |")
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

    out += ["## Feature rows and leakage audit", "", "Windows: " + "; ".join(f"{k} {v}" for k, v in describe().items()) +
            ". Rows whose target straddles a window edge are dropped.", ""]
    if not usable:
        out += ["No PM2.5 sensor meets the Phase 3 bar (>= 1 year of clean hours and >= 2000 winter hours), so no rows were built.", ""]
    wx = load_weather(conn, site)
    for lid, name, _ in usable[:3]:
        pm = load_station_pm(conn, lid, "pm25")
        out += [f"### {name} (station {lid})", "", "| horizon | rows | train | calibration | test | leakage audit |", "|---|---|---|---|---|---|"]
        for h in HORIZONS:
            rows = build_rows(pm, wx, horizon=h)
            counts = {k: 0 for k in ('train', 'calibration', 'test')}
            for r in rows:
                k = split_of(r['t'], h)
                if k:
                    counts[k] += 1
            problems = leakage_audit(pm, wx, rows)
            out.append(f"| +{h} h | {len(rows)} | {counts['train']} | {counts['calibration']} | {counts['test']} | "
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
