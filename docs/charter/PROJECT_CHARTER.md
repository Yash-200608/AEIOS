# AEIOS 2.0 Sentinel — Project Charter

**Document ID:** DOC-001  
**Version:** 1.0  
**Status:** Controlled — Gate A ACCEPTED (2026-08-01)  
**Classification:** Controlled document  

---

## 1. Purpose of this charter

This charter establishes AEIOS 2.0 (Sentinel) as a controlled engineering project. It defines vision, mission, scope, stakeholders, constraints, success criteria, governance, and the Gate C system boundary. After Gate A acceptance, changes to fundamental decisions require a design review and an Architecture Decision Record (ADR).

---

## 2. Vision

To build an autonomous, intelligent, self-sustaining environmental operating system capable of continuously observing, understanding, predicting, and responding to environmental changes in remote and inaccessible regions without dependence on traditional communication infrastructure or electrical grids.

AEIOS is **not** an air-quality monitor and **not** a generic IoT network. AEIOS is an **Environmental Operating System** — a platform on which domain applications (wildfire, air quality, and future verticals) are built.

---

## 3. Mission

Deploy a hierarchical, solar-powered, mesh-connected environmental intelligence platform that:

- Continuously monitors environmental conditions in infrastructure-poor terrain
- Retains and forwards data without requiring continuous internet or grid power
- Predicts risk (initially wildfire and pollution-related) with explainable outputs
- Monitors its own node and network health
- Supports authorities and researchers with timely, evidence-based decision support

---

## 4. System identity

| Term | Definition |
|------|------------|
| Full name | Adaptive Environmental Intelligence Operating System |
| Version | 2.0 |
| Codename | Sentinel |
| Class | Distributed cyber-physical environmental intelligence platform |
| Intelligence model | Hierarchical Edge Intelligence (ADR-001) |

Physical layer → embedded systems → communication network → edge computing → artificial intelligence → decision support → human interaction.

---

## 5. Problem statement

Existing environmental monitoring systems are primarily designed for urban or semi-urban environments where reliable electricity, internet connectivity, and maintenance access are available. They typically emphasize passive collection and cloud-centric processing, making them unsuitable for remote forests, mountainous terrain, wildlife reserves, and other inaccessible regions.

Hazards such as wildfires, deteriorating air quality, and localized pollution often remain undetected until significant damage has occurred because infrastructure lacks autonomy, resilience, predictive intelligence, and adaptive sensing.

AEIOS addresses these challenges through a decentralized, solar-powered, AI-enabled platform capable of autonomous operation, local decision-making, and resilient communication where conventional infrastructure is unavailable.

---

## 6. Objectives

### 6.1 Primary (v1)

1. **Autonomous monitoring** — continuous environmental sensing  
2. **Autonomous communication** — multi-hop mesh without cellular requirement  
3. **Autonomous power** — solar + energy-aware duty cycling  
4. **Autonomous intelligence** — gateway-local risk prediction and anomaly detection with explanations  
5. **Autonomous recovery** — store-and-forward and link recovery after outages  
6. **Autonomous maintenance awareness** — detect failing hardware and degraded links before total loss  

### 6.2 Platform (beyond first vertical)

AEIOS shall remain extensible to additional applications (water, landslide, wildlife, glacier, climate research) without redesigning the operating core — subject to Gate C and the Technology Introduction Rule.

---

## 7. Gate C — System boundary freeze (v1)

### 7.1 Included in v1

- Environmental sensing (approved sensor set)
- LoRa mesh communication
- Solar-powered autonomous nodes
- Hierarchical edge intelligence
- Offline gateway operation
- Local AI inference (gateway)
- Offline operator dashboard
- Node and network health monitoring
- Alert generation
- Local time-series database
- Binary mesh communication protocol

### 7.2 Explicitly excluded from v1

- Satellite communication
- Cellular connectivity as a requirement
- Drone deployment / autonomous drone patrols
- Federated learning
- Cloud-dependent inference
- Full firmware update images over LoRa
- Multi-gateway federation
- Mobile applications (Android/iOS)
- Kubernetes
- Digital twin
- TinyML inference on sensor nodes
- Continuous GPS tracking

Anything outside this boundary is **v1.1** or **v2.0** and must not appear as a MUST requirement in the SRS.

---

## 8. First application vertical

**Wildfire risk + environmental air sensing** — an application on the AEIOS OS core, not the definition of the OS itself.

Measured phenomena (v1): temperature, humidity, pressure, VOC indicators, PM2.5, PM10, CO₂, node power health, approximate smoke-related particulate elevation; location via installation-time fix only.

---

## 9. Stakeholders and personas

| Persona | Goals | Constraints |
|---------|-------|-------------|
| Forest / park officer | Timely risk and anomaly awareness; trustable alerts | Limited RF/IT expertise; intermittent site access |
| Research scientist | Quality datasets, explainable models, reproducible methods | Needs clear calibration and provenance |
| Disaster response team | Fast situational awareness during events | Needs clear severity and location context |
| Environmental agency | Compliance-oriented monitoring and reporting | Needs auditability and retention |
| University / lab | Experimentation and publication | Needs documented architecture and ADRs |
| NGO / field partner | Low-cost deployment and maintainability | Limited budget and spare parts |
| System maintainer / field engineer | Install, calibrate, replace modules, diagnose faults | Harsh access; needs maintenance mode and health signals |

---

## 10. Deployment scenarios (in scope for design)

