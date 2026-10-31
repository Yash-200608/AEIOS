"""v0 CSV adapter tests, using the real packets of 2026-10-27 (ADR-018). Prototype data, not field evidence."""

from __future__ import annotations

import calendar
import json
import tempfile
import time
import unittest
from pathlib import Path

import _paths  # noqa: F401

from gateway.contracts import FLAG_BME_FAULT, FLAG_PM_FAULT, MqHeaterState
from gateway.ingestion.csv_v0 import V0Node, V0_SENSORS, adapt_row, load_registry
from gateway.intelligence import QualityEngine
from v0_fixtures import REAL_ROWS

REGISTRY = {
    "N1": V0Node(wire_id=101, display_id="NODE-01", site="sgt"),
    "N2": V0Node(wire_id=102, display_id="NODE-02"),
}


def row(i: int) -> dict:
    return dict(next(r for r in REAL_ROWS if r["id"] == i))


def epoch(s: str) -> int:
    return calendar.timegm(time.strptime(s, "%Y-%m-%d %H:%M:%S"))


class TestRealPackets(unittest.TestCase):
    def test_every_real_packet_adapts_to_a_live_observation(self) -> None:
        for r in REAL_ROWS:
            with self.subTest(row=r["id"]):
                res = adapt_row(r, REGISTRY)
                self.assertIsNotNone(res.observation)
                self.assertEqual(res.notes, [])
                self.assertEqual(res.observation.provenance, "LIVE")

    def test_field_mapping_of_a_real_row(self) -> None:
        o = adapt_row(row(9), REGISTRY).observation
        self.assertEqual((o.wire_id, o.display_id), (101, "NODE-01"))
        self.assertEqual(o.sequence, 9)  # gateway row id
        self.assertEqual(o.sample_id, 8)  # the node's per-power-up packet counter ("boot")
        self.assertEqual((o.pm1, o.pm25, o.pm10), (52.0, 83.0, 88.0))
        self.assertEqual((o.temperature, o.humidity, o.pressure), (30.8, 54.0, 992.0))
        self.assertEqual(o.bme688_gas_feature, 25.6)  # BME680 kOhm, a gas feature (not ppm)
        self.assertEqual(o.mq135_raw, 830.0)  # millivolts
        self.assertAlmostEqual(o.mq135_index, 83.0)  # mV / 10, unitless
        self.assertIsNone(o.co2)
        self.assertEqual(o.installed_sensors, V0_SENSORS)
        self.assertNotIn("scd41", o.installed_sensors)

    def test_gateway_receive_time_is_the_measurement_time_and_node_time_is_not_trusted(self) -> None:
        r = row(9)  # node_time says 11:53, the gateway received it at 06:24 UTC
        o = adapt_row(r, REGISTRY).observation
        self.assertEqual(o.measurement_time, epoch("2026-10-27 06:24:06"))
        self.assertEqual(o.received_at, o.measurement_time)

    def test_radio_metadata_is_honest_about_v0(self) -> None:
        res = adapt_row(row(9), REGISTRY)
        rr = res.radio_row
        self.assertEqual(rr["protocol_version"], 0)
        self.assertTrue(rr["crc_valid"])
        self.assertFalse(rr["mac_valid"])  # v0 has no MAC
        self.assertTrue(rr["schema_valid"])
        self.assertEqual(rr["provenance"], "LIVE")
        self.assertEqual((rr["wire_id"], rr["sequence"], rr["rssi"]), (101, 9, -37.0))
        raw = json.loads(rr["raw_payload"])
        self.assertEqual(raw["node_time"], "2026-10-27T11:53:30")  # kept for the record

    def test_mq135_warms_up_by_packet_counter(self) -> None:
        first = adapt_row(row(11), REGISTRY).observation  # boot=1 -> just powered up
        later = adapt_row(row(9), REGISTRY).observation  # boot=8
        self.assertEqual(first.mq_heater_state, MqHeaterState.WARMING)
        self.assertEqual(first.mq_warmup_s, 0.0)
        self.assertEqual(later.mq_heater_state, MqHeaterState.MEASURING)
        self.assertEqual(later.mq_warmup_s, 7 * 300.0)

    def test_quality_engine_treats_v0_as_healthy_and_does_not_invent_an_scd41(self) -> None:
        q = QualityEngine().assess(adapt_row(row(9), REGISTRY).observation)
        self.assertIsNone(q.scd41)
        self.assertEqual((q.pms, q.bme688, q.mq135), (1.0, 1.0, 1.0))
        self.assertEqual(q.combined(), 1.0)
        self.assertEqual(q.flags, [])

    def test_a_node_in_its_first_minutes_has_reduced_mq135_quality(self) -> None:
        q = QualityEngine().assess(adapt_row(row(11), REGISTRY).observation)
        self.assertEqual(q.mq135, 0.35)
        self.assertIn("HEATER_RECENTLY_ACTIVATED", q.flags)


