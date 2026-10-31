# AI

Feature engineering, model training/inference, explainability.

Gateway-local inference only for v1 (ADR-001). TinyML/TFLite is not v1.

Evidence traces are mandatory for significant events. SHAP is required when a supervised/tree-based model is actually deployed (ADR-017). Do not force SHAP onto deterministic rule engines.

Never treat MQ135 or BME688 gas features as universal calibrated ppm.

## Data foundation (Phase 2)

```
python -m ai.preprocessing.openaq_fetch discover   # CPCB stations within 25 km of SGT (needs OPENAQ_API_KEY in .env)
python -m ai.preprocessing.openaq_fetch history    # hourly PM2.5/PM10 since 2022-08, resumable
python -m ai.preprocessing.weather_fetch           # Open-Meteo ERA5 + CAMS, no key
python -m ai.preprocessing.quality_report --write  # gaps, usable stations, leakage audit -> ai/reports/data_quality.md
```

The cache is an untracked SQLite file under `ai/data/cache/`. CPCB values are other people's reference measurements and weather/CAMS are model output; none of it is AEIOS node data. Features that use weather at the target time (`tw_*`) are an oracle (reanalysis standing in for a forecast) and must be labelled as such.
