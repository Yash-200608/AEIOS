# BOOT_SEQUENCE_VALIDATION.md — D1 (Task 5)

**Date:** 2026-08-01  
**Against:** DOC-006 FAS §9 Boot sequence  
**Runtime evidence:** **NOT AVAILABLE** (flash/boot FAIL)

## DOC-006 §9 reference order

```text
Power-on / reset
    → Early init (clock, UART log, TWDT)
    → BSP pin mux
    → Load NVS configuration (defaults if missing)
    → Driver init + self_test (record health bits)
    → AMP init (keys, node_id, seq)
    → LoRa radio init (deployment)
    → Mesh join / listen for ROUTE_ADV + TIME_SYNC
    → Start sensor + power schedules
    → Normal operation loop (tasks)
```

## Source-level D1 implementation order (`main.c`)

| FAS step | D1 runtime intent | Source evidence |
|----------|-------------------|-----------------|
| Early init | IDF + log before app_main body | ESP-IDF boot → `app_main` |
| BSP pin mux | `aeios_bsp_init()` | `main.c` |
| Load NVS | `nvs_flash_init` then config via services | `boot_nvs_flash` + `aeios_services_init` → `aeios_config_init` |
| Driver init + self_test | `aeios_drivers_init_all` + `aeios_drivers_self_test_all` | `main.c` |
| AMP init | Deferred message; codec linked | Log: air TX deferred until D2 LoRa / D3 mesh |
| LoRa radio init | Deferred (D2) | Explicit log; stubs only |
| Mesh join | Deferred (D3) | Explicit log |
| Sensor + power schedules | `aeios_app_start()` FreeRTOS tasks | `aeios_app.c` |
| Normal operation | Boot-complete log + task loops | `main.c` / tasks |

## Runtime comparison

**Cannot confirm.** No UART boot capture ([BOOT_LOG.md](BOOT_LOG.md)).

## Architecture deviation?

| Question | Answer |
|----------|--------|
| Does missing runtime log imply DOC-006 conflict? | **No** — verification gap, not design change |
| Are LoRa/mesh absences an ADR candidate? | **No** — D1 scoped deferral already stated in FAS D1–D4 roadmap / `main.c`; not a silent redesign |
| STOP for ADR? | **No ADR raised** |

When boot log exists, re-run this checklist against captured markers before D1 Accept.

## Verdict

| Check | Result |
|-------|--------|
| Source boot order vs DOC-006 D1 subset | **PASS (static review only)** |
| Runtime boot order vs DOC-006 | **FAIL — not evidenced** |
