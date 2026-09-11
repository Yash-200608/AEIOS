# AEIOS Node Firmware

ESP-IDF project for AEIOS Sentinel sensor nodes.

**Governing docs:** DOC-005, DOC-006 (v1.2), DOC-007, ICD-001, STD-FW-001, ADR-002…017.

Target board: `HW-NODE-r2` (ADR-013). No GPS driver. BME688 + MQ135 stubs. ESP-IDF only (ADR-002).

## D1 status

Platform bring-up **implemented in-tree**.  
**D1 Accepted** requires evidence on a machine with ESP-IDF: see [`docs/evidence/D1/EVIDENCE_PACKAGE.md`](../docs/evidence/D1/EVIDENCE_PACKAGE.md).

## Build (requires ESP-IDF)

```bash
cd firmware/node
idf.py set-target esp32
idf.py build
idf.py size
idf.py flash monitor   # capture boot log for D1 package
```

## Host AMP tests

```bash
python firmware/host_tests/golden_ref.py
# optional C suite when CMake+gcc available:
cd firmware/host_tests && cmake -B build -S . && cmake --build build && ctest --test-dir build
```

## Layering

Application → AMP → Services → Drivers → HAL/BSP → ESP-IDF

## Do not

Dashboard, FastAPI, AI product features — field-ready claims blocked until MVN. Host-side SQLite/schema/simulator work is allowed (C-19). MQTT is not on the core ingest path (ADR-015).
