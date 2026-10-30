# Gateway ML (basic online forecaster)

Lives in `~/gateway/ml` on the Pi. Needs only Python 3 and numpy, both already installed. No sudo needed.

**All training so far is on SYNTHETIC data.** `synth.py` invents readings that behave roughly like the two
nodes (same packet format, sentinels and faults). Results on it show the pipeline works, not how well it
predicts real air.

## What it does
- For each node, PM2.5 and PM10, it forecasts 5, 15 and 30 min ahead, with an 80 % band.
- One small ridge regression per node, target and horizon (12 in total) predicts the change from the current value in log space.
- Untrained, it predicts "same as now" (persistence). It improves only as far as the data supports.
- It keeps learning after every packet: each forecast is checked when the real value arrives, and the model is updated.
- It also flags unusual readings: a reading far from that signal's own last 24 h (robust z-score). Each episode is reported once.

## Files
| File | Purpose |
|---|---|
| `synth.py` | SYNTHETIC data: a history CSV, or a live stream into a separate database |
| `online_model.py` | Packet parser, features, the online model, unusual-reading flags, save and load (with checksum) |
| `train.py` | Feeds a CSV through the model and prints a week-by-week error report against persistence |
| `live.py` | Follows the `packets` table, then writes `predictions` and `anomalies` tables |
| `test_ml.py` | 15 tests: `python3 -m unittest -v test_ml` |

## Commands
```
cd ~/gateway/ml
python3 synth.py --days 28 --out synthetic.csv     # SYNTHETIC history ending now
python3 train.py synthetic.csv --reset             # train from scratch, saves model_state.json
python3 synth.py --live --db demo.db --every 2 &   # SYNTHETIC packets, one 5-min step every 2 s
python3 live.py --db demo.db --sources synthetic   # live forecasts on that stream (Ctrl+C to stop)
```

## Dashboard
`../dashboard.py` now shows the latest forecasts and unusual readings as well as packets (the original is kept as `dashboard.py.orig`).
```
cd ~/gateway && python3 dashboard.py                                  # real data, http://PI-IP:8080
cd ~/gateway && python3 dashboard.py --db ml/demo.db --port 8081      # SYNTHETIC demo, http://PI-IP:8081
pkill -f "synth.py --live"; pkill -f live.py; pkill -f "dashboard.py --db ml/demo.db"   # stop the demo
```

## Runs by itself at every power-on
Three user services (no sudo; the user has `Linger=yes`, so they start at boot without a login):

| Service | Runs | Log |
|---|---|---|
| `aeios-receiver` | `receiver.py`: LoRa packets into `gateway.db` (source `lora`) | `~/gateway/logs/receiver.log` |
| `aeios-model` | `live.py --sources lora`: forecasts and learns from real packets only | `~/gateway/logs/model.log` |
| `aeios-dashboard` | `dashboard.py` on port 8080 | `~/gateway/logs/dashboard.log` |

Unit files are in `~/.config/systemd/user/`. Each restarts automatically if it crashes.
```
systemctl --user status aeios-receiver aeios-model aeios-dashboard
systemctl --user restart aeios-model          # or stop / start / disable
tail -f ~/gateway/logs/receiver.log
```
The synthetic-trained state was moved to `model_state.synthetic.json`; the service started a fresh `model_state.json`.
`receiver.py` now puts the SX1278 in standby before receive and uses the low-frequency port settings (the original is `receiver.py.orig`).

## When real packets arrive
```
mv model_state.json model_state.synthetic.json; mv model_state.json.sha256 model_state.synthetic.json.sha256
python3 live.py                                    # learns from source 'lora' in ../gateway.db only
```
It starts as persistence and needs about a week of real packets before its forecasts mean anything.
The synthetic stream refuses to write into `gateway.db`, so real data is never mixed with invented data.
