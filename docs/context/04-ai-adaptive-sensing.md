# AEIOS — Context File 04

AI + Adaptive Sensing + Patent-Aware Intelligence Context

Purpose: This is the authoritative intelligence-layer context for AEIOS. It defines how the system turns validated heterogeneous sensor measurements into features, confidence, anomalies, events, adaptive sensing decisions, predictions, explanations and distributed environmental intelligence. It also preserves the patent-relevant cyber-physical interactions that the implementation is expected to investigate and experimentally validate.

Load Context Files 01, 02 and 03 first. Context 04 assumes their hardware, firmware, packet, gateway and database contracts.

**Ingest status:** Canonical copy of Context File 04 (citation artifacts stripped). Draft until [CONFLICT_MATRIX.md](CONFLICT_MATRIX.md) is resolved. Does not silently override Gate A–C controlled documents.

## 1. Intelligence Layer Philosophy

AEIOS is not intended to be: sensor values → generic ML model → prediction.

AEIOS is intended to be:

```text
physical environment
      ↓
heterogeneous observations
      ↓
measurement quality
      ↓
context + features
      ↓
cross-modal reasoning
      ↓
environmental state
      ↓
event confidence
      ↓
adaptive sensing decision
      ↓
new measurements
      ↓
higher-confidence understanding
```

This makes the system closed-loop.

The intelligence layer therefore has two directions:

- Forward path: Measurement → Understanding → Decision
- Feedback path: Decision → Changed sensing behavior → New measurement

The feedback path is one of the most important conceptual characteristics of AEIOS.

## 2. Intelligence Is Multi-Stage

Do not create one giant model.

Prefer: Sensor Data → Quality Engine → Normalization → Feature Engineering → Baseline / Context Models → Cross-Modal Confidence → Event Detection → Event Classification → Spatial / Temporal Correlation → Prediction → Explanation.

Adaptive sensing sits across these layers: Quality → Confidence → Adaptive Policy → Sampling / activation / telemetry.

## 3. Sensor Semantics

The intelligence engine must respect what every sensor physically represents.

- **PMS5003** strongest interpretation: quantitative particulate signal, PM trend, PM event detection. Not: CO₂ sensor, universal pollution composition analyzer.
- **SCD41** strongest interpretation: quantitative CO₂, temperature context, humidity context. Not: PM sensor, VOC analyzer.
- **BME688** strongest interpretation: environmental context, pressure, T/RH, gas-response features. Not: universally calibrated multi-gas ppm instrument.
- **MQ135** strongest interpretation: broad gas-response indicator, anomaly/context feature. Not: universal exact ppm analyzer.

The hardware blueprint explicitly emphasizes that PMS5003 and SCD41 are the stronger quantitative signals, BME688 provides environmental/gas features, and MQ135 should be treated as a calibrated relative/trend signal rather than a universal ppm analyzer.

## 4. Observation Model

The AI layer should consume normalized observations.

```text
Observation
├── identity (node_id, timestamp, sequence)
├── measurements (PM, CO₂, T, RH, pressure, gas response)
├── quality (sensor state, quality flags, confidence)
├── physical state (heater state, warm-up age, operating mode, battery/power state)
└── provenance (firmware version, configuration version, feature version)
```

The intelligence engine must not silently discard sensor state.

## 5. Feature Engineering Philosophy

Feature engineering should capture:

- Absolute level: PM2.5, CO₂, temperature, humidity, pressure, gas index
- Change: Δx
- Rate: dx/dt
- Acceleration / change of rate: d²x/dt²
- Deviation from baseline: x - baseline
- Normalized deviation: (x - baseline) / scale
- Volatility: rolling_std, MAD, IQR
- Cross-modal relationships: PM2.5+MQ135, PM2.5+BME gas, CO₂+T/RH
- Temporal persistence: brief spike vs persistent shift

## 6. Feature Windows

Use multiple temporal windows. Example: short 30 s, medium 5 min, long 30 min.

Do not assume these exact durations are optimal. The implementation should make them configurable.

A feature may be: short_term_slope, medium_term_mean, long_term_baseline.

