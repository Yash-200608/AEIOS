# AEIOS Firmware Architecture Specification (FAS)

**Document ID:** DOC-006  
**Version:** 1.2  
**Status:** Controlled — Gate D baseline  
**Classification:** Controlled document  
**Depends on:** DOC-002 SRS, DOC-003 SAD, DOC-004 TB, DOC-005 AMP, DOC-007 VVP, ICD-001, ADR-001..008, STD-FW-001  

---

## 1. Purpose

Bridge frozen communication and system requirements to **executable node firmware**. DOC-006 is the blueprint for ESP-IDF implementation. Changes that alter layering, task model, or AMP integration require design review and, if architectural, an ADR.

**Systems-engineering rule:** Prefer implementing and verifying the frozen design over adding features. New architectural ideas → ADR, not ad hoc code. Evaluate work by: *implementable, testable, verifiable against controlled documents?*

**Related:** [CODING_STANDARDS.md](CODING_STANDARDS.md) · [MVN.md](MVN.md) · [../verification/VVP.md](../verification/VVP.md)

---

## 2. Scope

| In scope | Out of scope |
|----------|--------------|
| Node firmware layering, tasks, memory, boot, recovery | Gateway/backend/AI/dashboard code |
| Driver interface contract | PCB schematics (hardware design pack) |
| AMP stack mapping to DOC-005 / ICD-001 | On-node TinyML (Gate C) |
| Deployment vs maintenance modes | Full firmware OTA over LoRa (ADR-003) |

---

## 3. Firmware layering

```text
┌─────────────────────────────────────┐
│ Application (sense cycle, alerts)   │
├─────────────────────────────────────┤
│ AMP (DOC-005 codec, routing, queue) │
├─────────────────────────────────────┤
│ Services (config, power, diag, log) │
├─────────────────────────────────────┤
│ Drivers (BME680, SCD41, PMS, LoRa…) │
├─────────────────────────────────────┤
│ HAL / BSP (GPIO, bus, board pins)   │
├─────────────────────────────────────┤
│ ESP-IDF + FreeRTOS                  │
├─────────────────────────────────────┤
│ Hardware                            │
└─────────────────────────────────────┘
```

**Rules:**

1. Upper layers MUST NOT include ESP-IDF headers except through BSP/HAL and FreeRTOS task wrappers.  
2. **AMP codec MUST be radio-agnostic** and host-testable (no SX127x calls inside `crc`/`mac`/`frame`).  
3. Drivers expose a uniform API (§5).  
4. Application never speaks raw LoRa registers.

---

## 4. Repository layout (normative)

```text
firmware/
  README.md
  node/                          # ESP-IDF project
    CMakeLists.txt
    sdkconfig.defaults
    main/
    components/
      aeios_bsp/
      aeios_hal/
      aeios_drivers/
      aeios_amp/                 # shared pure-C protocol
      aeios_services/
      aeios_app/
  host_tests/                    # Desktop CMake — golden vectors
    CMakeLists.txt
```

---

## 5. Driver interface (uniform)

Every sensor/radio-adjacent driver implements:

```c
typedef struct {
    int (*init)(void *ctx);
    int (*read)(void *ctx, void *out);
    int (*self_test)(void *ctx);
    int (*health)(void *ctx, uint32_t *flags);
    int (*sleep)(void *ctx);
    int (*wake)(void *ctx);
    int (*shutdown)(void *ctx); /* ADR-008: release HW before deep sleep / reboot */
} aeios_driver_ops_t;
```

| Driver | Bus | Notes |
|--------|-----|-------|
| bme680 | I²C | T/RH/P/gas |
| scd41 | I²C | CO₂ |
| pms5003 | UART | PM2.5/PM10 |
| battery | ADC / fuel gauge | SOC / voltage |
| lora | SPI | SX1276/RFM95 — **outside** AMP codec |
| gps | UART | Install mode only |
| rtc | internal / external | timekeeping assist |
| watchdog | TWDT / WWDT | system |

Return `0` on success; negative errno-style codes otherwise.

---

## 6. AMP stack modules (map to DOC-005)

```text
aeios_amp/
  include/aeios/amp/*.h
  src/
    frame.c      # assemble/disassemble 64B max frame
    header.c     # 20-byte header helpers
    crc.c        # CRC-16/CCITT-FALSE
    mac.c        # HMAC-SHA256 trunc64 + immutable view
    codec.c      # SENSOR_DATA etc. payload pack/unpack
    parser.c     # RX validate CRC→MAC→type
    routing.c    # uplink-centric next-hop (D3+)
    retry.c      # Link ACK state machine (D3+)
    queue.c      # store-and-forward (D3+)
    timesync.c   # TIME_SYNC apply (D3+)
    crypto/sha256.c
```

Conformance: ICD-001 Node v1 types.

---

## 7. RTOS task model

