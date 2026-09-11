# Evidence: Driver Skeletons

**Date:** 2026-08-01  

## Device firmware

`firmware/node/components/aeios_drivers/stubs/driver_stubs.c` — state machine (UNINIT/READY/SLEEP) for bme680, scd41, pms5003, battery, lora, gps.

- Uses frozen `aeios_driver_ops_t` (ADR-008 shutdown included).
- **No sensor/bus communication** (`read` returns `-2`).
- Health: `AEIOS_HEALTH_NOT_READY`.

## Host skeleton

`firmware/host_mocks/drivers/driver_skel.c` — same ops contract, unit-tested.

## Test

`test_driver_skel` — **PASS**

## Pass / Fail

**PASS** (skeletons only; D2 HW bring-up still blocked)