This helps distinguish: noise vs transient event vs persistent environmental change.

## 7. Baseline Modeling

AEIOS needs a definition of normal.

Possible baseline: rolling median, EWMA, daily profile, time-of-day baseline, site-specific baseline, node-specific baseline, seasonal baseline.

The baseline engine must avoid contaminating the baseline with confirmed events.

Example: normal → pollution event → event window excluded from baseline update → event ends → baseline resumes.

Otherwise: event → baseline shifts → event becomes "normal", which is undesirable.

## 8. Baseline Types

Potential hierarchy: Global baseline → Site baseline → Node baseline → Time-of-day baseline → Recent rolling baseline.

The system can choose the most appropriate level based on available data.

## 9. Sensor Quality Engine

Before AI reasoning: raw observation → quality assessment.

Quality should consider: range validity, missingness, rate-of-change plausibility, sensor state, warm-up state, calibration state, stale data, environmental extremes, electrical health, historical stability.

Output example:

```json
{
  "sensor": "MQ135",
  "quality": 0.63,
  "flags": ["HEATER_RECENTLY_ACTIVATED"]
}
```

## 10. Confidence Is Not the Same as Sensor Quality

This distinction is mandatory.

- Sensor quality: "How trustworthy is this measurement?"
- Event confidence: "How likely is the environmental event interpretation?"

Example: MQ135 quality = 0.65, PM quality = 0.96, BME quality = 0.94, Event confidence = 0.91.

This can occur because the event is supported strongly by multiple independent channels despite the weaker quality of MQ135.

Do not collapse these into one number.

## 11. Cross-Modal Event Confidence

This is a central AEIOS intelligence mechanism.

Suppose: PM2.5 ↑, BME688 gas response ↑, MQ135 response ↑, CO₂ changing.

The system asks: Are these signals physically and temporally consistent with one environmental event?

Possible confidence components:

```text
C = f(
    sensor quality,
    cross-modal agreement,
    temporal persistence,
    rate of change,
    environmental context,
    historical deviation
)
```

The exact mathematical model remains open.

## 12. Confidence Composition

Potential implementation:

```text
C_event =
    w1 * C_PM
  + w2 * C_CO2
  + w3 * C_BME
  + w4 * C_MQ
  + w5 * C_temporal
  + w6 * C_context
```

Weighted averaging is only an initial baseline.

More sophisticated alternatives: Bayesian evidence aggregation, probabilistic graphical models, fuzzy logic, learned meta-classifier, calibrated ensemble, Dempster-Shafer-style evidence combination, uncertainty-aware neural network.

The architecture must allow replacing the initial formula.

## 13. Sensor Agreement Matrix

A useful internal representation of potential relationships that need empirical validation.

For each event, calculate: agreement score, disagreement score, missing evidence score.

The matrix does not mean every pair always correlates positively.

## 14. Example: Real Environmental Event

Scenario: PM2.5 rises sharply, MQ135 rises, BME688 gas feature rises, CO₂ changes.

Possible interpretation: cross-modal agreement = high, temporal coherence = high, event confidence = high.

Adaptive response: increase PM sampling, activate / extend MQ135 measurement, increase event telemetry.

Gateway: event created.

## 15. Example: Sensor-Specific Spike

Scenario: MQ135 rises sharply, PM stable, CO₂ stable, BME gas stable, temperature stable.

Possible interpretation: environmental consistency = low, MQ135-only evidence = high.

Decision: do not immediately classify as regional environmental event.

Possible next action: observe, request confirmation, reduce MQ135 confidence, check heater state.

This is a critical capability.

## 16. Sensor Fault vs Environmental Event

AEIOS should distinguish sensor anomaly from environment anomaly.

- one sensor changes, others remain stable → sensor anomaly candidate
- multiple independent sensors change coherently → environmental event candidate

This is one of the major goals of multimodal sensing.

## 17. Fault Confidence

The system should produce environment_event_confidence, sensor_fault_confidence, uncertain_confidence rather than forcing a binary decision.

Example: environment = 0.21, fault = 0.68, uncertain = 0.11.

