# AEIOS Toolchain Verification Report

**Role:** Build Infrastructure Engineer  
**Date:** 2026-08-01  
**Workstation:** Windows (`C:\Users\Hp`)  
**Scope:** Install/verify toolchain only — **no firmware source modifications**  

---

## 1. Installation summary

| Component | Action | Result |
|-----------|--------|--------|
| Git | Already present | PASS |
| CMake (winget Kitware 4.4.1) | Installed system-wide | PASS (IDF uses bundled 3.30.2) |
| Ninja (winget) | Installed | PASS (IDF uses bundled 1.12.1) |
| Espressif EIM-CLI (winget) | Hash mismatch — **skipped** | FAIL install; workaround used |
| ESP-IDF v5.3.2 | `git clone` → `%USERPROFILE%\esp\esp-idf` | PASS |
| ESP-IDF tools (`install.bat esp32`) | First attempt failed (Hermes venv); retry with system Python | PASS |
| IDF Python venv | `%USERPROFILE%\.espressif\python_env\idf5.3_py3.12_env` | PASS |
| Xtensa GCC / GDB / OpenOCD | Via `install.bat` | PASS |

### Installation notes

1. **Do not run `install.bat` from a non-IDF virtualenv** (e.g. Hermes agent venv). Error observed:  
   `ERROR: This script was called from a virtual environment, can not create a virtual environment again`  
2. Clear `VIRTUAL_ENV` and use system Python 3.12, then:  
   `cd %USERPROFILE%\esp\esp-idf && install.bat esp32`  
3. Every shell session must run:  
   `cd %USERPROFILE%\esp\esp-idf`  
   `.\export.ps1`  
   before `idf.py`.

---

## 2. Installed versions (after `export.ps1`)

| Tool | Version | Path |
|------|---------|------|
| ESP-IDF | **v5.3.2** | `C:\Users\Hp\esp\esp-idf` |
| Python (IDF venv) | **3.12.10** | `C:\Users\Hp\.espressif\python_env\idf5.3_py3.12_env\Scripts\python.exe` |
| CMake | **3.30.2** (IDF tools) | `C:\Users\Hp\.espressif\tools\cmake\3.30.2\bin\cmake.exe` |
| Ninja | **1.12.1** | `C:\Users\Hp\.espressif\tools\ninja\1.12.1\ninja.exe` |
| xtensa-esp32-elf-gcc | **13.2.0** (esp-13.2.0_20240530) | `...\xtensa-esp-elf\bin\xtensa-esp32-elf-gcc.exe` |
| Git | **2.53.0.windows.2** | `C:\Program Files\Git\cmd\git.exe` |
| OpenOCD | **v0.12.0-esp32-20241016** | `...\openocd-esp32\bin\openocd.exe` |

---

## 3. Environment variables (post-export)

| Variable | Value |
|----------|-------|
| `IDF_PATH` | `C:\Users\Hp\esp\esp-idf` |
| `IDF_PYTHON_ENV_PATH` | `C:\Users\Hp\.espressif\python_env\idf5.3_py3.12_env` |
| `ESP_IDF_VERSION` | `5.3` |
| `OPENOCD_SCRIPTS` | under `.espressif\tools\openocd-esp32\...` |
| `IDF_CCACHE_ENABLE` | `1` |

---

## 4. Verification commands — results

| Command | Result | Pass/Fail |
|---------|--------|-----------|
| `idf.py --version` | `ESP-IDF v5.3.2` (in exported shell) | **PASS** |
| `echo IDF_PATH` / `$env:IDF_PATH` | `C:\Users\Hp\esp\esp-idf` | **PASS** |
| `python --version` | `Python 3.12.10` (IDF venv when exported) | **PASS** |
| `cmake --version` | `cmake version 3.30.2` | **PASS** |
| `ninja --version` | `1.12.1` | **PASS** |
| `xtensa-esp32-elf-gcc --version` | `13.2.0` | **PASS** |
| `git --version` | `2.53.0.windows.2` | **PASS** |
| `openocd --version` | `Open On-Chip Debugger v0.12.0-esp32-20241016` | **PASS** |

**Toolchain sprint success criterion:** every required command executes successfully → **MET** (when `export.ps1` has been sourced).

---

## 5. Post-install build attempt (evidence only — no firmware edits)

| Step | Result |
|------|--------|
| `idf.py set-target esp32` | Ran (project configured) |
| `idf.py build` | **FAIL** at compile of `aeios_drivers.c` |
| Error | `'NULL' undeclared` — missing `#include <stddef.h>` |
| `idf.py size` | **NOT RUN** (no successful binary) |
| `idf.py flash` / `monitor` | **NOT RUN** (no binary; COM1/COM3 present but unused) |

Build log excerpt saved: `docs/evidence/D1/build_raw.txt`  
Firmware fix is **out of scope** for Build Infrastructure Engineer (requires Lead Embedded one-line include). No source was modified this sprint.

---

## 6. Serial ports observed

```text
COM1, COM3
```

Hardware identity unknown; flash deferred until successful build + confirmed ESP32 port.

---

## 7. How to open a working AEIOS build shell

```powershell
# Avoid Hermes/other venvs:
$env:VIRTUAL_ENV = $null
cd $env:USERPROFILE\esp\esp-idf
.\export.ps1
cd C:\Users\Hp\OneDrive\Desktop\AEIOS\firmware\node
idf.py --version
idf.py build
```

---

## 8. Pass / Fail — Infrastructure sprint

| Criterion | Status |
|-----------|--------|
| All required tools install/verify | **PASS** |
| ESP-IDF export works | **PASS** |
| Firmware builds cleanly | **FAIL** (pre-existing firmware compile error; not toolchain) |
| Size / flash / boot evidence | **BLOCKED** on firmware compile |

---

## 9. Recommended next action (handoff)

**To Lead Embedded Systems Engineer:** add `#include <stddef.h>` to `aeios_drivers.c` (and audit other files for `NULL` without stddef), then re-run D1 evidence Tasks 2–5.

**Build Infrastructure:** toolchain ready. Sprint objective for dependencies is **complete**.
