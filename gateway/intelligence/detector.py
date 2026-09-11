"""Deterministic event detector + lifecycle (CF04 §16–20). No ML."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

from gateway.contracts import Observation
from gateway.intelligence.confidence import ConfidenceBreakdown, ConfidenceEngine
from gateway.intelligence.features import FeatureVector


PM_SCALE = 8.0
CO2_SCALE = 50.0
BME_SCALE = 8.0  # kΩ-like feature; decrease => more gas
MQ_SCALE = 5.0
Z_THRESH = 2.2


@dataclass
class NodeEventState:
    status: str = "CLEAR"  # CLEAR | CANDIDATE | CONFIRMED | RESOLVING
    event_type: str = "NORMAL"
    event_id: Optional[int] = None
    started_at: Optional[int] = None
    high_count: int = 0
    last_type: str = "NORMAL"


class EventDetector:
    def __init__(self, persist_needed: int = 2) -> None:
        self.persist_needed = persist_needed
        self.conf = ConfidenceEngine()
        self._state: dict[int, NodeEventState] = {}
        self._first_seen: dict[tuple[int, str], int] = {}

    def state(self, wire_id: int) -> NodeEventState:
        return self._state.setdefault(wire_id, NodeEventState())

    def classify(
        self,
        obs: Observation,
        features: FeatureVector,
        baseline: dict[str, float],
        quality_ok: bool,
        mq_primed: bool = False,
    ) -> tuple[str, bool, bool, bool, bool, bool]:
        def high(val: Optional[float], key: str, scale: float, invert: bool = False) -> bool:
            if val is None or not quality_ok:
                return False
            dev = (baseline[key] - val) if invert else (val - baseline[key])
            return dev > Z_THRESH * scale

        pm_high = high(features.pm25, "pm25", PM_SCALE)
        co2_high = high(features.co2, "co2", CO2_SCALE)
        # BME gas-response: lower resistance/feature => more reducing gas
        bme_high = high(features.bme_gas, "bme688_gas_feature", BME_SCALE, invert=True)
        mq_q = obs.quality.mq135 >= 0.7 and obs.mq_warmup_s >= 12.0 and mq_primed
        mq_high = high(features.mq_index, "mq135_index", MQ_SCALE) and mq_q

        n = sum([pm_high, co2_high, bme_high, mq_high])
        if n >= 3 or (pm_high and (bme_high or mq_high) and (co2_high or bme_high)):
            etype = "MULTIMODAL_ENVIRONMENTAL_EVENT"
        elif pm_high and not mq_high and not bme_high:
            etype = "PARTICULATE_EVENT"
        elif co2_high and not pm_high:
            etype = "CO2_EVENT"
        elif mq_high and not pm_high and not co2_high and not bme_high:
            etype = "SENSOR_ANOMALY"
        elif (bme_high or mq_high) and not pm_high:
            etype = "GAS_RESPONSE_EVENT"
        elif pm_high:
            etype = "PARTICULATE_EVENT"
        else:
            etype = "NORMAL"
        return etype, pm_high, co2_high, bme_high, mq_high, n >= 1

    def step(
        self,
        obs: Observation,
        features: FeatureVector,
        baseline: dict[str, float],
        mq_primed: bool = False,
    ) -> tuple[NodeEventState, ConfidenceBreakdown, Optional[str]]:
        """Returns state, confidence, and action: OPEN | CLOSE | None."""
        st = self.state(obs.wire_id)
        etype, pm_h, co2_h, bme_h, mq_h, any_h = self.classify(
            obs, features, baseline, quality_ok=obs.quality.combined() > 0.2, mq_primed=mq_primed
        )
        if any_h and etype != "NORMAL":
            st.high_count += 1
        else:
            st.high_count = 0

        persist = st.high_count >= self.persist_needed
        cb = self.conf.combine(
            obs.quality,
            features,
            pm_high=pm_h,
            co2_high=co2_h,
            bme_high=bme_h,
            mq_high=mq_h,
            persist=persist,
        )

        action = None
        if st.status == "CLEAR":
            if persist and etype != "NORMAL":
                st.status = "CONFIRMED"
                st.event_type = etype
                st.started_at = obs.measurement_time
                st.last_type = etype
                action = "OPEN"
            elif any_h and etype != "NORMAL":
                st.status = "CANDIDATE"
                st.event_type = etype
        elif st.status == "CANDIDATE":
            if persist and etype != "NORMAL":
                st.status = "CONFIRMED"
                st.event_type = etype
                st.started_at = obs.measurement_time
                action = "OPEN"
            elif not any_h:
                st.status = "CLEAR"
                st.event_type = "NORMAL"
                st.high_count = 0
        elif st.status == "CONFIRMED":
            if etype != "NORMAL":
                st.event_type = etype
            if not any_h:
                st.status = "RESOLVING"
        elif st.status == "RESOLVING":
            if persist and etype != "NORMAL":
                st.status = "CONFIRMED"
                st.event_type = etype
            elif not any_h:
                st.status = "CLEAR"
                action = "CLOSE"
                st.event_type = "NORMAL"
                st.high_count = 0
        return st, cb, action