| Scenario | Power implication | RF implication | Maintenance |
|----------|-------------------|----------------|-------------|
| Dense forest | Canopy reduces solar yield | Attenuation, multipath; shorter hops | Rare access; high autonomy |
| Mountain / ridge | Seasonal/winter solar stress | Longer LOS possible; weather extremes | Difficult access |
| Wildlife reserve | Minimal disturbance mounting | Coverage planning around terrain | Low intrusion |
| National park | Policy/siting constraints | Tourist/interference variables | Regulated visits |
| Border forest | Security of nodes | Sparse infrastructure | Coordinated access |
| Industrial buffer | Pollution focus; possible EMI | May have partial infrastructure — must still run offline | Mixed |

---

## 11. Constraints

| Constraint | Statement |
|------------|-----------|
| Budget | Prototype BOM target approximately ₹50,000 |
| Power | Grid independence required for nodes; solar + storage |
| Connectivity | Internet must not be required for core monitoring, AI inference, alerting locally, or dashboard use on the local network |
| Scale (prototype) | Demonstrate with a small mesh (order of 3–10 nodes + one gateway); architecture must not preclude hundreds |
| Environment | Outdoor harsh conditions; enclosure and derating required |
| Security | Authenticated nodes and integrity-protected packets; controls derived from threat model |
| Maintainability | Field-replaceable sensing/power modules; firmware updates without LoRa image transfer |

---

## 12. Design goals

| Goal | Description |
|------|-------------|
| Reliability | Continuous operation in harsh environments |
| Scalability | Architecture supports growth to large node counts |
| Maintainability | Sensor/firmware updates without full redesign |
| Fault tolerance | Continue useful operation despite node or link failures |
| Energy efficiency | Long-term solar-powered deployment |
| Security | Authenticated devices and protected communications |
| Explainability | Operators can understand why an alert was raised |
| Modularity | New sensors via abstraction, not redesign |
| Cost efficiency | Prototype within budget target |
| Offline capability | No dependence on cloud infrastructure for v1 core |

---

## 13. Success criteria

AEIOS v1 is successful if it can:

1. Sustain long-term off-grid node operation under documented solar assumptions  
2. Collect and retain environmental data during network outages, then synchronize  
3. Predict wildfire or pollution-related risk using gateway-local AI with explanations  
4. Forward data through multi-hop mesh when direct links fail  
5. Explain why a high-risk alert was generated  
6. Monitor node health (power, sensors, links)  
7. Operate in forest/mountain-like conditions without continuous human intervention  

Detailed, testable acceptance criteria are in the SRS.

---

## 14. Governing rules

### 14.1 One Rule

> Every feature must answer: would this genuinely improve autonomous environmental monitoring in remote, infrastructure-poor terrain? If not, exclude it.

### 14.2 Technology Introduction Rule

A technology may be introduced only if:

1. It solves a clearly defined requirement  
2. It fits power, cost, and remote deployment constraints  
3. It can be realistically implemented, tested, and demonstrated in the v1 prototype  

### 14.3 Documentation Rule

Every major subsystem is documented with:

1. Purpose  
2. Scientific/Engineering Background  
3. Design Objectives  
4. Requirements  
5. Technology Selection & Trade-offs  
6. Internal Working  
7. Integration with AEIOS  
8. Implementation Plan  
9. Testing & Validation  
10. Risks & Limitations  
11. Future Improvements  

No page-count targets.

---

## 15. Documentation governance

| ID | Document | Contains | Must not contain |
|----|----------|----------|------------------|
| DOC-001 | Project Charter (this document) | Vision, scope, boundary, governance | Implementation code |
| DOC-002 | Software Requirements Specification | FR/NFR, use cases, interfaces, acceptance | Product/technology brand names |
| DOC-003 | Software Architecture Document | How requirements are realized | Unbounded future wishlist as MUST |
| DOC-004 | Technology Baseline | Approved HW/SW/tools/versions | Requirements prose |

Architecture Decision Records (`docs/adr/`) configuration-control major decisions.

---

## 16. Gate model

| Gate | Meaning | Exit artifact |
|------|---------|---------------|
| A | Charter + SRS + Technology Baseline accepted | Signed Gate A checklist |
| B | Mesh protocol frozen (packet + routing + reliability + auth) | Protocol specification |
| C | System boundary freeze | Section 7 of this charter |
| D | Detailed design ready for scale implementation | SAD + design packs |
| E | Field validation | Validation report vs SRS acceptance |

**Parallel tracks:** Architecture remains one milestone ahead of implementation. Literature / long-form technical report narrative must not block Gates A–B.

---

## 17. Risks (charter-level)

| Risk | Impact | Mitigation direction |
|------|--------|----------------------|
| Forest RF attenuation | Mesh holes | Dense hop planning; link-quality metrics |
| Solar under canopy / monsoon | Node downtime | Energy budget + adaptive duty cycle |
| False alarms | Operator distrust | Thresholds + explainability + human review path |
| Sensor drift | Bad AI inputs | Health checks; calibration procedures |
| Scope creep | Missed prototype | Gate C + Technology Introduction Rule |
| Security theater | False confidence | Threat-model-driven controls only |

Detailed risk register lives with Gate A checklist / SRS annex as needed.

---

## 18. Contributions and expected impact

**Contributions:** offline-first hierarchical environmental OS concept; mesh + energy-aware nodes; explainable edge risk scoring; self-health monitoring; research-grade sensing (including true CO₂) within a constrained prototype budget.

**Expected impact:** earlier hazard awareness in remote terrain; reusable platform for multiple environmental applications; defensible engineering record for research, competition, and field pilots.

---

## 19. Approval

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Project owner | | | |
| Systems lead | | | |
| Gate A reviewer | | | |

**Document status after signatures:** Controlled — changes require design review.
