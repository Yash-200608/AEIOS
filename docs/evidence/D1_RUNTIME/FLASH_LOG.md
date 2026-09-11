# FLASH_LOG.md — D1 Runtime

**Date:** 2026-08-02  
**Command:** `idf.py -p COM5 flash` (via IDF Python venv)  
**Baud:** 460800 (esptool write); monitor 115200  

## Result

**PASS**

```text
esptool.py --chip esp32 -p COM5 -b 460800 --before=default_reset --after=hard_reset write_flash
  --flash_mode dio --flash_freq 40m --flash_size 2MB
  0x1000 bootloader.bin
  0x10000 aeios_node.bin
  0x8000 partition-table.bin
...
Hash of data verified. (bootloader, app, partition table)
Hard resetting via RTS pin...
Done
```

| Item | Value |
|------|--------|
| Port | COM5 |
| Chip | ESP32-D0WD-V3 rev v3.1 |
| App size written | 211312 bytes |
| Exit code | 0 |

## Warnings

- Image header flash size **2MB**; chip detects **4MB** (also seen at boot). Non-fatal; uses header size.

Raw: [`flash_raw.txt`](flash_raw.txt)
