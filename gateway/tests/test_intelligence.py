"""Direct unit tests for the deterministic intelligence classes (ADR-017) and the not-fitted sensor profile.

These classes were previously exercised only end to end through the simulator.
"""

from __future__ import annotations

import unittest

import _paths  # noqa: F401

from gateway.contracts import (
    ALL_SENSORS,
    FLAG_BME_FAULT,
    FLAG_PM_FAULT,
    FLAG_SCD_FAULT,
    FLAG_SAMPLE_INVALID,
    MqHeaterState,
    Observation,
    SensorQuality,
)
from gateway.intelligence import (
    BaselineBank,
    ConfidenceEngine,
    EventDetector,
    FeatureExtractor,
    FeatureVector,
    QualityEngine,
)

V0_SENSORS = frozenset({"pms5003", "bme688", "mq135"})


def make_obs(**kw) -> Observation:
    f = dict(
        wire_id=1, display_id="NODE-01", sequence=1, sample_id=1, measurement_time=1000, received_at=1000,
        pm1=5.0, pm25=12.0, pm10=20.0, co2=420.0, temperature=25.0, humidity=50.0, pressure=1013.0,
        bme688_gas_feature=50.0, mq135_raw=1800.0, mq135_index=5.0,
        mq_heater_state=MqHeaterState.MEASURING, mq_warmup_s=100.0,
    )
    f.update(kw)
    return Observation(**f)


class TestQualityEngine(unittest.TestCase):
    def setUp(self) -> None:
        self.q = QualityEngine()

    def test_clean_observation_scores_one_without_flags(self) -> None:
        r = self.q.assess(make_obs())
        self.assertEqual((r.pms, r.scd41, r.bme688, r.mq135), (1.0, 1.0, 1.0, 1.0))
        self.assertEqual(r.flags, [])

    def test_pms_fault_flag_scores_zero(self) -> None:
        r = self.q.assess(make_obs(quality_flags=FLAG_PM_FAULT))
        self.assertEqual(r.pms, 0.0)
        self.assertIn("PMS_FAULT_OR_MISSING", r.flags)

    def test_pm_out_of_range_is_degraded_not_zero(self) -> None:
        r = self.q.assess(make_obs(pm25=1500.0))
        self.assertEqual(r.pms, 0.2)
        self.assertIn("PMS_RANGE", r.flags)

    def test_missing_co2_is_a_fault_when_scd41_is_fitted(self) -> None:
        r = self.q.assess(make_obs(co2=None))
        self.assertEqual(r.scd41, 0.0)
        self.assertIn("SCD41_FAULT_OR_MISSING", r.flags)

    def test_scd41_not_fitted_is_none_and_not_a_fault(self) -> None:
        r = self.q.assess(make_obs(co2=None, installed_sensors=V0_SENSORS))
        self.assertIsNone(r.scd41)
        self.assertNotIn("SCD41_FAULT_OR_MISSING", r.flags)
        self.assertEqual(r.combined(), 1.0)

    def test_mq135_heater_states(self) -> None:
        cases = {
            MqHeaterState.OFF: 0.15, MqHeaterState.COOLING: 0.15, MqHeaterState.WARMING: 0.35,
            MqHeaterState.FAULT: 0.0, MqHeaterState.MEASURING: 1.0,
        }
        for heater, expected in cases.items():
            with self.subTest(heater=heater):
                self.assertEqual(self.q.assess(make_obs(mq_heater_state=heater)).mq135, expected)

    def test_mq135_early_warmup_caps_quality(self) -> None:
        r = self.q.assess(make_obs(mq_warmup_s=5.0))
        self.assertEqual(r.mq135, 0.45)
        self.assertIn("MQ135_WARMUP", r.flags)

    def test_sample_invalid_scales_fitted_sensors_only(self) -> None:
        r = self.q.assess(make_obs(quality_flags=FLAG_SAMPLE_INVALID, installed_sensors=V0_SENSORS))
        self.assertAlmostEqual(r.pms, 0.4)
        self.assertIsNone(r.scd41)
        self.assertIn("SAMPLE_INVALIDATED", r.flags)

    def test_caller_supplied_floor_is_respected(self) -> None:
        r = self.q.assess(make_obs(quality=SensorQuality(pms=0.5, scd41=1.0, bme688=1.0, mq135=1.0)))
        self.assertEqual(r.pms, 0.5)

    def test_default_installed_sensors_is_all_four(self) -> None:
        self.assertEqual(make_obs().installed_sensors, ALL_SENSORS)


