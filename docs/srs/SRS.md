# AEIOS 2.0 Sentinel — Software Requirements Specification (SRS)

**Document ID:** DOC-002  
**Version:** 1.0  
**Status:** Controlled — Gate A ACCEPTED (2026-08-01)  
**Classification:** Controlled document  

**Rules for this document:** State *what* the system must do. Do **not** name products, frameworks, chip brands, or libraries. Those belong in the Technology Baseline and SAD.

**Priority legend (MoSCoW):** MUST / SHOULD / COULD / WON'T (v1)

---

## 1. Introduction

### 1.1 Purpose

Specify software and system behavioral requirements for AEIOS v1 (Sentinel) sufficient for architecture, design, implementation, and acceptance testing.

### 1.2 Scope

Covers sensor-node software behavior, mesh communication behavior, gateway edge services, local intelligence, alerting, operator-facing software, configuration, health monitoring, and offline operation. Hardware physics limits are constraints; detailed schematics are out of scope for this SRS.

### 1.3 Definitions

| Term | Meaning |
|------|---------|
| Node | Autonomous field sensing endpoint |
| Gateway | Edge aggregator and local intelligence host |
| Mesh | Multi-hop radio network among nodes and gateway |
| Deployment mode | Normal field operation (long-range radio only for WAN) |
| Maintenance / install mode | Temporary local servicing mode |
| Store-and-forward | Retain data locally until delivery succeeds |
| Hierarchical edge intelligence | Local preprocessing on nodes; predictive AI on gateway |

### 1.4 References

- DOC-001 Project Charter (Gate C boundary)  
- DOC-003 SAD  
- DOC-004 Technology Baseline  
- DOC-005 Mesh Protocol (AMP)  
- [SYSTEM_REQUIREMENTS.md](SYSTEM_REQUIREMENTS.md) (SR-xxx)  
- [../traceability/RTM.md](../traceability/RTM.md)  
- ADR-001 … ADR-007  

---

## 2. Overall description

### 2.1 Product perspective

AEIOS is an offline-first environmental operating system. Nodes sense and survive; the mesh transports; the gateway stores, infers, decides, alerts, and presents. Optional external connectivity may synchronize when present but must not be required for core functions.

### 2.2 User classes

Forest/park officers, researchers, disaster response, agencies, universities/NGOs, field maintainers (see Charter).

### 2.3 Operating environment constraints

- No grid power required at nodes  
- No continuous internet required  
- Outdoor harsh environments  
- Prototype mesh scale small; design must not preclude large scale  

### 2.4 Design constraints (technology-agnostic)

- Binary mesh framing on the air interface (ADR-006)  
- Firmware image updates must not require full-image transfer over the long-range mesh (ADR-003)  
- Maps usable offline (ADR-004)  
- CO₂ measured with a true CO₂ instrument class (ADR-005)  
- GNSS used for install-time fix only (ADR-007)  

### 2.5 Assumptions and dependencies

- Nodes are mostly stationary after install  
- Gateway has local power suitable for continuous edge operation (may still be solar-backed at site)  
- Operators can reach the gateway on a local network for dashboard use  

---

## 3. Use cases

| ID | Actor | Use case | Priority |
|----|-------|----------|----------|
| UC-01 | Maintainer | Install node, acquire location once, leave deployment mode | MUST |
| UC-02 | System | Sample environment on schedule / adaptive interval | MUST |
| UC-03 | System | Forward telemetry via multi-hop mesh to gateway | MUST |
| UC-04 | System | Buffer telemetry when links fail; sync later | MUST |
| UC-05 | Gateway | Persist time-series and health records locally | MUST |
| UC-06 | Gateway | Compute risk / anomaly outputs with explanations | MUST |
| UC-07 | Officer | View live map, node status, alerts offline | MUST |
| UC-08 | Officer | Acknowledge / review alert timeline | MUST |
| UC-09 | Maintainer | Update node configuration over mesh (thresholds, intervals) | MUST |
| UC-10 | Maintainer | Update node firmware via maintenance channel (not mesh image) | MUST |
| UC-11 | Researcher | Export historical series for analysis | SHOULD |
| UC-12 | System | Detect sensor or power faults and raise health alerts | MUST |
| UC-13 | Admin | Authenticate to dashboard with roles | MUST |
| UC-14 | System | Enter low-power sleep between samples in deployment mode | MUST |

