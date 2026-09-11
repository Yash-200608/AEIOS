# AEIOS 2.0 Sentinel — Software Architecture Document (SAD)

**Document ID:** DOC-003  
**Version:** 0.1 (Initial — Gate A companion)  
**Status:** Approved as Gate A companion (2026-08-01); evolves under change control  
**Classification:** Controlled document  

This SAD explains **how** SRS requirements are realized using the Technology Baseline. It stays one milestone ahead of implementation.

**Not frozen here:** byte-level mesh codec and routing algorithms (Gate B protocol specification).

---

## 1. Architectural goals

| Goal | Approach |
|------|----------|
| Offline First | All core services run on the gateway; nodes store-and-forward |
| Energy Aware | Deployment-mode duty cycling; radios limited to LoRa |
| Hierarchical Edge Intelligence | Node preprocess; gateway AI + decisions (ADR-001) |
| Modularity | Sensor drivers and gateway services as replaceable modules |
| Security | Threat-model-driven controls; authenticated mesh + RBAC dashboard |
| Explainability | SHAP (or equivalent) on gateway risk models |

---

## 2. Context view

```text
Environment
    │
    ▼
┌─────────────────┐     LoRa mesh (binary)     ┌──────────────────────┐
│  Sensor Nodes   │◄──────────────────────────►│  Gateway (Pi)        │
│  ESP32 + sensors│     multi-hop + S&F        │  radio bridge        │
└─────────────────┘                            │  MQTT                │
                                               │  ingestion / parser  │
                                               │  TimescaleDB         │
                                               │  FastAPI + AI        │
                                               │  React dashboard     │
                                               └──────────┬───────────┘
                                                          │ local LAN
                                                          ▼
                                                   Operators / Maintainers

Optional internet ── sync only (non-required) ──► External systems (future)
```

---

## 3. Layered software architecture

```text
Applications & Dashboard (React, offline tiles)
          ▲
REST API & WebSocket (FastAPI)
          ▲
AI & Decision Engine (feature pipeline, models, SHAP, alerts)
          ▲
Data Management (TimescaleDB, retention, backups)
          ▲
Communication fabric (MQTT internal bus, mesh bridge)
          ▲
Embedded firmware (ESP-IDF: sense, power, mesh client)
          ▲
Hardware
```

---

## 4. Node architecture

### 4.1 Modes

| Mode | Radios | GNSS | Purpose |
|------|--------|------|---------|
| Deployment | LoRa only | Off | Field operation |
| Maintenance / Install | LoRa + optional Wi-Fi/BT | On for fix | Provision, firmware load, GPS fix |

### 4.2 Firmware task domains (logical)

| Domain | Responsibility |
|--------|----------------|
| Sensor task | Sample PMS5003, BME680, SCD41; validate |
| Power task | Charge/sleep policy; battery metrics |
| Communication task | Binary TX/RX; retries; queue |
| Diagnostics / heartbeat | Health flags; heartbeat packets |
| Config manager | Apply authenticated config |
| Logging | Local ring buffer / flash logs |
| Watchdog | Fault recovery |
| OTA (maintenance path) | Image update only when maintenance channel active |

### 4.3 Local intelligence (non-ML)

Range checks, stuck sensors, threshold events, priority queue for emergency packets, adaptive sleep hints from energy and events.

---

## 5. Mesh communication architecture

### 5.1 Principles

- Binary frames only on air (ADR-006)  
- Multi-hop toward gateway  
- Store-and-forward on nodes  
- Config/commands compact; **no firmware images** on LoRa (ADR-003)  

### 5.2 Logical packet layers (pre–Gate B)

| Layer | Fields |
|-------|--------|
| Link | Version, Packet Type, Flags, Payload Length |
| Network | Source Node ID, Destination ID, Hop Count/TTL, Previous Hop (opt), Sequence |
| Time | Timestamp, Sync Status |
| Payload | Typed body |
| Integrity | CRC-16 |
| Auth | MAC |

### 5.3 Packet types (logical)

Sensor Data, Heartbeat, ACK, NACK, Route Advertisement, Route Update, Configuration Update, Diagnostics, Time Synchronization, Emergency Alert.

### 5.4 Gate B dependency

Byte layout, routing, retransmission, CRC/MAC, and payload codecs are specified in [protocol/AMP_PROTOCOL_SPEC.md](protocol/AMP_PROTOCOL_SPEC.md) (**DOC-005**, on-wire v1). Freeze via [../gates/GATE_B_CHECKLIST.md](../gates/GATE_B_CHECKLIST.md) **before** mesh firmware implementation.