The final API may expose the highest-confidence class plus the complete distribution.

## 18. Event Classes

Initial classes can include: NORMAL, PARTICULATE_EVENT, GAS_RESPONSE_EVENT, CO2_EVENT, MULTIMODAL_ENVIRONMENTAL_EVENT, SENSOR_ANOMALY, MULTISENSOR_FAULT, LOW_POWER_EVENT, COMMUNICATION_EVENT, UNKNOWN_ANOMALY.

These are not regulatory classifications. They are internal engineering classes.

## 19. Event Severity

Potential levels: INFO, LOW, MEDIUM, HIGH, CRITICAL.

Severity should not simply equal confidence.

Example: confidence = 0.95, severity = LOW can be valid.

A highly confident tiny event is not necessarily dangerous.

## 20. Event Lifecycle

Node-level: CANDIDATE → CONFIRMING → CONFIRMED → ACTIVE → RESOLVING → RESOLVED.

Gateway can aggregate node-level events into REGIONAL_EVENT with its own lifecycle.

## 21. Adaptive Sensing

Adaptive sensing is one of AEIOS's defining behaviors.

Instead of all sensors always at the same rate, use: environment state → sensing policy → which sensor, when, how often, how long, how much telemetry.

## 22. Adaptive Inputs

The policy may consider: event confidence, sensor quality, battery state, solar state, recent rate of change, sensor disagreement, time since MQ135 activation, radio quality, current operating mode, time of day, historical event frequency.

## 23. Adaptive Outputs

The policy may control: sampling interval, sensor activation, MQ135 heater state, MQ135 measurement duration, PMS sampling mode, SCD41 mode, BME688 measurement profile, LoRa transmit priority, batching, diagnostic level.

Not every output must be changed together.

## 24. Operating Policy

Initial policy table:

- NORMAL — standard sampling, normal telemetry
- WATCH — contextual sensors slightly emphasized, monitor trend
- EVENT_CONFIRMATION — increase evidence gathering, activate selected confirmation sensor
- HIGH_RESOLUTION — high-rate measurements, event packet priority, stronger diagnostics
- LOW_BATTERY — reduce optional sensing, reduce telemetry, protect node lifetime
- DEGRADED — remove failed sensor from reasoning, continue remaining system
- SAFE — minimal functionality, preserve power and recoverability

## 25. Information Value

A major research direction: How much additional useful information is expected from activating a particular sensor?

Define conceptually:

Information Value(sensor action) = expected reduction in uncertainty or expected improvement in decision quality.

Example: BME688 gas feature changed → uncertain event → MQ135 measurement likely useful → high expected information value.

## 26. Energy Cost

Each sensing action has an estimated energy cost E(action).

Potential components: sensor power, heater power, MCU processing, radio transmission, warm-up time.

Therefore: policy_score = information_value / energy_cost is a possible initial heuristic.

The project must experimentally measure real energy costs before treating this as a validated model.

## 27. Information Value per Joule

Possible scheduling concept: score = expected_information_gain / estimated_energy_cost.

Then: if score > threshold: perform action; else defer.

This should be compared against simpler baselines: fixed sampling, battery-only adaptive sampling, event-only sampling, information/energy policy.

This comparison is critical.

## 28. Why Baselines Matter

A sophisticated algorithm is only useful if it beats simpler policies.

Experiments should compare:

- Baseline A: fixed-rate sampling
- Baseline B: battery-aware sampling
- Baseline C: simple threshold adaptive sampling
- Candidate D: cross-modal confidence policy
- Candidate E: information-value-per-energy policy

Measure: event recall, false positives, detection latency, energy consumed, radio traffic, useful information per joule.

## 29. Sensor Role Switching

AEIOS can allow sensors to play different roles over time.

Example: SCD41/BME688 as context sensors; PMS5003 as event confirmation; MQ135 as conditional gas confirmation.

During another environmental scenario, the roles may shift.

This is preferable to hard-coding a single fixed hierarchy forever.

## 30. MQ135 Intelligence

MQ135 should be interpreted through context.

