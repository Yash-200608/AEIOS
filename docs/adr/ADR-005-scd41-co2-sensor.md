# ADR-005: SCD41 Selected as CO₂ Sensor

- **Status:** Accepted — SCD41 decision stands; “Drop MQ135” superseded by [ADR-011](ADR-011-mq135-gas-response.md)  
- **Date:** 2026-08-01  
- **Gate:** A  

## Context

MQ-series metal-oxide sensors (e.g., MQ135) were considered for approximate air pollution / CO₂ proxies but exhibit high drift, poor repeatability, high power, and calibration challenges — unsuitable for a research-grade platform. AEIOS requires scientifically meaningful CO₂ when claiming CO₂ capability.

## Decision

**Include SCD41 (true CO₂) in v1.** Absorb cost elsewhere in the BOM if needed (enclosure/misc optimization). Do not ship misleading CO₂ proxies.

**Drop MQ135** from the sensing baseline.

## Alternatives considered

| Alternative | Why rejected |
|-------------|--------------|
| MQ135 / MQ-series | Drift, calibration, power, credibility |
| Omit CO₂ entirely | Weaker wildfire/ventilation features and research value |
| “Include if budget permits” | Conditional language forbidden in frozen design |

## Rationale

Research-grade measurements, better feature engineering for wildfire/air applications, eliminates MQ calibration debt, strengthens datasets for AI.

## Consequences

- BOM must include SCD41  
- SRS includes CO₂ measurement requirements  
- Drivers and health checks cover SCD41  
- Charter sensing baseline lists SCD41  

## Review history

| Date | Event |
|------|-------|
| 2026-08-01 | Gate A SCD41 decision closed — Include |
| 2026-09-11 | MQ135 exclusion superseded by ADR-011; SCD41 remains quantitative CO₂ |
