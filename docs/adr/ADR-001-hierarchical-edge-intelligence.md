# ADR-001: Hierarchical Edge Intelligence

- **Status:** Accepted  
- **Date:** 2026-08-01  
- **Gate:** A  

## Context

AEIOS must provide predictive intelligence without cloud dependence. Early wording claimed “distributed intelligence,” which implied substantial ML on every sensor node. Node MCUs are power- and memory-constrained; gateway-class hardware can run explainable models.

## Decision

Adopt **Hierarchical Edge Intelligence**:

1. **Sensor node** — acquisition, filtering, validation, local event detection, power management, store-and-forward  
2. **Mesh** — reliable transport of telemetry, health, and compact commands/config  
3. **Gateway** — AI inference, risk prediction, explainability, decision and alert engines  
4. **Operators** — offline dashboard and alert consumption  

Do not claim federated or on-node TinyML as v1 capabilities.

## Alternatives considered

| Alternative | Why rejected |
|-------------|--------------|
| Fully centralized cloud AI | Violates Offline First |
| On-node ML (TinyML) for v1 | Power/memory/validation burden; Gate C excluded |
| “Distributed intelligence” branding without on-node ML | Misleading for research and competitions |

## Rationale

Matches power reality, preserves offline autonomy, enables SHAP-class explainability at the gateway, and keeps nodes focused on sensing and survival.

## Consequences

- SRS and marketing must use hierarchical wording  
- AI service runs on the gateway  
- Nodes may raise local threshold events but not full risk models in v1  
- Future TinyML remains v2+ and requires a new ADR  

## Review history

| Date | Event |
|------|-------|
| 2026-08-01 | Accepted in design review; replaces “Distributed Intelligence” principle wording |
| 2026-09-11 | TinyML exclusion reaffirmed; node deterministic policy and SHAP-when-deployed refined in ADR-017 (this ADR not superseded) |