Potential features: raw ADC, conditioned voltage, baseline-normalized value, rate of change, heater age, temperature, humidity, BME gas response, PM, CO₂.

A future model might estimate gas_event_likelihood rather than false precision gas_ppm unless a validated target-specific calibration is developed.

## 31. BME688 Intelligence

Potential BME features: temperature anomaly, humidity anomaly, pressure change, gas resistance trend, BSEC-derived feature, gas-response slope, gas baseline deviation.

BME688 should provide context to interpret MQ135 and environmental events.

## 32. PMS Intelligence

Potential features: pm25_level, pm10_level, pm_ratio, pm25_slope, pm10_slope, particle_count_ratio, baseline_deviation, short-term variance.

PM event detection should consider level + rate + persistence + environmental context, not simply PM2.5 > threshold.

## 33. SCD41 Intelligence

Potential features: CO₂ level, CO₂ slope, CO₂ deviation from baseline, CO₂ variability, T/RH context, ventilation-change proxy.

CO₂ can support interpretation of occupancy/activity, ventilation, combustion/context, broader environmental events.

Do not interpret every CO₂ increase as pollution.

## 34. Context Features

Environmental context may include: temperature, humidity, pressure, time of day, season, recent weather state, node operating temperature, sensor heater state, battery state.

Context can modulate confidence.

Example: MQ135 response high + temperature changed sharply + heater just activated should produce lower immediate confidence than MQ135 response high + stable temperature + BME gas response agrees.

## 35. Temporal Reasoning

AEIOS should distinguish instantaneous spike from persistent shift and periodic pattern.

Potential techniques: moving averages, EWMA, CUSUM, change-point detection, hidden Markov models, temporal convolution, recurrent models, state-space models.

Start simple. Move to ML only when data justifies it.

## 36. Anomaly Detection

Potential algorithms:

- Statistical: z-score, robust z-score, EWMA, CUSUM
- Unsupervised: Isolation Forest, Local Outlier Factor, One-Class SVM
- Temporal: change-point detection, forecasting residuals
- Learned: autoencoder, temporal neural network

No algorithm is selected permanently by this context file.

## 37. Event Detection Pipeline

Recommended: Observation → quality filtering → baseline deviation → feature extraction → candidate detection → cross-modal confirmation → confidence → classification → severity.

## 38. Forecasting

Prediction may include: PM2.5 forecast, CO₂ trend, AQ risk, event probability.

Potential horizons: 15 min, 30 min, 1 hour.

Actual horizons should be chosen after data analysis.

## 39. Forecast Model Candidates

Depending on data volume:

- Small dataset: linear regression, ridge, random forest, gradient boosting
- Moderate time series: XGBoost/LightGBM with lag features, SARIMA-like approaches, state-space models
- Large dataset: temporal deep learning, transformer-like temporal models, graph temporal models

Do not use an LSTM merely because it sounds advanced.

## 40. Spatial Intelligence

Nodes have fixed configured locations.

Spatial features may include: distance to neighboring node, neighbor event confidence, time lag between detections, gradient across nodes, spatial concentration, directional progression.

Possible model: Node observations → spatiotemporal graph → regional event.

## 41. GPS-Less Source Estimation

Potential workflow: Node events → timestamp alignment → confidence weighting → spatial arrangement → event propagation estimate → source region hypothesis.

Potential outputs: source_x, source_y, confidence, propagation_direction, estimated_speed.

The software must present these as estimates, not guaranteed source truths.

## 42. Missing Nodes

Spatial intelligence must tolerate missing nodes.

Example: NODE-02 offline. Reconstruction operates with remaining nodes and records reduced spatial confidence if appropriate.

## 43. Explainability

Every significant AI result should be explainable.

Preferred output includes: event class, confidence, supporting evidence, contradicting evidence, sensor quality, decision, reason (independent modalities changed within the same temporal window).

## 44. SHAP and Similar Tools

SHAP can be considered for supervised models.

But explainability need not depend exclusively on SHAP.

Alternative: rule contribution, feature contribution, evidence attribution, counterfactual, uncertainty.

For AEIOS, a hybrid explanation may be clearer than a black-box post-hoc explanation.

