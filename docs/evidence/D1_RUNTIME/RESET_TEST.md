# RESET_TEST.md — D1 Runtime

**Date:** 2026-08-02  
**Method:** UART RTS reset (esptool-equivalent hard reset via DTR/RTS)  

## Procedure

1. Capture Boot A (20 s)  
2. Reset via RTS  
3. Capture Boot B (20 s)  
4. Compare functional markers  

Script: [`capture_compare.py`](capture_compare.py)  
Console: [`reset_compare_console.txt`](reset_compare_console.txt)

## Results

| Check | Result |
|-------|--------|
| Functional marker identity | **True** |
| Config string A vs B | Identical (`node=16 gw=2 sample=60s hb=120s`) |
| Both reach Boot complete + idle | Yes |
| `reset_reason` | Both logged `1` (`ESP_RST_POWERON` / power-on class; RTS often reports as such on ESP32) |

## Pass / Fail

**PASS** — successive boots functionally identical.
