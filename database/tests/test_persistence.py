"""DB-001..012. Tests must never touch aeios_dev.db or production paths."""

from __future__ import annotations

import os
import tempfile
import unittest
from pathlib import Path

import _paths  # noqa: F401

from database.connection import connect
from database.migrate import applied_migrations, list_user_tables, schema_version
from database.paths import DatabasePathError, DEFAULT_DEV_DB, is_forbidden_test_path
from gateway.contracts import Observation, SensorQuality
from gateway.storage import EventRecord, SamplingDecisionRecord, StorageError
from gateway.storage.sqlite import SqliteRepository

REQUIRED_TABLES = {
    "nodes",
    "sensor_readings",
    "sensor_states",
    "events",
    "event_features",
    "sampling_decisions",
    "radio_packets",
    "power_state",
    "system_logs",
    "schema_migrations",
}


def _temp_path() -> str:
    fd, path = tempfile.mkstemp(suffix=".sqlite")
    os.close(fd)
    os.unlink(path)
    return path


def _cleanup(path: str) -> None:
    for suffix in ("", "-wal", "-shm", "-journal"):
        Path(path + suffix).unlink(missing_ok=True)


def _repo(path: str) -> SqliteRepository:
    return SqliteRepository(path, purpose="test")


def _seed_node(repo: SqliteRepository, wire_id: int = 1) -> None:
    repo.upsert_node(wire_id, f"NODE-{wire_id:02d}", name="lab", site="test")


def _obs(wire_id: int = 1, sequence: int = 1, **kwargs) -> Observation:
    fields = dict(
        wire_id=wire_id,
        display_id=f"NODE-{wire_id:02d}",
        sequence=sequence,
        sample_id=sequence,
        measurement_time=1_000 + sequence,
        received_at=1_100 + sequence,
        pm1=4.0,
        pm25=8.0,
        pm10=12.0,
        co2=420.0,
        temperature=25.0,
        humidity=40.0,
        pressure=1013.25,
        bme688_gas_feature=50.0,
        mq135_raw=1800.0,
        mq135_index=12.0,
        quality=SensorQuality(pms=0.9, scd41=0.9, bme688=0.9, mq135=0.8),
        quality_flags=0,
        sampling_interval_s=10.0,
        firmware_version="sim-0.1.0",
        config_version="FIXED_RATE",
        confidence=0.9,
        provenance="SIMULATED",
    )
    fields.update(kwargs)
    return Observation(**fields)


def _event(wire_id: int | None = 1, status: str = "CANDIDATE") -> EventRecord:
    return EventRecord(
        event_id=None,
        wire_id=wire_id,
        started_at=2000,
        ended_at=None,
        event_type="PARTICULATE_EVENT",
        severity="MEDIUM",
        environment_event_confidence=0.7,
        sensor_fault_confidence=0.1,
        uncertain_confidence=0.2,
        event_confidence=0.7,
        status=status,
        evidence_json="{}",
        regional=False,
        provenance="SIMULATED",
        features=[("pm25_dev", 15.0, 0.4)],
    )