## 45. Uncertainty

The system should distinguish prediction from confidence and ideally uncertainty.

Example: PM forecast = 92 µg/m³, confidence = 0.87, prediction interval = [75, 111] where the model supports it.

## 46. Model Registry

Gateway should eventually track: model_name, model_version, training_dataset_version, feature_version, created_at, metrics, status.

Example: event-detector v0.3, features-0.2, dataset-2026-08, precision=..., recall=...

## 47. Training Data

Potential sources: field data (primary long-term), controlled events (labeled scenarios), synthetic data (early development), public datasets (initial experimentation, not automatic substitute for AEIOS-specific field data).

Data provenance is mandatory.

## 48. Labeling

Event labels may include: event_type, start, end, severity, source, confidence, label_source.

Label sources: manual, reference instrument, controlled experiment, expert review, automatically generated.

Do not treat weak automated labels as ground truth without qualification.

## 49. Reference Instruments

When accuracy claims matter, AEIOS sensor + trusted/reference monitor should be co-located.

The hardware engineering document explicitly states that sensor accuracy claims should be validated using co-location with a trusted reference instrument.

## 50. Calibration Strategy

Calibration is sensor-specific.

- PMS5003: reference co-location, environmental correction after validation.
- SCD41: manufacturer-supported calibration process under valid conditions.
- BME688: environmental offset calibration, gas-feature configuration.
- MQ135: target-specific empirical characterization, baseline normalization, controlled tests.

Do not create a single universal `calibration()` function that hides fundamentally different calibration methods.

## 51. Drift

Long-running AEIOS deployments require drift awareness.

Potential drift indicators: baseline shift, increased variance, persistent sensor disagreement, calibration residuals, unexpected response time changes.

Possible response: flag, recalibrate, reduce confidence, request maintenance.

## 52. Adaptive Calibration

A future advanced system may: detect drift → estimate correction → compare with reference/context → update calibration state.

This should only be enabled once there is enough evidence.

Automatic adaptation must never silently rewrite trusted measurements.

## 53. Patent-Aware Intelligence Architecture

The current patent strategy identifies three candidate families.

- Family A: Cross-modal event confidence controlling sensing.
- Family B: Thermal / airflow partitioning.
- Family C: GPS-less spatial-temporal reconstruction.

Context 04 is primarily responsible for Family A and Family C.

Family B is primarily a hardware/mechanical concern but interacts with sensor-quality features.

## 54. Family A — Core Candidate

The key cyber-physical loop is:

heterogeneous measurements → cross-modal evidence → event confidence → expected information value → energy cost → adaptive sensing action → new measurements → updated confidence.

Potential actions: change sampling frequency, activate sensor, activate heater, extend measurement window, change telemetry priority.

This is more specific than generic "adaptive sampling."

## 55. Patent-Aware Rule

Do not implement a fake novelty feature only for patent purposes.

The system must produce: measurable technical effect, reproducible behavior, comparison against baselines.

Potential evidence: fixed-rate baseline vs confidence-only policy vs energy-aware policy vs information/energy policy.

Measure: energy, event recall, false positives, response latency, radio traffic.

## 56. Family B Interaction

Physical sensor placement should influence intelligence.

Example: MQ135 heater active → local temperature rise → SCD41/BME688 thermal confidence reduced → event interpretation adjusted.

This creates a cyber-physical relationship: physical enclosure → sensor state → data quality → AI confidence.

## 57. Family C — Distributed Intelligence

The gateway can combine node confidence + timestamp + fixed coordinates + event class + event strength and estimate regional event, source region, propagation path, confidence.

The node does not require GPS.

## 58. Spatial Confidence

A regional event confidence might depend on: node count + temporal coherence + spatial coherence + individual sensor quality + event confidence.

Example: 3 independent nodes + coherent progression + high local confidence = high regional confidence.

One node alone should generally have lower spatial confidence.

## 59. Graph Interpretation

Represent nodes as G = (V, E) where V = sensing nodes, E = neighborhood/communication/spatial relationships.

Node features: event confidence, PM, CO₂, gas, T/RH, time, quality.

