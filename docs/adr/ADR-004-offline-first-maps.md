# ADR-004: Offline-First Gateway with Preloaded Maps

- **Status:** Accepted  
- **Date:** 2026-08-01  
- **Gate:** A  

## Context

The operator dashboard needs a live map of nodes. Depending on live internet map tile services violates Offline First when the gateway has no uplink.

## Decision

The v1 dashboard **must** operate with **preloaded offline map tiles** (e.g., MBTiles or equivalent offline vector/raster packs) for the deployment region. Internet may refresh tiles when available; offline remains the default and required mode.

## Alternatives considered

| Alternative | Why rejected |
|-------------|--------------|
| Live OpenStreetMap / Google tiles only | Breaks Offline First |
| No map (tables only) | Weak operator UX for spatial hazards |
| Cloud-hosted GIS | Out of Gate C; cloud-dependent |

## Rationale

Matches Principle Offline First and Gate C offline dashboard requirement.

## Consequences

- Deployment includes a regional tile pack on the gateway  
- Technology Baseline and SAD specify offline map approach  
- NFR: dashboard usable without internet  

## Review history

| Date | Event |
|------|-------|
| 2026-08-01 | Accepted in design review |
