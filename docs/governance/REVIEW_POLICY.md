# AEIOS Systems Review Policy

**Document ID:** GOV-REV-001  
**Version:** 1.0  
**Status:** Active — Engineering Execution Phase  
**Date:** 2026-08-01  
**Role:** Chief Systems Reviewer rubric  
**Depends on:** GOV-EXEC-001, DOC-007, STD-FW-001, GATE_D_CHECKLIST  

---

## 1. Maturity statement

AEIOS is an **evidence-controlled project**. Controlled documents define the baseline; ADRs change architecture; evidence packages accept implementation; MVN gates higher layers.

---

## 2. Review inputs (required package)

Every submission for gate or subsystem review SHALL include:

| Input | Description |
|-------|-------------|
| Scope of work | Requirement, VT, or gate item addressed |
| Evidence | Logs, captures, reports, binaries, screenshots as applicable |
| Test results | Pass/fail with IDs |
| Known limitations | Explicit list |
| Deviations | From controlled docs (or “none”) |
| ADR references | If architectural change |

Incomplete packages → **Reject** or return without full review.

PR-level minimum: [PR_EVIDENCE_CHECKLIST.md](PR_EVIDENCE_CHECKLIST.md)

---

## 3. Review outputs

### 3.1 Compliance Review

Conformance checked against applicable:

- Charter (DOC-001)  
- SRS (DOC-002)  
- SAD (DOC-003)  
- Technology Baseline (DOC-004)  
- AMP (DOC-005)  
- FAS (DOC-006)  
- VVP (DOC-007)  
- Coding Standards (STD-FW-001)  
- ICDs (when applicable)  

### 3.2 Evidence Assessment

| Level | Meaning |
|-------|---------|
| **A** | Objective, reproducible, sufficient |
| **B** | Sufficient; missing minor supporting evidence |
| **C** | Partial; additional verification required |
| **D** | Claims without adequate evidence |

Gate acceptance normally requires **A** or **B**. Level **C/D** → Conditional Accept or Reject.

### 3.3 Risk Assessment (findings)

| Severity | Effect on gate |
|----------|----------------|
| **Critical** | Blocks acceptance |
| **Major** | Blocks acceptance |
| **Minor** | Does not block; must track |
| **Observation** | Advisory |

### 3.4 Gate Recommendation

One of:

| Decision | Meaning |
|----------|---------|
| **Accept** | Proceed |
| **Accept with Observations** | Proceed; minors/observations logged |
| **Conditional Accept** | Proceed only after stated conditions met |
| **Reject** | Do not proceed; rework required |

---

## 4. Four mandatory questions

1. Implemented according to controlled document?  
2. Tested?  
3. Objective evidence present?  
4. Acceptance / VT criteria satisfied?  

Any **No** → cannot Accept (may Conditional Accept only if gaps are explicitly scoped and non-Critical).

---

## 5. Traceability mindset

```text
Engineering Evidence
        │
        ▼
Verification Test (VT-*)
        │
        ▼
Requirement (FR/NFR)
        │
        ▼
System Requirement (SR-*)
        │
        ▼
Project Objective
        │
        ▼
Project Charter
```

Reviewers verify this chain is intact for the scope under review.

---

## 6. Template — Systems Review Record

```text
Review ID: REV-YYYYMMDD-##
Subject:
Scope (SR/FR/VT/Gate):
Compliance: Pass / Fail (notes)
Evidence level: A / B / C / D
Findings: [Critical|Major|Minor|Observation] ...
Recommendation: Accept | Accept with Observations | Conditional Accept | Reject
Conditions (if any):
Reviewer / Date:
```

Store completed records under `docs/reviews/` when issued.
