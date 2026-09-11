# AEIOS Firmware Coding Standards

**Document ID:** STD-FW-001  
**Version:** 1.0  
**Status:** Frozen — Gate D  
**Date:** 2026-08-01  
**Parent:** DOC-006 FAS  

These rules are **configuration-controlled**. Exceptions require written justification in the PR and, if architectural, an ADR.

---

## Rule 1 — Layer isolation

Higher layers MUST NOT call ESP-IDF (or RadioLib) directly.

```text
Application
    → Services
        → Drivers
            → HAL / BSP
                → ESP-IDF / vendor libs
```

- `aeios_amp` remains **pure C** (no ESP headers) so host tests stay valid.  
- LoRa radio driver may use SPI HAL; AMP codec must not.

**Check:** `#include "esp_*.h"` only under `aeios_bsp`, `aeios_hal`, `aeios_drivers` (bus), `main` bootstrap — not in `aeios_amp` or application policy logic.

---

## Rule 2 — Static allocation first

Avoid `malloc` / `free` / Newlib heap during **normal deployment operation**.

Use:

- Static buffers  
- Fixed-size FreeRTOS queues (static create where possible)  
- Ring buffers with compile-time capacity  

Heap MAY appear only in maintenance/diagnostics paths behind explicit guards — never on the SENSOR_DATA TX hot path.

---

## Rule 3 — Interface ownership

Each module exposes:

1. **Public API** (`include/…`)  
2. **Internal implementation** (`.c` not included elsewhere)  
3. **Tests** (host, Unity, or VT catalog entry)  

No module reads another module’s static/file-scope state. Cross-module data passes through APIs or DOC-005 frames.

---

## Rule 4 — Every bug gets a test

A defect fix that ships without a regression test is incomplete.

- Protocol/codec bugs → host golden / VT-AMP-*  
- Driver bugs → Unity or HW IT entry  
- Link VT ID or test name in the commit/PR body  

---

## Rule 5 — No untested code enters main

Restated from [GOV-EXEC-001](../governance/ENGINEERING_EXECUTION.md): every merge includes implementation + test + objective evidence. Manual-only “I tried it” is not sufficient sole evidence.

PR template: [PR_EVIDENCE_CHECKLIST.md](../governance/PR_EVIDENCE_CHECKLIST.md).

| Topic | Standard |
|-------|----------|
| Language | C11 for firmware; no Arduino |
| Naming | `aeios_<module>_` prefix for public symbols |
| Logging | `ESP_LOGx` with module TAG; never log `K_net` |
| Errors | `0` / `ESP_OK` success; negative or `esp_err_t` failure |
| Endianness | Little-endian on wire (DOC-005); use explicit pack helpers |
| Comments | Why, not what; cite DOC/ADR IDs for non-obvious constraints |

---

## Bring-up order (frozen guidance)

### Drivers (D2)

1. RTC / HAL  
2. Battery monitor  
3. BME680  
4. SCD41  
5. PMS5003  
6. LoRa (RFM95W/SX1276)  
7. GPS (install mode only)  

### AMP (D3)

1. Frame encoder/decoder  
2. CRC  
3. HMAC/MAC  
4. Parser  
5. Sequence management  
6. Queue management  
7. Link ACK  
8. Retry logic  
9. Store-and-forward  
10. Routing  

Do not skip ahead to routing before queue + Link ACK are verified.