Edges may represent: distance, adjacency, radio connectivity, wind-related direction if available.

Graph-based models are an open research option.

## 60. Model Selection Policy

Choose the simplest model that works.

Decision criteria: accuracy, latency, energy, memory, explainability, robustness, dataset size, maintenance burden.

A simple model with strong validation is preferable to a complex model with weak evidence.

## 61. On-Node vs Gateway Intelligence

On-node keep: deterministic validation, filtering, lightweight features, confidence pre-processing, adaptive policy, power-aware decisions.

Gateway keep: heavier ML, multi-node analysis, spatial models, forecasting, larger feature sets, historical analysis, dashboard-facing reasoning.

This separation protects node power.

## 62. AI Model Deployment

Potential architecture: Training workstation → validated model artifact → gateway model registry → Raspberry Pi inference.

The ESP32 should only receive tiny models if evidence shows this is practical and useful.

## 63. Edge AI Constraints

Gateway models must account for: Raspberry Pi compute, RAM, thermal constraints, offline operation, inference latency.

The goal is not maximum model complexity. The goal is maximum useful environmental intelligence under edge constraints.

## 64. Data Splitting

Avoid leakage.

Do not randomly split time-series data across train/test if that allows future information to enter training.

Prefer: earlier time → train, later time → validation, later still → test.

For multi-node models, also consider leave-one-node-out to test generalization.

## 65. Evaluation Metrics

- Event detection: precision, recall, F1, false-positive rate, detection latency.
- Forecasting: MAE, RMSE, MAPE where appropriate, prediction interval coverage.
- Localization: source-location error, regional classification accuracy, temporal ordering accuracy.
- Adaptive sensing: energy per useful detection, measurement reduction, communication reduction, event recall preserved.

## 66. Most Important Adaptive-Sensing Evaluation

Do not claim "adaptive sampling saves energy." Measure it.

Example experiment: Baseline 10 s fixed sampling vs Adaptive 10 s normal / 2 s during event confirmation.

Metrics: energy/day, event recall, detection latency, packet count. Then compare.

## 67. Information-Value Experiment

For every activation: What did the additional sensor measurement add?

Possible definition: information_gain = uncertainty_before - uncertainty_after.

Alternative: decision_quality_after - decision_quality_before.

Then: information_gain / energy_cost. Compare sensor actions.

This is a research experiment, not a fixed truth.

## 68. Event-Driven Communication

Adaptive intelligence can control telemetry.

- Normal: periodic compressed observation
- Candidate event: increased reporting
- Confirmed event: immediate high-priority event packet
- Critical event: retry / acknowledgement policy

This is connected to the protocol defined in Context 03.

## 69. Decision Trace

Every adaptive decision should produce a trace.

Example: 10:31:20.400, mode NORMAL → EVENT_CONFIRMATION, reason PM2.5 slope increased, support PMS quality=.96 BME gas quality=.90, confidence 0.62, action PMS sampling 10 s → 2 s, energy cost estimated +X, next evaluation 10 s.

This makes the system debuggable and explainable.

## 70. AI Event Explanation

A dashboard result should be traceable:

Why event? Because: (1) PM2.5 increased 4.2× baseline. (2) BME688 gas feature changed. (3) MQ135 response changed. (4) Changes occurred within 35 s. (5) Sensor quality remained above threshold. Contradictions: none significant.

This is preferable to a generic confidence number.

## 71. Human-in-the-Loop

For uncertain/high-impact events, the system may request validation.

Example: confidence = 0.61, severity = HIGH. Dashboard: "Potential high-impact event; manual confirmation recommended."

This can improve dataset labeling.

## 72. Active Learning

Possible future loop: uncertain event → human review → label → training dataset → model improvement.

This aligns naturally with AEIOS's self-improving vision.

But no model should retrain automatically in production without controlled validation.

## 73. Self-Learning Constraint

"Self-learning" from the proposal should be implemented carefully.

Acceptable early definition: The system can accumulate historical observations and support model improvement.

It should not initially mean: the production model changes itself continuously without validation.