class TestBaselineBank(unittest.TestCase):
    def test_unknown_node_gets_documented_defaults(self) -> None:
        snap = BaselineBank().snapshot(7)
        self.assertEqual((snap["pm25"], snap["co2"], snap["mq135_index"]), (12.0, 420.0, 5.0))

    def test_first_update_primes_then_ewma_blends(self) -> None:
        bank = BaselineBank(alpha=0.08)
        bank.snapshot(1)
        bank.update(make_obs(pm25=100.0), freeze=False)
        self.assertEqual(bank.snapshot(1)["pm25"], 100.0)
        bank.update(make_obs(pm25=200.0), freeze=False)
        self.assertAlmostEqual(bank.snapshot(1)["pm25"], 0.92 * 100.0 + 0.08 * 200.0)

    def test_freeze_keeps_baseline_during_events(self) -> None:
        bank = BaselineBank()
        bank.update(make_obs(pm25=50.0), freeze=False)
        bank.update(make_obs(pm25=500.0), freeze=True)
        self.assertEqual(bank.snapshot(1)["pm25"], 50.0)

    def test_mq135_is_primed_only_from_good_quality_readings(self) -> None:
        bank = BaselineBank()
        poor = make_obs(mq135_index=30.0, quality=SensorQuality(mq135=0.35))
        bank.update(poor, freeze=False)
        self.assertFalse(bank.mq_primed(1))
        good = make_obs(mq135_index=30.0, quality=SensorQuality(mq135=0.9))
        bank.update(good, freeze=False)
        self.assertTrue(bank.mq_primed(1))
        self.assertEqual(bank.snapshot(1)["mq135_index"], 30.0)

    def test_mq135_missing_quality_does_not_prime(self) -> None:
        bank = BaselineBank()
        bank.update(make_obs(mq135_index=30.0, quality=SensorQuality(mq135=None)), freeze=False)
        self.assertFalse(bank.mq_primed(1))


class TestFeatureExtractor(unittest.TestCase):
    def test_delta_deviation_and_slope(self) -> None:
        fx = FeatureExtractor()
        base = {"pm25": 10.0, "co2": 400.0, "bme688_gas_feature": 50.0, "mq135_index": 5.0}
        f1 = fx.extract(make_obs(pm25=20.0), base)
        self.assertIsNone(f1.pm25_delta)
        self.assertEqual(f1.pm25_dev, 10.0)
        f2 = fx.extract(make_obs(pm25=26.0), base)
        self.assertEqual(f2.pm25_delta, 6.0)
        self.assertEqual(f2.pm25_slope, 6.0)  # (26 - 20) / (2 - 1)
        self.assertEqual(f2.pm25_dev, 16.0)

    def test_missing_values_give_none_features(self) -> None:
        f = FeatureExtractor().extract(make_obs(co2=None), {"pm25": 10.0})
        self.assertIsNone(f.co2)
        self.assertIsNone(f.co2_dev)
        self.assertIsNone(f.bme_gas_dev)  # no baseline key supplied

    def test_history_is_kept_per_node(self) -> None:
        fx = FeatureExtractor()
        fx.extract(make_obs(wire_id=1, pm25=50.0), {})
        f = fx.extract(make_obs(wire_id=2, pm25=10.0), {})
        self.assertIsNone(f.pm25_delta)


