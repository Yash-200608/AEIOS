# AEIOS Context Stack

**Status:** Ingested 2026-09-11. Conflict matrix **resolved 2026-09-11**.

These five files remain the narrative constitution. They do **not** silently override Gate A–C controlled documents. After resolution:

- **Release law:** charter, SRS, SAD, DOC-004, AMP, FAS, ADR-001…008 (as originally frozen), until items in [CONTROLLED_DOC_CHANGE_QUEUE.md](../adr/CONTROLLED_DOC_CHANGE_QUEUE.md) are merged.
- **Target architecture:** [CONFLICT_MATRIX.md](CONFLICT_MATRIX.md) + [RESOLVED_ARCHITECTURE.md](RESOLVED_ARCHITECTURE.md) + ADR-009…017.
- Cursor rules: `alwaysApply: false` (must not override controlled docs).

| File | Title | Role |
|------|-------|------|
| [01-master-constitution.md](01-master-constitution.md) | Master Project Context | Identity, locked hardware, closed-loop philosophy |
| [02-hardware-firmware.md](02-hardware-firmware.md) | Hardware + Embedded Firmware | Node platform, pins, drivers |
| [03-comms-gateway-database.md](03-comms-gateway-database.md) | Communication + Gateway + Database | Protocol, Pi 5, SQLite |
| [04-ai-adaptive-sensing.md](04-ai-adaptive-sensing.md) | AI + Adaptive Sensing | Confidence, VoI, explainability |
| [05-dev-test-deployment.md](05-dev-test-deployment.md) | Development + Testing + Deployment | Repo, tests, CI, field |

Wording in 01–05 that contradicts the matrix (example ADR numbers in CF05 §72; “PlatformIO or Arduino” in CF03 §76) is **historical ingest text**. Follow [RESOLVED_ARCHITECTURE.md](RESOLVED_ARCHITECTURE.md) and ADR-002 / C-18 / C-21.

Agent checklist: [AGENTS.md](../../AGENTS.md).
