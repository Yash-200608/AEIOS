# System Requirements (SR)

**Parent:** DOC-002 SRS  
**Version:** 1.0  
**Status:** Controlled addendum (post–Gate A, non-breaking)  
**Date:** 2026-08-01  

System Requirements link Charter objectives to groups of functional/non-functional requirements. They do not replace FR/NFR IDs.

| SR ID | System requirement | Charter objective / success link | Primary FR / NFR groups |
|-------|-------------------|----------------------------------|-------------------------|
| SR-001 | Continuously sense approved environmental quantities at each node | Autonomous monitoring | FR-SENSE-* |
| SR-002 | Tag node location at install without continuous GNSS | Deployment practicality | FR-LOC-* |
| SR-003 | Operate nodes from solar storage with energy-aware sleep | Autonomous power | FR-PWR-*, NFR-PWR-* |
| SR-004 | Perform local preprocessing and threshold events on nodes | Hierarchical edge (node tier) | FR-NODE-* |
| SR-005 | Transport data over multi-hop long-range mesh without cellular | Autonomous communication | FR-COM-*, NFR-OFF-001 |
| SR-006 | Retain data during outages and deliver when links recover | Autonomous recovery | FR-COM-006, NFR-OFF-002 |
| SR-007 | Persist telemetry and health on an offline gateway | Offline gateway / local DB | FR-GW-* |
| SR-008 | Compute risk and anomalies locally with explanations | Autonomous intelligence | FR-AI-*, FR-ALERT-* |
| SR-009 | Present offline map, status, trends, alerts to operators | Human decision support | FR-UI-*, NFR-MAP-001 |
| SR-010 | Monitor node, sensor, energy, and link health | Autonomous maintenance awareness | FR-HLTH-* |
| SR-011 | Authenticate devices, protect packets, control operator access | Security design goal | FR-CFG-003..007, NFR-SEC-* |
| SR-012 | Allow field configuration and maintenance-path firmware update without mesh images | Maintainability | FR-CFG-001, FR-CFG-005, FR-COM-013 |
| SR-013 | Remain within Gate C v1 boundary (explicit non-goals) | Scope control | FR-OUT-*, Charter §7 |
| SR-014 | Meet quantified offline, reliability, and acceptance tests | Success criteria / Gate E | NFR-*, AC-01..AC-10 |

Traceability mappings: [RTM.md](../traceability/RTM.md).  
Verification mappings: [DOC-007 VVP](../verification/VVP.md) · [TEST_CATALOG](../verification/TEST_CATALOG.md).
