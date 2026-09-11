"""SQLite repository implementation (ADR-014). Development DB: aeios_dev.db."""

from __future__ import annotations

import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from gateway.contracts import Observation
from gateway.storage import EventRecord, SamplingDecisionRecord, StorageError

_REPO_ROOT = Path(__file__).resolve().parents[2]
MIGRATIONS_DIR = _REPO_ROOT / "database" / "migrations"


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


class SqliteRepository:
    def __init__(self, path: str | Path, *, fail_writes: bool = False) -> None:
        self.path = Path(path)
        self.fail_writes = fail_writes
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(str(self.path))
        self._conn.row_factory = sqlite3.Row
        self._conn.execute("PRAGMA foreign_keys = ON")
        self._conn.execute("PRAGMA journal_mode = WAL")
        apply_migrations(self._conn, MIGRATIONS_DIR)

    def _exec(self, sql: str, args: tuple = ()) -> sqlite3.Cursor:
        if self.fail_writes and sql.strip().upper().startswith(("INSERT", "UPDATE", "DELETE")):
            raise StorageError("injected database_failure")
        try:
            cur = self._conn.execute(sql, args)
            self._conn.commit()
            return cur
        except sqlite3.Error as exc:
            self._conn.rollback()
            raise StorageError(str(exc)) from exc

    def upsert_node(
        self,
        wire_id: int,
        display_id: str,
        *,
        name: str = "",
        site: str = "",
        pos_x: float = 0.0,
        pos_y: float = 0.0,
        latitude: Optional[float] = None,
        longitude: Optional[float] = None,
        enabled: bool = True,
    ) -> None:
        now = utc_now_iso()
        self._exec(
            """
            INSERT INTO nodes (wire_id, display_id, name, site, pos_x, pos_y, latitude, longitude,
                               enabled, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(wire_id) DO UPDATE SET
                display_id=excluded.display_id,
                name=excluded.name,
                site=excluded.site,
                pos_x=excluded.pos_x,
                pos_y=excluded.pos_y,
                latitude=excluded.latitude,
                longitude=excluded.longitude,
                enabled=excluded.enabled,
                updated_at=excluded.updated_at
            """,
            (
                wire_id,
                display_id,
                name,
                site,
                pos_x,
                pos_y,
                latitude,
                longitude,
                1 if enabled else 0,
                now,
                now,
            ),
        )

    def insert_radio_packet(self, row: dict[str, Any]) -> None:
        self._exec(
            """
            INSERT INTO radio_packets (
                received_at, wire_id, sequence, message_type, protocol_version,
                rssi, snr, crc_valid, mac_valid, schema_valid, duplicate,
                raw_payload, drop_reason, provenance
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                row.get("received_at"),
                row.get("wire_id"),
                row.get("sequence"),
                row.get("message_type"),
                row.get("protocol_version"),
                row.get("rssi"),
                row.get("snr"),
                1 if row.get("crc_valid") else 0,
                1 if row.get("mac_valid") else 0,
                1 if row.get("schema_valid") else 0,
                1 if row.get("duplicate") else 0,
                row.get("raw_payload"),
                row.get("drop_reason"),
                row.get("provenance", "SIMULATED"),
            ),
        )

    def insert_observation(self, obs: Observation) -> None:
        self._exec(
            """
            INSERT INTO sensor_readings (
                wire_id, sequence, sample_id, measurement_time, received_at,
                pm1, pm25, pm10, co2, temperature, humidity, pressure,
                bme688_gas_feature, mq135_raw, mq135_index, quality_flags,
                sensor_quality, confidence, operating_mode, sampling_interval_s, provenance
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                obs.wire_id,
                obs.sequence,
                obs.sample_id,
                obs.measurement_time,
                obs.received_at,
                obs.pm1,
                obs.pm25,
                obs.pm10,
                obs.co2,
                obs.temperature,
                obs.humidity,
                obs.pressure,
                obs.bme688_gas_feature,
                obs.mq135_raw,
                obs.mq135_index,
                obs.quality_flags,
                obs.quality.combined(),
                None,
                obs.operating_mode.value if hasattr(obs.operating_mode, "value") else str(obs.operating_mode),
                obs.sampling_interval_s,
                obs.provenance,
            ),
        )

    def insert_sensor_states(self, obs: Observation, timestamp: int) -> None:
        rows = [
            ("pms5003", "OK" if obs.quality.pms >= 0.4 else "FAULT", obs.quality.pms, None, None),
            ("scd41", "OK" if obs.quality.scd41 >= 0.4 else "FAULT", obs.quality.scd41, None, None),
            (
                "bme688",
                "OK" if obs.quality.bme688 >= 0.4 else "FAULT",
                obs.quality.bme688,
                None,
                None,
            ),
            (
                "mq135",
                obs.mq_heater_state.value if hasattr(obs.mq_heater_state, "value") else str(obs.mq_heater_state),
                obs.quality.mq135,
                obs.mq_heater_state.value if hasattr(obs.mq_heater_state, "value") else str(obs.mq_heater_state),
                obs.mq_warmup_s,
            ),
        ]
        for sensor, state, quality, heater, warmup in rows:
            self._exec(
                """
                INSERT INTO sensor_states (
                    wire_id, timestamp, sensor, state, quality, heater_state, warmup_age_s, provenance
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (obs.wire_id, timestamp, sensor, state, quality, heater, warmup, obs.provenance),
            )

    def insert_sampling_decision(self, rec: SamplingDecisionRecord) -> None:
        self._exec(
            """
            INSERT INTO sampling_decisions (
                wire_id, timestamp, previous_mode, new_mode, trigger, confidence,
                expected_information_gain, estimated_energy_cost, selected_sensor, provenance
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                rec.wire_id,
                rec.timestamp,
                rec.previous_mode,
                rec.new_mode,
                rec.trigger,
                rec.confidence,
                rec.expected_information_gain,
                rec.estimated_energy_cost,
                rec.selected_sensor,
                rec.provenance,
            ),
        )

    def insert_power_state(self, row: dict[str, Any]) -> None:
        self._exec(
            """
            INSERT INTO power_state (
                wire_id, timestamp, battery_voltage, battery_soc, battery_state,
                solar_state, energy_consumed_j, operating_mode, provenance
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                row["wire_id"],
                row["timestamp"],
                row.get("battery_voltage"),
                row.get("battery_soc"),
                row.get("battery_state"),
                row.get("solar_state"),
                row.get("energy_consumed_j"),
                row.get("operating_mode"),
                row.get("provenance", "SIMULATED"),
            ),
        )

    def insert_event(self, rec: EventRecord) -> int:
        cur = self._exec(
            """
            INSERT INTO events (
                wire_id, started_at, ended_at, event_type, severity,
                environment_event_confidence, sensor_fault_confidence, uncertain_confidence,
                event_confidence, status, evidence_json, regional, provenance
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                rec.wire_id,
                rec.started_at,
                rec.ended_at,
                rec.event_type,
                rec.severity,
                rec.environment_event_confidence,
                rec.sensor_fault_confidence,
                rec.uncertain_confidence,
                rec.event_confidence,
                rec.status,
                rec.evidence_json,
                1 if rec.regional else 0,
                rec.provenance,
            ),
        )
        event_id = int(cur.lastrowid)
        for name, value, contrib in rec.features:
            self._exec(
                "INSERT INTO event_features (event_id, feature_name, feature_value, contribution) VALUES (?, ?, ?, ?)",
                (event_id, name, value, contrib),
            )
        return event_id

    def close_event(self, event_id: int, ended_at: int, status: str) -> None:
        self._exec(
            "UPDATE events SET ended_at = ?, status = ? WHERE event_id = ?",
            (ended_at, status, event_id),
        )

    def log(
        self,
        timestamp: int,
        component: str,
        level: str,
        code: str,
        message: str,
        wire_id: Optional[int] = None,
        provenance: str = "SIMULATED",
    ) -> None:
        self._exec(
            """
            INSERT INTO system_logs (timestamp, component, level, code, message, wire_id, provenance)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (timestamp, component, level, code, message, wire_id, provenance),
        )

    def _rows(self, sql: str) -> list[dict[str, Any]]:
        cur = self._conn.execute(sql)
        return [dict(r) for r in cur.fetchall()]

    def fetch_readings(self) -> list[dict[str, Any]]:
        return self._rows("SELECT * FROM sensor_readings ORDER BY measurement_time, id")

    def fetch_events(self) -> list[dict[str, Any]]:
        return self._rows("SELECT * FROM events ORDER BY started_at, event_id")

    def fetch_sampling_decisions(self) -> list[dict[str, Any]]:
        return self._rows("SELECT * FROM sampling_decisions ORDER BY timestamp, id")

    def fetch_radio_packets(self) -> list[dict[str, Any]]:
        return self._rows("SELECT * FROM radio_packets ORDER BY id")

    def fetch_nodes(self) -> list[dict[str, Any]]:
        return self._rows("SELECT * FROM nodes ORDER BY wire_id")

    def fetch_power(self) -> list[dict[str, Any]]:
        return self._rows("SELECT * FROM power_state ORDER BY timestamp, id")

    def fetch_logs(self) -> list[dict[str, Any]]:
        return self._rows("SELECT * FROM system_logs ORDER BY id")

    def fetch_sensor_states(self) -> list[dict[str, Any]]:
        return self._rows("SELECT * FROM sensor_states ORDER BY id")

    def counts(self) -> dict[str, int]:
        out = {}
        for table in (
            "nodes",
            "sensor_readings",
            "sensor_states",
            "events",
            "event_features",
            "sampling_decisions",
            "radio_packets",
            "power_state",
            "system_logs",
        ):
            out[table] = int(self._conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0])
        return out

    def close(self) -> None:
        self._conn.close()


def apply_migrations(conn: sqlite3.Connection, migrations_dir: Path) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS schema_migrations (
            version INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            applied_at TEXT NOT NULL
        )
        """
    )
    conn.commit()
    files = sorted(migrations_dir.glob("*.sql"))
    applied = {row[0] for row in conn.execute("SELECT version FROM schema_migrations")}
    for path in files:
        stem = path.stem
        version = int(stem.split("_", 1)[0])
        if version in applied:
            continue
        sql = path.read_text(encoding="utf-8")
        conn.executescript(sql)
        conn.execute(
            "INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)",
            (version, path.name, utc_now_iso()),
        )
        conn.commit()
