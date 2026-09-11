# SIZE_REPORT.md — D1

**Date:** 2026-08-01  
**Command:** `idf.py size` / `idf.py size-components`  
**Status:** **PASS**  

## Binary artifacts

| File | Size (bytes) |
|------|----------------|
| `build/aeios_node.bin` | 210528 |
| `build/aeios_node.elf` | 3422624 |
| `build/bootloader/bootloader.bin` | 26752 |

App partition: `0x33660` used of `0x100000` (**80% free**).  
Bootloader: `0x6880` used, `0x780` (7%) free in slot.

## Memory Type Usage Summary (`idf.py size`)

| Memory Type | Used [bytes] | Used [%] | Remain [bytes] | Total [bytes] |
|-------------|--------------|----------|----------------|---------------|
| Flash Code (.text) | 103370 | — | — | — |
| IRAM | 54046 | 41.23 | 77026 | 131072 |
| Flash Data | 43656 | — | — | — |
| DRAM | 11668 | 6.46 | 169068 | 180736 |
| RTC SLOW | 24 | 0.29 | 8168 | 8192 |

**Total image size:** 210412 bytes (bin may be padded larger)

Raw: `size_raw.txt`, `size_components_raw.txt`

## Pass / Fail

**PASS**
