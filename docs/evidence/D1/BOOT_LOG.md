# BOOT_LOG.md — D1

**Date:** 2026-08-01  
**Sprint:** 1B — Gate D1 close (verification only)  
**Status:** **FAIL / NOT RUN**  

## Objective

Capture complete UART boot log and verify DOC-006 boot stages at runtime.

## Commands executed

```text
idf.py monitor
```

**Not executed** — blocked by flash failure ([FLASH_LOG.md](FLASH_LOG.md)).

Per Sprint 1B rule: after flash failure, **STOP**. No fabricated boot log.

## Runtime checklist (unverified)

| Stage | Expected log marker | Result |
|-------|---------------------|--------|
| Bootloader executes | IDF bootloader banner | **NOT CAPTURED** |
| Partition table found | partition table load | **NOT CAPTURED** |
| Application starts | `==== AEIOS Sentinel boot (DOC-006) ====` | **NOT CAPTURED** |
| NVS initialized | `NVS flash OK` | **NOT CAPTURED** |
| BSP initialized | `BSP OK hw_rev=...` | **NOT CAPTURED** |
| HAL initialized | `HAL OK` | **NOT CAPTURED** |
| Logging initialized | (via SERVICES / log service) | **NOT CAPTURED** |
| Services initialized | `SERVICES OK` | **NOT CAPTURED** |
| Driver registration | `DRIVERS init OK` / per-driver init | **NOT CAPTURED** |
| Watchdog self-test | `SELF-TEST OK (wdt+rtc)` | **NOT CAPTURED** |
| RTC self-test | same | **NOT CAPTURED** |
| Scheduler start | `starting FreeRTOS tasks (DOC-006)` | **NOT CAPTURED** |
| Application idle / normal | `==== Boot complete — normal operation (D1 skeleton) ====` | **NOT CAPTURED** |

## Expected markers (source: `firmware/node/main/main.c` — for re-test)

```text
==== AEIOS Sentinel boot (DOC-006) ====
NVS flash OK
BSP OK hw_rev=HW-NODE-r1
HAL OK
SERVICES OK
DRIVERS init OK
SELF-TEST OK (wdt+rtc)
==== Boot complete — normal operation (D1 skeleton) ====
```

## Root cause

Depends on successful flash. No ESP32 on serial bus.

## Corrective action

Connect hardware → `idf.py -p COMx flash monitor` → paste full UART transcript into this file (and `boot_raw.txt`).

## Re-test result

Pending.

## Pass / Fail

**FAIL**