---

## 6. Gateway architecture

```text
LoRa HAT / bridge process
        │
        ▼
  Packet parser (binary → structured events)
        │
        ▼
     MQTT topics (internal)
        │
   ┌────┴────┐
   ▼         ▼
Ingestion   Realtime fanout
   │
   ▼
TimescaleDB
   │
   ├─► AI worker (features → models → SHAP → predictions table)
   ├─► Alert engine (rules + AI scores)
   └─► FastAPI (query, admin, websocket)
            │
            ▼
         Nginx → React (offline MBTiles)
```

### 6.1 Service modules (`gateway/` + `backend/` + `ai/`)

| Module | Role |
|--------|------|
| mqtt | Broker config / topic conventions |
| parser | Binary decode, MAC verify, CRC |
| ingestion | Persist sensor/health rows |
| storage | DB access patterns |
| sync | Optional outbound sync when uplink exists |
| monitoring | Process health for dashboard |
| ai/inference | Batch/stream scoring |
| ai/explainability | SHAP payloads |
| backend/api | REST + WebSocket |
| backend/auth | JWT + RBAC |

### 6.2 Explicitly not in v1 gateway compose

Prometheus, Grafana, Redis (unless future ADR), Kubernetes.

---

## 7. Data architecture (logical)

Logical stores (names illustrative):

| Store | Contents |
|-------|----------|
| SensorData | Time-series environmental samples |
| NodeHealth | Sensor faults, liveness |
| BatteryStatus | Energy metrics |
| Alerts | Alert instances + ack state |
| Predictions | Risk scores + explanations |
| Configurations | Node/gateway parameters |
| SystemLogs | Operational logs |
| MaintenanceHistory | Field actions |

Hypertables / retention / continuous aggregates are design details under `database/schema` at Gate D.

---

## 8. AI pipeline architecture

```text
Raw samples → clean/align → features (env + power + deltas + time)
        → risk model (wildfire-oriented)
        → anomaly model
        → SHAP / explanation
        → Decision engine (thresholds, hysteresis)
        → Alert records + dashboard
```

Training may occur offline on exported datasets; **inference for operations is gateway-local**.

---

## 9. Security architecture (process)

```text
Threat Model → Assets → Attack Surface
    → Node authentication
    → Packet authentication (MAC)
    → Gateway service auth
    → Dashboard auth (JWT/RBAC)
    → Key provisioning
    → Physical / maintenance controls
```

Then bind AES/TLS/JWT as mitigations only. Detailed threat table expands in a later SAD revision before production field crypto freeze.

---

## 10. Dashboard architecture

- React + TypeScript SPA served locally  
- Leaflet (or equivalent) consuming **offline** tile packs  
- Views: map, node detail, trends, alerts+explanations, health, basic config (authorized)  
- WebSocket for live updates; REST for history  

---

## 11. Deployment topology (v1)

- One gateway per site cluster  
- 3–10 nodes for prototype; addressing space must allow growth  
- Preloaded regional map tiles on gateway storage  
- Docker Compose stack on the Pi  

Multi-gateway federation is out of scope (Gate C).

---

## 12. Failure handling (summary)

| Failure | Response |
|---------|----------|
| Link loss | Store-and-forward; retry; route update when available |
| Node death | Remainder operates; health alert on silence |
| Sensor fault | Flag data; health alert; continue other sensors |
| Gateway process crash | Restart supervised containers/services; durable DB |
| Power starvation on node | Deeper sleep / reduced rate; critical alert if possible |
| Gateway WAN loss | No effect on core local loop |

---

## 13. Implementation sequencing (architecture ahead)

1. Gate A accept Charter + SRS + TB  
2. Expand SAD threat model + DB sketch  
3. **Gate B** protocol specification freeze  
4. Firmware drivers + power bring-up (may start after A; mesh codec after B)  
5. Gateway ingest + DB + API  
6. AI MVP + dashboard offline maps  
7. Field validation (Gate E / Charter success)  

---

## 14. Open items (tracked)

| Item | Owner gate |
|------|------------|
| Byte-accurate frame + routing | B |
| Key provisioning ceremony | D |
| Exact solar BOM / panel sizing | D |
| Alert outbound SMS/siren adapters | COULD / later |

---

## 15. Approval

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Architect | | | |
| Reviewer | | | |
