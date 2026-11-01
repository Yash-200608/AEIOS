"""Node-based forecasting: hourly node series, labelling and fallback, station export. Synthetic data only; no network."""

from __future__ import annotations

import json
import sqlite3
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from ai.feature_engineering.features import HOUR, Series  # noqa: E402
from ai.service import forecast_service as S  # noqa: E402
from ai.service import node_inputs as NI  # noqa: E402
from ai.service import stations as ST  # noqa: E402
from ai.tests.test_service import FakeEngine, fake_client, wx_series  # noqa: E402

NOW = datetime(2026, 11, 1, 12, 25, tzinfo=timezone.utc)
NOW_H = int(datetime(2026, 11, 1, 12, tzinfo=timezone.utc).timestamp())


def make_db(path: str, rows: list[tuple]) -> None:
    c = sqlite3.connect(path)
    c.execute("CREATE TABLE sensor_readings (wire_id INTEGER, measurement_time INTEGER, pm25 REAL, provenance TEXT)")
    c.executemany("INSERT INTO sensor_readings VALUES (?,?,?,?)", rows)
    c.commit()
    c.close()


class TestHourlySeries(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        self.addCleanup(self._tmp.cleanup)
        self.db = str(Path(self._tmp.name) / "aeios_test.db")

    def test_hour_is_stamped_at_its_end_and_needs_two_readings(self) -> None:
        start = NOW_H - 3 * HOUR                     # the 09:00-10:00 hour
        rows = [(101, start + 300, 50.0, "LIVE"), (101, start + 600, 70.0, "LIVE"),   # two readings: kept, mean 60, stamped 10:00
                (101, start + HOUR + 300, 90.0, "LIVE")]                            # one reading in 10:00-11:00: dropped
        make_db(self.db, rows)
        s = NI.hourly_series(self.db, 101, NOW)
        self.assertEqual(s.data, {start + HOUR: 60.0})

    def test_the_current_hour_is_never_used_before_it_finishes(self) -> None:
        cur = NOW_H                                  # 12:00-13:00 is still running at 12:25
        make_db(self.db, [(101, cur + 60, 40.0, "LIVE"), (101, cur + 120, 42.0, "LIVE")])
        self.assertEqual(NI.hourly_series(self.db, 101, NOW).data, {})

    def test_simulated_implausible_and_other_nodes_are_excluded(self) -> None:
        t = NOW_H - 5 * HOUR
        make_db(self.db, [(101, t + 60, 40.0, "SIMULATED"), (101, t + 120, 40.0, "SIMULATED"),
                          (101, t + 200, -1.0, "LIVE"), (101, t + 260, 4000.0, "LIVE"),
                          (102, t + 60, 30.0, "LIVE"), (102, t + 120, 30.0, "LIVE")])
        self.assertEqual(NI.hourly_series(self.db, 101, NOW).data, {})
        self.assertEqual(len(NI.hourly_series(self.db, 102, NOW).data), 1)

    def test_readiness_counts_history_against_the_eight_week_target(self) -> None:
        t = NOW_H - 10 * HOUR
        make_db(self.db, [(101, t + h * HOUR + off, 50.0, "LIVE") for h in range(4) for off in (60, 120)])
        r = NI.training_readiness(self.db, [101])[0]
        self.assertEqual(r["hours"], 4)
        self.assertFalse(r["ready_for_node_model"])
        self.assertEqual(r["target_hours"], NI.READINESS_HOURS)


class TestNodeForecasts(unittest.TestCase):
    def setUp(self) -> None:
        self.node = {"station_code": 3, "location_id": 900101, "name": "NODE-01", "node": True,
                     "input_label": "AEIOS node NODE-01 (test)"}

    def pm(self, last: int, n: int = 30) -> Series:
        return Series({last - i * HOUR: 80.0 + i for i in range(n)})

    def test_node_rows_carry_their_label_and_the_caveat(self) -> None:
        rows = S.forecast_station(self.node, self.pm(NOW_H), wx_series(NOW_H), "Open-Meteo analysis", FakeEngine(), NOW, [])
        self.assertTrue(all(r["input_source"] == "AEIOS node NODE-01 (test)" for r in rows))
        self.assertTrue(all(NI.NODE_CAVEAT in r["reason"] for r in rows))
        self.assertTrue(all(r["location_id"] == 900101 for r in rows))

    def test_a_silent_node_says_so_instead_of_inventing_a_forecast(self) -> None:
        rows = S.forecast_station(self.node, Series(), {}, "w", FakeEngine(), NOW, ["node database not configured"])
        self.assertTrue(all(r["source"] == "no_input" for r in rows))
        self.assertIn("node not reporting", rows[0]["reason"])
        self.assertIn("node database not configured", rows[0]["reason"])

    def test_cpcb_rows_are_not_marked_as_node_rows(self) -> None:
        cpcb = {"station_code": 1, "location_id": 301, "name": "Vikas Sadan"}
        rows = S.forecast_station(cpcb, self.pm(NOW_H), wx_series(NOW_H), "w", FakeEngine(), NOW, [])
        self.assertNotIn("not validated on node data", rows[0]["reason"] or "")

    def test_run_once_puts_nodes_first_and_falls_back_to_cpcb(self) -> None:
        with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as tmp:
            db = str(Path(tmp) / "aeios_test.db")
            make_db(db, [(101, NOW_H - 2 * HOUR + 60, 55.0, "LIVE"), (101, NOW_H - 2 * HOUR + 120, 57.0, "LIVE")])
            cfg = {"model": "m", "model_version": "vfake", "weather_site": {"lat": 28.4, "lon": 76.9},
                   "stations": [{"station_code": 0, "location_id": 301, "name": "Vikas Sadan", "pm25_sensor_ids": [1]}],
                   "nodes": [{"station_code": 0, "wire_id": 101, "location_id": 900101, "display_id": "NODE-01", "nearest_cpcb": "Vikas Sadan"},
                             {"station_code": 0, "wire_id": 102, "location_id": 900102, "display_id": "NODE-02", "nearest_cpcb": "Vikas Sadan"}]}
            wx_payload = {"hourly": {"time": [f"2026-11-01T{h:02d}:00" for h in range(12)], "temperature_2m": [20.0] * 12,
                                     "boundary_layer_height": [500.0] * 12}}
            s = S.run_once(cfg, FakeEngine(), fake_client(lambda u: {"results": []}), fake_client(lambda u: wx_payload),
                           None, NOW, node_db=db)
            nodes_rows = [r for r in s["rows"] if r["location_id"] >= 900000]
            cpcb_rows = [r for r in s["rows"] if r["location_id"] < 900000]
            self.assertEqual(s["nodes"], 2)
            self.assertEqual(s["rows"][0]["location_id"], 900101)          # nodes come first in the output
            fed = [r for r in nodes_rows if r["location_id"] == 900101]
            silent = [r for r in nodes_rows if r["location_id"] == 900102]
            self.assertTrue(all(r["source"] == "lightgbm_cqr" for r in fed))   # NODE-01 has two readings in its last full hour
            self.assertTrue(all(r["source"] == "no_input" for r in silent))    # NODE-02 has none: no invented forecast
            self.assertEqual(len(cpcb_rows), 5)                                # the CPCB fallback still runs

    def test_without_a_node_database_nodes_report_no_input(self) -> None:
        cfg = {"model": "m", "model_version": "vfake", "weather_site": {"lat": 28.4, "lon": 76.9}, "stations": [],
               "nodes": [{"station_code": 0, "wire_id": 101, "location_id": 900101, "display_id": "NODE-01", "nearest_cpcb": "x"}]}
        s = S.run_once(cfg, FakeEngine(), fake_client(lambda u: {"results": []}), fake_client(lambda u: {"hourly": {"time": []}}), None, NOW, node_db=None)
        self.assertTrue(all(r["source"] == "no_input" for r in s["rows"]))
        self.assertIn("node database not configured", s["rows"][0]["reason"])


class TestStationExport(unittest.TestCase):
    def test_nodes_map_to_their_nearest_cpcb_station_and_load_validates(self) -> None:
        stations = [{"station_code": 0, "location_id": 1, "name": "far", "lat": 28.9, "lon": 77.5, "pm25_sensor_ids": [5]},
                    {"station_code": 1, "location_id": 2, "name": "near", "lat": 28.48, "lon": 76.90, "pm25_sensor_ids": [6]}]
        with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as tmp:
            reg = Path(tmp) / "nodes.json"
            reg.write_text(json.dumps({"_c": "x", "N1": {"wire_id": 101, "display_id": "NODE-01", "site": "SGT", "latitude": 28.4782, "longitude": 76.9040}}))
            cfg = {"model": "m", "model_version": "v", "weather_site": {}, "stations": stations}
            # reproduce the export's nearest-station rule without a database
            here = (28.4782, 76.9040)
            near = min(stations, key=lambda s: ST._km(here, (s["lat"], s["lon"])))
            self.assertEqual(near["name"], "near")
            self.assertEqual(ST.NODE_LOCATION_BASE + 101, 900101)
            cfg["nodes"] = [{"station_code": near["station_code"], "wire_id": 101, "location_id": 900101, "display_id": "NODE-01"}]
            good = Path(tmp) / "stations.json"
            good.write_text(json.dumps(cfg))
            self.assertEqual(ST.load(good)["nodes"][0]["display_id"], "NODE-01")
            cfg["nodes"].append(dict(cfg["nodes"][0], display_id="NODE-02"))
            good.write_text(json.dumps(cfg))
            with self.assertRaises(ValueError):
                ST.load(good)
            cfg["nodes"] = [{"station_code": 9, "wire_id": 103, "location_id": 900103, "display_id": "NODE-03"}]
            good.write_text(json.dumps(cfg))
            with self.assertRaises(ValueError):
                ST.load(good)


if __name__ == "__main__":
    unittest.main()
