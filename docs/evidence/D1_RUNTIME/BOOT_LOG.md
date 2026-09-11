# BOOT_LOG.md — D1 Runtime

**Date:** 2026-08-02  
**Port:** COM5 @ 115200  
**Capture:** RTS reset + 20–28 s UART (complete first boot through idle diag heartbeat)  

Raw (ANSI retained): [`boot_raw.txt`](boot_raw.txt), [`boot_A.txt`](boot_A.txt)

## Checklist

| Stage | Evidence | Result |
|-------|----------|--------|
| Bootloader | `boot.esp32`, SPI 40MHz DIO | **PASS** |
| Partition table | nvs / phy_init / factory listed | **PASS** |
| Application start | `Calling app_main()`, `aeios_node` | **PASS** |
| NVS initialized | `NVS flash OK` | **PASS** |
| BSP initialized | `BSP OK hw_rev=HW-NODE-r1` | **PASS** |
| HAL initialized | `HAL OK` | **PASS** |
| Logging initialized | `logging service ready` | **PASS** |
| Services / driver manager | `SERVICES OK`, `DRIVERS init OK` | **PASS** |
| Watchdog initialized | `watchdog driver init` + `self_test PASS` | **PASS** |
| RTC initialized | `rtc driver init` + `self_test PASS` | **PASS** |
| Scheduler start | `starting FreeRTOS tasks (DOC-006)` | **PASS** |
| Idle / normal | `Boot complete`, `Returned from app_main()`, diag heartbeat | **PASS** |

## Excerpt (application path)

```text
I (327) aeios_boot: ==== AEIOS Sentinel boot (DOC-006) ====
I (327) aeios_boot: reset_reason=1
I (347) aeios_boot: NVS flash OK
I (367) aeios_boot: BSP OK hw_rev=HW-NODE-r1
I (377) aeios_boot: HAL OK
I (377) aeios_log: logging service ready (level=INFO default)
I (387) aeios_cfg: config loaded node=16 gw=2 sample=60s hb=120s
I (397) aeios_boot: SERVICES OK
I (407) drv_wdt: watchdog driver init
I (407) drv_rtc: rtc driver init (HAL-backed)
I (477) aeios_boot: DRIVERS init OK
I (527) aeios_boot: SELF-TEST OK (wdt+rtc)
I (547) aeios_app: starting FreeRTOS tasks (DOC-006)
I (557) aeios_boot: ==== Boot complete — normal operation (D1 skeleton) ====
I (567) main_task: Returned from app_main()
I (15557) aeios_app: diag heartbeat uptime_ms=15262 ...
```

## Pass / Fail

**PASS**
