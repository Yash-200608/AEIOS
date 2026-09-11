# AEIOS 2.0 — Sentinel

**Adaptive Environmental Intelligence Operating System**

AEIOS is a **distributed cyber-physical environmental intelligence platform** for remote forests, mountains, wildlife reserves, and other infrastructure-poor regions. It is an environmental operating system — not an air-quality IoT demo.

Codename: **Sentinel**

---

## Identity

| Attribute | Definition |
|-----------|------------|
| System type | Distributed cyber-physical environmental intelligence platform |
| Intelligence model | Hierarchical Edge Intelligence (ADR-001) |
| First application vertical | Environmental sensing (wildfire and other event apps later) |
| Operation model | Offline-first, solar-powered, LoRa star v1 (AMP codec; mesh later) |

---

## Governing rules

1. **One Rule** — Every feature must genuinely improve autonomous environmental monitoring in remote, infrastructure-poor terrain.
2. **Technology Introduction Rule** — A technology may enter AEIOS only if it solves a defined requirement, fits power/cost/deployment constraints, and can be implemented, tested, and demonstrated in the v1 prototype.
3. **Documentation Rule** — Subsystems use a fixed engineering template; completeness is measured by content, not page count.

After Gate A acceptance, changing fundamental decisions requires a design review and an updated Architecture Decision Record (ADR).

---

## Controlled documents

| Document | Path | Purpose |
|----------|------|---------|
| Project Charter | [docs/charter/PROJECT_CHARTER.md](docs/charter/PROJECT_CHARTER.md) | Vision, scope, governance, Gate C boundary |
| SRS | [docs/srs/SRS.md](docs/srs/SRS.md) | What the system must do (no technology names) |
| SAD | [docs/sad/SAD.md](docs/sad/SAD.md) | How requirements are realized |
| Technology Baseline | [docs/technology-baseline.md](docs/technology-baseline.md) | Approved hardware, software, tools |
| ADRs | [docs/adr/](docs/adr/) | Configuration-controlled decisions |
| Gate A checklist | [docs/gates/GATE_A_CHECKLIST.md](docs/gates/GATE_A_CHECKLIST.md) | **ACCEPTED** 2026-08-01 |
| Protocol (DOC-005) | [docs/sad/protocol/AMP_PROTOCOL_SPEC.md](docs/sad/protocol/AMP_PROTOCOL_SPEC.md) | **Controlled** — on-wire v1 frozen |
| Gate B checklist | [docs/gates/GATE_B_CHECKLIST.md](docs/gates/GATE_B_CHECKLIST.md) | **ACCEPTED** 2026-08-01 |
| ICD-001 / ICD-002 | [docs/icd/](docs/icd/) | Active against DOC-005 |
| Firmware Architecture (DOC-006) | [docs/firmware/FAS.md](docs/firmware/FAS.md) | Gate D baseline |
| Coding Standards | [docs/firmware/CODING_STANDARDS.md](docs/firmware/CODING_STANDARDS.md) | Frozen |
| MVN | [docs/firmware/MVN.md](docs/firmware/MVN.md) | Blocks AI/dashboard critical path |
| V&V Plan (DOC-007) | [docs/verification/VVP.md](docs/verification/VVP.md) | Requirement→test contract |
| Engineering Execution | [docs/governance/ENGINEERING_EXECUTION.md](docs/governance/ENGINEERING_EXECUTION.md) | Evidence-first phase |
| Gate D checklist | [docs/gates/GATE_D_CHECKLIST.md](docs/gates/GATE_D_CHECKLIST.md) | D1→MVN evidence packages |
| Versioning | [docs/VERSIONING.md](docs/VERSIONING.md) | Semver / docs / ADR / protocol / HW |
| RTM | [docs/traceability/RTM.md](docs/traceability/RTM.md) | Requirement traceability |
| Risk Register | [docs/risk/RISK_REGISTER.md](docs/risk/RISK_REGISTER.md) | Living risks |

---

## Repository layout

```text
AEIOS/
├── firmware/       # Sensor node firmware (ESP-IDF)
├── gateway/        # Edge gateway (AMP ingest, SQLite, intelligence)
├── simulation/     # Hardware-independent digital twin (no field hardware)
├── backend/        # API and decision services
├── ai/             # Feature engineering, models, explainability
├── database/       # Schema, migrations
├── frontend/       # Offline-capable operator dashboard
├── deployment/     # Docker, nginx, systemd, scripts
├── docs/           # Controlled engineering documents
├── tests/          # Firmware, backend, AI, integration, field
└── scripts/        # Automation helpers
```

Implementation directories are scaffolded and empty until architecture is one milestone ahead of development (parallel-track policy).

---

## Gates

| Gate | Meaning |
|------|---------|
| **A** | Charter + SRS + Technology Baseline accepted |
| **B** | Binary mesh protocol frozen (packet + routing + reliability + auth) |
| **C** | System boundary freeze (what v1 is / is not) — recorded in Charter |
| **D** | Detailed design ready for full implementation |
| **E** | Field validation against acceptance criteria |

---

## v1 sensing baseline (target — ADR-009…013)

PMS5003 (PM), SCD41 (CO₂), BME688 (T/RH/P + gas **features**, not ppm), MQ135 (duty-cycled gas-response, **not** calibrated ppm), SX1278 @ 433 MHz, solar/battery. **No GPS/GNSS.** Battery ADC is hardware-pending (not GPIO34). Node IDs are configurable (`uint16` on air). Do not hard-code five nodes.

Pins and BSP: [ADR-013](docs/adr/ADR-013-hw-node-r2-pinmap.md). Conflict resolutions: [docs/context/CONFLICT_MATRIX.md](docs/context/CONFLICT_MATRIX.md).

Gate A–C controlled documents still describe BME680 / install GPS / Timescale / MQTT until the [change queue](docs/adr/CONTROLLED_DOC_CHANGE_QUEUE.md) is merged. **Target architecture** is the ADRs above.

---

## Status

| Gate | Status |
|------|--------|
| **A–C** | Frozen |
| **B** | AMP on-wire v1 frozen |
| **D** | **Engineering Execution** — evidence-gated D1→MVN; gateway/AI blocked by MVN |

**Rule:** No untested code enters main ([GOV-EXEC-001](docs/governance/ENGINEERING_EXECUTION.md)).  
**Reviews:** Evidence packages per [GOV-REV-001](docs/governance/REVIEW_POLICY.md); DoD [GOV-DOD-001](docs/governance/DEFINITION_OF_DONE.md).  
**Next gate evidence:** [D1 Acceptance Preview](docs/gates/D1_ACCEPTANCE_PREVIEW.md).

Prototype budget target ≈ ₹50,000.
