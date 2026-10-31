"""Shared observation / identity contracts.

Firmware drivers (real or virtual) must produce this normalized observation.
The gateway intelligence layer consumes it after AMP decode + merge of
DIAGNOSTICS extended fields. Swapping VirtualPMS5003 for a real driver
must not change these field names.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Optional


DATA_SIMULATED = "SIMULATED"
DATA_LIVE = "LIVE"


class Provenance(str, Enum):
    SIMULATED = DATA_SIMULATED
    LIVE = DATA_LIVE


class OperatingMode(str, Enum):
    NORMAL = "NORMAL"
    WATCH = "WATCH"
    EVENT_CONFIRMATION = "EVENT_CONFIRMATION"
    HIGH_RESOLUTION = "HIGH_RESOLUTION"
    LOW_BATTERY = "LOW_BATTERY"
    DEGRADED = "DEGRADED"
    SAFE = "SAFE"


class MqHeaterState(str, Enum):
    OFF = "OFF"
    WARMING = "WARMING"
    READY = "READY"
    MEASURING = "MEASURING"
    COOLING = "COOLING"
    FAULT = "FAULT"


# Sensors a node may carry. A sensor that is not fitted (the v0 field prototype has no SCD41) is "not fitted", not faulted.
SENSOR_PMS = "pms5003"
SENSOR_SCD41 = "scd41"
SENSOR_BME688 = "bme688"
SENSOR_MQ135 = "mq135"
ALL_SENSORS = frozenset({SENSOR_PMS, SENSOR_SCD41, SENSOR_BME688, SENSOR_MQ135})

# AMP §7.1.1 status_flags
FLAG_PM_FAULT = 1 << 0
FLAG_BME_FAULT = 1 << 1
FLAG_SCD_FAULT = 1 << 2
FLAG_BATT_LOW = 1 << 3
FLAG_SAMPLE_INVALID = 1 << 4


@dataclass
class SensorQuality:
    """Per-sensor trust. Not the same as event confidence (CF04 §10)."""

    # None means the sensor is not fitted on this node (see Observation.installed_sensors).
    pms: Optional[float] = 1.0
    scd41: Optional[float] = 1.0
    bme688: Optional[float] = 1.0
    mq135: Optional[float] = 1.0
    flags: list[str] = field(default_factory=list)

    def combined(self) -> float:
        vals = [self.pms, self.scd41, self.bme688, self.mq135]
        present = [v for v in vals if v is not None]
        return sum(present) / max(1, len(present))


@dataclass
class Observation:
    """Normalized observation (CF04 §4). MQ135/BME gas are not universal ppm."""

    wire_id: int
    display_id: str
    sequence: int
    sample_id: int
    measurement_time: int
    received_at: Optional[int] = None
    pm1: Optional[float] = None
    pm25: Optional[float] = None
    pm10: Optional[float] = None
    n0p3: Optional[float] = None
    co2: Optional[float] = None
    temperature: Optional[float] = None
    humidity: Optional[float] = None
    pressure: Optional[float] = None
    bme688_gas_feature: Optional[float] = None
    mq135_raw: Optional[float] = None
    mq135_index: Optional[float] = None
    mq_heater_state: MqHeaterState = MqHeaterState.OFF
    mq_warmup_s: float = 0.0
    mq_present: bool = True
    quality: SensorQuality = field(default_factory=SensorQuality)
    quality_flags: int = 0
    operating_mode: OperatingMode = OperatingMode.NORMAL
    sampling_interval_s: float = 10.0
    battery_pct: int = 100
    battery_voltage: Optional[float] = None
    battery_state: str = "NORMAL_POWER"
    firmware_version: Optional[str] = None
    config_version: Optional[str] = None
    confidence: Optional[float] = None
    provenance: str = DATA_SIMULATED
    installed_sensors: frozenset = ALL_SENSORS


@dataclass
class RadioRx:
    """One received PSDU plus link diagnostics (not trusted until ingest)."""

    psdu: bytes
    received_at: int
    rssi_dbm: float
    snr_db: float
    latency_s: float = 0.0
    collided: bool = False
    duplicated: bool = False
    provenance: str = DATA_SIMULATED
