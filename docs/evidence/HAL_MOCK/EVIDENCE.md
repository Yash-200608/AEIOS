# Evidence: HAL Desktop Mock

**Date:** 2026-08-01  
**Path:** `firmware/host_mocks/hal/` + `include/aeios_hal_host.h`

## Intent

Mirror DOC-006 HAL semantics for host tests **without** modifying firmware `aeios_hal.h` (still ESP-IDF-bound) and **without** simulating ESP32 boot evidence.

## API covered

init, uptime (virtual), unix time set/get, WDT add/feed counters, light sleep (clock advance), deep sleep mock (flag + clock; process continues).

## Test

`test_hal_mock` — **PASS**

## Pass / Fail

**PASS**
