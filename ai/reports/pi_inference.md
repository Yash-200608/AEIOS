# Pi 5 inference check (Phase 3)

Measured 2026-10-31 on `node-gateway` (Raspberry Pi 5, 4 GB, Python 3.13.5, venv `~/aeios_ai/.venv` with numpy 2.5.4 and
lightgbm 4.7.0 from `ai/requirements-runtime.txt`). Model `pm25_lgbm_cqr/v20261031`. The receiver and uploader run as systemd *user* services and were
running during the test; they were not touched. (An earlier draft of this note said they were inactive: that check used system scope,
not user scope, and was wrong. The memory and latency figures below were measured with them running.) Nothing here involves AEIOS node data.

| check | result |
|---|---|
| artifact verification (sha256 of every model file) + load | 0.13 s |
| prediction parity with the training workstation | 180 cases x 3 quantiles, max abs difference 2.8e-14 ug/m3, 0 mismatches |
| same top TreeSHAP driver as the workstation | 180 / 180 |
| one forecast (3 quantiles + conformal), no explanation | median 0.4 ms, p95 0.7 ms |
| one forecast with TreeSHAP drivers | median 5.1 ms, p95 5.5 ms |
| all five horizons with explanations | 22 ms |
| peak resident memory (python + numpy + lightgbm + 5 horizons x 3 models) | 85 MB |
| free RAM afterwards | about 2.4 GB of 4 GB |

Disk: venv 241 MB (scipy comes in as a lightgbm dependency), model 14 MB. SoC temperature 51 C at the end of the run.

Reproduce: build the package and parity cases on the workstation, copy to `~/aeios_ai`, run `python pi_bench.py` with the
venv interpreter (the script and cases are not tracked; they are generated from `ai.training.dataset` and `ai.inference.engine`).
