"""v0 field prototype adapter: Pi `packets` rows -> `Observation` + radio metadata (ADR-018).

The live nodes send ASCII CSV (not AMP). The Pi receiver validates each line and stores it in gateway.db `packets`
(columns: id, rx_utc, source, node, boot, node_time, temp, rh, pressure, gas_kohm, pm1, pm2_5, pm10, mq_mv,
lat, lon, fix, sats, rssi, snr). This module turns one such row into the repository's normalised `Observation` so
the deterministic intelligence (QualityEngine, BaselineBank, FeatureExtractor, EventDetector) runs on real data.

Mapping decisions, all from the 14 real packets of 2026-10-27:
- Node ids come only from a registry (never parsed from the CSV name). Unknown nodes are quarantined.
- `boot` is a per-power-up packet counter (it restarts at 1), not a boot count. It becomes `sample_id` and also
  tells us how long the MQ135 has been powered, because the node has no heater state to report.
- `node_time` is NOT trusted: the node clocks are unsynchronised (hours off the gateway). The gateway receive time
  (`rx_utc`) is the measurement time; `node_time` is kept in the raw payload.
- `sequence` is the gateway row id, which is unique and monotone per gateway (v0 has no node sequence number).
- BME680 gas resistance (kOhm) goes to `bme688_gas_feature`; MQ135 millivolts go to `mq135_raw`, and
  `mq135_index = mV / divisor` is a unitless relative response. Neither is ppm.
- GPS (`lat`, `lon`, `fix`, `sats`) is metadata only; the registry position is authoritative (ADR-010).
- v0 has no SCD41: it is simply not in `installed_sensors`, so it is "not fitted", not "faulted".
- v0 has no MAC: `mac_valid` is recorded as 0 (not applicable). The radio CRC already passed in the receiver.
"""

from __future__ import annotations

import calendar
import hashlib
import json
import time
from dataclasses import dataclass, field
from typing import Any, Mapping, Optional

from gateway.contracts import (
    DATA_LIVE,
    FLAG_BME_FAULT,
    FLAG_PM_FAULT,
    ALL_SENSORS,
    SENSOR_BME688,
    SENSOR_MQ135,
    SENSOR_PMS,
    MqHeaterState,
    Observation,
    OperatingMode,
    SensorQuality,
)

V0_PROTOCOL_VERSION = 0
V0_MESSAGE_TYPE_SENSOR = 1
V0_FIRMWARE = "v0-csv"
V0_SENSORS = frozenset({SENSOR_PMS, SENSOR_BME688, SENSOR_MQ135})  # PMS5003, BME680 (as bme688 slot), MQ135

# Plausibility limits. Values outside these are treated as faults, not as extreme weather.
PM_MAX = 1000.0
TEMP_RANGE = (-40.0, 85.0)
RH_RANGE = (0.0, 100.0)
PRESSURE_RANGE = (300.0, 1100.0)
MQ_RAIL_MV = 3300.0


@dataclass(frozen=True)
class V0Node:
    wire_id: int
    display_id: str
    site: str = ""
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    hardware_revision: str = "v0-pms5003-bme680-mq135-gps"
    sampling_interval_s: float = 300.0
    mq_index_divisor_mv: float = 10.0
    mq_ready_after_s: float = 180.0
    installed_sensors: frozenset = V0_SENSORS


def load_registry(path: str) -> dict[str, V0Node]:
    """Registry JSON: {"N1": {"wire_id": 101, "display_id": "NODE-01", "site": "sgt", ...}, ...}"""
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    reg: dict[str, V0Node] = {}
    for name, cfg in data.items():
        if name.startswith("_"):
            continue
        cfg = dict(cfg)
        if "installed_sensors" in cfg:
            cfg["installed_sensors"] = frozenset(cfg["installed_sensors"])
        node = V0Node(**cfg)
        if not (1 <= node.wire_id <= 65534) or node.wire_id == 2:
            raise ValueError(f"registry node {name}: wire_id {node.wire_id} is not a valid AMP wire id")
        reg[name] = node
    wires = [n.wire_id for n in reg.values()]
    if len(set(wires)) != len(wires):
        raise ValueError("registry wire_ids must be unique")
    return reg


def config_version(node: V0Node) -> str:
    blob = json.dumps(
        {"mq_div": node.mq_index_divisor_mv, "mq_ready": node.mq_ready_after_s, "interval": node.sampling_interval_s},
        sort_keys=True,
    )
    return "v0cfg-" + hashlib.sha256(blob.encode()).hexdigest()[:8]


@dataclass
class AdaptResult:
    """Exactly one of `observation` / `skipped` / `quarantine` is set."""

    radio_row: dict[str, Any]
    observation: Optional[Observation] = None
    skipped: Optional[str] = None  # not an error: e.g. non-LIVE source
    quarantine: Optional[str] = None  # a real packet we refuse to interpret
    notes: list[str] = field(default_factory=list)


def _epoch(rx_utc: str) -> int:
    return calendar.timegm(time.strptime(rx_utc.replace("T", " ")[:19], "%Y-%m-%d %H:%M:%S"))


def _num(v: Any) -> Optional[float]:
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return f if f == f and abs(f) != float("inf") else None


def _canonical(row: Mapping[str, Any]) -> bytes:
    return json.dumps({k: row[k] for k in sorted(row)}, separators=(",", ":"), default=str).encode("utf-8")


