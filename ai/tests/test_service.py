"""Forecast service tests: station handling, staleness, storage, verification, upload. Fake model and canned HTTP only."""

from __future__ import annotations

import json
import sys
import tempfile
import unittest
import urllib.error
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from ai.feature_engineering.features import HOUR, Series  # noqa: E402
from ai.preprocessing.common import HttpError, JsonClient  # noqa: E402
from ai.service import forecast_service as S  # noqa: E402
from ai.service import live_inputs as LI  # noqa: E402
from ai.service.stations import load as load_stations  # noqa: E402

NOW = datetime(2026, 10, 31, 12, 25, tzinfo=timezone.utc)
HOUR_NOW = int(datetime(2026, 10, 31, 12, tzinfo=timezone.utc).timestamp())
STATION = {"station_code": 3, "location_id": 77, "name": "Test Station", "pm25_sensor_ids": [900, 5]}
CFG = {"model": "pm25_lgbm_cqr", "model_version": "vfake", "weather_site": {"lat": 28.4, "lon": 76.9}, "stations": [STATION]}


class FakeEngine:
    version = "vfake"
    ready = True
    reason = ""

    def __init__(self) -> None:
        self.calls: list[tuple[dict, int]] = []

    def predict(self, features, horizon, *, input_source, explain=True, top=5):
        self.calls.append((dict(features), horizon))
        now = features["pm_now"]
        return {"source": "lightgbm_cqr", "model_version": "vfake", "q10": now * 0.7, "q50": now * 1.1, "q90": now * 1.6,
                "interval": "80% conformal", "drivers": [{"feature": "pm_now", "value": now, "contribution_log": 0.1, "effect_pct": 10.5}],
                "input_source": input_source}


def pm_series(last_stamp: int, n: int = 30, value=lambda i: 80.0 + i) -> Series:
    return Series({last_stamp - i * HOUR: value(i) for i in range(n)})


def wx_series(stamp: int, n: int = 30) -> dict:
    return {"temperature_2m": Series({stamp - i * HOUR: 20.0 for i in range(n)}),
            "boundary_layer_height": Series({stamp - i * HOUR: 400.0 for i in range(n)})}


def fake_client(handler) -> JsonClient:
    class Resp:
        def __init__(self, p): self._b = json.dumps(p).encode()
        def read(self): return self._b
        def __enter__(self): return self
        def __exit__(self, *a): return None

    def opener(req, timeout):
        return Resp(handler(req.full_url))

    return JsonClient("https://x.test", opener=opener, sleep=lambda s: None)


