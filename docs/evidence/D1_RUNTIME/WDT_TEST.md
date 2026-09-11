# WDT_TEST.md — D1 Supplement

**Date:** 2026-08-02  
**Build:** `CONFIG_AEIOS_TEST_MODE=y`  
**Raw UART:** [`test_mode_uart.txt`](test_mode_uart.txt)

## Procedure

1. Erase NVS (`0x9000`, 24 KB) for clean phase=0  
2. Flash test-mode firmware  
3. Capture ≥50 s UART  

## Evidence (excerpts)

```text
W (603) aeios_test: AEIOS_TEST: arming WDT trip
W (623) aeios_test: AEIOS_TEST: STOPPING WDT feed — expect TASK_WDT reset
...
I (603) aeios_test: AEIOS_TEST: phase=1
W (603) aeios_test: AEIOS_TEST: WDT RECOVERY OK (reset=TASK_WDT)
```

| Field | Value |
|-------|--------|
| Trip method | Dedicated task subscribed to TWDT; feed stopped |
| Reset reason | **TASK_WDT** (`ESP_RST_TASK_WDT` / 6) |
| Recovery | Full DOC-006 boot sequence resumed; harness logged `WDT RECOVERY OK` |

## Automated checks

`STOPPING WDT feed` = True · `WDT RECOVERY OK` = True · `TASK_WDT` = True · **ALL_OK=True**

## Pass / Fail

**PASS**
