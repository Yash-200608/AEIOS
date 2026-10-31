"""Phase 2 data foundation: OpenAQ parsing/resume, Open-Meteo parsing, leakage-safe features, splits, report gating.

No network, no keys: HTTP is replaced by canned responses. Synthetic series are test data only.
"""

from __future__ import annotations

import json
import math
import sys
import unittest
import urllib.error
from datetime import date, datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from ai.feature_engineering import features as F  # noqa: E402
from ai.feature_engineering.splits import chronological_split, walk_forward  # noqa: E402
from ai.preprocessing import openaq_fetch as Q  # noqa: E402
from ai.preprocessing import quality_report as R  # noqa: E402
from ai.preprocessing import weather_fetch as W  # noqa: E402
from ai.preprocessing.common import HttpError, JsonClient, RateLimiter, open_cache  # noqa: E402

T0 = int(datetime(2024, 1, 1, tzinfo=timezone.utc).timestamp())
H = 3600


class FakeResp:
    def __init__(self, payload: dict) -> None:
        self._b = json.dumps(payload).encode()

    def read(self) -> bytes:
        return self._b

    def __enter__(self):
        return self

    def __exit__(self, *a) -> None:
        return None


def fake_client(handler, **kw) -> JsonClient:
    calls: list[str] = []

    def opener(req, timeout):
        calls.append(req.full_url)
        return FakeResp(handler(req.full_url))

    c = JsonClient("https://x.test", opener=opener, sleep=lambda s: None, **kw)
    c.calls = calls  # type: ignore[attr-defined]
    return c


