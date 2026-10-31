"""Behaviour fingerprint of the gateway intelligence pipeline (SIMULATION RESULT, not field evidence).

Runs deterministic simulation scenarios and hashes every table the gateway writes, ignoring only the wall-clock
columns created_at / updated_at. A refactor of the pipeline must leave these hashes unchanged.

    python -m simulation.tests.golden_pipeline --write    # record fingerprints into golden_pipeline.json
    python -m simulation.tests.golden_pipeline            # print current fingerprints
"""

from __future__ import annotations

import hashlib
import json
import sqlite3
import sys
import tempfile
from pathlib import Path

from simulation.runners.experiment import ExperimentConfig, run_experiment

GOLDEN_PATH = Path(__file__).with_name("golden_pipeline.json")
WALL_CLOCK_COLUMNS = {"created_at", "updated_at"}
TABLES = (
    "nodes",
    "radio_packets",
    "sensor_readings",
    "sensor_states",
    "events",
    "event_features",
    "sampling_decisions",
    "power_state",
    "system_logs",
)

# Scenarios chosen to exercise: events opening/closing, regional events, MQ135 gating, faults, restart, duplicates.
CASES = [
    ("multimodal_event", 42),
    ("multimodal_event", 43),
    ("regional_propagating_event", 42),
    ("mq135_only_spike", 42),
    ("sensor_failure", 42),
    ("gateway_restart", 42),
    ("multiple_simultaneous_events", 43),
    ("duplicate_packet", 42),
    ("normal", 42),
]
DURATION = 900.0
NODES = 3


def _table_digest(conn: sqlite3.Connection, table: str) -> tuple[str, int]:
    cur = conn.execute(f"SELECT * FROM {table} ORDER BY 1")
    cols = [d[0] for d in cur.description]
    keep = [i for i, c in enumerate(cols) if c not in WALL_CLOCK_COLUMNS]
    h = hashlib.sha256()
    n = 0
    for row in cur.fetchall():
        vals = []
        for i in keep:
            v = row[i]
            vals.append(v.hex() if isinstance(v, (bytes, bytearray)) else v)
        h.update(json.dumps(vals, sort_keys=True, default=str).encode())
        n += 1
    return h.hexdigest()[:16], n


def fingerprint(scenario: str, seed: int) -> dict:
    with tempfile.TemporaryDirectory() as tmp:
        db_path = str(Path(tmp) / "golden.db")
        run_experiment(ExperimentConfig(scenario=scenario, duration=DURATION, n_nodes=NODES, seed=seed, db_path=db_path, out_dir=None))
        conn = sqlite3.connect(db_path)
        try:
            out = {}
            for t in TABLES:
                digest, rows = _table_digest(conn, t)
                out[t] = {"rows": rows, "sha": digest}
            return out
        finally:
            conn.close()


def all_fingerprints() -> dict:
    return {f"{s}:{seed}": fingerprint(s, seed) for s, seed in CASES}


if __name__ == "__main__":
    fps = all_fingerprints()
    if "--write" in sys.argv:
        GOLDEN_PATH.write_text(json.dumps(fps, indent=1, sort_keys=True) + "\n", encoding="utf-8")
        print(f"wrote {GOLDEN_PATH} ({len(fps)} cases)")
    else:
        print(json.dumps(fps, indent=1, sort_keys=True))
