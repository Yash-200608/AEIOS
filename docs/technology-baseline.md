# AEIOS 2.0 Sentinel — Technology Baseline

**Document ID:** DOC-004  
**Version:** 1.0  
**Status:** Controlled — Gate A ACCEPTED (2026-08-01)  
**Classification:** Controlled document  

This document lists **approved** technologies for v1. Requirements live in the SRS. Architecture lives in the SAD. Adding a technology requires the Technology Introduction Rule and, if architectural, an ADR.

---

## 1. Hardware baseline

| Item | Approved choice | Notes |
|------|-----------------|-------|
| Gateway compute | Raspberry Pi 5 (8 GB class) | Continuous edge host |
| Gateway OS | Raspberry Pi OS 64-bit | Ubuntu Server 24.04 LTS as documented alternative |
| Node MCU | ESP32 | Dual-core class suitable for FreeRTOS tasks |
| Node firmware SDK | ESP-IDF | ADR-002; Arduino not approved |
| LoRa radio | SX1276 / RFM95W | ADR: no SX126x until hardware revision |
| PM sensor | PMS5003 | PM2.5 / PM10 |
| Env sensor | BME680 | T, RH, P, VOC gas resistance |
| CO₂ sensor | SCD41 | ADR-005; required in v1 |
| GNSS | Module as selected in design | Install mode only (ADR-007) |
| Power | Solar panel + MPPT + LiFePO₄ storage | Per power design |
| Enclosure | Outdoor IP-rated enclosure | Target IP67 class in hardware design |
| Explicitly rejected | MQ135 / MQ-series air proxies | Drift/calibration/power |

---

## 2. Node software baseline

| Item | Approved choice |
|------|-----------------|
| RTOS | FreeRTOS (via ESP-IDF) |
| Languages | C/C++ |
| LoRa library preference | RadioLib (or thin project driver on top) |
| Local storage | NVS + flash filesystem / SD as designed |
| Unit tests | Unity Test Framework |

**Deployment mode:** Wi-Fi and Bluetooth off.  
**Maintenance mode:** Wi-Fi and/or Bluetooth may be enabled for servicing and firmware load.

---

## 3. Gateway & backend baseline

| Item | Approved choice | Status |
|------|-----------------|--------|
| Language | Python 3.12+ | Required |
| API framework | FastAPI | Required |
| MQTT broker | Eclipse Mosquitto | Required |
| Time-series DB | TimescaleDB (PostgreSQL) | Required |
| Edge packaging | Docker + Docker Compose | Required |
| Reverse proxy | Nginx | Required |
| AI / ML | scikit-learn, XGBoost | Required |
| Explainability | SHAP | Required |
| Data libs | NumPy, Pandas, SciPy | Required |
| Cache / queue | Redis | **Not** in v1 default; add only if profiling proves need + ADR |
| Metrics stack | Prometheus + Grafana | **Excluded** from v1; health in app dashboard |
| Process supervision | systemd (host) as needed | Allowed |

---

## 4. Frontend baseline

| Item | Approved choice |
|------|-----------------|
| Language | TypeScript |
| UI library | React |
| Maps | Leaflet (or equivalent) **with offline tiles** (MBTiles / offline vector) |
| Charts | Chart.js (D3.js future only) |
| Tests | Jest + React Testing Library |

Live third-party tile servers are **not** an approved sole map source (ADR-004).

---

## 5. Serialization & APIs

| Domain | Approved choice |
|--------|-----------------|
| LoRa mesh | Project binary protocol only (ADR-006) |
| Gateway APIs | JSON over HTTP (OpenAPI via FastAPI) |
| Realtime UI | WebSocket |
| Future on-air encodings (CBOR/Protobuf) | Not approved for v1 air interface |

---

## 6. Security baseline (implementations)

| Control area | Approved mechanisms (v1 direction) |
|--------------|-------------------------------------|
| Mesh integrity/auth | MAC over binary packets; keys from provisioning design |
| Dashboard | TLS on local network as deployed; JWT + RBAC |
| Firmware | Signed images on maintenance update path (design detail in SAD) |
| Secure boot / TPM | Optional/SHOULD later — not blocking Gate A |

Final control set follows threat model in SAD; no control without a mapped threat.

---

## 7. Development environment

| Item | Approved |
|------|----------|
| IDE | Visual Studio Code |
| VCS | Git + GitHub |
| Host OS for dev | Windows 11, Ubuntu 24.04, macOS |
| Docs | Markdown; Mermaid/PlantUML as needed |
| API docs | OpenAPI / Swagger (generated) |
| Load/API explorers | Postman; Locust for load |

---

## 8. Deployment & ops (v1)

| Item | Approved |
|------|----------|
| Containerization | Docker Compose on gateway |
| Backups | Scripted DB backup to local media |
| Monitoring | Application health APIs + dashboard (not Prometheus/Grafana) |

---

## 9. Explicitly out of baseline (v1)

Kubernetes, multi-tenant cloud platform, federated learning frameworks, TensorFlow Lite / on-node TinyML, satellite modems, mobile app toolchains as product deliverables, SX126x radios, Arduino framework for production firmware, MQ135, Redis/Prometheus/Grafana as default services.

---

## 10. Version pinning policy

At implementation start, lock minor versions in lockfiles (`requirements.txt` / `package-lock` / ESP-IDF version note in `firmware/README`). Changes to major frameworks require TB revision and Gate review if they affect ADRs.

---

## 11. Approval

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Author | | | |
| Reviewer | | | |
| Gate A approver | | | |
