# Evidence: Host Protocol Test Suite

**Date:** 2026-08-01  
**Command:** `ctest --test-dir firmware/host_tests/build --output-on-failure`  
**Raw:** [ctest_raw.txt](../HOST/ctest_raw.txt)

## Suites

| Test | Coverage |
|------|----------|
| `test_amp_golden` | CRC/MAC/golden HEARTBEAT |
| `test_amp_malformed` | bad magic/version/CRC/MAC/len |
| `test_amp_replay` | duplicates + T_replay |
| `test_amp_routing` | cost, hysteresis, stale, TTL forward |
| `test_amp_queue` | FIFO, EMERGENCY vs SENSOR drop policy |
| `test_amp_retry` | ACK success, 3-attempt fail, SF policy |
| `test_amp_timesync` | pack/apply/reject |
| `test_hal_mock` | HAL desktop mock |
| `test_driver_skel` | driver ops skeleton |
| `golden_ref.py` | Python reference |

## Result

**9/9 CTest PASS** + Python golden **PASS**

## Regression policy

CI workflow `.github/workflows/host-tests.yml` fails the job if any CTest or Python golden fails.