---

## 4. Functional requirements

### 4.1 Sensing

| ID | Requirement | Priority |
|----|--------------|----------|
| FR-SENSE-001 | Each node SHALL measure particulate matter including PM2.5 and PM10. | MUST |
| FR-SENSE-002 | Each node SHALL measure temperature. | MUST |
| FR-SENSE-003 | Each node SHALL measure relative humidity. | MUST |
| FR-SENSE-004 | Each node SHALL measure barometric pressure. | MUST |
| FR-SENSE-005 | Each node SHALL measure a VOC-related gas indicator from the environmental gas sensor. | MUST |
| FR-SENSE-006 | Each node SHALL measure carbon dioxide concentration using a true CO₂ sensing method (not metal-oxide proxy). | MUST |
| FR-SENSE-007 | Each node SHALL measure battery state of charge or equivalent energy health metric. | MUST |
| FR-SENSE-008 | Each node SHOULD measure solar charging activity or input presence when hardware provides it. | SHOULD |
| FR-SENSE-009 | The sensing software SHALL support a modular driver model so an additional sensor type can be added without redesigning unrelated subsystems. | MUST |
| FR-SENSE-010 | The system SHALL NOT claim CO₂ from removed low-grade proxy sensors. | MUST |
| FR-SENSE-011 | Nodes SHALL apply basic validation (range checks, stuck-value detection) before accepting a sample as valid. | MUST |
| FR-SENSE-012 | Invalid samples SHALL be flagged in health/telemetry rather than silently presented as good data. | MUST |

### 4.2 Location

| ID | Requirement | Priority |
|----|--------------|----------|
| FR-LOC-001 | In install mode, a node SHALL be able to acquire a geographic fix. | MUST |
| FR-LOC-002 | Acquired coordinates SHALL be stored in non-volatile memory on the node. | MUST |
| FR-LOC-003 | After successful store (or manual coordinate entry), GNSS reception SHALL be disabled for deployment mode. | MUST |
| FR-LOC-004 | The gateway SHALL store each node’s coordinates for map and analytics use. | MUST |
| FR-LOC-005 | Continuous tracking of node position during deployment mode SHALL NOT be required. | WON'T (v1) |

### 4.3 Power and duty cycle

| ID | Requirement | Priority |
|----|--------------|----------|
| FR-PWR-001 | Nodes SHALL operate from rechargeable storage charged by solar input without grid connection. | MUST |
| FR-PWR-002 | In deployment mode, nodes SHALL enter low-power sleep between work cycles. | MUST |
| FR-PWR-003 | Sampling / wake interval SHALL be configurable. | MUST |
| FR-PWR-004 | Nodes SHOULD adapt wake interval based on energy health and/or detected risk events. | SHOULD |
| FR-PWR-005 | Nodes SHALL report energy health to the gateway. | MUST |
| FR-PWR-006 | Nodes SHALL recover cleanly after power loss (configuration retained; buffered data retained within storage limits). | MUST |

### 4.4 Node local processing

| ID | Requirement | Priority |
|----|--------------|----------|
| FR-NODE-001 | Nodes SHALL perform local preprocessing (filtering / aggregation as designed) before transmission. | MUST |
| FR-NODE-002 | Nodes SHALL detect simple threshold-based local events (e.g., extreme PM or temperature). | MUST |
| FR-NODE-003 | Nodes SHALL prioritize emergency/alert traffic over routine telemetry when both are queued. | SHOULD |
| FR-NODE-004 | Nodes SHALL expose diagnostics suitable for field troubleshooting in maintenance mode. | MUST |

### 4.5 Communication and mesh

