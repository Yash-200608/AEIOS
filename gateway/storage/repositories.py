"""Typed repository objects. Domain/intelligence code must not contain SQL."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, Optional

from gateway.contracts import FLAG_BME_FAULT, FLAG_PM_FAULT, FLAG_SAMPLE_INVALID, FLAG_SCD_FAULT, MqHeaterState, Observation
from gateway.storage import EventRecord, SamplingDecisionRecord

if TYPE_CHECKING:
    from gateway.storage.sqlite import Database


def map_sensor_lifecycle_state(
    *,
    quality: float,
    fault: bool,
    warming: bool,
    stale: bool,
    calibrating: bool = False,
) -> str:
    """Map quality/heater into the persisted sensor_states vocabulary."""
    if fault:
        return "SENSOR_FAULT"
    if warming:
        return "WARMING"
    if calibrating:
        return "CALIBRATING"
    if stale:
        return "STALE"
    if quality < 0.4:
        return "DEGRADED"
    return "VALID"


class NodeRepository:
    def __init__(self, db: Database) -> None:
        self._db = db

    def upsert(
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
        hardware_revision: Optional[str] = None,
        firmware_version: Optional[str] = None,
        config_version: Optional[str] = None,
        enabled: bool = True,
        status: str = "UNKNOWN",
    ) -> None:
        from database.migrate import utc_now_iso

        now = utc_now_iso()
        self._db._exec(
            """
            INSERT INTO nodes (
                wire_id, display_id, name, site, pos_x, pos_y, latitude, longitude,
                hardware_revision, firmware_version, config_version, enabled, status,
                created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(wire_id) DO UPDATE SET
                display_id=excluded.display_id,
                name=excluded.name,
                site=excluded.site,
                pos_x=excluded.pos_x,
                pos_y=excluded.pos_y,
                latitude=excluded.latitude,
                longitude=excluded.longitude,
                hardware_revision=COALESCE(excluded.hardware_revision, nodes.hardware_revision),
                firmware_version=COALESCE(excluded.firmware_version, nodes.firmware_version),
                config_version=COALESCE(excluded.config_version, nodes.config_version),
                enabled=excluded.enabled,
                status=excluded.status,
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
                hardware_revision,
                firmware_version,
                config_version,
                1 if enabled else 0,
                status,
                now,
                now,
            ),
        )

    def exists(self, wire_id: int) -> bool:
        row = self._db._conn.execute("SELECT 1 FROM nodes WHERE wire_id = ?", (wire_id,)).fetchone()
        return row is not None

    def mark_seen(
        self,
        wire_id: int,
        *,
        last_seen: int,
        last_sequence: int,
        firmware_version: Optional[str] = None,
        config_version: Optional[str] = None,
        status: str = "ONLINE",
    ) -> None:
        from database.migrate import utc_now_iso

        self._db._exec(
            """
            UPDATE nodes SET
                last_seen = ?,
                last_sequence = ?,
                firmware_version = COALESCE(?, firmware_version),
                config_version = COALESCE(?, config_version),
                status = ?,
                updated_at = ?
            WHERE wire_id = ?
            """,
            (last_seen, last_sequence, firmware_version, config_version, status, utc_now_iso(), wire_id),
        )

    def fetch_all(self) -> list[dict[str, Any]]:
        return self._db._rows("SELECT * FROM nodes ORDER BY wire_id")


