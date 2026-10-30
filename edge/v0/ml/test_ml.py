#!/usr/bin/env python3
"""Tests for the gateway ML code. All data here is SYNTHETIC. Run: python3 -m unittest -v test_ml"""
import math, os, tempfile, unittest
import numpy as np
import synth
from online_model import Forecaster, Ridge, parse_packet, FEATURES, STEP_S

PKT = "N1,5,2026-10-27T10:00:00,27.4,51,991,52.3,20,31,44,712,0.000000,0.000000,0,0"

def feed(fc, rows, src="synthetic"):
    outs = []
    for rx, raw, _, _ in rows: outs.append(fc.step(parse_packet(raw), rx, src))
    return outs

class TestParse(unittest.TestCase):
    def test_good_packet(self):
        r = parse_packet(PKT)
        self.assertEqual((r["node"], r["pm2_5"], r["mq_mv"]), ("N1", 31.0, 712.0))
    def test_firmware_sentinels(self):
        r = parse_packet("N2,1,2026-10-27T10:00:00,nan,nan,nan,nan,-1,-1,-1,2001,0.000000,0.000000,0,3")
        self.assertTrue(all(math.isnan(r[k]) for k in ("temp", "rh", "pressure", "gas_kohm", "pm1", "pm2_5", "pm10")))
        self.assertEqual(r["mq_mv"], 2001.0)
    def test_malformed(self):
        for bad in ("", "N1,1,2", "garbage", ",1,2,3,4,5,6,7,8,9,10", "N1," + "9" * 300):
            self.assertIsNone(parse_packet(bad), bad)
    def test_out_of_range_is_missing(self):
        self.assertTrue(math.isnan(parse_packet(PKT.replace(",991,", ",5000,"))["pressure"]))

class TestRidge(unittest.TestCase):
    def test_learns_known_relation(self):
        rng = np.random.default_rng(0); w = rng.normal(size=5); m = Ridge(5, lam=1.0, alpha=0.01)
        for _ in range(3000):
            x = rng.normal(size=5); m.update(x, float(x @ w))
        np.testing.assert_allclose(m.weights(), w, atol=1e-3)

class TestForecaster(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.rows, cls.log = synth.generate(days=10, seed=3, t0=1790000000)
    def test_synthetic_is_deterministic_and_sane(self):
        rows2, _ = synth.generate(days=10, seed=3, t0=1790000000)
        self.assertEqual(self.rows, rows2)
        for _, raw, _, _ in self.rows:
            r = parse_packet(raw)
            if not math.isnan(r["pm2_5"]): self.assertTrue(r["pm1"] <= r["pm2_5"] <= r["pm10"], raw)
    def test_untrained_model_is_persistence(self):
        out = Forecaster().step(parse_packet(PKT), 1790000000.0)
        self.assertEqual(len(out["predictions"]), 6)
        for p in out["predictions"]: self.assertAlmostEqual(p["p50"], p["now"], places=9)
    def test_unknown_node_and_duplicate_skipped(self):
        fc = Forecaster()
        self.assertIsNotNone(fc.step(parse_packet(PKT.replace("N1", "N9", 1)), 1e9)["skipped"])
        self.assertIsNone(fc.step(parse_packet(PKT), 1e9)["skipped"])
        self.assertIsNotNone(fc.step(parse_packet(PKT), 1e9 + 10)["skipped"])
    def test_gap_is_recorded_as_missing(self):
        fc = Forecaster(); fc.step(parse_packet(PKT), 1e9); fc.step(parse_packet(PKT), 1e9 + 4 * STEP_S)
        self.assertEqual(sum(math.isnan(v) for v in fc.hist["N1"]["pm2_5"]), 3)
    def test_clock_jump_back_resets_history(self):
        fc = Forecaster()
        for i in range(5): fc.step(parse_packet(PKT), 1e9 + i * STEP_S)
        self.assertIsNone(fc.step(parse_packet(PKT), 1e9 - 86400)["skipped"])
        self.assertEqual(len(fc.hist["N1"]["t"]), 1)
    def test_no_pm_reading_no_forecast(self):
        r = parse_packet(PKT.replace(",20,31,44,", ",-1,-1,-1,"))
        self.assertEqual(Forecaster().step(r, 1e9)["predictions"], [])
    def test_save_load_roundtrip_and_tamper(self):
        fc = Forecaster(); feed(fc, self.rows[:800])
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "s.json"); fc.save(p); fc2 = Forecaster.load(p)
            a, b = feed(fc, self.rows[800:900]), feed(fc2, self.rows[800:900])
            self.assertEqual([o["predictions"] for o in a], [o["predictions"] for o in b])
            with open(p, "ab") as f: f.write(b" ")
            with self.assertRaises(ValueError): Forecaster.load(p)
    def test_learns_on_synthetic_data(self):
        """SYNTHETIC sanity check only: after 10 days the 30-minute PM2.5 model should beat persistence here."""
        fc = Forecaster(); feed(fc, self.rows)
        s = {(r["node"], r["target"], r["horizon_min"]): r for r in fc.summary()}
        for n in ("N1", "N2"):
            self.assertGreater(s[(n, "pm2_5", 30)]["skill"], 0.0)
            self.assertGreater(s[(n, "pm2_5", 30)]["scored"], 2000)
    def test_one_flag_per_episode(self):
        fc = Forecaster(); t = 1e9; flags = []
        for i in range(120):                                   # 10 h: calm, a 1 h spike, calm again
            pm = 300 if 60 <= i < 72 else 30 + (i % 3)
            flags += [a for a in fc.step(parse_packet(PKT.replace(",20,31,44,", f",{pm - 10},{pm},{pm + 10},")), t + i * STEP_S)["anomalies"]
                      if a["signal"] == "pm2_5"]
        self.assertEqual(len(flags), 1)
    def test_feature_vector_size(self):
        fc = Forecaster(); feed(fc, self.rows[:100])
        self.assertTrue(all(len(p["x"]) == len(FEATURES) for p in fc.pending))

if __name__ == "__main__":
    unittest.main()
