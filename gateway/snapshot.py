"""Dashboard-facing snapshot. UI must show SIMULATED vs LIVE."""

from __future__ import annotations

from typing import Any

from gateway.contracts import DATA_SIMULATED
from gateway.storage.sqlite import SqliteRepository


def build_snapshot(repo: SqliteRepository, *, extra: dict[str, Any] | None = None) -> dict[str, Any]:
    nodes = repo.fetch_nodes()
    readings = repo.fetch_readings()
    events = repo.fetch_events()
    power = repo.fetch_power()
    radio = repo.fetch_radio_packets()
    decisions = repo.fetch_sampling_decisions()
    latest_by_node: dict[int, dict] = {}
    for row in readings:
        latest_by_node[row["wire_id"]] = row
    latest_power: dict[int, dict] = {}
    for row in power:
        latest_power[row["wire_id"]] = row
    latest_mode: dict[int, str] = {}
    for row in decisions:
        latest_mode[row["wire_id"]] = row["new_mode"]

    crc_fail = sum(1 for r in radio if not r["crc_valid"])
    dup = sum(1 for r in radio if r["duplicate"])
    accepted = sum(1 for r in radio if r["schema_valid"] and not r["duplicate"])

    node_status = []
    for n in nodes:
        wid = n["wire_id"]
        rd = latest_by_node.get(wid, {})
        pw = latest_power.get(wid, {})
        node_status.append(
            {
                "wire_id": wid,
                "display_id": n["display_id"],
                "enabled": bool(n["enabled"]),
                "position": {"x": n["pos_x"], "y": n["pos_y"], "latitude": n["latitude"], "longitude": n["longitude"]},
                "sensor_values": {
                    "pm1": rd.get("pm1"),
                    "pm25": rd.get("pm25"),
                    "pm10": rd.get("pm10"),
                    "co2": rd.get("co2"),
                    "temperature": rd.get("temperature"),
                    "humidity": rd.get("humidity"),
                    "pressure": rd.get("pressure"),
                    "bme688_gas_feature": rd.get("bme688_gas_feature"),
                    "mq135_index": rd.get("mq135_index"),
                    "mq135_raw": rd.get("mq135_raw"),
                },
                "sensor_quality": rd.get("sensor_quality"),
                "sampling_mode": latest_mode.get(wid, rd.get("operating_mode")),
                "power_state": {
                    "voltage": pw.get("battery_voltage"),
                    "soc": pw.get("battery_soc"),
                    "battery_state": pw.get("battery_state"),
                    "solar_state": pw.get("solar_state"),
                },
                "last_measurement_time": rd.get("measurement_time"),
                "last_received_at": rd.get("received_at"),
            }
        )

    payload = {
        "data_plane": DATA_SIMULATED,
        "disclaimer": "SIMULATION RESULT — not field-validated accuracy, range, or energy savings.",
        "node_status": node_status,
        "events": [
            {
                "event_id": e["event_id"],
                "wire_id": e["wire_id"],
                "event_type": e["event_type"],
                "status": e["status"],
                "severity": e["severity"],
                "confidence": {
                    "event": e["event_confidence"],
                    "environment_event": e["environment_event_confidence"],
                    "sensor_fault": e["sensor_fault_confidence"],
                    "uncertain": e["uncertain_confidence"],
                },
                "started_at": e["started_at"],
                "ended_at": e["ended_at"],
                "regional": bool(e["regional"]),
                "evidence_json": e["evidence_json"],
            }
            for e in events
        ],
        "radio_health": {
            "packets": len(radio),
            "accepted": accepted,
            "crc_fail": crc_fail,
            "duplicates": dup,
        },
        "sampling_decisions_count": len(decisions),
        "simulation_or_live": DATA_SIMULATED,
    }
    if extra:
        payload["simulation"] = extra
    return payload
