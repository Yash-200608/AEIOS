# ADR-016: Docker Compose for Development; systemd Acceptable on the Pi

- **Status:** Accepted  
- **Date:** 2026-09-11  
- **Gate:** Post–Gate C reconciliation (C-13)

## Context

DOC-004 requires Docker Compose on the gateway. Context File 05 allows native Pi services when they improve reliability. Field nodes must not depend on unnecessary orchestration.

## Decision

1. **Development / CI / integration:** Docker and Docker Compose are allowed and preferred for reproducibility.
2. **Field Raspberry Pi:** native **systemd** units are acceptable and preferred when they reduce failure modes (single process or small set: gateway, API, worker).
3. Both deployments **must share** the same application, configuration schema, and environment names (`AEIOS_ENV`, `AEIOS_MODE`).
4. Do not require Kubernetes or a container swarm for v1.

## Alternatives considered

| Alternative | Why rejected |
|-------------|--------------|
| Compose mandatory on every Pi | Operational fragility for a single-box prototype |
| No containers anywhere | Hurts CI and developer onboarding |

## Rationale

Same contracts, different process supervisors.

## Consequences

- `deployment/` may contain both compose files and unit files.
- DOC-004 “Docker Compose required” needs a controlled revision to match this split.

## Review history

| Date | Event |
|------|-------|
| 2026-09-11 | Accepted |