class ObservationRepository:
    def __init__(self, db: Database) -> None:
        self._db = db

    def insert(self, obs: Observation) -> None:
        conf = obs.confidence if obs.confidence is not None else obs.quality.combined()
        mode = obs.operating_mode.value if hasattr(obs.operating_mode, "value") else str(obs.operating_mode)
        self._db._exec(
            """
            INSERT INTO sensor_readings (
                wire_id, sequence, sample_id, measurement_time, received_at,
                pm1, pm25, pm10, co2, temperature, humidity, pressure,
                bme688_gas_feature, mq135_raw, mq135_index, quality_flags,
                sensor_quality, confidence, operating_mode, sampling_interval_s,
                firmware_version, config_version, provenance
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                conf,
                mode,
                obs.sampling_interval_s,
                obs.firmware_version,
                obs.config_version,
                obs.provenance,
            ),
        )

    def insert_states(self, obs: Observation, timestamp: int) -> None:
        stale = bool(obs.quality_flags & FLAG_SAMPLE_INVALID)
        q = obs.quality
        heater_value = obs.mq_heater_state.value if hasattr(obs.mq_heater_state, "value") else str(obs.mq_heater_state)
        # (sensor, quality, fault, warming, heater_state, warmup_age_s). quality None = sensor not fitted: no row.
        specs = [
            ("pms5003", q.pms, bool(obs.quality_flags & FLAG_PM_FAULT) or (q.pms is not None and q.pms <= 0.0), False, None, None),
            ("scd41", q.scd41, bool(obs.quality_flags & FLAG_SCD_FAULT) or (q.scd41 is not None and q.scd41 <= 0.0), False, None, None),
            ("bme688", q.bme688, bool(obs.quality_flags & FLAG_BME_FAULT) or (q.bme688 is not None and q.bme688 <= 0.0), False, None, None),
            (
                "mq135",
                q.mq135,
                obs.mq_heater_state == MqHeaterState.FAULT or not obs.mq_present,
                obs.mq_heater_state == MqHeaterState.WARMING,
                heater_value,
                obs.mq_warmup_s,
            ),
        ]
        for sensor, quality, fault, warming, heater, warmup in specs:
            if quality is None:
                continue
            state = map_sensor_lifecycle_state(quality=quality, fault=fault, warming=warming, stale=stale)
            self._db._exec(
                """
                INSERT INTO sensor_states (
                    wire_id, timestamp, sensor, state, quality, heater_state, warmup_age_s, provenance
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (obs.wire_id, timestamp, sensor, state, quality, heater, warmup, obs.provenance),
            )

    def exists(self, wire_id: int, sequence: int) -> bool:
        row = self._db._conn.execute(
            "SELECT 1 FROM sensor_readings WHERE wire_id = ? AND sequence = ?", (wire_id, sequence)
        ).fetchone()
        return row is not None

    def fetch_all(self) -> list[dict[str, Any]]:
        return self._db._rows("SELECT * FROM sensor_readings ORDER BY measurement_time, id")

    def fetch_states(self) -> list[dict[str, Any]]:
        return self._db._rows("SELECT * FROM sensor_states ORDER BY id")


class EventRepository:
    def __init__(self, db: Database) -> None:
        self._db = db

    def insert(self, rec: EventRecord) -> int:
        with self._db.transaction():
            cur = self._db._exec(
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
                self._db._exec(
                    """
                    INSERT INTO event_features (event_id, feature_name, feature_value, contribution)
                    VALUES (?, ?, ?, ?)
                    """,
                    (event_id, name, value, contrib),
                )
        return event_id

    def close(self, event_id: int, ended_at: int, status: str) -> None:
        self._db._exec(
            "UPDATE events SET ended_at = ?, status = ? WHERE event_id = ?",
            (ended_at, status, event_id),
        )

    def fetch_all(self) -> list[dict[str, Any]]:
        return self._db._rows("SELECT * FROM events ORDER BY started_at, event_id")

    def fetch_features(self, event_id: Optional[int] = None) -> list[dict[str, Any]]:
        if event_id is None:
            return self._db._rows("SELECT * FROM event_features ORDER BY id")
        cur = self._db._conn.execute(
            "SELECT * FROM event_features WHERE event_id = ? ORDER BY id", (event_id,)
        )
        return [dict(r) for r in cur.fetchall()]


class SamplingDecisionRepository:
    def __init__(self, db: Database) -> None:
        self._db = db

    def insert(self, rec: SamplingDecisionRecord) -> None:
        self._db._exec(
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

    def fetch_all(self) -> list[dict[str, Any]]:
        return self._db._rows("SELECT * FROM sampling_decisions ORDER BY timestamp, id")


class RadioPacketRepository:
    def __init__(self, db: Database) -> None:
        self._db = db

    def insert(self, row: dict[str, Any]) -> None:
        self._db._exec(
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

    def fetch_all(self) -> list[dict[str, Any]]:
        return self._db._rows("SELECT * FROM radio_packets ORDER BY id")


class PowerRepository:
    def __init__(self, db: Database) -> None:
        self._db = db

    def insert(self, row: dict[str, Any]) -> None:
        self._db._exec(
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

    def fetch_all(self) -> list[dict[str, Any]]:
        return self._db._rows("SELECT * FROM power_state ORDER BY timestamp, id")


class SystemLogRepository:
    def __init__(self, db: Database) -> None:
        self._db = db

    def insert(
        self,
        timestamp: int,
        component: str,
        level: str,
        code: str,
        message: str,
        wire_id: Optional[int] = None,
        provenance: str = "SIMULATED",
    ) -> None:
        self._db._exec(
            """
            INSERT INTO system_logs (timestamp, component, level, code, message, wire_id, provenance)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (timestamp, component, level, code, message, wire_id, provenance),
        )

    def fetch_all(self) -> list[dict[str, Any]]:
        return self._db._rows("SELECT * FROM system_logs ORDER BY id")
