# HOST_METRICS.md — HOST_SPRINT_2

**Date:** 2026-08-02  
**Note:** Counts are measured locally; no fabricated coverage %.

## Host tests

| Metric | Value |
|--------|--------|
| CTest executables | 13 |
| CTest result | **13/13 PASS** |
| Python golden | **PASS** |
| Fuzz iterations | 20000 (seed `0xA5105`) |
| Fuzz crashes | 0 |

## LOC (non-blank, non-`//` lines; approximate)

| Tree | Files | LOC ~ |
|------|-------|-------|
| `aeios_amp` | 27 | 1276 |
| `host_mocks` | 6 | 456 |
| `host_tests` | 15 | 1661 |

Source: [`loc_raw.txt`](loc_raw.txt)

## Compiler warnings

Host build uses `-Wall -Wextra -Werror` → **0 warnings** allowed.

## Static analysis findings

| Tool | Local | Notes |
|------|-------|-------|
| cppcheck | NOT RUN | MSI install blocked; CI enforces |
| clang-tidy | Ran | 1 real bug fixed (replay); memset_s noise suppressed |

## Protocol coverage (host)

| Area | Covered |
|------|---------|
| Encode/decode/CRC/MAC | Yes |
| Malformed / version / plen | Yes |
| Type/flag v1 helpers | Yes |
| Replay/dup/stale/window | Yes |
| Routing hysteresis / TTL | Yes |
| Queue overflow / emergency | Yes |
| Retry / timesync | Yes |
| Fuzz parser | Yes |
| Air / LoRa / RF | **HARDWARE REQUIRED** — not simulated |

## Driver coverage (host)

| Driver slot | Lifecycle init→shutdown |
|-------------|-------------------------|
| watchdog, rtc, battery, bme680, scd41, pms5003, lora, gps | **PASS** (skeleton mocks) |
| Real sensor/bus I/O | **HARDWARE REQUIRED** |

## CI status

Workflow present; fails on CTest/golden/cppcheck/format regressions.

## Pass / Fail

**PASS** (host metrics only)
