# AEIOS Engineering Execution Phase

**Document ID:** GOV-EXEC-001  
**Version:** 1.0  
**Status:** Active — effective immediately  
**Date:** 2026-08-01  
**Supersedes:** Ad hoc “architecture brainstorming” as the default mode of work  

---

## 1. Phase transition

| Before (Architecture) | Now (Engineering Execution) |
|-----------------------|-----------------------------|
| System architects | Systems engineers |
| Documents as primary deliverable | **Measurable evidence** as primary deliverable |
| “Is this a good idea?” | “Can this be implemented, tested, and verified against controlled documents?” |

Architecture (DOC-001…007, ADRs, ICDs, standards) is **frozen**. Implementation proceeds under configuration control.

---

## 2. Engineering dashboard (baseline)

| Stage | Status | Confidence |
|-------|--------|------------|
| Governance | Frozen | High |
| Requirements | Frozen | High |
| Architecture | Frozen | High |
| Protocol | Frozen | High |
| Firmware Architecture | Frozen | High |
| Verification Strategy | Frozen | High |
| Platform Bring-up (D1) | **Accepted** (2026-08-02) | High |
| Driver Validation (D2) | **Authorized** — not started | — |
| Gateway | **Blocked by MVN** | — |
| Backend | **Blocked by MVN** | — |
| AI | **Blocked by MVN** | — |
| DOC-008 Field Test Plan | Deferred until MVN Pass | — |

Living copy: update this table in PRs when stage status changes.

---

## 3. Chief Systems Reviewer criteria

Every subsystem review answers **all four**:

1. Was it implemented according to the controlled document?  
2. Was it tested?  
3. Is there **objective evidence**?  
4. Does it satisfy the acceptance / VT criteria?  

If any answer is **No**, the subsystem **does not pass** — even if it compiles.

---

## 4. Project-wide rule — No Untested Code Enters Main

Every merge to the default branch SHALL include:

| Required | Not sufficient |
|----------|----------------|
| Implementation | “I tested it manually” alone |
| Automated or catalogued unit/integration test | Untested hotfix |
| Evidence (log, CI, golden vector, VT ID) | Compile-only PR |

Defect policy (restates STD-FW-001 Rule 4):

- Protocol bug fixed → new/extended regression test (VT-AMP-* / host golden)  
- Driver bug fixed → new/extended regression test  
- Link the VT ID or test name in the PR  

---

## 5. Gate D review points (evidence-gated)

| Review | Evidence package (minimum) | Outcome |
|--------|----------------------------|---------|
| **D1** | `idf.py build` log, firmware binary artifact note, boot log, host AMP tests, static analysis (when available), memory map | **D1 Accepted** |
| **D2** | Per driver: self-test, init log, raw reading, error handling, power note, disconnect recovery, unit tests | **Driver Accepted** (one review each) |
| **D3** | Packet capture and/or golden compare, CRC, MAC, duplicate suppression, retry, SF, Link ACK timing | **AMP Accepted** (no dashboard required) |
| **D4 / MVN** | Full [MVN.md](../firmware/MVN.md) evidence pack | **MVN Accepted** / field-ready node |

Detailed checklists: [GATE_D_CHECKLIST.md](../gates/GATE_D_CHECKLIST.md)

---

## 6. Post-MVN parallel tracks (planning only)

Only after **MVN Accepted**:

| Track | Focus |
|-------|-------|
| 1 Embedded | Drivers finish, power, mesh reliability, field FW |
| 2 Gateway | Radio bridge, ingest, DB, local services |
| 3 Backend & Dashboard | API, offline UI, node mgmt, viz |
| 4 AI & Analytics | Dataset, features, baseline models, SHAP |

Interfaces remain those frozen in DOC-005 / ICD-001/002 / SAD.

---

## 7. DOC-008 (later)

**Field Test Plan** proves environmental performance. Distinct from DOC-007 (spec verification). Created only after MVN Pass. Stub: [../field/FTP_STUB.md](../field/FTP_STUB.md)

---

## 8. Related governance

| Doc | Role |
|-----|------|
| [REVIEW_POLICY.md](REVIEW_POLICY.md) | Rubric, evidence levels, gate recommendations |
| [DEFINITION_OF_DONE.md](DEFINITION_OF_DONE.md) | Project-wide DoD |
| [ENGINEERING_METRICS.md](ENGINEERING_METRICS.md) | Health metrics |
| [PR_EVIDENCE_CHECKLIST.md](PR_EVIDENCE_CHECKLIST.md) | Merge evidence |

---

## 9. Approval

| Role | Stance |
|------|--------|
| Project | Engineering Execution Phase active |
| Review authority | Chief Systems Reviewer model (evidence-first) |