class TestForecastStation(unittest.TestCase):
    def test_fresh_station_gets_five_labelled_forecasts(self) -> None:
        eng = FakeEngine()
        rows = S.forecast_station(STATION, pm_series(HOUR_NOW), wx_series(HOUR_NOW), "Open-Meteo analysis", eng, NOW, [])
        self.assertEqual([r["horizon_h"] for r in rows], [1, 3, 6, 12, 24])
        r = rows[2]
        self.assertEqual((r["source"], r["model_version"], r["station"], r["location_id"]), ("lightgbm_cqr", "vfake", "Test Station", 77))
        self.assertIn("not an AEIOS node", r["input_source"])
        self.assertEqual(r["origin_utc"], "2026-10-31 12:00:00")
        self.assertEqual(r["due_utc"], "2026-10-31 18:00:00")  # origin + 6 h
        self.assertEqual(r["stale_h"], 0)
        self.assertAlmostEqual(r["q50"], 80.0 * 1.1)
        self.assertIsInstance(json.loads(r["drivers"]), list)

    def test_features_use_only_data_up_to_the_origin_and_carry_station_code(self) -> None:
        eng = FakeEngine()
        pm = pm_series(HOUR_NOW)
        pm.data[HOUR_NOW + 2 * HOUR] = 9999.0  # a value from the future must never be read
        S.forecast_station(STATION, pm, wx_series(HOUR_NOW), "w", eng, NOW, [])
        feats = eng.calls[0][0]
        self.assertEqual(feats["pm_now"], 80.0)
        self.assertEqual(feats["station_code"], 3)
        self.assertEqual(feats["pm_lag1"], 81.0)
        self.assertNotIn(9999.0, feats.values())

    def test_stale_station_gets_no_input_rows_not_forecasts(self) -> None:
        eng = FakeEngine()
        rows = S.forecast_station(STATION, pm_series(HOUR_NOW - 7 * HOUR), wx_series(HOUR_NOW), "w", eng, NOW, [])
        self.assertTrue(all(r["source"] == "no_input" and r["q50"] is None for r in rows))
        self.assertIn("7 h old", rows[0]["reason"])
        self.assertEqual(eng.calls, [])

    def test_a_reading_exactly_at_the_staleness_limit_is_still_used(self) -> None:
        rows = S.forecast_station(STATION, pm_series(HOUR_NOW - S.MAX_STALE_H * HOUR), wx_series(HOUR_NOW), "w", FakeEngine(), NOW, [])
        self.assertEqual(rows[0]["source"], "lightgbm_cqr")
        self.assertEqual(rows[0]["stale_h"], S.MAX_STALE_H)

    def test_empty_series_is_no_input_with_the_upstream_problems(self) -> None:
        rows = S.forecast_station(STATION, Series(), {}, "w", FakeEngine(), NOW, ["sensor 900: HTTP 500"])
        self.assertEqual(rows[0]["source"], "no_input")
        self.assertIn("sensor 900: HTTP 500", rows[0]["reason"])

    def test_missing_weather_is_flagged_on_every_row(self) -> None:
        rows = S.forecast_station(STATION, pm_series(HOUR_NOW), {}, "unavailable (HTTP 500)", FakeEngine(), NOW, [])
        self.assertTrue(all("weather unavailable" in r["reason"] for r in rows))

    def test_fallback_engine_rows_keep_their_fallback_label(self) -> None:
        from ai.inference.engine import ForecastEngine
        rows = S.forecast_station(STATION, pm_series(HOUR_NOW), wx_series(HOUR_NOW), "w", ForecastEngine(None, reason="no model"), NOW, [])
        self.assertTrue(all(r["source"] == "fallback_persistence" and r["q10"] is None and r["interval"] is None for r in rows))
        self.assertEqual(rows[0]["q50"], 80.0)