| ID | Requirement | Priority |
|----|--------------|----------|
| FR-COM-001 | Nodes and gateway SHALL communicate using a long-range radio mesh without requiring cellular service. | MUST |
| FR-COM-002 | The mesh SHALL support multi-hop forwarding to the gateway. | MUST |
| FR-COM-003 | Air interface payloads SHALL use a versioned binary protocol (not text encodings on air). | MUST |
| FR-COM-004 | The protocol SHALL include source identity, destination, sequence numbering, hop limit, integrity check, and message authentication. | MUST |
| FR-COM-005 | The protocol SHALL support ACK and NACK for reliable delivery classes that require it. | MUST |
| FR-COM-006 | The protocol SHALL support store-and-forward across outages. | MUST |
| FR-COM-007 | The protocol SHALL support heartbeat / presence. | MUST |
| FR-COM-008 | The protocol SHALL support configuration updates, diagnostics queries, time synchronization messages, and emergency alerts as distinct types. | MUST |
| FR-COM-009 | The protocol SHOULD support route advertisement and route update messages. | SHOULD |
| FR-COM-010 | Nodes SHALL attempt alternate routes or retries according to the routing/reliability design when a link fails. | MUST |
| FR-COM-011 | In deployment mode, short-range maintenance radios SHALL remain off. | MUST |
| FR-COM-012 | In maintenance mode, short-range maintenance connectivity MAY be enabled for servicing. | MUST |
| FR-COM-013 | Full firmware image distribution over the long-range mesh SHALL NOT be required. | WON'T (v1) |
| FR-COM-014 | Compact configuration and command messages MAY be sent over the mesh. | MUST |

### 4.6 Gateway data plane

| ID | Requirement | Priority |
|----|--------------|----------|
| FR-GW-001 | The gateway SHALL receive mesh traffic and parse binary packets into structured records. | MUST |
| FR-GW-002 | The gateway SHALL persist environmental time-series locally. | MUST |
| FR-GW-003 | The gateway SHALL persist node health, battery, link-quality, and alert records. | MUST |
| FR-GW-004 | The gateway SHALL continue ingestion and local AI without internet access. | MUST |
| FR-GW-005 | When external connectivity is available, the gateway MAY synchronize selected data outbound. | COULD |
| FR-GW-006 | The gateway SHOULD retain an emergency local backup of critical recent data. | SHOULD |
| FR-GW-007 | Retention policies SHALL be configurable. | SHOULD |

### 4.7 Intelligence and decisions

| ID | Requirement | Priority |
|----|--------------|----------|
| FR-AI-001 | The gateway SHALL compute wildfire-related risk scores from available features. | MUST |
| FR-AI-002 | The gateway SHALL detect environmental anomalies (e.g., pollution spikes). | MUST |
| FR-AI-003 | The gateway SHALL provide an explanation for high-risk alerts (feature contributions or equivalent interpretability output). | MUST |
| FR-AI-004 | The gateway SHOULD detect sensor-fault patterns distinct from environmental events. | SHOULD |
| FR-AI-005 | The gateway SHOULD estimate confidence or uncertainty for risk outputs. | SHOULD |
| FR-AI-006 | Predictive inference SHALL run locally on the gateway for v1 (no cloud-required inference). | MUST |
| FR-AI-007 | On-node machine learning inference SHALL NOT be required. | WON'T (v1) |

### 4.8 Alerts

| ID | Requirement | Priority |
|----|--------------|----------|
| FR-ALERT-001 | The system SHALL generate alerts for configurable environmental risk thresholds. | MUST |
| FR-ALERT-002 | The system SHALL generate alerts for critical node health (e.g., low energy, sensor fault, prolonged silence). | MUST |
| FR-ALERT-003 | Alerts SHALL be visible on the local dashboard with timestamp, node, severity, and explanation when AI-derived. | MUST |
| FR-ALERT-004 | The system SHOULD support an alert timeline and acknowledgement state. | SHOULD |
| FR-ALERT-005 | Additional outbound channels (SMS, email, siren) MAY be supported if locally available. | COULD |

