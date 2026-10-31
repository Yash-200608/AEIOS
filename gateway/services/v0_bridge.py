"""v0 bridge: feed the live Pi packets through the deterministic intelligence pipeline (ADR-018).

Reads the receiver's gateway.db `packets` table READ-ONLY (the radio loop is never touched), adapts each real
(`lora`) row with gateway.ingestion.csv_v0, and runs it through IntelligencePipeline into the repository database
(aeios.db): sensor_readings, sensor_states, events, event_features, radio_packets, system_logs.

Safe to stop, restart and re-run: a cursor file remembers the last source row id, and a row already stored is
skipped (sensor_readings is unique on wire_id + sequence), so replays never duplicate data.

    python -m gateway.services.v0_bridge --source-db ~/gateway/gateway.db --registry deployment/pi/v0_nodes.json \\
        --db ~/aeios/var/aeios.db            # service loop
    python -m gateway.services.v0_bridge ... --once        # process what is there, print a summary, exit
    python -m gateway.services.v0_bridge ... --replay      # ignore the cursor (already stored rows are skipped)
"""

from __future__ import annotations

import argparse
import json
import os
import signal
import sqlite3
import sys
import time
from pathlib import Path
from typing import Mapping, Optional

from gateway.contracts import DATA_LIVE
from gateway.ingestion.csv_v0 import V0Node, adapt_row, load_registry
from gateway.intelligence.pipeline import IntelligencePipeline
from gateway.storage import StorageError
from gateway.storage.sqlite import SqliteRepository

BATCH = 500


class V0Bridge:
    def __init__(self, repo: SqliteRepository, registry: Mapping[str, V0Node], cursor_path: Optional[Path] = None) -> None:
        self.repo = repo
        self.registry = dict(registry)
        self.cursor_path = cursor_path
        self.stats = {"read": 0, "ingested": 0, "already_stored": 0, "skipped": 0, "quarantined": 0, "db_fail": 0}
        display = {n.wire_id: n.display_id for n in self.registry.values()}
        self.pipeline = IntelligencePipeline(repo, provenance=DATA_LIVE, display_by_wire=display, stats=self.stats)
        for name, node in self.registry.items():
            repo.upsert_node(
                node.wire_id,
                node.display_id,
                name=name,
                site=node.site,
                latitude=node.latitude,
                longitude=node.longitude,
                hardware_revision=node.hardware_revision,
                firmware_version="v0-csv",
                enabled=True,
                status="UNKNOWN",
            )

    # -- cursor ------------------------------------------------------------------------------------------------
    def load_cursor(self) -> int:
        if self.cursor_path and self.cursor_path.exists():
            try:
                return int(json.loads(self.cursor_path.read_text())["last_id"])
            except (ValueError, KeyError, OSError):
                return 0
        return 0

    def save_cursor(self, last_id: int) -> None:
        if not self.cursor_path:
            return
        tmp = self.cursor_path.with_suffix(self.cursor_path.suffix + ".tmp")
        tmp.write_text(json.dumps({"last_id": last_id}))
        os.replace(tmp, self.cursor_path)

    # -- processing --------------------------------------------------------------------------------------------
    def process_row(self, row: Mapping) -> None:
        self.stats["read"] += 1
        res = adapt_row(row, self.registry)
        if res.skipped:
            self.stats["skipped"] += 1
            return
        if res.quarantine or res.observation is None:
            self.stats["quarantined"] += 1
            try:
                self.repo.insert_radio_packet(res.radio_row)
                self.repo.log(
                    res.radio_row["received_at"], "v0_bridge", "WARNING", res.quarantine or "QUARANTINE",
                    f"packet row {row.get('id')} quarantined: {res.quarantine}", None, DATA_LIVE,
                )
            except StorageError:
                self.stats["db_fail"] += 1
            return
        obs = res.observation
        if self.repo.reading_exists(obs.wire_id, obs.sequence):
            self.stats["already_stored"] += 1
            return
        if self.pipeline.process(obs, res.radio_row, obs.received_at or obs.measurement_time):
            self.stats["ingested"] += 1

    def run_once(self, source_db: str, *, replay: bool = False, limit: Optional[int] = None) -> dict:
        cursor = 0 if replay else self.load_cursor()
        src = sqlite3.connect(f"file:{source_db}?mode=ro", uri=True, timeout=10)
        src.row_factory = sqlite3.Row
        try:
            while True:
                rows = src.execute("SELECT * FROM packets WHERE id > ? ORDER BY id LIMIT ?", (cursor, BATCH)).fetchall()
                if not rows:
                    break
                for r in rows:
                    self.process_row(dict(r))
                    cursor = int(r["id"])
                    if limit is not None and self.stats["read"] >= limit:
                        break
                self.save_cursor(cursor)
                if limit is not None and self.stats["read"] >= limit:
                    break
        finally:
            src.close()
        return dict(self.stats, cursor=cursor)


def log(msg: str) -> None:
    print(f"{time.strftime('%H:%M:%S')}  {msg}", flush=True)


def main(argv: Optional[list[str]] = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--source-db", required=True, help="receiver database (gateway.db), opened read-only")
    ap.add_argument("--registry", required=True, help="node registry JSON (see deployment/pi/v0_nodes.example.json)")
    ap.add_argument("--db", required=True, help="repository database to write (aeios.db)")
    ap.add_argument("--cursor", default=None, help="cursor file (default: <db>.v0cursor.json)")
    ap.add_argument("--poll", type=float, default=2.0, help="seconds between checks in service mode")
    ap.add_argument("--once", action="store_true")
    ap.add_argument("--replay", action="store_true", help="start from row 0 (stored rows are skipped)")
    a = ap.parse_args(argv)

    if not os.path.exists(a.source_db):
        print(f"{a.source_db} does not exist", file=sys.stderr)
        return 2
    registry = load_registry(a.registry)
    db_path = Path(a.db)
    db_path.parent.mkdir(parents=True, exist_ok=True)
    repo = SqliteRepository(db_path)
    cursor_path = Path(a.cursor) if a.cursor else db_path.with_name(db_path.name + ".v0cursor.json")
    bridge = V0Bridge(repo, registry, cursor_path)

    if a.once:
        print(json.dumps(bridge.run_once(a.source_db, replay=a.replay), indent=1))
        return 0

    stop: list[int] = []
    signal.signal(signal.SIGTERM, lambda *_: stop.append(1))
    log(f"v0 bridge started: {a.source_db} -> {a.db}, cursor {bridge.load_cursor()}, nodes {sorted(registry)}")
    first = True
    while not stop:
        try:
            before = dict(bridge.stats)
            bridge.run_once(a.source_db, replay=a.replay and first)
            first = False
            if bridge.stats != before:
                log(f"ingested {bridge.stats['ingested']} (stored already {bridge.stats['already_stored']}, "
                    f"quarantined {bridge.stats['quarantined']}, db_fail {bridge.stats['db_fail']})")
        except Exception as exc:  # a bad cycle must never stop the service
            log(f"cycle failed: {type(exc).__name__}: {exc}")
        for _ in range(max(1, int(a.poll * 10))):
            if stop:
                break
            time.sleep(0.1)
    return 0


if __name__ == "__main__":
    sys.exit(main())
