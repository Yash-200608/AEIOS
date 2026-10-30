"""SQLite repository facade (ADR-014). Development default: aeios_dev.db."""

from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator, Optional

from database.connection import connect
from database.migrate import table_counts
from gateway.contracts import Observation
from gateway.storage import EventRecord, SamplingDecisionRecord, StorageError
from gateway.storage.repositories import (
    EventRepository,
    NodeRepository,
    ObservationRepository,
    PowerRepository,
    RadioPacketRepository,
    SamplingDecisionRepository,
    SystemLogRepository,
)


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


class Database:
    """Owns a bootstrapped SQLite connection. Domain code uses the repository attributes."""

    def __init__(
        self,
        path: str | Path,
        *,
        purpose: str = "runtime",
        fail_writes: bool = False,
        migrations_dir: Path | None = None,
        target_version: int | None = None,
    ) -> None:
        self.path = Path(path)
        self.fail_writes = fail_writes
        self._in_tx = 0
        self._conn = connect(
            self.path,
            purpose=purpose,
            migrations_dir=migrations_dir,
            target_version=target_version,
        )
        self.nodes = NodeRepository(self)
        self.observations = ObservationRepository(self)
        self.events = EventRepository(self)
        self.sampling = SamplingDecisionRepository(self)
        self.radio = RadioPacketRepository(self)
        self.power = PowerRepository(self)
        self.logs = SystemLogRepository(self)

    @contextmanager
    def transaction(self) -> Iterator[None]:
        self._in_tx += 1
        try:
            yield
            if self._in_tx == 1:
                self._conn.commit()
        except Exception:
            self._conn.rollback()
            raise
        finally:
            self._in_tx = max(0, self._in_tx - 1)

    def _exec(self, sql: str, args: tuple = ()) -> sqlite3.Cursor:
        if self.fail_writes and sql.strip().upper().startswith(("INSERT", "UPDATE", "DELETE")):
            raise StorageError("injected database_failure")
        try:
            cur = self._conn.execute(sql, args)
            if self._in_tx == 0:
                self._conn.commit()
            return cur
        except sqlite3.Error as exc:
            self._conn.rollback()
            self._in_tx = 0
            raise StorageError(str(exc)) from exc

    def _rows(self, sql: str) -> list[dict[str, Any]]:
        cur = self._conn.execute(sql)
        return [dict(r) for r in cur.fetchall()]

    def counts(self) -> dict[str, int]:
        out = table_counts(self._conn)
        return {k: v for k, v in out.items() if k != "schema_migrations"}

    def close(self) -> None:
        self._conn.close()


class SqliteRepository(Database):
    """Backward-compatible facade used by ingest and the simulator."""

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
        hardware_revision: Optional[str] = None,
        firmware_version: Optional[str] = None,
        config_version: Optional[str] = None,
        enabled: bool = True,
        status: str = "UNKNOWN",
    ) -> None:
        self.nodes.upsert(
            wire_id,
            display_id,
            name=name,
            site=site,
            pos_x=pos_x,
            pos_y=pos_y,
            latitude=latitude,
            longitude=longitude,
            hardware_revision=hardware_revision,
            firmware_version=firmware_version,
            config_version=config_version,
            enabled=enabled,
            status=status,
        )

    def insert_radio_packet(self, row: dict[str, Any]) -> None:
        self.radio.insert(row)

    def insert_observation(self, obs: Observation) -> None:
        self.observations.insert(obs)

    def insert_sensor_states(self, obs: Observation, timestamp: int) -> None:
        self.observations.insert_states(obs, timestamp)

    def insert_sampling_decision(self, rec: SamplingDecisionRecord) -> None:
        self.sampling.insert(rec)

    def insert_power_state(self, row: dict[str, Any]) -> None:
        self.power.insert(row)

    def insert_event(self, rec: EventRecord) -> int:
        return self.events.insert(rec)

    def close_event(self, event_id: int, ended_at: int, status: str) -> None:
        self.events.close(event_id, ended_at, status)

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
        self.logs.insert(timestamp, component, level, code, message, wire_id, provenance)

    def ingest_trusted(
        self,
        radio_row: dict[str, Any],
        obs: Observation,
        *,
        states_timestamp: int,
    ) -> None:
        """One transaction: radio metadata + observation + sensor states + node last-seen."""
        with self.transaction():
            self.radio.insert(radio_row)
            self.observations.insert(obs)
            self.observations.insert_states(obs, states_timestamp)
            seen = obs.received_at if obs.received_at is not None else states_timestamp
            self.nodes.mark_seen(
                obs.wire_id,
                last_seen=seen,
                last_sequence=obs.sequence,
                firmware_version=obs.firmware_version,
                config_version=obs.config_version,
                status="ONLINE",
            )

    def fetch_readings(self) -> list[dict[str, Any]]:
        return self.observations.fetch_all()

    def fetch_events(self) -> list[dict[str, Any]]:
        return self.events.fetch_all()

    def fetch_sampling_decisions(self) -> list[dict[str, Any]]:
        return self.sampling.fetch_all()

    def fetch_radio_packets(self) -> list[dict[str, Any]]:
        return self.radio.fetch_all()

    def fetch_nodes(self) -> list[dict[str, Any]]:
        return self.nodes.fetch_all()

    def fetch_power(self) -> list[dict[str, Any]]:
        return self.power.fetch_all()

    def fetch_logs(self) -> list[dict[str, Any]]:
        return self.logs.fetch_all()

    def fetch_sensor_states(self) -> list[dict[str, Any]]:
        return self.observations.fetch_states()
