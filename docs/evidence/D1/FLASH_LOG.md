# FLASH_LOG.md — D1

**Date:** 2026-08-01  
**Sprint:** 1B — Gate D1 close (verification only)  
**Status:** **FAIL**  

## Flash command

```powershell
cd C:\Users\Hp\OneDrive\Desktop\AEIOS\firmware\node
. C:\Users\Hp\esp\esp-idf\export.ps1
idf.py flash
```

Equivalent explicit invoke used:

```text
python C:\Users\Hp\.espressif\python_env\idf5.3_py3.12_env\Scripts\python.exe
  C:\Users\Hp\esp\esp-idf\tools\idf.py flash
```

## Port / baud

| Item | Value |
|------|--------|
| Ports probed by esptool | **COM3**, then **COM1** |
| COM3 identity | Intel(R) AMT SOL (not ESP32) |
| COM1 identity | ACPI Communications Port (motherboard UART, not ESP32) |
| USB-UART / CP210x / CH340 / FTDI ESP32 | **Not present** |
| Monitor/console baud (sdkconfig) | **115200** (`CONFIG_ESPTOOLPY_MONITOR_BAUD`) |
| Flash mode (sdkconfig) | DIO |

## Flash output (verbatim excerpt)

Raw capture: [`flash_raw.txt`](flash_raw.txt)

```text
Executing action: flash
Serial port COM3
Connecting...
Failed to get PID of a device on COM3, using standard reset sequence.
....................
COM3 failed to connect: Failed to connect to Espressif device: No serial data received.

Serial port COM1
Connecting...
Failed to get PID of a device on COM1, using standard reset sequence.
....................
COM1 failed to connect: Failed to connect to Espressif device: No serial data received.

No serial ports found. Connect a device, or use '-p PORT' option to set a specific port.
```

Exit code: **2**

## Programming result

**FAIL** — no Espressif device connected; programming did not occur.

## Warnings

- esptool auto-selected non-ESP ports (AMT SOL / motherboard COM).
- No PID on either port; standard reset sequence used and failed.

## Root cause

No ESP32 node hardware with USB-serial bridge is attached to this workstation. Available serial devices are not Espressif targets.

## Corrective action

1. Connect AEIOS ESP32 node via USB (CP2102 / CH340 / native USB-UART).
2. Confirm a new COM port appears (Device Manager / `Get-CimInstance Win32_SerialPort`).
3. Re-run: `idf.py -p COMx flash` (and then monitor).
4. Do **not** flash COM1 or COM3 (AMT/motherboard).

## Re-test

**Pending hardware.** Per Sprint 1B rules: STOP after flash failure — no code changes attempted.

## Pass / Fail

**FAIL**