class TestEventDetector(unittest.TestCase):
    BASE = {"pm25": 12.0, "co2": 420.0, "bme688_gas_feature": 50.0, "mq135_index": 5.0}

    def step(self, det, pm25=12.0, **kw):
        obs = make_obs(quality=SensorQuality(), **kw)
        obs.quality = QualityEngine().assess(obs)
        feat = FeatureVector(pm25=pm25, co2=obs.co2, bme_gas=obs.bme688_gas_feature, mq_index=obs.mq135_index)
        return det.step(obs, feat, self.BASE, mq_primed=kw.pop("mq_primed", False))

    def test_persistent_pm_rise_opens_then_closes_an_event(self) -> None:
        det = EventDetector()
        st, _, action = self.step(det, pm25=60.0)
        self.assertEqual((st.status, action), ("CANDIDATE", None))
        st, cb, action = self.step(det, pm25=60.0)
        self.assertEqual((st.status, st.event_type, action), ("CONFIRMED", "PARTICULATE_EVENT", "OPEN"))
        self.assertGreater(cb.environment_event_confidence, 0.0)
        st, _, action = self.step(det, pm25=12.0)
        self.assertEqual((st.status, action), ("RESOLVING", None))
        st, _, action = self.step(det, pm25=12.0)
        self.assertEqual((st.status, action), ("CLEAR", "CLOSE"))

    def test_single_spike_that_does_not_persist_clears(self) -> None:
        det = EventDetector()
        self.step(det, pm25=60.0)
        st, _, action = self.step(det, pm25=12.0)
        self.assertEqual((st.status, action), ("CLEAR", None))

    def test_deviation_below_threshold_is_normal(self) -> None:
        det = EventDetector()
        st, _, _ = self.step(det, pm25=12.0 + 17.0)  # threshold is 2.2 x 8 = 17.6
        self.assertEqual(st.status, "CLEAR")

    def test_detection_is_suppressed_only_when_combined_quality_is_very_low(self) -> None:
        # One or two bad sensors (combined 0.5) do not stop detection...
        det = EventDetector()
        for _ in range(2):
            st, _, _ = self.step(det, pm25=300.0, quality_flags=FLAG_PM_FAULT, mq_heater_state=MqHeaterState.FAULT)
        self.assertEqual(st.status, "CONFIRMED")
        # ...but when every sensor is bad (combined <= 0.2) nothing is detected.
        det = EventDetector()
        all_bad = FLAG_PM_FAULT | FLAG_BME_FAULT | FLAG_SCD_FAULT
        for _ in range(3):
            st, _, action = self.step(det, pm25=300.0, quality_flags=all_bad, mq_heater_state=MqHeaterState.FAULT)
        self.assertEqual(st.status, "CLEAR")
        self.assertIsNone(action)

    def test_mq135_alone_is_a_sensor_anomaly_only_when_primed(self) -> None:
        det = EventDetector()
        obs = make_obs(mq135_index=40.0)
        obs.quality = QualityEngine().assess(obs)
        feat = FeatureVector(pm25=12.0, co2=420.0, bme_gas=50.0, mq_index=40.0)
        etype_unprimed = det.classify(obs, feat, self.BASE, quality_ok=True, mq_primed=False)[0]
        etype_primed = det.classify(obs, feat, self.BASE, quality_ok=True, mq_primed=True)[0]
        self.assertEqual(etype_unprimed, "NORMAL")
        self.assertEqual(etype_primed, "SENSOR_ANOMALY")

    def test_state_is_independent_per_node(self) -> None:
        det = EventDetector()
        self.step(det, pm25=60.0, wire_id=1)
        self.step(det, pm25=60.0, wire_id=1)
        self.assertEqual(det.state(1).status, "CONFIRMED")
        self.assertEqual(det.state(2).status, "CLEAR")


class TestConfidenceEngine(unittest.TestCase):
    def combine(self, quality, features, **kw):
        args = dict(pm_high=False, co2_high=False, bme_high=False, mq_high=False, persist=False)
        args.update(kw)
        return ConfidenceEngine().combine(quality, features, **args)

    def test_three_way_split_sums_to_one(self) -> None:
        cb = self.combine(SensorQuality(), FeatureVector(pm25=60.0, co2=420.0, bme_gas=50.0, mq_index=5.0), pm_high=True, persist=True)
        self.assertAlmostEqual(cb.environment_event_confidence + cb.sensor_fault_confidence + cb.uncertain_confidence, 1.0)
        self.assertEqual(cb.reason, "unimodal persistent deviation")

    def test_cross_modal_persistent_rise_is_environmental(self) -> None:
        cb = self.combine(
            SensorQuality(), FeatureVector(pm25=60.0, co2=700.0, bme_gas=20.0, mq_index=30.0),
            pm_high=True, co2_high=True, bme_high=True, persist=True,
        )
        self.assertEqual(cb.reason, "cross-modal persistent rise")
        self.assertGreater(cb.environment_event_confidence, cb.sensor_fault_confidence)

    def test_single_low_quality_mq135_spike_points_to_a_sensor_fault(self) -> None:
        cb = self.combine(SensorQuality(mq135=0.35), FeatureVector(mq_index=40.0), mq_high=True, persist=True)
        self.assertEqual(cb.reason, "single-sensor MQ135 spike")
        self.assertGreater(cb.sensor_fault_confidence, cb.environment_event_confidence)

    def test_sensors_that_are_not_fitted_are_not_counted_as_missing(self) -> None:
        feats = FeatureVector(pm25=12.0, co2=None, bme_gas=50.0, mq_index=5.0)
        all_fitted_but_co2_absent = self.combine(SensorQuality(), feats)
        v0 = self.combine(SensorQuality(scd41=None), feats)
        self.assertAlmostEqual(all_fitted_but_co2_absent.missing, 0.25)
        self.assertEqual(v0.missing, 0.0)

    def test_sensor_quality_in_breakdown_ignores_unfitted_sensors(self) -> None:
        cb = self.combine(SensorQuality(scd41=None), FeatureVector(pm25=12.0, bme_gas=50.0, mq_index=5.0))
        self.assertEqual(cb.sensor_quality, 1.0)


if __name__ == "__main__":
    unittest.main()