class DatabaseHostTests(unittest.TestCase):
    def setUp(self) -> None:
        self.path = _temp_path()
        self.assertFalse(is_forbidden_test_path(self.path))
        self.assertNotEqual(Path(self.path).name, DEFAULT_DEV_DB)

    def tearDown(self) -> None:
        _cleanup(self.path)

    def test_db_001_fresh_database_creation(self) -> None:
        self.assertFalse(Path(self.path).exists())
        repo = _repo(self.path)
        try:
            self.assertTrue(Path(self.path).exists())
            fk = repo._conn.execute("PRAGMA foreign_keys").fetchone()
            self.assertEqual(int(fk[0]), 1)
            tables = set(list_user_tables(repo._conn))
            self.assertTrue(REQUIRED_TABLES.issubset(tables))
            with self.assertRaises(DatabasePathError):
                SqliteRepository(DEFAULT_DEV_DB, purpose="test")
            with self.assertRaises(DatabasePathError):
                SqliteRepository("/var/lib/aeios/aeios.db", purpose="test")
        finally:
            repo.close()

    def test_db_002_migration_application(self) -> None:
        repo = _repo(self.path)
        try:
            rows = applied_migrations(repo._conn)
            self.assertEqual([r["version"] for r in rows], [1, 2, 3, 4])
            names = [r["name"] for r in rows]
            self.assertEqual(names[0], "001_initial_schema.sql")
            self.assertEqual(names[1], "002_indexes.sql")
            self.assertEqual(names[2], "003_constraints_or_quality.sql")
            self.assertEqual(names[3], "004_sampling_decisions.sql")
            self.assertEqual(schema_version(repo._conn), 4)
        finally:
            repo.close()

    def test_db_003_reopening_existing_database(self) -> None:
        repo = _repo(self.path)
        _seed_node(repo)
        repo.close()
        repo2 = _repo(self.path)
        try:
            nodes = repo2.fetch_nodes()
            self.assertEqual(len(nodes), 1)
            self.assertEqual(nodes[0]["display_id"], "NODE-01")
            self.assertEqual(schema_version(repo2._conn), 4)
            self.assertEqual(len(applied_migrations(repo2._conn)), 4)
        finally:
            repo2.close()

    def test_db_004_foreign_keys(self) -> None:
        repo = _repo(self.path)
        try:
            with self.assertRaises(StorageError):
                repo.insert_observation(_obs(wire_id=99))
            with self.assertRaises(StorageError):
                repo.upsert_node(2, "NODE-GW")
            _seed_node(repo, 1)
            repo.insert_observation(_obs(wire_id=1, sequence=1))
            self.assertEqual(repo.counts()["sensor_readings"], 1)
        finally:
            repo.close()

    def test_db_005_duplicate_prevention(self) -> None:
        repo = _repo(self.path)
        try:
            _seed_node(repo)
            obs = _obs(sequence=7)
            radio = {
                "received_at": 1100,
                "wire_id": 1,
                "sequence": 7,
                "message_type": 1,
                "protocol_version": 1,
                "rssi": -80.0,
                "snr": 5.0,
                "crc_valid": True,
                "mac_valid": True,
                "schema_valid": True,
                "duplicate": False,
                "raw_payload": b"\x01\x02",
                "drop_reason": None,
                "provenance": "SIMULATED",
            }
            repo.ingest_trusted(radio, obs, states_timestamp=1100)
            with self.assertRaises(StorageError):
                repo.ingest_trusted(dict(radio), _obs(sequence=7), states_timestamp=1101)
            self.assertEqual(repo.counts()["sensor_readings"], 1)
            self.assertEqual(repo.counts()["radio_packets"], 1)
            repo.insert_radio_packet(
                {
                    **radio,
                    "duplicate": True,
                    "schema_valid": False,
                    "drop_reason": "DUPLICATE",
                }
            )
            self.assertEqual(repo.counts()["radio_packets"], 2)
            self.assertEqual(repo.counts()["sensor_readings"], 1)
        finally:
            repo.close()

    def test_db_006_confidence_constraint(self) -> None:
        repo = _repo(self.path)
        try:
            _seed_node(repo)
            with self.assertRaises(StorageError):
                repo.insert_sampling_decision(
                    SamplingDecisionRecord(
                        wire_id=1,
                        timestamp=50,
                        previous_mode="NORMAL",
                        new_mode="WATCH",
                        trigger="THRESHOLD",
                        confidence=1.5,
                        expected_information_gain=0.2,
                        estimated_energy_cost=0.01,
                        selected_sensor="PMS5003",
                        provenance="SIMULATED",
                    )
                )
            with self.assertRaises(StorageError):
                repo.insert_observation(_obs(confidence=1.2))
            self.assertEqual(repo.counts()["sampling_decisions"], 0)
            self.assertEqual(repo.counts()["sensor_readings"], 0)
        finally:
            repo.close()

    def test_db_007_observation_insertion(self) -> None:
        repo = _repo(self.path)
        try:
            _seed_node(repo)
            repo.insert_observation(_obs())
            repo.insert_sensor_states(_obs(), 1101)
            rows = repo.fetch_readings()
            self.assertEqual(len(rows), 1)
            row = rows[0]
            self.assertEqual(row["wire_id"], 1)
            self.assertEqual(row["pm25"], 8.0)
            self.assertEqual(row["firmware_version"], "sim-0.1.0")
            self.assertAlmostEqual(row["confidence"], 0.9)
            states = repo.fetch_sensor_states()
            self.assertEqual({s["state"] for s in states}, {"VALID"})
            self.assertEqual({s["sensor"] for s in states}, {"pms5003", "scd41", "bme688", "mq135"})
        finally:
            repo.close()

    def test_db_008_event_insertion(self) -> None:
        repo = _repo(self.path)
        try:
            _seed_node(repo)
            eid = repo.insert_event(_event(status="CANDIDATE"))
            self.assertIsInstance(eid, int)
            repo.close_event(eid, 2500, "RESOLVED")
            events = repo.fetch_events()
            self.assertEqual(len(events), 1)
            self.assertEqual(events[0]["status"], "RESOLVED")
            self.assertEqual(events[0]["severity"], "MEDIUM")
            self.assertAlmostEqual(events[0]["event_confidence"], 0.7)
            feats = repo.events.fetch_features(eid)
            self.assertEqual(feats[0]["feature_name"], "pm25_dev")
            self.assertAlmostEqual(feats[0]["contribution"], 0.4)
        finally:
            repo.close()

    def test_db_009_sampling_decision_insertion(self) -> None:
        repo = _repo(self.path)
        try:
            _seed_node(repo)
            repo.insert_sampling_decision(
                SamplingDecisionRecord(
                    wire_id=1,
                    timestamp=50,
                    previous_mode="NORMAL",
                    new_mode="EVENT_CONFIRMATION",
                    trigger="CROSS_MODAL",
                    confidence=0.63,
                    expected_information_gain=0.4,
                    estimated_energy_cost=0.02,
                    selected_sensor="BME688",
                    provenance="SIMULATED",
                )
            )
            rows = repo.fetch_sampling_decisions()
            self.assertEqual(len(rows), 1)
            self.assertEqual(rows[0]["trigger"], "CROSS_MODAL")
            self.assertAlmostEqual(rows[0]["confidence"], 0.63)
        finally:
            repo.close()

    def test_db_010_transaction_rollback(self) -> None:
        repo = _repo(self.path)
        try:
            _seed_node(repo)
            with self.assertRaises(StorageError):
                with repo.transaction():
                    repo.insert_observation(_obs(sequence=1))
                    raise StorageError("boom")
            self.assertEqual(repo.counts()["sensor_readings"], 0)
            radio = {
                "received_at": 1,
                "wire_id": 1,
                "sequence": 1,
                "message_type": 1,
                "protocol_version": 1,
                "rssi": -70.0,
                "snr": 6.0,
                "crc_valid": True,
                "mac_valid": True,
                "schema_valid": True,
                "duplicate": False,
                "raw_payload": b"aa",
                "drop_reason": None,
                "provenance": "SIMULATED",
            }
            repo.fail_writes = True
            with self.assertRaises(StorageError):
                repo.ingest_trusted(radio, _obs(sequence=2), states_timestamp=1)
            repo.fail_writes = False
            self.assertEqual(repo.counts()["sensor_readings"], 0)
            self.assertEqual(repo.counts()["radio_packets"], 0)
            repo.ingest_trusted(radio, _obs(sequence=2), states_timestamp=1)
            self.assertEqual(repo.counts()["sensor_readings"], 1)
            self.assertEqual(repo.fetch_nodes()[0]["last_sequence"], 2)
            self.assertEqual(repo.fetch_nodes()[0]["status"], "ONLINE")
        finally:
            repo.close()

    def test_db_011_migration_upgrade(self) -> None:
        conn = connect(self.path, purpose="test", target_version=1)
        self.assertEqual(schema_version(conn), 1)
        self.assertNotIn("sampling_decisions", list_user_tables(conn))
        self.assertIn("nodes", list_user_tables(conn))
        conn.close()
        conn = connect(self.path, purpose="test")
        try:
            self.assertEqual(schema_version(conn), 4)
            self.assertIn("sampling_decisions", list_user_tables(conn))
            versions = [r["version"] for r in applied_migrations(conn)]
            self.assertEqual(versions, [1, 2, 3, 4])
        finally:
            conn.close()

    def test_db_012_repository_behavior(self) -> None:
        from database.inspect import inspect_report

        repo = _repo(self.path)
        try:
            _seed_node(repo, 1)
            repo.insert_power_state(
                {
                    "wire_id": 1,
                    "timestamp": 10,
                    "battery_voltage": 3.9,
                    "battery_soc": 0.8,
                    "battery_state": "NORMAL_POWER",
                    "solar_state": "CHARGING",
                    "energy_consumed_j": 1.2,
                    "operating_mode": "NORMAL",
                    "provenance": "SIMULATED",
                }
            )
            repo.log(10, "packet_ingest", "INFO", "BOOT", "ok", 1, "SIMULATED")
            self.assertEqual(len(repo.nodes.fetch_all()), 1)
            self.assertEqual(len(repo.power.fetch_all()), 1)
            self.assertEqual(len(repo.logs.fetch_all()), 1)
            self.assertEqual(repo.counts()["power_state"], 1)
            self.assertIs(repo.nodes._db, repo)
        finally:
            repo.close()
        report = inspect_report(self.path)
        self.assertEqual(report["schema_version"], 4)
        self.assertGreaterEqual(report["row_counts"]["nodes"], 1)
        self.assertIn("sampling_decisions", report["tables"])


if __name__ == "__main__":
    unittest.main()
