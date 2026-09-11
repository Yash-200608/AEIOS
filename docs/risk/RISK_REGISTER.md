# AEIOS Risk Register

**Document:** RISK_REGISTER.md  
**Version:** 1.0  
**Status:** Living  
**Owner:** Systems lead  
**Last updated:** 2026-08-01  

Probability / Impact scale: **L** Low · **M** Medium · **H** High  
Status: Open · Mitigating · Accepted · Closed  

---

## Active risks

### RISK-001 — Forest canopy RF attenuation

| Field | Value |
|-------|-------|
| Category | Communication |
| Probability | H |
| Impact | H |
| Description | Dense vegetation reduces LoRa range; mesh holes; delayed or lost telemetry |
| Mitigation | Multi-hop mesh; link-quality metrics; conservative hop planning in site survey; store-and-forward |
| Contingency | Add relay nodes; lower SF / adjust TX power per site test |
| Owner | Comms / deployment |
| Status | Mitigating |
| Related | FR-COM-*, NFR-REL-001, DOC-005 |

### RISK-002 — Solar deficit (canopy / monsoon / winter)

| Field | Value |
|-------|-------|
| Category | Power |
| Probability | H |
| Impact | H |
| Description | Nodes deplete storage; extended sleep or silence |
| Mitigation | Energy budget design; LiFePO₄ sizing; adaptive duty cycle; battery health telemetry |
| Contingency | Reduce sampling; temporary maintenance visit; relocate panel |
| Owner | Power / firmware |
| Status | Mitigating |
| Related | FR-PWR-*, NFR-PWR-* |

### RISK-003 — False positive environmental alerts

| Field | Value |
|-------|-------|
| Category | AI / Operations |
| Probability | M |
| Impact | H |
| Description | Operators lose trust; ignored real events |
| Mitigation | Hysteresis; explainability (SHAP); acknowledgement workflow; calibration of thresholds in field |
| Contingency | Raise thresholds; disable auto-escalate channels; human-in-loop |
| Owner | AI / product |
| Status | Open |
| Related | FR-AI-*, FR-ALERT-*, AC-05 |

### RISK-004 — Sensor drift / fault misread as environment

| Field | Value |
|-------|-------|
| Category | Sensing |
| Probability | M |
| Impact | H |
| Description | Bad data trains wrong conclusions or triggers false alerts |
| Mitigation | Range/stuck checks; health flags; SCD41 true CO₂ (no MQ proxy); calibration procedures |
| Contingency | Quarantine node data; field replace sensor |
| Owner | Sensing / firmware |
| Status | Mitigating |
| Related | FR-SENSE-*, FR-HLTH-*, ADR-005 |

### RISK-005 — Protocol / interface drift during parallel development

| Field | Value |
|-------|-------|
| Category | Integration |
| Probability | M |
| Impact | H |
| Description | Firmware, gateway, and tests diverge on packet meaning |
| Mitigation | Gate B freeze DOC-005; ICD-001/002 active; version field on wire; CI decode tests |
| Contingency | Compatibility shims; forced coordinated release |
| Owner | Systems |
| Status | Mitigating — Gate B freeze complete; residual risk is implementation drift (golden vectors) |
| Related | ADR-006, DOC-005, VERSIONING |

### RISK-006 — Scope creep into Gate C exclusions

| Field | Value |
|-------|-------|
| Category | Governance |
| Probability | M |
| Impact | M |
| Description | Satellite, mobile apps, TinyML, etc. enter v1 and delay prototype |
| Mitigation | Gate C list; SRS WON'T; Technology Introduction Rule; ADR for exceptions |
| Contingency | Explicit v1.1/v2 backlog only |
| Owner | Project owner |
| Status | Mitigating |
| Related | Charter §7 |

### RISK-007 — Inadequate mesh security / key mishandling

| Field | Value |
|-------|-------|
| Category | Security |
| Probability | M |
| Impact | H |
| Description | Spoofed nodes, replayed commands, injected telemetry |
| Mitigation | Threat-model-first design; MAC on packets; replay window; provisioning without global debug keys |
| Contingency | Rotate keys; revoke node IDs; maintenance re-provision |
| Owner | Security / firmware |
| Status | Open |
| Related | FR-CFG-*, NFR-SEC-*, DOC-005 Auth |

### RISK-008 — GNSS fix failure under canopy at install

| Field | Value |
|-------|-------|
| Category | Deployment |
| Probability | M |
| Impact | L |
| Description | Cannot acquire install fix; map position wrong |
| Mitigation | Install-mode only; manual coordinate entry fallback; clear sky if needed |
| Contingency | Survey-grade handheld coordinates entered manually |
| Owner | Field eng |
| Status | Accepted |
| Related | ADR-007, FR-LOC-* |

### RISK-009 — Gateway single point of failure for a site cluster

| Field | Value |
|-------|-------|
| Category | Reliability |
| Probability | M |
| Impact | H |
| Description | Site loses AI/dashboard/ingest if gateway dies (nodes may still buffer) |
| Mitigation | Supervised services; local backups; durable DB; node store-and-forward |
| Contingency | Spare gateway image; multi-gateway deferred to v2 |
| Owner | Gateway |
| Status | Accepted (v1) |
| Related | Gate C (no multi-gateway federation) |

### RISK-010 — Budget overrun from SCD41 + enclosure + radio

| Field | Value |
|-------|-------|
| Category | Cost |
| Probability | M |
| Impact | M |
| Description | Prototype exceeds ~₹50k |
| Mitigation | Absorb in enclosure/misc; freeze BOM early Gate D |
| Contingency | Reduce node count for demo; defer non-critical connectors |
| Owner | Hardware |
| Status | Open |
| Related | NFR-COST-001, ADR-005 |

### RISK-011 — Delayed Gate B freeze blocking firmware

| Field | Value |
|-------|-------|
| Category | Schedule |
| Probability | M |
| Impact | H |
| Description | Mesh implementation waits on protocol; schedule slips |
| Mitigation | Prioritize DOC-005; allow non-mesh driver bring-up in parallel |
| Contingency | Lab point-to-point interim profile explicitly versioned and discarded |
| Owner | Systems |
| Status | Mitigating |
| Related | Gate B |

---

## Closed risks

_None yet._

---

## Change log

| Date | Change |
|------|--------|
| 2026-08-01 | Initial register from Charter risks + Gate A review |
