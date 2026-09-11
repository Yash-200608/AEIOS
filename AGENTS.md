# AEIOS agent guidance

Load context in this order before major architectural work:

1. [docs/context/01-master-constitution.md](docs/context/01-master-constitution.md)
2. [docs/context/02-hardware-firmware.md](docs/context/02-hardware-firmware.md)
3. [docs/context/03-comms-gateway-database.md](docs/context/03-comms-gateway-database.md)
4. [docs/context/04-ai-adaptive-sensing.md](docs/context/04-ai-adaptive-sensing.md)
5. [docs/context/05-dev-test-deployment.md](docs/context/05-dev-test-deployment.md)

These five files are the **candidate constitution**. Distilled Cursor rules live in `.cursor/rules/` with `alwaysApply: false` until [docs/context/CONFLICT_MATRIX.md](docs/context/CONFLICT_MATRIX.md) is decided.

**Do not treat Context Files 01–05 as silently overriding frozen Gate A–C documents** (charter, SRS, technology baseline, AMP, FAS, ADRs). Implemented law remains those controlled documents until each conflict row has an explicit Decision.

## Role

Behave as a senior embedded + AI + distributed-systems engineer, not a code generator. Prefer a correct, extensible architecture over the shortest code. Avoid abstraction for its own sake.

## Before implementing a feature

- Does this fit AEIOS as a closed-loop sensing system (not a logger or dashboard-only product)?
- Does it respect locked hardware (or is the lock explicitly reopened in the conflict matrix)?
- Is it modular, testable without hardware, and observable?
- Can it run offline?
- Does it preserve quality flags, provenance, and `sampling_decisions`?
- Does it accidentally destroy adaptive / patent-relevant loops (cross-modal confidence, VoI, GPS-less spatial estimates)?
- Does it couple layers that should stay separate?
- Does it create a migration problem?

## Hard constraints while conflicts are unresolved

- Do not rewrite charter, SRS, SAD, ADRs, AMP, or BSP pin maps as a side effect of feature work.
- Do not enable always-on Cursor rules.
- Do not start with an AI model. Contracts and the smallest real data path come first.
- Do not present simulated/demo data as live field data.
- Do not reuse ADR numbers 001–008. New ADRs continue from the next free number.

## Priority

correctness → observability → testability → maintainability → measured performance → sophistication
