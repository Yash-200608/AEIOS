"""Feature extraction (CF04 §5–6). Windows are configurable; not claimed optimal."""

from __future__ import annotations

from collections import defaultdict, deque
from dataclasses import dataclass, field
from typing import Deque, Optional

from gateway.contracts import Observation


@dataclass
class FeatureVector:
    pm25: Optional[float] = None
    pm25_delta: Optional[float] = None
    pm25_slope: Optional[float] = None
    pm25_dev: Optional[float] = None
    co2: Optional[float] = None
    co2_delta: Optional[float] = None
    co2_dev: Optional[float] = None
    bme_gas: Optional[float] = None
    bme_gas_delta: Optional[float] = None
    bme_gas_dev: Optional[float] = None
    mq_index: Optional[float] = None
    mq_delta: Optional[float] = None
    mq_dev: Optional[float] = None
    humidity: Optional[float] = None
    temperature: Optional[float] = None
    pressure: Optional[float] = None


class FeatureExtractor:
    def __init__(self, short_n: int = 3, medium_n: int = 8) -> None:
        self.short_n = short_n
        self.medium_n = medium_n
        self._hist: dict[int, Deque[Observation]] = defaultdict(lambda: deque(maxlen=medium_n))

    def extract(self, obs: Observation, baseline: dict[str, float]) -> FeatureVector:
        h = self._hist[obs.wire_id]
        prev = h[-1] if h else None
        h.append(obs)

        def delta(cur: Optional[float], old: Optional[float]) -> Optional[float]:
            if cur is None or old is None:
                return None
            return cur - old

        def slope(key: str) -> Optional[float]:
            vals = [getattr(x, key) for x in h if getattr(x, key) is not None]
            if len(vals) < 2:
                return None
            return (vals[-1] - vals[0]) / max(1, len(vals) - 1)

        def dev(cur: Optional[float], bkey: str) -> Optional[float]:
            if cur is None or bkey not in baseline:
                return None
            return cur - baseline[bkey]

        return FeatureVector(
            pm25=obs.pm25,
            pm25_delta=delta(obs.pm25, prev.pm25 if prev else None),
            pm25_slope=slope("pm25"),
            pm25_dev=dev(obs.pm25, "pm25"),
            co2=obs.co2,
            co2_delta=delta(obs.co2, prev.co2 if prev else None),
            co2_dev=dev(obs.co2, "co2"),
            bme_gas=obs.bme688_gas_feature,
            bme_gas_delta=delta(obs.bme688_gas_feature, prev.bme688_gas_feature if prev else None),
            bme_gas_dev=dev(obs.bme688_gas_feature, "bme688_gas_feature"),
            mq_index=obs.mq135_index,
            mq_delta=delta(obs.mq135_index, prev.mq135_index if prev else None),
            mq_dev=dev(obs.mq135_index, "mq135_index"),
            humidity=obs.humidity,
            temperature=obs.temperature,
            pressure=obs.pressure,
        )
