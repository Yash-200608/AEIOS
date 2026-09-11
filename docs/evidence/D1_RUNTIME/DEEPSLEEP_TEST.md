# DEEPSLEEP_TEST.md — D1 Supplement

**Date:** 2026-08-02  
**Build:** `CONFIG_AEIOS_TEST_MODE=y`  
**Duration:** 10000 ms (CONFIG_AEIOS_TEST_DEEP_SLEEP_MS)  
**Raw UART:** [`test_mode_uart.txt`](test_mode_uart.txt)

## Procedure

After WDT recovery phase, harness calls `aeios_sleep_deep_ms(10000)` (existing sleep API).

## Evidence (excerpts)

```text
W (613) aeios_test: AEIOS_TEST: entering deep sleep for 10000 ms (timer wake)
...
I (603) aeios_test: AEIOS_TEST: phase=2
W (603) aeios_test: AEIOS_TEST: DEEP SLEEP WAKE (wake=TIMER reset=DEEPSLEEP)
W (613) aeios_test: AEIOS_TEST: TIMER WAKE CONFIRMED
I (623) aeios_test: AEIOS_TEST: config persistence check — see aeios_cfg line above
W (633) aeios_test: AEIOS_TEST: sequence COMPLETE ...
```

| Field | Value |
|-------|--------|
| Wake cause | **TIMER** (`ESP_SLEEP_WAKEUP_TIMER`) |
| Reset reason | **DEEPSLEEP** (`ESP_RST_DEEPSLEEP`) |
| Post-wake boot | Full AEIOS boot markers present |
| Config persistence | `config loaded node=16 gw=2 sample=60s hb=120s` still present |

## Pass / Fail

**PASS**