| Task | Priority (relative) | Responsibility |
|------|---------------------|----------------|
| `watchdog_task` | Highest | Pet TWDT; detect hangs |
| `comm_task` | High | RX/TX LoRa, Link ACK/retry, forward |
| `routing_task` | High | Route table / ROUTE_ADV (may merge with comm) |
| `queue_task` | Medium | Store-and-forward drain | 
| `sensor_task` | Medium | Sample drivers; local validate; enqueue SENSOR_DATA |
| `diag_task` | Low | Heartbeat, health flags, diagnostics responses |
| `power_task` | Medium | Duty cycle, sleep entry, battery |
| `maint_task` | Low (on demand) | Maintenance/install mode (Wi-Fi/GPS) |

v1 may combine `routing_task` + `queue_task` into `comm_task` if stack budget requires — document in implementation notes; do not change AMP semantics.

**Deployment mode:** Wi-Fi/BT stacks not started.  
**Maintenance mode:** `maint_task` may enable short-range radios per ADR.

---

## 8. Memory model

| Policy | Rule |
|--------|------|
| Allocation | Prefer **static** buffers; heap only for non-critical diagnostics |
| AMP TX/RX | Static frame buffers (64 B) × small pool (e.g. 4–8) |
| SF queue | Static ring of SENSOR_DATA records; capacity in Kconfig; drop-oldest except EMERGENCY |
| Stack sizes | Sized per task in Kconfig; monitored in diag |
| Flash | App partition + NVS; no mesh firmware image store |
| NVS namespaces | `aeios_cfg`, `aeios_sec`, `aeios_loc`, `aeios_rt` |

### 8.1 NVS schema (logical keys)

| Namespace | Key | Content |
|-----------|-----|---------|
| aeios_cfg | node_id | u16 |
| aeios_cfg | gw_id | u16 (default 0x0002) |
| aeios_cfg | sample_interval_s | u16 |
| aeios_cfg | heartbeat_interval_s | u16 |
| aeios_cfg | thresholds… | per CONFIG_UPDATE ids |
| aeios_sec | k_net | 16 bytes |
| aeios_loc | lat_e7, lon_e7, fix_ok | install GPS |
| aeios_rt | seq | last seq (optional persist) |

---

## 9. Boot sequence

```text
Power-on / reset
    → Early init (clock, UART log, TWDT)
    → BSP pin mux
    → Load NVS configuration (defaults if missing)
    → Driver init + self_test (record health bits)
    → AMP init (keys, node_id, seq)
    → LoRa radio init (deployment)
    → Mesh join / listen for ROUTE_ADV + TIME_SYNC
    → Start sensor + power schedules
    → Normal operation loop (tasks)
```

Install mode (flag/button/NVS): enable GPS until fix or timeout → store → disable GPS → reboot deployment.

---

## 10. Error recovery

| Fault | Response |
|-------|----------|
| Sensor failure | Set status_flags; continue other sensors; diag heartbeat |
| Brown-out | IDF BOD; on restart resume NVS; SF queue may be empty |
| Queue overflow | Drop oldest SENSOR; never prefer drop EMERGENCY first |
| Packet CRC fail | Drop (link) |
| Packet MAC fail | Drop; optional NACK |
| Lost parent | Mark route stale; accept ROUTE_ADV; SF buffer |
| Flash/NVS corrupt | Defaults + fault flag; require maintenance re-provision |
| Watchdog reset | Log reset reason; backoff; recover |

---

## 11. Gate D phases (implementation order)

| Phase | Goal | Exit criteria |
|-------|------|---------------|
| **D1** | Embedded platform bring-up | See Gate D checklist D1 exit (`idf.py build`, stubs, host tests, standards, DOC-007) |
| **D2** | Driver layer | Ops API + HW bring-up order in STD-FW-001 |
| **D3** | AMP stack | Codec done; then sequence→queue→ACK→retry→SF→routing |
| **D4** | Protocol validation | DOC-007 / TEST_CATALOG evidence |

**MVN** ([MVN.md](MVN.md)) gates gateway/AI critical path.

**Do not** start AI, dashboard, or FastAPI as the critical path until MVN is verified.

---

## 12. Logging

- Levels: ERROR / WARN / INFO / DEBUG  
- Tag per module (`amp`, `bme680`, `power`, …)  
- No secrets (`K_net`) in logs  

---

## 13. Testing strategy

| Layer | Method |
|-------|--------|
| AMP pure C | Host CMake + golden vectors |
| Drivers | Hardware-in-loop + Unity on target |
| Tasks | Integration on device |
| Conformance | ICD-001 checklist |

---

## 14. Versioning

Firmware semver in app descriptor. Protocol on-wire remains **1** until DOC-005 major change. DOC-006 version independent.

---

## 15. Approval

| Role | Date | Status |
|------|------|--------|
| Systems / firmware architecture | 2026-08-01 | Gate D baseline Controlled |
| Change policy | — | ADR required for layering/task/AMP contract changes |
