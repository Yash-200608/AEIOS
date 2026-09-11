# AI

Feature engineering, model training/inference, explainability.

Gateway-local inference only for v1 (ADR-001). TinyML/TFLite is not v1.

Evidence traces are mandatory for significant events. SHAP is required when a supervised/tree-based model is actually deployed (ADR-017). Do not force SHAP onto deterministic rule engines.

Never treat MQ135 or BME688 gas features as universal calibrated ppm.
