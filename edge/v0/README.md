# edge/v0 — live field prototype (Raspberry Pi 5 gateway)

Code running on the Pi `node-gateway` today. It is **separate from `gateway/`**, which is the AMP v1 target
implementation. v0 uses ASCII CSV LoRa packets and BME680 + GPS, with no SCD41; see ADR-018.

Packet: `node,boot,time,temp,rh,pressure,gas_kohm,pm1,pm2_5,pm10,mq_mV[,lat,lon,fix,sats]`

| File | systemd unit | Purpose |
|---|---|---|
| `receiver.py` | `aeios-receiver` | SX1278 (433 MHz, SF7, BW125, sync 0x12) over SPI; validates each packet (`valid_packet`), stores real packets in `gateway.db` via `gwdb.py` |
| `ml/live.py`, `ml/online_model.py` | `aeios-model` | Online ridge forecaster (PM2.5/PM10 at 5, 15, 30 min) and robust-z anomaly flags; tables `predictions`, `anomalies` |
| `dashboard.py` | `aeios-dashboard` | Local stdlib web dashboard on :8080 |
| `uploader.py` | `aeios-uploader` | Cursor-based upload of `packets`, `predictions`, `anomalies`, `smoke_alerts` to the cloud `ingest` function; only real (`lora`) data; offline queue; idempotent |
| `smoke_watch.py` | `aeios-smoke` | Wind back-trajectories × NASA FIRMS fires × local PM2.5 → WATCH/WARNING in `smoke_alerts`; cached, works offline |
| `simulate.py`, `lora_diag.py`, `ml/synth.py`, `ml/train.py` | — | Fake packets, radio diagnostic, synthetic data and training helpers |

Units use `EnvironmentFile=%h/.config/aeios/uploader.env` (and optional `smoke.env`). These files hold the cloud
ingest URL and device token, are never committed, and are created by `deployment/pi/install.sh`.

Everything here is standard library + numpy. Install and update: `deployment/pi/install.sh`.
Tests: `python3 -m unittest -v edge/v0/ml/test_ml.py` (from `edge/v0/ml`).
