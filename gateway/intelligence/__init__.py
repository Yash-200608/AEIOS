"""Replaceable deterministic intelligence (ADR-017). No ML / SHAP in v1."""

from gateway.intelligence.baseline import BaselineBank
from gateway.intelligence.confidence import ConfidenceEngine
from gateway.intelligence.detector import EventDetector, NodeEventState
from gateway.intelligence.features import FeatureExtractor, FeatureVector
from gateway.intelligence.quality import QualityEngine

__all__ = [
    "BaselineBank",
    "ConfidenceEngine",
    "EventDetector",
    "FeatureExtractor",
    "FeatureVector",
    "NodeEventState",
    "QualityEngine",
]
