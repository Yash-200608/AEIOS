# TEST_MODE.md — AEIOS D1 Verification Harness

**Date:** 2026-08-02  
**Status:** Implemented; **disabled** in production sdkconfig  

## Purpose

Compile-time harness to collect Gate D1 remaining runtime evidence:

1. Intentional Task WDT trip + recovery  
2. Deep sleep (timer wake) + boot after wake  

## Enable / disable

| Mode | How |
|------|-----|
| **Enable** | `CONFIG_AEIOS_TEST_MODE=y` (+ see `sdkconfig.defaults.test`) |
| **Disable (production)** | `# CONFIG_AEIOS_TEST_MODE is not set` (default) |

Kconfig: `firmware/node/main/Kconfig.projbuild`  
Overlay: `firmware/node/sdkconfig.defaults.test`

## Production isolation

| Mechanism | Effect |
|-----------|--------|
| `main.c` call site wrapped in `#if CONFIG_AEIOS_TEST_MODE` | Call **compiled out** when disabled |
| Harness body under `#if CONFIG_AEIOS_TEST_MODE` | Starve/sleep logic absent from production path |
| Default Kconfig `n` | Normal `sdkconfig.defaults` never enables harness |

## Behavior when enabled (startup sequencer)

NVS namespace `aeios_tv` / key `phase`:

| Phase | Action |
|-------|--------|
| 0 | Arm starve task; stop feeding TWDT |
| 1 | After `TASK_WDT` reset → log recovery → deep sleep `AEIOS_TEST_DEEP_SLEEP_MS` (default 10000) |
| 2 | After timer wake → log wake/reset → mark DONE |
| 3 | Idle; restore 30 s TWDT |

## Files

- `main/aeios_test_harness.c` / `.h`  
- `main/Kconfig.projbuild`  
- `sdkconfig.defaults.test`  

## Production confirmation (2026-08-02)

| Check | Result |
|-------|--------|
| `# CONFIG_AEIOS_TEST_MODE is not set` | Yes |
| `CONFIG_ESP_TASK_WDT_TIMEOUT_S=30` | Yes |
| `# CONFIG_ESP_TASK_WDT_PANIC is not set` | Yes |
| Boot log lacks `AEIOS_TEST_MODE ACTIVE` | **PASS** |
| Boot complete + dual-boot identity | **PASS** |
| Prod binary SHA-256 | `3099A33CE7642AF9181B6ACAF604615D0F2AE636DCA25B24ACC5699E5AB39BE9` |
