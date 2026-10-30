# ADR-018: v0 Field Prototype (CSV packets, BME680 + GPS nodes, cloud mirror)

- **Status:** Accepted (interim; AMP v1 remains the target)  
- **Date:** 2026-10-30  
- **Gate:** Post–Gate C reconciliation; does not change any frozen document

## Context

A working field prototype has been running since 2026-10-26, separately from the AMP v1 implementation in `gateway/`:

- Nodes send **ASCII CSV** LoRa packets (`node,boot,time,temp,rh,pressure,gas_kohm,pm1,pm2_5,pm10,mq_mV[,lat,lon,fix,sats]`) at 433 MHz (SF7, BW125, sync word 0x12) to an SX1278 on the Pi.
- Node hardware is **PMS5003, BME680, MQ135 and GPS**. There is **no SCD41** (no CO₂).
- The Pi runs a receiver, an online forecaster, a local dashboard, a cloud uploader and a smoke watch (`edge/v0/`).
- A cloud mirror (Supabase) and a web dashboard (`frontend/web/`) present the data. Cloud sync is a mirror only: the Pi keeps receiving, storing, forecasting and alerting with no internet.

These conflict with locked decisions: ADR-006 / ADR-009 (AMP binary frames), ADR-010 (no GPS), ADR-005 / ADR-012 (SCD41, BME688), and the AMP security properties (CRC-16, truncated HMAC-SHA256, replay window).

## Decision

1. **`edge/v0/` is the live v0 field prototype.** It is an interim deviation, recorded here, not a replacement for the AMP v1 target. `gateway/` stays the AMP v1 package.
2. **v0 data is labelled v0** wherever it is stored or shown: packets keep `source = 'lora'`; simulated rows are never uploaded; the UI separates measured, externally forecast, AEIOS-model and scenario data.
3. **Real v0 hardware is documented as built:** BME680 gas resistance is a gas *feature* (not ppm); MQ135 is a relative response (mV); GPS fields are metadata and are not used for installation-mode positioning.
4. **Adapter (planned, not yet built):** a CSV-to-`Observation` adapter will let the existing deterministic `QualityEngine`, `BaselineBank`, `FeatureExtractor` and `EventDetector` run on v0 data. Sensors that are not fitted (SCD41) must be reported as *not fitted*, not as faulted, so the combined quality score is not permanently penalised. That change, and the adapter itself, will be tested and recorded in a later commit.
5. **No field-readiness claim.** v0 results are prototype evidence. MVN still gates readiness claims (C-19).
6. **Convergence:** moving nodes to AMP v1 and the target sensor set supersedes this ADR; the dashboard, cloud schema and ML work should read from the repository `Observation` contract so that change is a transport swap.

## Alternatives considered

| Alternative | Why rejected |
|-------------|--------------|
| Rewrite the prototype to AMP v1 before any AI work | Blocks AI and dashboard work on firmware and hardware changes that are not yet possible |
| Edit frozen documents to match v0 | Violates release law; the change queue is the correct route |
| Leave the prototype outside the repository | Unversioned code on one device and in a temporary folder is a single point of loss |

## Rationale

The prototype produces real data today and exercises the edge-intelligence and sync paths. Recording the deviation keeps the repository honest and keeps AMP v1 as the destination.

## Consequences

- v0 packets have no authentication or replay protection beyond the radio CRC and the receiver's format check. v0 data must not be used for security-relevant decisions.
- Cloud uploads use a device token (hash stored server-side) and row-level security; the token lives only in the Pi's private `uploader.env`.
- Frozen-document follow-ups are queued in `CONTROLLED_DOC_CHANGE_QUEUE.md`.

## Review history

| Date | Event |
|------|-------|
| 2026-10-30 | Accepted (interim) |