A safe workflow: data → candidate model → offline validation → human/engineer approval → new version → deployment.

## 74. Explainable Adaptive Sampling

The system should be able to answer: Why did sampling increase?

Possible answer: PM2.5 slope exceeded watch threshold. BME688 gas response corroborated the change. MQ135 was not yet activated because its expected information/energy score was below threshold.

This is a valuable engineering property.

## 75. What AI Must Never Do

Never allow AI to: fabricate sensor values, silently alter raw observations, claim ppm without calibration, conceal uncertainty, overwrite historical data, disable safety/watchdog behavior, choose invalid hardware configurations, bypass packet validation.

## 76. Model Fallback

If the AI model fails: AI unavailable → deterministic rules → system continues.

The environmental sensing platform should not collapse because an ML artifact is unavailable.

## 77. Explainability Fallback

If SHAP/model explanation is unavailable: rule-based evidence + sensor contribution + quality + trend should still explain an event.

## 78. Dataset Architecture

Potential gateway datasets: raw_observations, clean_observations, features, events, labels, predictions, model_inputs, model_outputs.

Keep raw data immutable. Derived data can be recomputed.

## 79. Reproducibility

Every experiment should record: dataset version, feature version, model version, configuration version, firmware version, software version, timestamp.

Then: same inputs + same versions → reproducible result as far as the selected algorithm permits.

## 80. Simulation

The AI engine should support synthetic generators: generate_normal(), generate_pm_event(), generate_gas_event(), generate_multimodal_event(), generate_sensor_fault(), generate_missing_sensor(), generate_drift(), generate_low_battery().

This is essential before large real-world datasets exist.

## 81. Synthetic Event Design

Synthetic data should include: environmental event (PM↑ gas↑ CO₂ context), sensor fault (MQ135↑ everything else stable), drift, noise, missing data, multiple overlapping events.

## 82. AI Testing

Minimum: AI-001 normal data, AI-002 single-sensor spike, AI-003 multimodal event, AI-004 sensor drift, AI-005 missing sensor, AI-006 noisy data, AI-007 low confidence, AI-008 high confidence, AI-009 node missing, AI-010 regional event.

## 83. Research Notebook Requirement

Every substantial intelligence experiment should record: hypothesis, dataset, algorithm, parameters, baseline, metrics, result, failure, interpretation, next step.

Do not rely solely on code comments.

## 84. Creativity Is Explicitly Open

Valid investigation paths include: Bayesian sensor fusion, evidential reasoning, uncertainty-aware ML, causal inference, change-point detection, online drift detection, graph neural networks, spatiotemporal transformers, reinforcement-learning-inspired sensing policies, model-predictive sensing, contextual bandits for sensor activation, active learning, self-supervised representation learning, digital twins of sensors, energy prediction models, communication-aware sensing, anomaly-aware packet compression.

No technique should be adopted solely because it sounds advanced.

## 85. Potential Advanced Research Direction — Contextual Bandit

Sensor activation can eventually be treated as an action-selection problem.

State: current observations, battery, sensor states, recent events.

Actions: activate PM, activate MQ135, sample SCD41, sample BME, transmit, wait.

Reward: information gain - energy cost - communication cost.

This is a research direction, not a V1 requirement.

## 86. Potential Advanced Research Direction — Model Predictive Sensing

Instead of reacting only to current values: predict near-future state → select measurements → reduce uncertainty.

This could eventually allow sensing ahead of a predicted event rather than after the event begins.

## 87. Potential Advanced Research Direction — Digital Sensor State

Model every sensor as: physical state + measurement state + confidence state.

Example MQ135: heater temperature state, baseline state, aging/drift state, measurement confidence.

This can create a "digital twin" style abstraction without requiring a full physics simulation.

## 88. Patent-Aware Implementation Rule

The software should preserve evidence for the potentially distinctive loop:

heterogeneous evidence → cross-modal confidence → information value → energy cost → sensing action → new evidence.

To make this technically credible, the database must preserve: decision, reason, confidence, estimated value, estimated energy, actual action, result.

Context 03 already establishes sampling_decisions for this purpose.

## 89. Patent Family B Software Interaction

