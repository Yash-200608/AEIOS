"""Deterministic intelligence pipeline for one trusted observation (ADR-017).

quality -> baseline snapshot -> features -> detector -> baseline update -> storage -> event open/close -> regional.

Extracted unchanged from Gateway._on_sensor so that any transport (AMP frames today, the v0 CSV bridge, a future
driver) feeds the same logic. Transport-specific work (frame parsing, ACKs, replay window) stays in the caller.
"""

from __future__ import annotations

import json
from typing import TYPE_CHECKING, Optional

from gateway.contracts import Observation
from gateway.intelligence.baseline import BaselineBank
from gateway.intelligence.detector import EventDetector
from gateway.intelligence.features import FeatureExtractor
from gateway.intelligence.quality import QualityEngine
from gateway.storage import EventRecord, StorageError

if TYPE_CHECKING:
    from gateway.storage.sqlite import SqliteRepository


class IntelligencePipeline:
    def __init__(
        self,
        repo: "SqliteRepository",
        *,
        provenance: str,
        display_by_wire: Optional[dict[int, str]] = None,
        positions: Optional[dict[int, tuple[float, float]]] = None,
        stats: Optional[dict[str, int]] = None,
    ) -> None:
        self.repo = repo
        self.provenance = provenance
        self.display_by_wire = display_by_wire if display_by_wire is not None else {}
        self.positions = positions if positions is not None else {}
        # Shared with the owner so database failures are counted in one place.
        self.stats = stats if stats is not None else {"db_fail": 0}
        self.quality = QualityEngine()
        self.features = FeatureExtractor()
        self.baselines = BaselineBank()
        self.detector = EventDetector()
        self.open_events: dict[int, int] = {}
        self.first_confirm: dict[tuple[int, str], int] = {}
        self._regional_done: set[str] = set()

    def restart(self) -> None:
        """In-memory restart; stored data retained (SIM-014). first_confirm and regional dedupe survive, as before."""
        self.quality = QualityEngine()
        self.features = FeatureExtractor()
        self.baselines = BaselineBank()
        self.detector = EventDetector()
        self.open_events.clear()

    def process(self, obs: Observation, radio_row: dict, received_at: int) -> bool:
        """Run the pipeline and store the observation. Returns False if the database rejected it."""
        obs.quality = self.quality.assess(obs)
        freeze = self.detector.state(obs.wire_id).status in ("CONFIRMED", "RESOLVING")
        base = self.baselines.snapshot(obs.wire_id)
        feat = self.features.extract(obs, base)
        st, cb, action = self.detector.step(
            obs, feat, base, mq_primed=self.baselines.mq_primed(obs.wire_id)
        )
        self.baselines.update(obs, freeze=freeze)

        try:
            self.repo.ingest_trusted(radio_row, obs, states_timestamp=received_at)
        except StorageError:
            self.stats["db_fail"] += 1
            return False

        evidence = {
            "supporting_sensors": [
                n
                for n, ok in (
                    ("PMS5003", feat.pm25_dev is not None and (feat.pm25_dev or 0) > 10),
                    ("SCD41", feat.co2_dev is not None and (feat.co2_dev or 0) > 80),
                    ("BME688", feat.bme_gas_dev is not None and (feat.bme_gas_dev or 0) < -10),
                    ("MQ135", feat.mq_dev is not None and (feat.mq_dev or 0) > 8),
                )
                if ok
            ],
            "contradicting_evidence": [
                n
                for n, stable in (
                    ("PMS5003_stable", feat.pm25_dev is not None and abs(feat.pm25_dev or 0) < 5),
                    ("SCD41_stable", feat.co2_dev is not None and abs(feat.co2_dev or 0) < 40),
                )
                if stable
            ],
            "sensor_quality": {
                "pms": obs.quality.pms,
                "scd41": obs.quality.scd41,
                "bme688": obs.quality.bme688,
                "mq135": obs.quality.mq135,
                "flags": obs.quality.flags,
            },
            "features": {
                "pm25_dev": feat.pm25_dev,
                "co2_dev": feat.co2_dev,
                "bme_gas_dev": feat.bme_gas_dev,
                "mq_dev": feat.mq_dev,
            },
            "confidence": {
                "sensor_quality": cb.sensor_quality,
                "environment_event_confidence": cb.environment_event_confidence,
                "sensor_fault_confidence": cb.sensor_fault_confidence,
                "uncertain_confidence": cb.uncertain_confidence,
                "event_confidence": cb.event_confidence,
            },
            "decision_reason": cb.reason,
            "engine": "deterministic_rules",
            "data_plane": self.provenance,
        }

        if action == "OPEN":
            rec = EventRecord(
                event_id=None,
                wire_id=obs.wire_id,
                started_at=obs.measurement_time,
                ended_at=None,
                event_type=st.event_type,
                severity=_severity(cb.event_confidence, st.event_type),
                environment_event_confidence=cb.environment_event_confidence,
                sensor_fault_confidence=cb.sensor_fault_confidence,
                uncertain_confidence=cb.uncertain_confidence,
                event_confidence=cb.event_confidence,
                status="CONFIRMED",
                evidence_json=json.dumps(evidence),
                regional=False,
                provenance=self.provenance,
                features=[
                    ("pm25_dev", feat.pm25_dev, 0.4 if (feat.pm25_dev or 0) > 10 else 0.05),
                    ("co2_dev", feat.co2_dev, 0.25 if (feat.co2_dev or 0) > 80 else 0.05),
                    ("bme_gas_dev", feat.bme_gas_dev, 0.2),
                    ("mq_dev", feat.mq_dev, 0.15),
                ],
            )
            try:
                eid = self.repo.insert_event(rec)
                self.open_events[obs.wire_id] = eid
                st.event_id = eid
                self.first_confirm[(obs.wire_id, st.event_type)] = obs.measurement_time
                self._maybe_regional(st.event_type, obs.measurement_time)
            except StorageError:
                self.stats["db_fail"] += 1
        elif action == "CLOSE" and obs.wire_id in self.open_events:
            try:
                self.repo.close_event(self.open_events[obs.wire_id], obs.measurement_time, "RESOLVED")
            except StorageError:
                self.stats["db_fail"] += 1
            self.open_events.pop(obs.wire_id, None)
        return True

    def _maybe_regional(self, event_type: str, t: int) -> None:
        if event_type in ("SENSOR_ANOMALY", "NORMAL"):
            return
        hits = [(wid, ts) for (wid, et), ts in self.first_confirm.items() if et == event_type and abs(ts - t) <= 90]
        if len(hits) < 2:
            return
        key = event_type
        if key in self._regional_done:
            return
        hits.sort(key=lambda x: x[1])
        evidence = {
            "regional": True,
            "node_order": [self.display_by_wire.get(w, str(w)) for w, _ in hits],
            "first_times": {self.display_by_wire.get(w, str(w)): ts for w, ts in hits},
            "source_hypothesis": _source_hypothesis(hits, self.positions),
            "engine": "deterministic_spatial_order",
            "data_plane": self.provenance,
            "note": "GPS-less reconstruction from configured positions and detection order",
        }
        rec = EventRecord(
            event_id=None,
            wire_id=None,
            started_at=hits[0][1],
            ended_at=None,
            event_type="REGIONAL_EVENT",
            severity="MEDIUM",
            environment_event_confidence=0.7,
            sensor_fault_confidence=0.1,
            uncertain_confidence=0.2,
            event_confidence=0.7,
            status="CONFIRMED",
            evidence_json=json.dumps(evidence),
            regional=True,
            provenance=self.provenance,
            features=[("node_count", float(len(hits)), 1.0)],
        )
        try:
            self.repo.insert_event(rec)
            self._regional_done.add(key)
        except StorageError:
            self.stats["db_fail"] += 1


def _severity(conf: float, etype: str) -> str:
    if etype == "SENSOR_ANOMALY":
        return "LOW"
    if conf >= 0.8:
        return "HIGH"
    if conf >= 0.5:
        return "MEDIUM"
    return "LOW"


def _source_hypothesis(hits: list[tuple[int, int]], positions: dict[int, tuple[float, float]]) -> dict:
    if len(hits) < 2:
        return {}
    a, ta = hits[0]
    b, tb = hits[1]
    pa = positions.get(a)
    pb = positions.get(b)
    if not pa or not pb or tb == ta:
        return {"earliest_node": a}
    dt = max(1, tb - ta)
    dx = pb[0] - pa[0]
    dy = pb[1] - pa[1]
    return {
        "earliest_wire_id": a,
        "direction_xy": [dx, dy],
        "estimated_speed_m_s": ((dx * dx + dy * dy) ** 0.5) / dt,
        "label": "SIMULATION estimate — not a field source location",
    }
