"""Storage repository protocol (ADR-014). Domain code must not use SQL dialects."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Optional, Protocol

from gateway.contracts import Observation


class StorageError(Exception):
    pass


@dataclass
class SamplingDecisionRecord:
    wire_id: int
    timestamp: int
    previous_mode: str
    new_mode: str
    trigger: str
    confidence: float
    expected_information_gain: float
    estimated_energy_cost: float
    selected_sensor: Optional[str]
    provenance: str


@dataclass
class EventRecord:
    event_id: Optional[int]
    wire_id: Optional[int]
    started_at: int
    ended_at: Optional[int]
    event_type: str
    severity: str
    environment_event_confidence: float
    sensor_fault_confidence: float
    uncertain_confidence: float
    event_confidence: float
    status: str
    evidence_json: str
    regional: bool
    provenance: str
    features: list[tuple[str, Optional[float], Optional[float]]]


class Repository(Protocol):
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
    ) -> None: ...

    def insert_radio_packet(self, row: dict[str, Any]) -> None: ...

    def insert_observation(self, obs: Observation) -> None: ...

    def insert_sensor_states(self, obs: Observation, timestamp: int) -> None: ...

    def insert_sampling_decision(self, rec: SamplingDecisionRecord) -> None: ...

    def insert_power_state(self, row: dict[str, Any]) -> None: ...

    def insert_event(self, rec: EventRecord) -> int: ...

    def ingest_trusted(
        self,
        radio_row: dict[str, Any],
        obs: Observation,
        *,
        states_timestamp: int,
    ) -> None: ...

    def close_event(self, event_id: int, ended_at: int, status: str) -> None: ...

    def log(
        self,
        timestamp: int,
        component: str,
        level: str,
        code: str,
        message: str,
        wire_id: Optional[int] = None,
        provenance: str = "SIMULATED",
    ) -> None: ...

    def fetch_readings(self) -> list[dict[str, Any]]: ...

    def fetch_events(self) -> list[dict[str, Any]]: ...

    def fetch_sampling_decisions(self) -> list[dict[str, Any]]: ...

    def fetch_radio_packets(self) -> list[dict[str, Any]]: ...

    def fetch_nodes(self) -> list[dict[str, Any]]: ...

    def fetch_power(self) -> list[dict[str, Any]]: ...

    def fetch_logs(self) -> list[dict[str, Any]]: ...

    def fetch_sensor_states(self) -> list[dict[str, Any]]: ...

    def counts(self) -> dict[str, int]: ...

    def close(self) -> None: ...
