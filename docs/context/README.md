# AEIOS Context Stack (draft)

**Status:** Draft — ingested 2026-09-11. **Not** configuration-controlled. **Does not** silently override Gate A–C ADRs, the charter, the technology baseline, AMP, or FAS.

These five files are the candidate engineering constitution from the context-building phase. Cursor rules that distill them currently have `alwaysApply: false`. Fill [CONFLICT_MATRIX.md](CONFLICT_MATRIX.md) before promoting those rules or rewriting frozen documents.

| File | Title | Role |
|------|-------|------|
| [01-master-constitution.md](01-master-constitution.md) | Master Project Context / System Constitution | Identity, locked hardware, closed-loop philosophy |
| [02-hardware-firmware.md](02-hardware-firmware.md) | Hardware + Embedded Firmware | Node platform, pins, drivers, state machines |
| [03-comms-gateway-database.md](03-comms-gateway-database.md) | Communication + Gateway + Database | LoRa protocol, Pi 5, SQLite, APIs |
| [04-ai-adaptive-sensing.md](04-ai-adaptive-sensing.md) | AI + Adaptive Sensing + Patent-Aware Intelligence | Confidence, VoI, explainability, spatial estimates |
| [05-dev-test-deployment.md](05-dev-test-deployment.md) | Development + Testing + Deployment | Repo, tests, CI, field, demo vs live |

Load **01** first, then 02–05, before major architectural work. Agent operating checklist: [AGENTS.md](../../AGENTS.md).

Until conflicts are resolved, treat Gate A–C controlled documents as **implemented law** and this folder as **candidate constitution**.
