# FINAL_RUNTIME_REPORT.md — Gate D1

**Date:** 2026-08-02  
**Target:** ESP32-D0WD-V3 @ COM5 (CP2102), MAC d4:e9:f4:b3:dd:28  
**Rules:** Verification only; no architecture/protocol/feature changes  

---

## Summary matrix

| Step | Item | Result |
|------|------|--------|
| 1 | Target COM5 / chip_id | **PASS** |
| 2 | Flash | **PASS** |
| 3 | Complete boot UART | **PASS** |
| 4 | Boot vs DOC-006 | **PASS** |
| 5 | NVS persistence | **PASS** (via `aeios_cfg`; literal `AEIOS_TEST_KEY` N/A) |
| 6 | Software/RTS reset compare | **PASS** |
| 7 | Controlled WDT timeout | **NOT EXECUTED** — ISSUE-D1-WDT-TRIP-001 |
| 8 | Deep sleep 10 s | **NOT EXECUTED** — ISSUE-D1-DEEPSLEEP-001 |

## Defects fixed this sprint

None (no runtime defects requiring code change discovered on boot/flash path).

## Known non-blocking warning

Flash image header 2MB vs physical 4MB — warning only.

## Gate recommendation

**Not ready for unconditional Chief Systems Accept** until WDT trip and deep-sleep cycle evidence exist **or** Chief Systems formally waives those items as out of D1 scope.

Core D1 platform bring-up (flash, boot order, NVS cfg persistence, reset stability, WDT/RTC self_test) is **objectively evidenced**.

## Do not start D2

Confirmed — remaining gaps are verification hooks, not driver bring-up.

## Package

| File | Status |
|------|--------|
| TARGET_INFO.md | Done |
| FLASH_LOG.md | Done |
| BOOT_LOG.md | Done |
| BOOT_ORDER_VALIDATION.md | Done |
| NVS_TEST.md | Done |
| RESET_TEST.md | Done |
| WATCHDOG_TEST.md | Partial |
| SLEEP_TEST.md | Partial |
| FINAL_RUNTIME_REPORT.md | This file |
