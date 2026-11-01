"""Forecast inference with integrity checks and a deterministic fallback (ADR-017).

`ForecastEngine.load()` verifies the sha256 of every model file against `metadata.json` before using it. If the artifact is
missing, altered or unreadable, or lightgbm is not installed, the engine does not guess: it returns persistence forecasts
labelled `fallback_persistence` with no interval, so a consumer can never mistake them for model output.

Every forecast says what it is: model version, the source of its input (e.g. a CPCB reading vs an AEIOS node), and
TreeSHAP drivers. Nothing here claims node-level accuracy; the model was trained on CPCB station data.
"""

from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path
from typing import Any, Optional

try:  # numpy/lightgbm are optional at import time so the fallback path works on a bare interpreter
    import numpy as np
    import lightgbm as lgb
except ImportError:  # pragma: no cover - exercised by the fallback test via a flag
    np = None  # type: ignore[assignment]
    lgb = None  # type: ignore[assignment]

REGISTRY = Path(__file__).resolve().parents[1] / "models" / "registry"
MODEL_NAME = "pm25_lgbm_cqr"


class ModelIntegrityError(RuntimeError):
    pass


def _sha256(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def latest_version(registry: Path = REGISTRY, name: str = MODEL_NAME) -> Optional[Path]:
    base = registry / name
    if not base.is_dir():
        return None
    versions = sorted(d for d in base.iterdir() if (d / "metadata.json").is_file())
    return versions[-1] if versions else None


class ForecastEngine:
    def __init__(self, meta: Optional[dict] = None, boosters: Optional[dict] = None, conformal: Optional[dict] = None,
                 reason: str = "") -> None:
        self.meta = meta
        self.boosters = boosters or {}
        self.conformal = conformal or {}
        self.reason = reason  # why the engine is in fallback mode, if it is

    @property
    def ready(self) -> bool:
        return self.meta is not None

    @property
    def version(self) -> Optional[str]:
        return self.meta["version"] if self.meta else None

    @classmethod
    def load(cls, model_dir: Optional[Path] = None) -> "ForecastEngine":
        try:
            if lgb is None or np is None:
                raise ModelIntegrityError("numpy/lightgbm not installed")
            d = Path(model_dir) if model_dir else latest_version()
            if d is None or not (d / "metadata.json").is_file():
                raise ModelIntegrityError("no model artifact found")
            meta = json.loads((d / "metadata.json").read_text(encoding="utf-8"))
            for rel, want in meta["files"].items():
                f = d / rel
                if not f.is_file():
                    raise ModelIntegrityError(f"missing file {rel}")
                if _sha256(f) != want:
                    raise ModelIntegrityError(f"checksum mismatch for {rel}")
            boosters: dict[int, dict[float, Any]] = {}
            conformal: dict[int, float] = {}
            for h in meta["horizons"]:
                boosters[h] = {q / 100: lgb.Booster(model_file=str(d / f"h{h}" / f"q{q}.txt")) for q in (10, 50, 90)}
                conformal[h] = json.loads((d / f"h{h}" / "conformal.json").read_text())["conformal_log"]
            return cls(meta, boosters, conformal)
        except Exception as e:  # noqa: BLE001 - any failure at all means fallback, never a half-loaded model
            return cls(None, reason=f"{type(e).__name__}: {e}")

    def _vector(self, features: dict[str, Any]) -> Any:
        names = self.meta["feature_names"]
        x = np.full(len(names), np.nan, dtype=np.float32)
        for i, n in enumerate(names):
            v = features.get(n)
            if v is not None and math.isfinite(float(v)):
                x[i] = float(v)
        return x

    def predict(self, features: dict[str, Any], horizon: int, *, input_source: str, explain: bool = True, top: int = 5) -> dict:
        """features: the dict from ai.feature_engineering.features (plus `station_code`). Returns a self-describing forecast."""
        out: dict[str, Any] = {"horizon_h": horizon, "input_source": input_source, "trained_on": "CPCB station data, not AEIOS nodes"}
        now = features.get("pm_now")
        if self.ready and horizon in self.boosters and now is not None:
            x = self._vector(features)
            raw = {q: float(b.predict(x.reshape(1, -1), num_iteration=b.best_iteration or None)[0]) for q, b in self.boosters[horizon].items()}
            lo, med, hi = sorted(raw.values())
            c = self.conformal[horizon]
            out.update(source="lightgbm_cqr", model_version=self.version, q10=max(0.0, math.expm1(lo - c)), q50=max(0.0, math.expm1(med)),
                       q90=max(0.0, math.expm1(hi + c)), interval="80% conformal")
            if explain:
                from ai.explainability.treeshap import drivers
                out["drivers"] = drivers(self.boosters[horizon][0.5], x, self.meta["feature_names"], top=top)
            return out
        if now is None:
            out.update(source="no_input", model_version=None, q10=None, q50=None, q90=None, interval=None, reason="no current PM2.5 value")
        else:
            out.update(source="fallback_persistence", model_version=None, q10=None, q50=float(now), q90=None, interval=None,
                       reason=self.reason or f"no model for horizon {horizon}")
        return out
