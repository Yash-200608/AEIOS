# Requirement Traceability Matrix (RTM)

**Document:** RTM.md  
**Version:** 1.0  
**Status:** Living (post–Gate A)  
**Date:** 2026-08-01  

Maps Charter objectives → System Requirements → FR/NFR → Architecture → ADR → Tests / Acceptance.

Test case IDs are placeholders until `tests/` is populated (`TC-*`).

---

## Matrix

| Charter objective / success | SR | FR / NFR (representative) | Architecture module | ADR | Test / AC |
|-----------------------------|----|---------------------------|---------------------|-----|-----------|
| Autonomous monitoring | SR-001 | FR-SENSE-001..012 | firmware/sensors, drivers | ADR-005 | TC-SENSE-*; AC-06 |
| Install location only | SR-002 | FR-LOC-001..005 | firmware core (modes) | ADR-007 | AC-07 |
| Autonomous power | SR-003 | FR-PWR-001..006; NFR-PWR-* | firmware/power | — | AC-01 |
| Node local processing | SR-004 | FR-NODE-001..004 | firmware/core | ADR-001 | TC-NODE-* |
| Autonomous communication | SR-005 | FR-COM-001..012; NFR-OFF-001 | firmware/communication; gateway bridge | ADR-006 | AC-03 |
| Autonomous recovery (S&F) | SR-006 | FR-COM-006; NFR-OFF-002 | firmware queue; gateway ingest | ADR-006 | AC-02 |
| Offline gateway + DB | SR-007 | FR-GW-001..007 | gateway/*, database/* | — | AC-04 |
| Local AI + explanations | SR-008 | FR-AI-001..007; FR-ALERT-* | ai/*, backend alerts | ADR-001 | AC-05 |
| Offline dashboard | SR-009 | FR-UI-001..007; NFR-MAP-001 | frontend/* | ADR-004 | AC-04 |
| Self-health monitoring | SR-010 | FR-HLTH-001..005 | diagnostics; dashboard health | — | AC-06 |
| Security | SR-011 | FR-CFG-002..007; NFR-SEC-* | mesh MAC; backend/auth | — | AC-10 |
| Maintainability / updates | SR-012 | FR-CFG-001,005; FR-COM-013/014 | firmware/ota (maint); config | ADR-002, ADR-003 | AC-08, AC-09 |
| Scope / non-goals | SR-013 | FR-OUT-001..006 | Gate C Charter §7 | — | Review gate |
| Validation / success | SR-014 | NFR-*; AC-01..10 | tests/field | — | Gate E |

---

## ADR coverage

| ADR | Decision | SR / FR link |
|-----|----------|--------------|
| ADR-001 | Hierarchical Edge Intelligence | SR-004, SR-008 |
| ADR-002 | ESP-IDF only | SR-012 (impl constraint via TB) |
| ADR-003 | No LoRa firmware OTA | SR-012; FR-COM-013 |
| ADR-004 | Offline maps | SR-009; NFR-MAP-001 |
| ADR-005 | SCD41 | SR-001; FR-SENSE-006 |
| ADR-006 | Binary protocol | SR-005; DOC-005 |
| ADR-007 | GPS install-only | SR-002 |

---

## Maintenance

Update this matrix when FR/NFR IDs are added, ADRs change, or test IDs are assigned. RTM edits are non-blocking for Gate B but required before Gate E audit.

Verification procedures and Pass evidence: [DOC-007](../verification/VVP.md).
