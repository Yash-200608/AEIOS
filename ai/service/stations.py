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


NODE_LOCATION_BASE = 900000    # node forecasts use location_id = NODE_LOCATION_BASE + wire_id, so they never collide with OpenAQ ids


def _km(a: tuple[float, float], b: tuple[float, float]) -> float:
    import math
    p1, p2 = math.radians(a[0]), math.radians(b[0])
    h = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(b[1] - a[1]) / 2) ** 2
    return 6371.0088 * 2 * math.asin(math.sqrt(h))


def export(conn, model_dir: Path, nodes_registry: Optional[Path] = None) -> dict:
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
    nodes = []
    if nodes_registry is not None:
        reg = json.loads(Path(nodes_registry).read_text(encoding="utf-8"))
        for name, v in reg.items():
            if name.startswith("_"):
                continue
            here = (float(v["latitude"]), float(v["longitude"]))
            nearest = min(stations, key=lambda s: _km(here, (s["lat"], s["lon"])))   # the model's station_code feature: nearest CPCB station
            nodes.append({"node": name, "wire_id": int(v["wire_id"]), "display_id": v["display_id"], "site": v.get("site", ""),
                          "lat": here[0], "lon": here[1], "location_id": NODE_LOCATION_BASE + int(v["wire_id"]),
                          "station_code": nearest["station_code"], "nearest_cpcb": nearest["name"]})
    return {"model": meta["model"], "model_version": meta["version"], "weather_site": {"lat": 28.4782417, "lon": 76.9040528},
            "stations": stations, "nodes": nodes}


def load(path: Path) -> dict:
    cfg = json.loads(Path(path).read_text(encoding="utf-8"))
    cfg.setdefault("nodes", [])
    wires = [n["wire_id"] for n in cfg["nodes"]]
    if len(set(wires)) != len(wires):
        raise ValueError("duplicate node wire_id")
    n_st = len(cfg["stations"])
    for n in cfg["nodes"]:
        if not 0 <= n["station_code"] < n_st:
            raise ValueError(f"node {n['display_id']} has no valid station_code")
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
    ap.add_argument("--nodes", default=None, help="node registry JSON (deployment/pi/v0_nodes.example.json)")
    a = ap.parse_args(argv)
    d = Path(a.model_dir) if a.model_dir else latest_version()
    if d is None:
        raise SystemExit("no model in the registry")
    cfg = export(open_cache(), d, Path(a.nodes) if a.nodes else None)
    Path(a.out).write_text(json.dumps(cfg, indent=1), encoding="utf-8")
    print(f"wrote {a.out}: {len(cfg['stations'])} stations and {len(cfg['nodes'])} nodes for {cfg['model']}/{cfg['model_version']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
