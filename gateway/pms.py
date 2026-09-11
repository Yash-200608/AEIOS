"""PMS5003 UART frame encoder/parser (Plantower 32-byte active protocol).

This is the production parser the firmware will share conceptually.
Virtual PMS5003 must emit these bytes; protocol tests must not bypass this module.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Optional


PMS_START = b"\x42\x4d"
PMS_FRAME_LEN = 32
PMS_DATA_LEN = 28  # big-endian length field (bytes after length field)


class PmsParseError(str, Enum):
    OK = "OK"
    SHORT = "SHORT"
    BAD_START = "BAD_START"
    BAD_LENGTH = "BAD_LENGTH"
    BAD_CHECKSUM = "BAD_CHECKSUM"


@dataclass
class PmsReading:
    """Normalized PMS5003 output. Units: µg/m³ for PM; counts/0.1L for bins."""

    pm1: float
    pm25: float
    pm10: float
    pm1_cf1: float
    pm25_cf1: float
    pm10_cf1: float
    n0p3: float
    n0p5: float
    n1p0: float
    n2p5: float
    n5p0: float
    n10: float
    version: int = 0
    error_code: int = 0


def _be16(hi: int, lo: int) -> int:
    return ((hi & 0xFF) << 8) | (lo & 0xFF)


def _u16_be(value: int) -> bytes:
    v = max(0, min(65535, int(value)))
    return bytes([(v >> 8) & 0xFF, v & 0xFF])


def checksum(frame32: bytes) -> int:
    return sum(frame32[:30]) & 0xFFFF


def encode_frame(reading: PmsReading) -> bytes:
    """Build a valid 32-byte PMS5003 active-mode frame (big-endian)."""
    parts = [PMS_START, _u16_be(PMS_DATA_LEN)]
    parts.append(_u16_be(round(reading.pm1_cf1)))
    parts.append(_u16_be(round(reading.pm25_cf1)))
    parts.append(_u16_be(round(reading.pm10_cf1)))
    parts.append(_u16_be(round(reading.pm1)))
    parts.append(_u16_be(round(reading.pm25)))
    parts.append(_u16_be(round(reading.pm10)))
    parts.append(_u16_be(round(reading.n0p3)))
    parts.append(_u16_be(round(reading.n0p5)))
    parts.append(_u16_be(round(reading.n1p0)))
    parts.append(_u16_be(round(reading.n2p5)))
    parts.append(_u16_be(round(reading.n5p0)))
    parts.append(_u16_be(round(reading.n10)))
    parts.append(bytes([reading.version & 0xFF, reading.error_code & 0xFF]))
    body = b"".join(parts)
    if len(body) != 30:
        raise RuntimeError("PMS body length")
    csum = sum(body) & 0xFFFF
    return body + _u16_be(csum)


def parse_frame(buf: bytes) -> tuple[PmsParseError, Optional[PmsReading]]:
    if buf is None or len(buf) < PMS_FRAME_LEN:
        return PmsParseError.SHORT, None
    frame = bytes(buf[:PMS_FRAME_LEN])
    if frame[0:2] != PMS_START:
        return PmsParseError.BAD_START, None
    length = _be16(frame[2], frame[3])
    if length != PMS_DATA_LEN:
        return PmsParseError.BAD_LENGTH, None
    rx = _be16(frame[30], frame[31])
    if rx != checksum(frame):
        return PmsParseError.BAD_CHECKSUM, None

    def g(off: int) -> int:
        return _be16(frame[off], frame[off + 1])

    reading = PmsReading(
        pm1_cf1=float(g(4)),
        pm25_cf1=float(g(6)),
        pm10_cf1=float(g(8)),
        pm1=float(g(10)),
        pm25=float(g(12)),
        pm10=float(g(14)),
        n0p3=float(g(16)),
        n0p5=float(g(18)),
        n1p0=float(g(20)),
        n2p5=float(g(22)),
        n5p0=float(g(24)),
        n10=float(g(26)),
        version=frame[28],
        error_code=frame[29],
    )
    return PmsParseError.OK, reading


def corrupt_checksum(frame: bytes) -> bytes:
    b = bytearray(frame)
    b[31] = (b[31] + 1) & 0xFF
    return bytes(b)
