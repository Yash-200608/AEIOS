# Compile Fix Log — Clean Build Sprint

**Role:** Lead Firmware Engineer  
**Date:** 2026-08-01  
**Goal:** Zero compiler errors; clean `aeios_node` binary  

---

## Error 1 (only error encountered)

| Field | Value |
|-------|-------|
| **File** | `firmware/node/components/aeios_drivers/aeios_drivers.c` |
| **Line** | 41 (also 69) |
| **Compiler message** | `error: 'NULL' undeclared (first use in this function)` — note: defined in `<stddef.h>` |
| **Root cause** | Used `NULL` without including `<stddef.h>` |
| **Fix** | Added `#include <stddef.h>` after existing includes. No interface/API change. |
| **Rebuild result** | **PASS** — `Project build complete.` |

---

## Build success

```text
Generated .../build/aeios_node.bin
aeios_node.bin binary size 0x33660 bytes. Smallest app partition is 0x100000 bytes. 0xcc9a0 bytes (80%) free.
Project build complete.
```

Artifacts:

- `firmware/node/build/aeios_node.elf`
- `firmware/node/build/aeios_node.bin`
- `firmware/node/build/bootloader/bootloader.bin`

---

## Architectural deviations

**None.** No controlled interfaces changed. No ADR required.
