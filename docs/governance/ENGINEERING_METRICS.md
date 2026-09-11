# AEIOS Engineering Metrics

**Document ID:** GOV-MET-001  
**Version:** 1.0  
**Status:** Active — track during Execution Phase  
**Date:** 2026-08-01  

Objective indicators of progress (not “features completed”). Update periodically (e.g. per gate review) in `docs/metrics/SNAPSHOT.md`.

---

## Documentation

| Metric | Notes |
|--------|-------|
| Requirements coverage (%) | FR/NFR with ≥1 VT mapped |
| Traceability coverage (%) | SR→FR→module→VT chain complete |
| ADR count | Accepted ADRs |
| Controlled document revision count | DOC/GOV version bumps |

---

## Firmware

| Metric | Notes |
|--------|-------|
| Build success rate | CI / local D1+ |
| Warning count | Treat unexpected as debt |
| Static analysis findings | Critical/Major = block |
| Unit test pass rate | Host + Unity |
| Code coverage | Where practical |
| Flash usage | From map / `idf.py size` |
| RAM usage | Static + peak if available |
| Boot time | To “Normal operation” |

---

## Protocol

| Metric | Notes |
|--------|-------|
| Golden vector pass rate | VT-AMP-* |
| Parser conformance | DOC-005 types |
| CRC verification success | |
| MAC verification success | |
| Retry success rate | When D3 complete |

---

## Hardware

| Metric | Notes |
|--------|-------|
| Driver bring-up completion | Per STD-FW-001 order |
| Self-test pass rate | |
| Current consumption (active) | |
| Sleep current | VT-PWR-003 |
| Wake latency | |

---

## Verification

| Metric | Notes |
|--------|-------|
| Tests implemented vs planned | TEST_CATALOG |
| Passed / Failed | |
| Regression coverage | Bugs with tests |

---

## Initial snapshot

See [SNAPSHOT.md](../metrics/SNAPSHOT.md).
