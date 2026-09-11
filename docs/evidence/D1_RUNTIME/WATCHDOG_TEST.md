# WATCHDOG_TEST.md — D1 Runtime

**Date:** 2026-08-02  

## Requested

Enable watchdog → controlled timeout → capture reset reason + recovery.

## Executed (available without new features)

| Check | Evidence | Result |
|-------|----------|--------|
| WDT driver init | `watchdog driver init` / `init OK` | **PASS** |
| WDT self_test | `drv_wdt: self_test PASS` | **PASS** |
| Tasks subscribe/feed | App tasks call `aeios_hal_wdt_add` / feed | Present in code; idle heartbeats continue |

## Controlled timeout

**NOT EXECUTED**

| Field | Detail |
|-------|--------|
| Root cause | D1 image has no intentional hang / TWDT starve path; verification sprint forbids new features |
| Impact | Cannot capture `ESP_RST_TASK_WDT` (or similar) + recovery boot under this rule set |
| Corrective action | Add a **verification-only** one-shot starve hook in a later approved change; re-run this test |
| Issue ID | **ISSUE-D1-WDT-TRIP-001** |

## Pass / Fail

**PARTIAL** — init/self_test PASS; controlled trip **BLOCKED** (no feature added).
