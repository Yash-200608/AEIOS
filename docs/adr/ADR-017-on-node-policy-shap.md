# ADR-017: On-Node Deterministic Policy; SHAP When Supervised Models Deploy

- **Status:** Accepted  
- **Date:** 2026-09-11  
- **Gate:** Post–Gate C reconciliation (C-16, C-17)  
- **Does not supersede:** [ADR-001](ADR-001-hierarchical-edge-intelligence.md) — hierarchical split and **TinyML exclusion remain**.

## Context

ADR-001 allows local threshold events but not on-node ML. Context File 04 requires replaceable adaptive policy (quality, confidence pre-process, MQ135 heater, power) on the node, and hybrid explanations (evidence traces always; SHAP for tree models). SAD currently lists SHAP as required for all gateway risk models.

## Decision

**Node (ESP-IDF C, no TFLite / TinyML in v1):**

- validation, filtering, feature extraction, quality assessment
- lightweight confidence **pre-processing**
- **deterministic** adaptive policy (replaceable module)
- power-aware decisions and packetization

**Gateway:**

- heavy ML, multi-node fusion, spatial estimates, forecasting, history, dashboard-facing reasoning

**Explainability:**

- Every significant event **must** carry an evidence trace: supporting sensors, contradictions, per-sensor quality, feature/trend evidence, confidence, decision reason.
- **SHAP is required** when a supervised / tree / boosting model is actually deployed on the gateway.
- Do not force SHAP onto deterministic rule engines; rule contribution + quality + trends are sufficient there.
- If the ML artifact is unavailable, fall back to deterministic rules and still persist the observation.

## Alternatives considered

| Alternative | Why rejected |
|-------------|--------------|
| TinyML on ESP32 in v1 | Gate C / ADR-001 exclusion; power and validation cost |
| SHAP on every rule firing | Noise; no model to explain |
| Threshold-only node with no policy module | Cannot express MQ135 duty cycle / VoI experiments |

## Rationale

Keeps the closed-loop on the node without claiming neural inference at the edge. Explanations stay honest about which engine produced them.

## Consequences

- ADR-001 TinyML ban unchanged.
- SAD “SHAP (or equivalent) on gateway risk models” is interpreted as: SHAP when those models exist; traces always. Formal SAD wording is in the change queue.
- Policy lives in services/app, never inside PMS/SCD/BME/MQ drivers.

## Review history

| Date | Event |
|------|-------|
| 2026-09-11 | Accepted |