### 4.9 Operator dashboard

| ID | Requirement | Priority |
|----|--------------|----------|
| FR-UI-001 | Operators SHALL view a map of nodes using offline map data for the deployment region. | MUST |
| FR-UI-002 | Operators SHALL view live or near-live node status (online/silent, battery, last seen). | MUST |
| FR-UI-003 | Operators SHALL view historical trends for key environmental variables. | MUST |
| FR-UI-004 | Operators SHALL view AI risk outputs and explanations. | MUST |
| FR-UI-005 | Operators SHALL view communication/link health summaries. | MUST |
| FR-UI-006 | Dashboard core features SHALL function without internet access. | MUST |
| FR-UI-007 | The UI SHOULD support heat-map style visualization of selected variables. | SHOULD |

### 4.10 Configuration, updates, security

| ID | Requirement | Priority |
|----|--------------|----------|
| FR-CFG-001 | Sampling intervals, alert thresholds, sleep duration, calibration constants, radio parameters, and AI confidence thresholds SHALL be configurable without firmware recompile where feasible. | MUST |
| FR-CFG-002 | Configuration changes SHALL be authenticated. | MUST |
| FR-CFG-003 | Nodes SHALL authenticate to the network; packets SHALL be integrity-protected / authenticated per threat model. | MUST |
| FR-CFG-004 | Dashboard access SHALL require authentication and role-based authorization. | MUST |
| FR-CFG-005 | Node firmware updates SHALL be supported via maintenance channels (physical or short-range maintenance mode). | MUST |
| FR-CFG-006 | Replay protection SHALL be applied to accepted command and telemetry classes as specified by the security design. | MUST |
| FR-CFG-007 | Security controls SHALL map to identified threats (no control without a threat). | MUST |

### 4.11 Health and self-monitoring

| ID | Requirement | Priority |
|----|--------------|----------|
| FR-HLTH-001 | The system SHALL monitor node liveness (heartbeat / last-seen). | MUST |
| FR-HLTH-002 | The system SHALL monitor sensor health flags. | MUST |
| FR-HLTH-003 | The system SHALL monitor energy health. | MUST |
| FR-HLTH-004 | The system SHALL monitor link quality indicators used by routing/diagnostics. | MUST |
| FR-HLTH-005 | Health anomalies SHALL appear in the operator interface. | MUST |

### 4.12 Explicit non-goals (v1)

| ID | Requirement | Priority |
|----|--------------|----------|
| FR-OUT-001 | Satellite backhaul SHALL NOT be required. | WON'T |
| FR-OUT-002 | Cellular connectivity SHALL NOT be required. | WON'T |
| FR-OUT-003 | Multi-gateway federation SHALL NOT be required. | WON'T |
| FR-OUT-004 | Mobile native apps SHALL NOT be required. | WON'T |
| FR-OUT-005 | Federated learning SHALL NOT be required. | WON'T |
| FR-OUT-006 | Digital twin simulation SHALL NOT be required. | WON'T |

---

## 5. Non-functional requirements

