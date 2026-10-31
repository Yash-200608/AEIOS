"""v0 bridge tests: real packets from a receiver-style gateway.db through the intelligence pipeline (ADR-018).

Prototype data, not field evidence. Temp database names deliberately avoid aeios.db / aeios_dev.db.
"""

from __future__ import annotations

import sqlite3
import tempfile
import unittest
from pathlib import Path

import _paths  # noqa: F401

from gateway.ingestion.csv_v0 import V0Node
from gateway.services.v0_bridge import V0Bridge
from gateway.storage.sqlite import SqliteRepository
from v0_fixtures import REAL_ROWS, add_rows, make_source_db

REGISTRY = {
    "N1": V0Node(wire_id=101, display_id="NODE-01", site="sgt"),
    "N2": V0Node(wire_id=102, display_id="NODE-02"),
}
SIMULATED = [
    dict(REAL_ROWS[0], id=1, source="simulated"),
    dict(REAL_ROWS[1], id=2, source="simulated"),
]


class BridgeCase(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        self.addCleanup(self._tmp.cleanup)
        self.dir = Path(self._tmp.name)
        self.src = self.dir / "receiver_test.db"
        self.dest = self.dir / "bridge_test.db"
        self.cursor = self.dir / "bridge_test.cursor.json"
        self.repos: list[SqliteRepository] = []

    def bridge(self) -> V0Bridge:
        repo = SqliteRepository(self.dest)
        self.repos.append(repo)
        return V0Bridge(repo, REGISTRY, self.cursor)


class TestReplayOfRealPackets(BridgeCase):
    def test_ingests_only_live_rows_and_stores_per_sensor_states(self) -> None:
        make_source_db(self.src, SIMULATED + REAL_ROWS)
        b = self.bridge()
        stats = b.run_once(str(self.src))
        self.assertEqual((stats["read"], stats["ingested"], stats["skipped"]), (16, 14, 2))
        repo = b.repo
        self.assertEqual(len(repo.fetch_readings()), 14)
        states = repo.fetch_sensor_states()
        self.assertEqual(len(states), 14 * 3)  # pms5003, bme688, mq135 — never scd41
        self.assertEqual({s["sensor"] for s in states}, {"pms5003", "bme688", "mq135"})
        self.assertTrue(all(r["provenance"] == "LIVE" for r in repo.fetch_readings()))
        self.assertEqual(sorted(n["wire_id"] for n in repo.fetch_nodes()), [101, 102])

    def test_radio_rows_are_recorded_as_v0_without_mac(self) -> None:
        make_source_db(self.src, REAL_ROWS)
        b = self.bridge()
        b.run_once(str(self.src))
        rows = b.repo.fetch_radio_packets()
        self.assertEqual(len(rows), 14)
        self.assertTrue(all(r["protocol_version"] == 0 and not r["mac_valid"] for r in rows))

    def test_rerun_and_replay_add_nothing(self) -> None:
        make_source_db(self.src, REAL_ROWS)
        self.bridge().run_once(str(self.src))
        b2 = self.bridge()
        again = b2.run_once(str(self.src), replay=True)
        self.assertEqual(again["ingested"], 0)
        self.assertEqual(again["already_stored"], 14)
        self.assertEqual(len(b2.repo.fetch_readings()), 14)

    def test_cursor_resumes_with_new_rows_only(self) -> None:
        make_source_db(self.src, REAL_ROWS[:5])
        first = self.bridge().run_once(str(self.src))
        self.assertEqual(first["ingested"], 5)
        conn = sqlite3.connect(self.src)
        add_rows(conn, REAL_ROWS[5:])
        conn.close()
        b2 = self.bridge()
        second = b2.run_once(str(self.src))
        self.assertEqual((second["read"], second["ingested"]), (9, 9))
        self.assertEqual(len(b2.repo.fetch_readings()), 14)

    def test_source_database_is_never_modified(self) -> None:
        make_source_db(self.src, REAL_ROWS)
        before = self.src.read_bytes()
        self.bridge().run_once(str(self.src))
        self.assertEqual(self.src.read_bytes(), before)

    def test_no_events_from_the_calm_real_packets(self) -> None:
        make_source_db(self.src, REAL_ROWS)
        b = self.bridge()
        b.run_once(str(self.src))
        self.assertEqual(b.repo.fetch_events(), [])


class TestQuarantine(BridgeCase):
    def test_unknown_node_is_quarantined_and_logged(self) -> None:
        bad = dict(REAL_ROWS[2], id=50, node="N9")
        make_source_db(self.src, [bad] + REAL_ROWS[:2])
        b = self.bridge()
        stats = b.run_once(str(self.src))
        self.assertEqual((stats["ingested"], stats["quarantined"]), (2, 1))
        logs = b.repo.fetch_logs()
        self.assertTrue(any(l["code"] == "UNKNOWN_NODE" for l in logs))
        self.assertEqual(len(b.repo.fetch_readings()), 2)


class TestDetectionOnLiveData(BridgeCase):
    def test_sustained_pm_rise_opens_a_live_particulate_event(self) -> None:
        # Calm hour of real-looking values, then a sustained PM surge at 5-minute spacing.
        rows = []
        t0 = 1_800_000_000
        import time as _t

        def stamp(i: int) -> str:
            return _t.strftime("%Y-%m-%d %H:%M:%S", _t.gmtime(t0 + i * 300))

        for i in range(1, 41):
            surge = i > 30
            rows.append(dict(
                id=i, node="N1", boot=i + 5, node_time="", rx_utc=stamp(i), source="lora",
                temp=31.0, rh=45, pressure=991, gas_kohm=30.0,
                pm1=(150 if surge else 40), pm2_5=(320 if surge else 65), pm10=(380 if surge else 75),
                mq_mv=820, rssi=-40, snr=9.5,
            ))
        make_source_db(self.src, rows)
        b = self.bridge()
        b.run_once(str(self.src))
        events = b.repo.fetch_events()
        self.assertTrue(events, "a 5x sustained PM2.5 surge should open an event")
        self.assertTrue(all(e["provenance"] == "LIVE" for e in events))


if __name__ == "__main__":
    unittest.main()
