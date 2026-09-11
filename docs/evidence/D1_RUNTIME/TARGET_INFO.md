# TARGET_INFO.md — D1 Runtime

**Date:** 2026-08-02  
**Port:** COM5  
**USB-UART:** Silicon Labs CP210x USB to UART Bridge  

## Command

```text
python -m esptool --port COM5 chip_id
python -m esptool --port COM5 flash_id
python -m esptool --port COM5 read_mac
```

## Results

| Field | Value |
|-------|--------|
| Chip model | **ESP32-D0WD-V3** (ESP32-WROOM-32 class) |
| Revision | **v3.1** |
| Features | WiFi, BT, Dual Core, 240MHz, VRef calibration in efuse |
| Crystal | 40 MHz |
| Flash size | **4MB** (Manufacturer 68, Device 4016) |
| Flash voltage | 3.3V (strapping) |
| MAC address | **d4:e9:f4:b3:dd:28** |
| Chip ID | N/A on ESP32 (esptool reports MAC instead) |

## Pass / Fail

**PASS** — target reachable on COM5.

Raw: `chip_id_raw.txt`, `flash_id_raw.txt`, `read_mac_raw.txt`