class TestStoreVerifyUpload(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        self.addCleanup(self._tmp.cleanup)
        self.conn = S.open_store(str(Path(self._tmp.name) / "forecasts_test.db"))
        self.addCleanup(self.conn.close)
        self.rows = S.forecast_station(STATION, pm_series(HOUR_NOW), wx_series(HOUR_NOW), "w", FakeEngine(), NOW, [])

    def test_storing_the_same_origin_twice_adds_nothing(self) -> None:
        self.assertEqual(S.store_rows(self.conn, self.rows), 5)
        self.assertEqual(S.store_rows(self.conn, self.rows), 0)
        self.assertEqual(self.conn.execute("SELECT count(*) FROM forecasts").fetchone()[0], 5)

    def test_verify_scores_forecasts_once_their_hour_is_observed(self) -> None:
        S.store_rows(self.conn, self.rows)
        later = NOW + timedelta(hours=7)
        pm = pm_series(HOUR_NOW + 6 * HOUR)  # due hours up to +6 h are now observed
        pm.data[HOUR_NOW + 1 * HOUR] = 100.0
        pm.data[HOUR_NOW + 3 * HOUR] = 200.0
        self.assertEqual(S.verify(self.conn, STATION, pm, later), 3)  # +1, +3, +6 h; +12 and +24 not yet
        o = dict((h, (a, e, p, inside)) for h, a, e, p, inside in self.conn.execute(
            "SELECT f.horizon_h, o.actual_pm, o.abs_err, o.persistence_abs_err, o.in_interval FROM outcomes o JOIN forecasts f ON f.id=o.forecast_id"))
        a, err, perr, inside = o[1]
        self.assertEqual(a, 100.0)
        self.assertAlmostEqual(err, abs(100.0 - 80.0 * 1.1))
        self.assertAlmostEqual(perr, 20.0)
        self.assertEqual(inside, 1)  # 56 .. 128
        self.assertEqual(o[3][3], 0)  # 200 is outside [56, 128]
        self.assertEqual(S.verify(self.conn, STATION, pm, later), 0)  # idempotent

    def test_no_input_rows_are_never_scored(self) -> None:
        stale = S.forecast_station(STATION, Series(), {}, "w", FakeEngine(), NOW, [])
        S.store_rows(self.conn, stale)
        self.assertEqual(S.verify(self.conn, STATION, pm_series(HOUR_NOW), NOW), 0)

    def test_upload_batches_drivers_as_json_and_advances_the_cursor(self) -> None:
        S.store_rows(self.conn, self.rows)
        sent = []
        n = S.upload(self.conn, "https://x/ingest", "tok", "dev", post=lambda u, t, body: sent.append(body) or {"ok": True})
        self.assertEqual(n, 5)
        body = sent[0]
        self.assertEqual((body["device_id"], body["table"]), ("dev", "forecasts"))
        self.assertEqual([r["id"] for r in body["rows"]], [1, 2, 3, 4, 5])
        self.assertIsInstance(body["rows"][0]["drivers"], list)
        self.assertEqual(body["rows"][0]["station"], "Test Station")
        self.assertEqual(S.upload(self.conn, "u", "t", "d", post=lambda *a: self.fail("nothing left to send")), 0)

    def test_failed_upload_keeps_rows_queued(self) -> None:
        S.store_rows(self.conn, self.rows)

        def boom(u, t, body):
            raise urllib.error.URLError("offline")

        with self.assertRaises(urllib.error.URLError):
            S.upload(self.conn, "u", "t", "d", post=boom)
        sent = []
        self.assertEqual(S.upload(self.conn, "u", "t", "d", post=lambda u, t, b: sent.append(b)), 5)

    def test_upload_payload_never_contains_the_token(self) -> None:
        S.store_rows(self.conn, self.rows)
        sent = []
        S.upload(self.conn, "u", "SECRET-TOKEN-VALUE", "d", post=lambda u, t, b: sent.append(json.dumps(b)))
        self.assertNotIn("SECRET-TOKEN-VALUE", sent[0])

    def test_report_before_and_after_verification(self) -> None:
        self.assertIn("Nothing verified yet", S.report(self.conn))
        S.store_rows(self.conn, self.rows)
        S.verify(self.conn, STATION, pm_series(HOUR_NOW + 6 * HOUR), NOW + timedelta(hours=7))
        text = S.report(self.conn)
        self.assertIn("| +1 h |", text)
        self.assertIn("persistence MAE", text)


class TestLiveInputs(unittest.TestCase):
    def test_newer_feed_wins_and_future_hours_are_ignored(self) -> None:
        def period(end_iso: str, v: float) -> dict:
            return {"value": v, "period": {"datetimeFrom": {"utc": end_iso.replace("12:00", "11:00")}, "datetimeTo": {"utc": end_iso}}}

        def handler(url: str) -> dict:
            if "/sensors/5/" in url:      # legacy feed
                return {"results": [period("2026-10-31T12:00:00Z", 10.0), period("2026-10-31T11:00:00Z", 11.0)]}
            return {"results": [period("2026-10-31T12:00:00Z", 55.0), period("2026-10-31T18:00:00Z", 999.0)]}  # newer feed, plus a future hour

        pm, problems = LI.fetch_station_pm(fake_client(handler), [900, 5], NOW)
        self.assertEqual(problems, [])
        self.assertEqual(pm.at(HOUR_NOW), 55.0)
        self.assertEqual(pm.at(HOUR_NOW - HOUR), 11.0)
        self.assertNotIn(999.0, pm.data.values())

    def test_a_failing_sensor_is_reported_and_the_other_still_used(self) -> None:
        def handler(url: str) -> dict:
            if "/sensors/900/" in url:
                raise urllib.error.HTTPError(url, 500, "x", {}, None)  # type: ignore[arg-type]
            return {"results": [{"value": 30.0, "period": {"datetimeFrom": {"utc": "2026-10-31T11:00:00Z"}, "datetimeTo": {"utc": "2026-10-31T12:00:00Z"}}}]}

        pm, problems = LI.fetch_station_pm(fake_client(handler), [900, 5], NOW)
        self.assertEqual(pm.at(HOUR_NOW), 30.0)
        self.assertEqual(len(problems), 1)
        self.assertIn("sensor 900", problems[0])

    def test_implausible_values_are_dropped(self) -> None:
        pay = {"results": [{"value": -5.0, "period": {"datetimeFrom": {"utc": "2026-10-31T10:00:00Z"}, "datetimeTo": {"utc": "2026-10-31T11:00:00Z"}}},
                           {"value": 5000.0, "period": {"datetimeFrom": {"utc": "2026-10-31T11:00:00Z"}, "datetimeTo": {"utc": "2026-10-31T12:00:00Z"}}}]}
        pm, _ = LI.fetch_station_pm(fake_client(lambda u: pay), [1], NOW)
        self.assertEqual(pm.data, {})

    def test_weather_failure_returns_a_problem_not_an_exception(self) -> None:
        def handler(url: str) -> dict:
            raise urllib.error.HTTPError(url, 400, "bad", {}, None)  # type: ignore[arg-type]

        wx, problem = LI.fetch_weather(fake_client(handler), 28.0, 77.0)
        self.assertEqual(wx, {})
        self.assertIn("HTTP 400", problem)

    def test_latest_origin_ignores_hours_after_now(self) -> None:
        pm = Series({HOUR_NOW - HOUR: 1.0, HOUR_NOW + 5 * HOUR: 2.0})
        self.assertEqual(LI.latest_origin(pm, NOW), HOUR_NOW - HOUR)
        self.assertIsNone(LI.latest_origin(Series(), NOW))


class TestRunOnceAndConfig(unittest.TestCase):
    def test_run_once_end_to_end_with_canned_http(self) -> None:
        def openaq(url: str) -> dict:
            return {"results": [{"value": 90.0, "period": {"datetimeFrom": {"utc": "2026-10-31T11:00:00Z"}, "datetimeTo": {"utc": "2026-10-31T12:00:00Z"}}}]}

        def weather(url: str) -> dict:
            t = [datetime.fromtimestamp(HOUR_NOW - i * HOUR, timezone.utc).strftime("%Y-%m-%dT%H:%M") for i in range(48)]
            return {"hourly": {"time": t, "temperature_2m": [21.0] * 48, "boundary_layer_height": [500.0] * 48}}

        with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as tmp:
            conn = S.open_store(str(Path(tmp) / "forecasts_test.db"))
            eng = FakeEngine()
            s = S.run_once(CFG, eng, fake_client(openaq), fake_client(weather), conn, NOW)
            self.assertEqual((s["stations"], s["forecast_rows"], s["no_input"], s["stored"]), (1, 5, 0, 5))
            self.assertIn("Open-Meteo", s["weather"])
            self.assertEqual(eng.calls[0][0]["temperature_2m"], 21.0)
            self.assertEqual(eng.calls[0][0]["boundary_layer_height"], 500.0)
            self.assertEqual(S.run_once(CFG, eng, fake_client(openaq), fake_client(weather), conn, NOW)["stored"], 0)  # same origin: no duplicates
            conn.close()

    def test_stations_file_validation(self) -> None:
        with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as tmp:
            p = Path(tmp) / "stations_test.json"
            good = dict(CFG, stations=[dict(STATION, station_code=0)])
            p.write_text(json.dumps(good))
            self.assertEqual(load_stations(p)["stations"][0]["name"], "Test Station")
            p.write_text(json.dumps(dict(CFG, stations=[dict(STATION, station_code=2)])))
            with self.assertRaises(ValueError):
                load_stations(p)
            p.write_text(json.dumps(dict(CFG, stations=[dict(STATION, station_code=0, pm25_sensor_ids=[])])))
            with self.assertRaises(ValueError):
                load_stations(p)


if __name__ == "__main__":
    unittest.main()