When the enclosure creates thermal or airflow interactions: physical state → sensor quality → confidence.

Example: MQ135 active → nearby temperature rises → SCD41 quality reduced → CO₂ confidence adjusted.

Do not hide these interactions. They are part of the cyber-physical system.

## 90. Patent Family C Software Interaction

Gateway needs: node_id, timestamp, confidence, coordinates, event class, measurement quality.

Then: node event sequence → spatial correlation → regional event.

No GPS receiver is necessary.

## 91. Model Governance

Models require: versioning, validation, rollback, metadata, evaluation, approval.

The gateway should know: current_model, previous_model, model_metrics.

## 92. Production vs Research Models

Support: stable_production_model, experimental_model.

The dashboard may compare them internally.

Do not let experimental models silently replace production decisions.

## 93. Research Feature Flags

Potential: FEATURE_ADAPTIVE_SAMPLING, FEATURE_MQ135_DUTY_CYCLE, FEATURE_INFORMATION_VALUE, FEATURE_SPATIAL_RECONSTRUCTION, FEATURE_EXPERIMENTAL_MODEL.

Feature flags should be explicit.

## 94. AI Failure Handling

If model inference fails: log error, record fallback, use deterministic path, preserve observation.

Do not drop the measurement.

## 95. AI Latency Budget

The gateway should measure: feature latency, model latency, event latency.

The dashboard can show: event detected 1.8 seconds after packet arrival where appropriate.

## 96. AI Memory Budget

The AI service should avoid unbounded in-memory history.

Use: windowed features, database-backed history, cached summaries.

## 97. Data Leakage Avoidance

Never use future observations, post-event values, or manually corrected future labels when generating features for a past prediction task.

This is especially important for forecasting.

## 98. Evaluation Without Self-Deception

AEIOS should compare against simple baselines.

Example: Naive threshold vs EWMA vs Isolation Forest vs XGBoost vs advanced model.

If the simple approach wins: use the simple approach.

## 99. Primary AI Deliverables

V1 should target:

- A. Data-quality engine
- B. Baseline/deviation engine
- C. Cross-modal confidence engine
- D. Rule-based adaptive policy
- E. Basic anomaly detection
- F. Event classifier
- G. Basic spatial correlation
- H. Explainable event output

Advanced ML is optional after these foundations are solid.

## 100. V1 Intelligence Definition of Done

V1 intelligence is complete when:

- Sensor observations are normalized.
- Sensor quality is calculated.
- Baselines exist.
- Trends and deviations are computed.
- Cross-modal confidence can be calculated.
- Sensor anomalies can be distinguished from candidate environmental events at least heuristically.
- Adaptive sampling can change based on validated policy.
- MQ135 can be conditionally activated or deprioritized where hardware supports it.
- Event packets carry confidence and quality.
- Gateway can combine events across nodes.
- Basic spatial/temporal correlation works.
- Explanations exist.
- Experiments compare against baselines.
- AI can fail without taking down sensing.
- All decisions are traceable.

## 101. Final Mental Model

The AI layer should behave like an environmental reasoning system:

What do I observe? → How trustworthy is it? → What changed? → Do independent sensors agree? → How likely is this to be a real event? → What measurement would reduce uncertainty? → Is that measurement worth its energy? → Should I activate it? → What did the new measurement tell me? → Should I transmit more urgently? → What is happening across the network? → What is likely to happen next? → Why did I reach this conclusion?

That loop is the intelligence identity of AEIOS.

## 102. Next Context File

Context File 05 — Development + Testing + Deployment Context.

It will define: repository structure, branch strategy, coding conventions, firmware build process, gateway development environment, Python environment, database migration workflow, CI, test pyramid, simulation, hardware-in-the-loop, serial/log tooling, ESP32 flashing, Raspberry Pi deployment, system services, Docker where useful, environment/configuration management, secrets, release/versioning, observability, field commissioning, backups, recovery, security, documentation, demo mode, and long-term scaling.

Context 05 will be the final operational context layer that tells the coding agent how to build, test, ship and maintain everything defined by Contexts 01–04.