class TestBadRows(unittest.TestCase):
    def test_unknown_node_is_quarantined_not_guessed(self) -> None:
        r = row(9)
        r["node"] = "N9"
        res = adapt_row(r, REGISTRY)
        self.assertIsNone(res.observation)
        self.assertEqual(res.quarantine, "UNKNOWN_NODE")
        self.assertIsNone(res.radio_row["wire_id"])
        self.assertFalse(res.radio_row["schema_valid"])
        self.assertEqual(res.radio_row["drop_reason"], "UNKNOWN_NODE")

    def test_non_live_sources_are_skipped(self) -> None:
        r = row(9)
        r["source"] = "simulated"
        res = adapt_row(r, REGISTRY)
        self.assertEqual(res.skipped, "NOT_LIVE")
        self.assertIsNone(res.observation)

    def test_pm_sentinel_minus_one_means_no_pms_frame(self) -> None:
        r = row(9)
        r["pm2_5"] = -1
        o = adapt_row(r, REGISTRY).observation
        self.assertIsNone(o.pm25)
        self.assertTrue(o.quality_flags & FLAG_PM_FAULT)
        self.assertEqual(QualityEngine().assess(o).pms, 0.0)

    def test_pm_values_above_range_are_a_fault(self) -> None:
        r = row(9)
        r["pm10"] = 4000
        self.assertTrue(adapt_row(r, REGISTRY).observation.quality_flags & FLAG_PM_FAULT)

    def test_inconsistent_pm_ordering_is_flagged_but_not_a_fault(self) -> None:
        r = row(9)
        r["pm1"] = 150  # PM1 cannot exceed PM2.5
        o = adapt_row(r, REGISTRY).observation
        self.assertIn("PM_ORDER_INCONSISTENT", o.quality.flags)
        self.assertFalse(o.quality_flags & FLAG_PM_FAULT)

    def test_bme_out_of_range_values_are_removed_and_flagged(self) -> None:
        r = row(9)
        r["temp"] = 200
        res = adapt_row(r, REGISTRY)
        self.assertIsNone(res.observation.temperature)
        self.assertTrue(res.observation.quality_flags & FLAG_BME_FAULT)
        self.assertIn("BME_INVALID", res.notes)

    def test_non_positive_gas_resistance_is_a_bme_fault(self) -> None:
        r = row(9)
        r["gas_kohm"] = 0
        o = adapt_row(r, REGISTRY).observation
        self.assertIsNone(o.bme688_gas_feature)
        self.assertEqual(QualityEngine().assess(o).bme688, 0.0)

    def test_mq135_at_the_supply_rail_is_a_fault(self) -> None:
        r = row(9)
        r["mq_mv"] = 3300
        o = adapt_row(r, REGISTRY).observation
        self.assertEqual(o.mq_heater_state, MqHeaterState.FAULT)
        self.assertIsNone(o.mq135_index)
        self.assertEqual(QualityEngine().assess(o).mq135, 0.0)

    def test_bad_timestamp_is_quarantined(self) -> None:
        r = row(9)
        r["rx_utc"] = "not a time"
        self.assertEqual(adapt_row(r, REGISTRY).quarantine, "BAD_TIME")

    def test_never_raises_on_garbage(self) -> None:
        r = row(9)
        r.update(id="x", boot="y", pm1="?", pm2_5=None, temp="nan", mq_mv=None)
        res = adapt_row(r, REGISTRY)
        self.assertIsNone(res.observation)  # id is not an integer
        self.assertEqual(res.quarantine, "BAD_FIELDS")


class TestRegistry(unittest.TestCase):
    def _write(self, data: dict) -> str:
        self._tmp = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        self.addCleanup(self._tmp.cleanup)
        p = Path(self._tmp.name) / "nodes.json"
        p.write_text(json.dumps(data), encoding="utf-8")
        return str(p)

    def test_loads_nodes_and_ignores_comment_keys(self) -> None:
        reg = load_registry(self._write({"_comment": "x", "N1": {"wire_id": 101, "display_id": "NODE-01"}}))
        self.assertEqual(list(reg), ["N1"])
        self.assertEqual(reg["N1"].installed_sensors, V0_SENSORS)

    def test_wire_id_2_is_reserved_for_the_gateway(self) -> None:
        with self.assertRaises(ValueError):
            load_registry(self._write({"N1": {"wire_id": 2, "display_id": "NODE-01"}}))

    def test_wire_ids_must_be_unique(self) -> None:
        with self.assertRaises(ValueError):
            load_registry(self._write({"N1": {"wire_id": 101, "display_id": "A"}, "N2": {"wire_id": 101, "display_id": "B"}}))

    def test_example_registry_in_the_repo_is_valid(self) -> None:
        example = Path(__file__).resolve().parents[2] / "deployment" / "pi" / "v0_nodes.example.json"
        reg = load_registry(str(example))
        self.assertEqual(sorted(reg), ["N1", "N2"])


if __name__ == "__main__":
    unittest.main()