def hours_payload(start_ts: int, n: int, value=lambda i: 50.0 + i, coverage=100.0) -> dict:
    res = []
    for i in range(n):
        iso = datetime.fromtimestamp(start_ts + i * H, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        res.append({"value": value(i), "period": {"datetimeFrom": {"utc": iso}}, "coverage": {"percentComplete": coverage}})
    return {"results": res}


LOCATIONS = {"results": [
    {"id": 10, "name": "Sector 51, Gurugram - HSPCB", "provider": {"name": "CPCB"}, "coordinates": {"latitude": 28.43, "longitude": 77.06},
     "datetimeFirst": {"utc": "2019-01-01T00:00:00Z"}, "datetimeLast": {"utc": "2026-10-30T00:00:00Z"},
     "sensors": [{"id": 101, "parameter": {"name": "pm25", "units": "µg/m³"}}, {"id": 102, "parameter": {"name": "pm10", "units": "µg/m³"}},
                 {"id": 103, "parameter": {"name": "no2", "units": "ppb"}}]},
    {"id": 11, "name": "Some PurpleAir", "provider": {"name": "PurpleAir"}, "coordinates": {"latitude": 28.48, "longitude": 76.9},
     "sensors": [{"id": 201, "parameter": {"name": "pm25", "units": "µg/m³"}}]},
    {"id": 12, "name": "No PM here", "provider": {"name": "CPCB"}, "coordinates": {"latitude": 28.5, "longitude": 76.9},
     "sensors": [{"id": 301, "parameter": {"name": "o3", "units": "ppb"}}]},
]}


class TestOpenAQ(unittest.TestCase):
    def test_parse_locations_keeps_only_pm_sensors_and_computes_distance(self) -> None:
        st, se = Q.parse_locations(LOCATIONS, F.__dict__.get("SGT_LAT", 28.4782), 76.9040)
        self.assertEqual([s["location_id"] for s in st], [10, 11])  # location 12 has no PM sensor
        self.assertEqual(sorted(s["sensor_id"] for s in se), [101, 102, 201])
        self.assertTrue(10 < st[0]["distance_km"] < 20)

    def test_discover_filters_provider_and_never_stores_other_providers_by_default(self) -> None:
        conn = open_cache(":memory:")
        c = fake_client(lambda url: LOCATIONS if "page=1" in url else {"results": []})
        r = Q.discover(c, conn)
        self.assertEqual((r["stations_found"], r["stations_kept"], r["sensors"]), (2, 1, 2))
        self.assertIn("PurpleAir", r["providers_seen"])
        self.assertEqual([x[0] for x in conn.execute("SELECT location_id FROM aq_stations")], [10])

    def test_discover_any_provider_keeps_all(self) -> None:
        conn = open_cache(":memory:")
        r = Q.discover(fake_client(lambda u: LOCATIONS), conn, provider_contains=None)
        self.assertEqual(r["stations_kept"], 2)

    def test_radius_is_capped_at_the_api_maximum(self) -> None:
        c = fake_client(lambda u: {"results": []})
        Q.discover(c, open_cache(":memory:"), radius_m=90_000)
        self.assertTrue(all("radius=25000" in u for u in c.calls))

    def test_parse_hours_drops_null_values_and_keeps_coverage(self) -> None:
        p = hours_payload(T0, 3)
        p["results"][1]["value"] = None
        rows = Q.parse_hours(p)
        self.assertEqual([r[0] for r in rows], [T0 + H, T0 + 3 * H])
        self.assertEqual(rows[0][2], 100.0)

    def test_history_is_resumable_and_idempotent(self) -> None:
        conn = open_cache(":memory:")
        Q.discover(fake_client(lambda u: LOCATIONS), conn)
        end = datetime(2024, 1, 10, tzinfo=timezone.utc)

        def handler(url: str) -> dict:
            return hours_payload(T0, 24)

        c1 = fake_client(handler)
        s1 = Q.fetch_history(c1, conn, since="2024-01-01", until=end)
        self.assertEqual(s1["sensors"], 2)
        n1 = conn.execute("SELECT count(*) FROM aq_hourly").fetchone()[0]
        self.assertEqual(n1, 48)  # 24 rows x 2 sensors
        # second run only re-reads from (fetched_through - 48h), and replacing rows does not duplicate them
        c2 = fake_client(handler)
        Q.fetch_history(c2, conn, since="2024-01-01", until=end)
        self.assertEqual(conn.execute("SELECT count(*) FROM aq_hourly").fetchone()[0], n1)
        self.assertIn("2024-01-0", c2.calls[0].replace("%3A", ":"))

    def test_backfill_reads_only_older_months(self) -> None:
        conn = open_cache(":memory:")
        with conn:
            conn.execute("INSERT INTO aq_sensors VALUES (101, 10, 'pm25', 'ug')")
            conn.execute("INSERT INTO aq_hourly VALUES (101, ?, 5.0, 100.0)", (int(datetime(2024, 3, 10, tzinfo=timezone.utc).timestamp()),))
        c = fake_client(lambda u: {"results": []})
        Q.fetch_history(c, conn, since="2024-01-01", until=datetime(2024, 6, 1, tzinfo=timezone.utc), backfill=True)
        joined = " ".join(c.calls).replace("%3A", ":")
        self.assertIn("2024-01-01", joined)
        self.assertNotIn("2024-04", joined)  # nothing newer than the cached start (+ overlap) is re-read
        self.assertEqual(conn.execute("SELECT count(*) FROM aq_fetch_state").fetchone()[0], 0)

    def test_history_paginates_until_a_short_page(self) -> None:
        conn = open_cache(":memory:")
        with conn:
            conn.execute("INSERT INTO aq_sensors VALUES (101, 10, 'pm25', 'ug')")
        pages = {"1": hours_payload(T0, Q.PAGE), "2": hours_payload(T0 + Q.PAGE * H, 5)}
        c = fake_client(lambda u: pages["2" if "page=2" in u else "1"])
        Q.fetch_history(c, conn, since="2024-01-01", until=datetime(2024, 1, 20, tzinfo=timezone.utc))
        self.assertEqual(conn.execute("SELECT count(*) FROM aq_hourly").fetchone()[0], Q.PAGE + 5)

    def test_only_the_working_date_parameters_are_sent(self) -> None:
        conn = open_cache(":memory:")
        with conn:
            conn.execute("INSERT INTO aq_sensors VALUES (101, 10, 'pm25', 'ug')")
        c = fake_client(lambda u: hours_payload(T0, 2))
        Q.fetch_history(c, conn, since="2024-01-01", until=datetime(2024, 1, 5, tzinfo=timezone.utc))
        self.assertTrue(all("datetime_from" in u and "date_from" not in u for u in c.calls))

    def test_history_can_be_limited_to_a_parameter_or_sensor(self) -> None:
        conn = open_cache(":memory:")
        Q.discover(fake_client(lambda u: LOCATIONS), conn)
        c = fake_client(lambda u: hours_payload(T0, 2))
        r = Q.fetch_history(c, conn, since="2024-01-01", until=datetime(2024, 1, 5, tzinfo=timezone.utc), parameters=("pm25",))
        self.assertEqual(r["sensors"], 1)
        r = Q.fetch_history(c, conn, since="2024-01-01", until=datetime(2024, 1, 5, tzinfo=timezone.utc), sensor_ids=[102])
        self.assertEqual(r["sensors"], 1)

    def test_half_hour_periods_are_stamped_at_their_end_rounded_up(self) -> None:
        def row(frm: str, to: str, v: float) -> dict:
            return {"value": v, "period": {"datetimeFrom": {"utc": frm}, "datetimeTo": {"utc": to}}}

        rows = Q.parse_hours({"results": [row("2026-10-01T06:30:00Z", "2026-10-01T07:30:00Z", 1.0),
                                          row("2026-10-01T07:00:00Z", "2026-10-01T08:00:00Z", 2.0)]})
        d = lambda ts: datetime.fromtimestamp(ts, timezone.utc).strftime("%H:%M")  # noqa: E731
        self.assertEqual([d(r[0]) for r in rows], ["08:00", "08:00"])  # never earlier than the data was complete

    def test_missing_key_is_a_clear_error_and_never_printed(self) -> None:
        import os
        old = os.environ.pop("OPENAQ_API_KEY", None)
        try:
            with self.assertRaises(SystemExit) as cm:
                Q.make_client()
            self.assertIn("OPENAQ_API_KEY", str(cm.exception))
        finally:
            if old is not None:
                os.environ["OPENAQ_API_KEY"] = old

    def test_http_4xx_error_does_not_leak_headers(self) -> None:
        def opener(req, timeout):
            raise urllib.error.HTTPError(req.full_url, 401, "no", {}, None)  # type: ignore[arg-type]

        c = JsonClient("https://x.test", {"X-API-Key": "SECRET-VALUE"}, opener=opener, sleep=lambda s: None)
        with self.assertRaises(HttpError) as cm:
            c.get("/locations")
        self.assertNotIn("SECRET-VALUE", str(cm.exception))

    def test_rate_limiter_blocks_the_call_over_the_limit(self) -> None:
        now = [0.0]
        slept: list[float] = []

        def sleep(s: float) -> None:
            slept.append(s)
            now[0] += s

        rl = RateLimiter(3, clock=lambda: now[0], sleep=sleep)
        for _ in range(3):
            rl.wait()
        self.assertEqual(slept, [])
        rl.wait()  # fourth call inside the same minute must wait
        self.assertEqual(len(slept), 1)
        self.assertGreater(slept[0], 50)


class TestWeather(unittest.TestCase):
    def test_parse_hourly_renames_and_keeps_nulls(self) -> None:
        p = {"hourly": {"time": ["2024-01-01T00:00", "2024-01-01T01:00"], "pm2_5": [10.0, None], "dust": [1.0, 2.0]}}
        rows = W.parse_hourly(p, W.CAMS_VARS)
        self.assertIn((T0, "cams_pm2_5", 10.0), rows)
        self.assertIn((T0 + H, "cams_pm2_5", None), rows)
        self.assertIn((T0 + H, "cams_dust", 2.0), rows)

    def test_fetch_site_stores_all_three_sources_and_resumes(self) -> None:
        conn = open_cache(":memory:")

        def hourly(vars_: list[str], start: str, end: str) -> dict:
            from datetime import timedelta
            a, b = date.fromisoformat(start), date.fromisoformat(end)
            times = []
            d = a
            while d <= b:
                times += [f"{d.isoformat()}T{h:02d}:00" for h in range(24)]
                d += timedelta(days=1)
            return {"hourly": {"time": times, **{v: [1.0] * len(times) for v in vars_}}}

        def handler(url: str) -> dict:
            from urllib.parse import parse_qs, urlparse
            q = {k: v[0] for k, v in parse_qs(urlparse(url).query).items()}
            vars_ = q["hourly"].split(",")
            if "past_days" in q:
                end = date(2024, 3, 11)
                return hourly(vars_, "2024-03-02", end.isoformat())
            return hourly(vars_, q["start_date"], q["end_date"])

        mk = lambda: fake_client(handler)  # noqa: E731
        stats = W.fetch_site(conn, "t", 28.0, 77.0, since="2024-03-01", today=date(2024, 3, 10), archive=mk(), forecast=mk(), aq=mk())
        self.assertGreater(stats["weather_rows"], 0)
        self.assertGreater(stats["cams_rows"], 0)
        have = {r[0] for r in conn.execute("SELECT DISTINCT var FROM wx_hourly")}
        self.assertTrue({"temperature_2m", "boundary_layer_height", "cams_pm2_5", "cams_aod"} <= have)
        state = conn.execute("SELECT source FROM wx_fetch_state ORDER BY source").fetchall()
        self.assertEqual(state, [("archive",), ("cams",)])


def synth_pm(n_hours: int, start: int = T0, f=None) -> F.Series:
    f = f or (lambda i: 60.0 + 30.0 * math.sin(i / 12.0) + (i % 7))
    return F.Series({start + i * H: f(i) for i in range(n_hours)})


def synth_wx(n_hours: int, start: int = T0) -> dict:
    wx = {}
    for var in F.WEATHER_NOW + ["wind_direction_10m"]:
        wx[var] = F.Series({start + i * H: 10.0 + (i % 24) for i in range(n_hours)})
    return wx


class TestFeatures(unittest.TestCase):
    def test_clean_pm_rejects_negative_implausible_and_low_coverage(self) -> None:
        self.assertIsNone(F.clean_pm(-1.0, 100))
        self.assertIsNone(F.clean_pm(2000.0, 100))
        self.assertIsNone(F.clean_pm(50.0, 40.0))
        self.assertIsNone(F.clean_pm(float("nan"), 100))
        self.assertEqual(F.clean_pm(50.0, None), 50.0)
        self.assertEqual(F.clean_pm(2000.0, 100, "pm10"), 2000.0)

    def test_row_values_match_hand_computation(self) -> None:
        pm = F.Series({T0 + i * H: float(i) for i in range(100)})
        rows = F.build_rows(pm, {}, horizon=6, start_ts=T0 + 50 * H, end_ts=T0 + 50 * H)
        self.assertEqual(len(rows), 1)
        r = rows[0]
        self.assertEqual(r["y"], 56.0)
        f = r["features"]
        self.assertEqual((f["pm_now"], f["pm_lag1"], f["pm_lag24"]), (50.0, 49.0, 26.0))
        self.assertEqual(f["pm_mean3"], 49.0)
        self.assertEqual(f["pm_max24"], 50.0)
        self.assertEqual(f["pm_delta3"], 3.0)

    def test_rows_need_a_current_value_and_a_target(self) -> None:
        pm = F.Series({T0 + i * H: 10.0 for i in range(10) if i != 4})
        rows = F.build_rows(pm, {}, horizon=1)
        origins = {(r["t"] - T0) // H for r in rows}
        self.assertNotIn(4, origins)  # no current value
        self.assertNotIn(3, origins)  # its target (hour 4) is missing
        self.assertNotIn(9, origins)  # target beyond the end

    def test_no_leakage_in_the_real_builder(self) -> None:
        pm, wx = synth_pm(24 * 40), synth_wx(24 * 40)
        for h in F.HORIZONS:
            rows = F.build_rows(pm, wx, horizon=h)
            self.assertTrue(rows)
            self.assertEqual(F.leakage_audit(pm, wx, rows), [])

    def test_leakage_audit_catches_a_feature_that_reads_the_future(self) -> None:
        pm, wx = synth_pm(24 * 10), synth_wx(24 * 10)
        rows = F.build_rows(pm, wx, horizon=3)
        for r in rows:  # simulate a buggy builder: a feature that is really the target
            r["features"]["pm_mean3"] = r["y"]
        self.assertTrue(F.leakage_audit(pm, wx, rows))

    def test_target_weather_is_off_by_default_and_marked_when_on(self) -> None:
        pm, wx = synth_pm(100), synth_wx(100)
        self.assertFalse(any(k.startswith("tw_") for k in F.build_rows(pm, wx, horizon=3)[0]["features"]))
        self.assertTrue(any(k.startswith("tw_") for k in F.build_rows(pm, wx, horizon=3, target_weather=True)[0]["features"]))

    def test_calendar_flags(self) -> None:
        diwali_eve = int(datetime(2024, 11, 1, 12, tzinfo=timezone.utc).timestamp())
        spring = int(datetime(2024, 4, 10, 12, tzinfo=timezone.utc).timestamp())
        self.assertEqual(F.calendar_features(diwali_eve)["diwali_window"], 1.0)
        self.assertEqual(F.calendar_features(diwali_eve)["stubble_season"], 1.0)
        self.assertEqual(F.calendar_features(spring)["diwali_window"], 0.0)
        self.assertEqual(F.calendar_features(spring)["stubble_season"], 0.0)

    def test_hour_of_day_uses_local_time(self) -> None:
        # 18:30 UTC is midnight in IST -> hour_sin ~ 0, hour_cos ~ 1
        t = int(datetime(2024, 3, 3, 18, 30, tzinfo=timezone.utc).timestamp())
        f = F.calendar_features(t)
        self.assertAlmostEqual(f["hour_sin"], 0.0, places=6)
        self.assertAlmostEqual(f["hour_cos"], 1.0, places=6)

    def test_ventilation_is_none_without_inputs(self) -> None:
        self.assertEqual(F.ventilation(500.0, 2.0, 4.0), 1500.0)
        self.assertIsNone(F.ventilation(None, 2.0, 4.0))
        self.assertIsNone(F.ventilation(500.0, None, None))
        self.assertEqual(F.ventilation(500.0, 2.0, None), 1000.0)


class TestStationMerge(unittest.TestCase):
    def test_newer_sensor_wins_on_overlap_and_fills_gaps(self) -> None:
        conn = open_cache(":memory:")
        with conn:
            conn.execute("INSERT INTO aq_sensors VALUES (5,10,'pm25','ug')")      # legacy feed
            conn.execute("INSERT INTO aq_sensors VALUES (900,10,'pm25','ug')")    # live feed
            conn.execute("INSERT INTO aq_sensors VALUES (6,10,'pm10','ug')")
            conn.executemany("INSERT INTO aq_hourly VALUES (5,?,?,100.0)", [(T0, 10.0), (T0 + H, 11.0)])
            conn.executemany("INSERT INTO aq_hourly VALUES (900,?,?,100.0)", [(T0 + H, 99.0), (T0 + 2 * H, 12.0)])
            conn.execute("INSERT INTO aq_hourly VALUES (6,?,500.0,100.0)", (T0,))
        s = F.load_station_pm(conn, 10, "pm25")
        self.assertEqual(s.data, {T0: 10.0, T0 + H: 99.0, T0 + 2 * H: 12.0})


class TestSplits(unittest.TestCase):
    def test_chronological_split_is_ordered_and_purged(self) -> None:
        pm = synth_pm(24 * 100)
        h = 24
        rows = F.build_rows(pm, {}, horizon=h)
        sp = chronological_split(rows)
        self.assertTrue(all(len(v) > 0 for v in sp.values()))
        self.assertLess(max(r["t"] for r in sp["train"]), min(r["t"] for r in sp["calibration"]))
        self.assertLess(max(r["t"] for r in sp["calibration"]), min(r["t"] for r in sp["test"]))
        # no training target is later than the first calibration origin: no label overlap across the boundary
        self.assertLessEqual(max(r["target_ts"] for r in sp["train"]), min(r["t"] for r in sp["calibration"]) + h * H)
        self.assertLessEqual(max(r["target_ts"] for r in sp["calibration"]), min(r["t"] for r in sp["test"]))

    def test_split_fractions_validated(self) -> None:
        with self.assertRaises(ValueError):
            chronological_split([], train=0.8, calibration=0.3)

    def test_walk_forward_never_trains_on_the_future(self) -> None:
        rows = F.build_rows(synth_pm(24 * 400), {}, horizon=6)
        folds = list(walk_forward(rows, fold_days=30, min_train_days=180))
        self.assertGreater(len(folds), 3)
        for train, test in folds:
            self.assertLessEqual(max(r["target_ts"] for r in train), min(r["t"] for r in test))


class TestReport(unittest.TestCase):
    def test_empty_cache_says_phase3_is_blocked(self) -> None:
        text = R.build_report(open_cache(":memory:"))
        self.assertIn("No station data cached yet", text)
        self.assertIn("Phase 3 cannot start", text)

    def test_gap_stats(self) -> None:
        hrs = [T0, T0 + H, T0 + 5 * H]
        g = R.gap_stats(hrs)
        self.assertEqual((g["n"], g["span_h"], g["longest_gap_h"]), (3, 6, 3))
        self.assertAlmostEqual(g["gap_pct"], 50.0)

    def test_long_outage_is_reported_separately_from_ordinary_gaps(self) -> None:
        a = [T0 + i * H for i in range(1000)]
        b = [T0 + (1000 + 24 * 800 + i) * H for i in range(1000)]  # 800-day outage in the middle
        g = R.gap_stats(a + b)
        self.assertEqual(g["segments"], 2)
        self.assertEqual(len(g["holes"]), 1)
        self.assertGreater(g["gap_pct"], 90.0)
        self.assertEqual(g["seg_gap_pct"], 0.0)

    def test_report_with_enough_data_runs_the_leakage_audit(self) -> None:
        conn = open_cache(":memory:")
        n = 24 * 400
        with conn:
            conn.execute("INSERT INTO aq_stations VALUES (10,'Test CPCB','CPCB',28.4,77.0,12.0,NULL,NULL)")
            conn.execute("INSERT INTO aq_sensors VALUES (101,10,'pm25','ug')")
            conn.executemany("INSERT INTO aq_hourly VALUES (101,?,?,100.0)", [(T0 + i * H, 60.0 + (i % 50)) for i in range(n)])
            conn.executemany("INSERT INTO wx_hourly VALUES ('sgt',?,'temperature_2m',?)", [(T0 + i * H, 20.0) for i in range(n)])
        text = R.build_report(conn)
        self.assertIn("usable", text)
        self.assertIn("clean", text)
        self.assertNotIn("PROBLEMS", text)

    def test_fully_null_months_are_listed(self) -> None:
        conn = open_cache(":memory:")
        with conn:
            conn.executemany("INSERT INTO wx_hourly VALUES ('sgt',?,'boundary_layer_height',NULL)", [(T0 + i * H, ) for i in range(48)])
        self.assertIn("Months with no values at all", R.build_report(conn))


if __name__ == "__main__":
    unittest.main()