def adapt_row(row: Mapping[str, Any], registry: Mapping[str, V0Node]) -> AdaptResult:
    """Convert one gateway.db `packets` row. Never raises on bad data; bad rows are skipped or quarantined."""
    base_radio = {
        "message_type": V0_MESSAGE_TYPE_SENSOR,
        "protocol_version": V0_PROTOCOL_VERSION,
        "rssi": _num(row.get("rssi")),
        "snr": _num(row.get("snr")),
        "crc_valid": True,  # the receiver drops packets that fail the radio CRC before they are stored
        "mac_valid": False,  # v0 has no MAC (not applicable)
        "duplicate": False,
        "raw_payload": _canonical(row),
        "provenance": DATA_LIVE,
    }
    try:
        received_at = _epoch(str(row["rx_utc"]))
    except (KeyError, ValueError):
        radio = dict(base_radio, received_at=int(time.time()), wire_id=None, sequence=None, schema_valid=False, drop_reason="BAD_TIME")
        return AdaptResult(radio_row=radio, quarantine="BAD_TIME")

    if row.get("source") != "lora":
        radio = dict(base_radio, received_at=received_at, wire_id=None, sequence=None, schema_valid=False, drop_reason="NOT_LIVE")
        return AdaptResult(radio_row=radio, skipped="NOT_LIVE")

    node = registry.get(str(row.get("node")))
    if node is None:
        radio = dict(base_radio, received_at=received_at, wire_id=None, sequence=None, schema_valid=False, drop_reason="UNKNOWN_NODE")
        return AdaptResult(radio_row=radio, quarantine="UNKNOWN_NODE")

    try:
        sequence = int(row["id"])
        boot = int(row.get("boot") if row.get("boot") is not None else 0)
    except (KeyError, TypeError, ValueError):
        radio = dict(base_radio, received_at=received_at, wire_id=node.wire_id, sequence=None, schema_valid=False, drop_reason="BAD_FIELDS")
        return AdaptResult(radio_row=radio, quarantine="BAD_FIELDS")

    notes: list[str] = []
    qflags = 0
    qnotes: list[str] = []

    def pm(name: str) -> Optional[float]:
        v = _num(row.get(name))
        return None if v is None or v < 0 else v  # firmware sends -1 for "no PMS frame"

    pm1, pm25, pm10 = pm("pm1"), pm("pm2_5"), pm("pm10")
    if pm25 is None or pm10 is None:
        qflags |= FLAG_PM_FAULT
        notes.append("PM_MISSING")
    elif pm25 > PM_MAX or pm10 > PM_MAX:
        qflags |= FLAG_PM_FAULT
        notes.append("PM_RANGE")
    elif pm1 is not None and (pm1 > pm25 * 1.05 + 1 or pm25 > pm10 * 1.05 + 1):
        qnotes.append("PM_ORDER_INCONSISTENT")  # PM1 <= PM2.5 <= PM10 must hold; flagged, not penalised

    temp, rh, pressure = _num(row.get("temp")), _num(row.get("rh")), _num(row.get("pressure"))
    bme_bad = False
    if temp is not None and not (TEMP_RANGE[0] <= temp <= TEMP_RANGE[1]):
        temp, bme_bad = None, True
    if rh is not None and not (RH_RANGE[0] <= rh <= RH_RANGE[1]):
        rh, bme_bad = None, True
    if pressure is not None and not (PRESSURE_RANGE[0] <= pressure <= PRESSURE_RANGE[1]):
        pressure, bme_bad = None, True
    gas = _num(row.get("gas_kohm"))
    if gas is not None and gas <= 0:
        gas, bme_bad = None, True
    if temp is None or rh is None or pressure is None or gas is None:
        bme_bad = True
    if bme_bad:
        qflags |= FLAG_BME_FAULT
        notes.append("BME_INVALID")

    mq_mv = _num(row.get("mq_mv"))
    mq_ok = mq_mv is not None and 0 < mq_mv < MQ_RAIL_MV
    warmup_s = max(0, boot - 1) * node.sampling_interval_s  # time since power-up, from the packet counter
    if not mq_ok:
        heater = MqHeaterState.FAULT
        notes.append("MQ_INVALID")
    elif warmup_s < node.mq_ready_after_s:
        heater = MqHeaterState.WARMING
    else:
        heater = MqHeaterState.MEASURING

    obs = Observation(
        wire_id=node.wire_id,
        display_id=node.display_id,
        sequence=sequence,
        sample_id=boot & 0xFFFF,
        measurement_time=received_at,
        received_at=received_at,
        pm1=pm1,
        pm25=pm25,
        pm10=pm10,
        co2=None,
        temperature=temp,
        humidity=rh,
        pressure=pressure,
        bme688_gas_feature=gas,
        mq135_raw=mq_mv if mq_ok else None,
        mq135_index=(mq_mv / node.mq_index_divisor_mv) if mq_ok else None,
        mq_heater_state=heater,
        mq_warmup_s=float(warmup_s),
        mq_present=True,
        quality=SensorQuality(flags=qnotes),
        quality_flags=qflags,
        operating_mode=OperatingMode.NORMAL,
        sampling_interval_s=node.sampling_interval_s,
        firmware_version=V0_FIRMWARE,
        config_version=config_version(node),
        provenance=DATA_LIVE,
        installed_sensors=node.installed_sensors,
    )
    radio = dict(base_radio, received_at=received_at, wire_id=node.wire_id, sequence=sequence, schema_valid=True, drop_reason=None)
    return AdaptResult(radio_row=radio, observation=obs, notes=notes)
