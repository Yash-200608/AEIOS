# ADR-011: MQ135 Included as Duty-Cycled Gas-Response Feature

- **Status:** Accepted  
- **Date:** 2026-09-11  
- **Gate:** Post–Gate C reconciliation (C-02)  
- **Amends:** [ADR-005](ADR-005-scd41-co2-sensor.md) — **SCD41 remains the quantitative CO₂ sensor.** Only the “Drop MQ135” clause is superseded.

## Context

ADR-005 dropped MQ-series devices because they are poor CO₂ proxies. Context Files 01–04 lock MQ135 as a **complementary** heated SnO₂ gas-response channel: anomaly trigger, contextual evidence, and an energy-costly action for information-value experiments. Pretending MQ135 is calibrated ppm would recreate the credibility problem ADR-005 solved.

## Decision

1. **MQ135 is in the v1 sensing node.**
2. **Roles:** broad gas-response, anomaly/context modality, duty-cycled heater, warm-up-aware measurement, energy-costly sensing action.
3. **Never** label raw ADC, voltage, or a unitless index as universal calibrated ppm.
4. Firmware **must** track: heater state, warm-up/stabilization, activation/deactivation, time since activation, quality flags, and confidence impact (including thermal coupling to SCD41/BME688).
5. Analog path: conditioned voltage only; divider ratio is configuration. Do not connect an unconditioned MQ output to the ESP32 ADC.
6. **SCD41 remains the only quantitative CO₂ channel.** Do not infer CO₂ from MQ135.

## Alternatives considered

| Alternative | Why rejected |
|-------------|--------------|
| Keep MQ135 excluded (ADR-005) | Contradicts locked BOM and patent-relevant VoI/heater loop |
| Use MQ135 as ppm CO₂ | Scientifically indefensible; undoes ADR-005 |

## Rationale

MQ135’s value is hierarchical confirmation and energy-aware activation, not fake gas analysis. SCD41 still owns CO₂ truth.

## Consequences

- DOC-004 “explicitly rejected MQ135” requires a controlled revision.
- Driver table includes MQ135 (heater-aware), not a GPS stub.
- `sampling_decisions` must be able to record MQ135 activate/defer and estimated energy.
- Accuracy claims still require co-location with a reference instrument (unchanged).

## Review history

| Date | Event |
|------|-------|
| 2026-09-11 | Accepted — MQ135 reinstated as feature sensor |
