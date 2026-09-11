# TEST_REPORT.md — HOST_SPRINT_2

**Date:** 2026-08-02  
**Scope:** Host-only; no ESP32 runtime  

## Result

**13/13 CTest PASS** + Python golden **PASS** (`-Wall -Wextra -Werror`)

Raw: [`ctest_raw.txt`](ctest_raw.txt), [`golden_raw.txt`](golden_raw.txt)

## Suites

| Test | Purpose |
|------|---------|
| `test_amp_golden` | CRC/MAC/golden HEARTBEAT |
| `test_amp_malformed` | Parse negatives |
| `test_amp_expanded` | Task 1 expanded matrix (below) |
| `test_amp_fuzz` | Task 2 fuzz |
| `test_amp_replay` | Dup + T_replay |
| `test_amp_routing` | Cost / hysteresis / TTL |
| `test_amp_queue` | SF + emergency policy |
| `test_amp_retry` | Link ACK retry |
| `test_amp_timesync` | TIME_SYNC |
| `test_hal_mock` | Time/WDT/sleep mock |
| `test_hal_bus_mock` | GPIO/UART/I2C/SPI mocks |
| `test_driver_skel` | Single skeleton ops |
| `test_driver_lifecycle` | 8 drivers × lifecycle |

## Task 1 coverage (`test_amp_expanded`)

| Case | Status |
|------|--------|
| Invalid version | PASS |
| Invalid packet type (v1 helper) | PASS |
| Invalid payload length | PASS |
| CRC mismatch | PASS |
| MAC mismatch | PASS |
| Replay window overflow / stale seq | PASS |
| Duplicate sequence | PASS |
| Stale timestamp packet | PASS |
| TTL expiry | PASS |
| Routing hysteresis | PASS |
| Queue overflow | PASS |
| Emergency prioritization | PASS |
| Max / min payload | PASS |
| Malformed frame | PASS |
| Unknown/illegal flags | PASS (encoder strips FRAGMENT/ENCRYPTED; helper rejects raw) |

## Bug found + regression

**Replay:** sequences older than the 32-seq window were incorrectly accepted.  
**Fix:** `replay.c` rejects too-old seq.  
**Regression:** `replay window overflow old reject` in `test_amp_expanded`.

## Pass / Fail

**PASS**
