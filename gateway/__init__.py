"""AEIOS gateway contracts — host-testable, hardware-swappable.

Core v1 path (ADR-015): radio frame → AMP validate → ingest → SQLite → intelligence → snapshot.
MQTT is not on this path. This package does not require a Raspberry Pi.
"""

from gateway.contracts import DATA_LIVE, DATA_SIMULATED, Observation, Provenance

__all__ = ["DATA_LIVE", "DATA_SIMULATED", "Observation", "Provenance"]