| ID | Requirement | Priority |
|----|--------------|----------|
| NFR-OFF-001 | Core monitoring, local storage, local inference, local alerts, and local dashboard SHALL operate with zero internet. | MUST |
| NFR-OFF-002 | Nodes SHALL retain undelivered telemetry across link outages for at least 14 days under nominal sampling, within storage limits documented in design. | MUST |
| NFR-PWR-001 | Node energy design SHALL target multi-day autonomy under documented worst-case weather assumptions for the pilot site class. | MUST |
| NFR-PWR-002 | Deployment mode SHALL keep short-range maintenance radios powered off. | MUST |
| NFR-PERF-001 | End-to-end latency from sample to gateway store under healthy single-hop conditions SHOULD be under 60 seconds for routine telemetry. | SHOULD |
| NFR-PERF-002 | Emergency alert packets SHOULD be prioritized to reduce latency versus routine telemetry. | SHOULD |
| NFR-SCALE-001 | Prototype demonstration MAY use 3–10 nodes + 1 gateway; architecture SHALL NOT preclude hundreds of nodes. | MUST |
| NFR-REL-001 | Loss of a single non-gateway node SHALL NOT stop the remainder of the mesh from operating. | MUST |
| NFR-REL-002 | Gateway process failures SHALL be recoverable via supervised restart without data-plane corruption. | MUST |
| NFR-SEC-001 | Mesh and dashboard security SHALL follow a documented threat model. | MUST |
| NFR-SEC-002 | Secrets and keys SHALL be provisionable for field devices without embedding a single global debug key in production images. | SHOULD |
| NFR-ACC-001 | Sensing accuracy targets SHALL be documented per instrument class and verified in validation. | MUST |
| NFR-MAINT-001 | Mean steps to replace a failed sensor module SHALL be documentable as a field procedure. | SHOULD |
| NFR-ENV-001 | Nodes SHALL be designed for outdoor enclosure use (ingress protection target set in hardware design). | MUST |
| NFR-COST-001 | Prototype hardware BOM SHOULD remain near ₹50,000 target. | SHOULD |
| NFR-UX-001 | Primary operator tasks (view map, status, alerts) SHALL be achievable without vendor cloud accounts. | MUST |
| NFR-MAP-001 | Map rendering SHALL not depend on live third-party tile servers. | MUST |

---

## 6. External interfaces (logical)

### 6.1 Mesh air interface

Binary frames per protocol specification (Gate B). Logical fields: version, type, flags, length, addressing, hop limit, sequence, time, payload, CRC, MAC.

### 6.2 Gateway service interfaces

- Ingest interface from radio bridge to parser/storage  
- Query interface for time-series, nodes, alerts, predictions, health  
- Real-time event interface for dashboard live updates  
- Admin interface for configuration and user roles  

Exact resource paths and schemas are SAD/design artifacts; this SRS requires the capabilities above.

### 6.3 Human interfaces

Offline map dashboard; alert views; historical charts; health views; configuration screens for authorized roles.

### 6.4 Maintenance interfaces

Physical or short-range maintenance channel for firmware image load and deep diagnostics; mesh for compact config.

---

## 7. Acceptance criteria (Gate E preview)

| ID | Criterion |
|----|-----------|
| AC-01 | A node runs ≥ 72 hours on storage+solar under a documented indoor/outdoor test profile without grid power. |
| AC-02 | With gateway radio silenced ≥ 24 hours, a node retains samples and delivers them after link restore (spot-check count match within tolerance). |
| AC-03 | Multi-hop path of ≥ 2 hops delivers telemetry successfully in a controlled test. |
| AC-04 | Dashboard shows nodes and last values with network cable unplugged from WAN (local LAN only). |
| AC-05 | A synthetic high-risk scenario produces an alert with a non-empty explanation payload. |
| AC-06 | Forced sensor disconnect raises a health fault distinct from a clear-air reading. |
| AC-07 | Install-mode location stored; deployment mode shows GNSS inactive. |
| AC-08 | Config threshold change over mesh alters subsequent alerting behavior. |
| AC-09 | Firmware update performed via maintenance channel succeeds; no requirement to push image over mesh. |
| AC-10 | Unauthorized dashboard user cannot change configuration. |

---

## 8. Personas and scenarios (requirements impact)

Requirements above are binding for Charter deployment scenarios (forest, mountain, reserve, park, border, industrial buffer). Scenario-specific sizing (solar, hop distance) is design input, not separate FR IDs.

---

## 9. Risks affecting requirements

| Risk | SRS impact |
|------|------------|
| Canopy RF loss | Emphasizes multi-hop and health of links (FR-COM, FR-HLTH) |
| Monsoon solar | Adaptive duty cycle SHOULD (FR-PWR-004) |
| False positives | Explanation MUST (FR-AI-003); acknowledgement SHOULD |
| Scope creep | Section 4.12 WON'T list |

---

## 10. Approval

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Author | | | |
| Reviewer | | | |
| Gate A approver | | | |
