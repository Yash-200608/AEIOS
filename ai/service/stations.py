"""Station list for the forecast service: which CPCB stations to forecast and which OpenAQ sensors feed each one.

The list is generated on a workstation from the data cache and the model's own station order (the model's `station_code`
feature is the index into that order, so the two must agree) and copied to the Pi as a small JSON file. The Pi never needs the
cache database.

    python -m ai.service.export_stations --out stations.json
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Optional

from ai.inference.engine import latest_version
from ai.preprocessing.common import open_cache


def export(conn, model_dir: Path) -> dict:
    meta = json.loads((model_dir / "metadata.json").read_text(encoding="utf-8"))
    stations = []
    for code, s in enumerate(meta["stations"]):
        lid = s["location_id"]
        row = conn.execute("SELECT name, provider, lat, lon, distance_km FROM aq_stations WHERE location_id=?", (lid,)).fetchone()
        if row is None:
            raise SystemExit(f"station {lid} is in the model metadata but not in the cache")
        sensors = [r[0] for r in conn.execute(
            "SELECT sensor_id FROM aq_sensors WHERE location_id=? AND parameter='pm25' ORDER BY sensor_id DESC", (lid,))]  # newest feed first
        stations.append({"station_code": code, "location_id": lid, "name": row[0], "provider": row[1], "lat": row[2], "lon": row[3],
                         "distance_km": round(row[4], 1), "pm25_sensor_ids": sensors})
    return {"model": meta["model"], "model_version": meta["version"], "weather_site": {"lat": 28.4782417, "lon": 76.9040528},
            "stations": stations}


def load(path: Path) -> dict:
    cfg = json.loads(Path(path).read_text(encoding="utf-8"))
    for s in cfg["stations"]:
        if not s["pm25_sensor_ids"]:
            raise ValueError(f"station {s['name']} has no PM2.5 sensor")
    codes = [s["station_code"] for s in cfg["stations"]]
    if codes != list(range(len(codes))):
        raise ValueError("station_code values must be 0..n-1 in model order")
    return cfg


def main(argv: Optional[list[str]] = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", default="stations.json")
    ap.add_argument("--model-dir", default=None)
    a = ap.parse_args(argv)
    d = Path(a.model_dir) if a.model_dir else latest_version()
    if d is None:
        raise SystemExit("no model in the registry")
    cfg = export(open_cache(), d)
    Path(a.out).write_text(json.dumps(cfg, indent=1), encoding="utf-8")
    print(f"wrote {a.out}: {len(cfg['stations'])} stations for {cfg['model']}/{cfg['model_version']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
