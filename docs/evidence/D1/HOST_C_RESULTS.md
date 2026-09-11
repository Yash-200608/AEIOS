# HOST_C_RESULTS.md — D1

**Date:** 2026-08-01  
**Sprint:** 1B  
**Status:** **PASS**  

## Objective

Execute `firmware/host_tests` CMake C suite and compare golden vectors to Python reference (DOC-005).

## Toolchain used

| Tool | Path / version |
|------|----------------|
| CMake | Espressif 3.30.2 |
| Ninja | Espressif 1.12.1 |
| Host C compiler | llvm-mingw (`gcc` → Clang 22.1.8) at `tools/llvm-mingw/.../bin` |

## Commands executed

```powershell
cd firmware/host_tests
cmake -B build -S . -G Ninja -DCMAKE_C_COMPILER=<llvm-mingw>\gcc.exe
cmake --build build
ctest --test-dir build --output-on-failure
.\build\test_amp_golden.exe
python .\golden_ref.py
```

Raw: `host_c_cmake_raw.txt`, `host_c_build_raw.txt`, `host_c_ctest_raw.txt`, `host_c_run_raw.txt`, `host_golden_raw.txt`

## Executed tests (`test_amp_golden`)

| Test | Result |
|------|--------|
| sha256(abc) | **PASS** |
| crc deterministic | **PASS** |
| sensor pack len 24 | **PASS** |
| encode length | **PASS** |
| decode ok | **PASS** |
| parse ok | **PASS** |
| type preserved | **PASS** |
| seq preserved | **PASS** |
| src preserved | **PASS** |
| unpack sensor | **PASS** |
| co2 match | **PASS** |
| pm25 match | **PASS** |
| mac survives hop mutate | **PASS** |
| mac rejects tamper | **PASS** |
| GOLDEN HEARTBEAT emit | **PASS** |

**ctest:** `1/1 Test #1: amp_golden ... Passed` — **100% passed, 0 failed**

## Coverage

| Scope | Covered |
|-------|---------|
| SHA-256 FIPS vector | Yes |
| CRC-16 determinism | Yes |
| SENSOR_DATA pack/encode/decode/parse | Yes |
| HMAC-SHA256 trunc64 MAC hop immutability | Yes |
| MAC tamper reject | Yes |
| Golden HEARTBEAT frame | Yes |
| Link ACK / routing / SF queue | Out of scope (D3) |

## Golden vector comparison

| Source | HEARTBEAT hex (38 bytes) |
|--------|---------------------------|
| Python `golden_ref.py` | `ae0102000800100002000000080001008087ec655a00013202000100e7e4a1d0ef7709a7861c` |
| C `test_amp_golden` | `AE0102000800100002000000080001008087EC655A00013202000100E7E4A1D0EF7709A7861C` |

**Match:** YES (case-insensitive identical). CRC=`e4e7`, MAC=`a1d0ef7709a7861c`.

## Python golden (companion)

```text
PASS: sha256(abc)
PASS: mac immutable under hop mutate
All Python reference checks passed
```

## Pass / Fail

| Suite | Status |
|-------|--------|
| Host C (`ctest amp_golden`) | **PASS** |
| Python golden | **PASS** |
| Overall host protocol | **PASS** |
