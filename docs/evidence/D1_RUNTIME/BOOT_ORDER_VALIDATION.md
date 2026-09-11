# BOOT_ORDER_VALIDATION.md — vs DOC-006 §9

**Date:** 2026-08-02  

## DOC-006 §9 (reference)

```text
Power-on / reset
  → Early init (clock, UART log, TWDT)
  → BSP pin mux
  → Load NVS configuration (defaults if missing)
  → Driver init + self_test
  → AMP init … → LoRa … → Mesh …   (deployment; D1 deferred)
  → Start sensor + power schedules
  → Normal operation
```

## Runtime order (observed)

| # | Observed | Matches DOC-006 D1 |
|---|----------|--------------------|
| 1 | Bootloader / UART / app_main | Early init | Yes |
| 2 | `nvs_flash_init` → `NVS flash OK` | NVS subsystem ready | Yes (prerequisite) |
| 3 | BSP pin mux / `BSP OK` | BSP | Yes |
| 4 | HAL OK | HAL (FAS platform) | Yes |
| 5 | Log + **config loaded** (NVS keys) | Load NVS configuration | Yes |
| 6 | Driver init + self_test | Drivers | Yes |
| 7 | AMP air deferred (log only) | D1 deferral | Yes (intentional) |
| 8 | FreeRTOS tasks + boot complete | Schedules / normal op | Yes |

## Deviations

**None requiring STOP / ADR.**

Clarification only: `nvs_flash_init` runs before BSP (ESP-IDF requirement before `nvs_open`). Logical **configuration load** (`aeios_cfg`) occurs after BSP/HAL inside services — consistent with FAS “Load NVS configuration”.

LoRa / mesh join not present — D1 skeleton scope (logged).

## Verdict

**PASS** — runtime boot order matches DOC-006 D1 subset.
