"""AMP Protocol Version 1 codec — Python mirror of firmware aeios_amp (DOC-005).

On-wire contract is frozen. This module must stay bit-compatible with
firmware/host_tests/golden_ref.py and firmware/node/components/aeios_amp.
Do not invent a second packet protocol.
"""

from __future__ import annotations

import hashlib
import hmac
import struct
from dataclasses import dataclass
from enum import IntEnum
from typing import Optional

AMP_MAGIC = 0xAE
AMP_VERSION = 1
AMP_HEADER_LEN = 20
AMP_CRC_LEN = 2
AMP_MAC_LEN = 8
AMP_MAX_PAYLOAD = 34
AMP_MAX_FRAME = 64
AMP_OVERHEAD = AMP_HEADER_LEN + AMP_CRC_LEN + AMP_MAC_LEN

AMP_FLAG_ACK_REQ = 1 << 0
AMP_FLAG_PRIORITY = 1 << 1
AMP_FLAG_ENCRYPTED = 1 << 2
AMP_FLAG_FROM_GW = 1 << 3
AMP_FLAG_FRAGMENT = 1 << 4

AMP_GATEWAY_ID_DEFAULT = 0x0002
AMP_BROADCAST_ID = 0xFFFF

# DOC-005 §15 lab key
DEFAULT_K_NET = bytes([0x11] * 16)

# Implementation diagnostic codes (opaque DIAGNOSTICS payload per DOC-005 §7.8).
# These are not a new AMP type. ICD-001 table is pending change-control.
DIAG_EXTENDED_OBS = 0x20
DIAG_SAMPLING_DECISION = 0x21


class AmpType(IntEnum):
    SENSOR_DATA = 0x01
    HEARTBEAT = 0x02
    ACK = 0x03
    NACK = 0x04
    ROUTE_ADV = 0x05
    ROUTE_UPDATE = 0x06
    CONFIG_UPDATE = 0x07
    DIAGNOSTICS = 0x08
    TIME_SYNC = 0x09
    EMERGENCY_ALERT = 0x0A


class ParseResult(IntEnum):
    OK = 0
    BAD_LEN = 1
    BAD_MAGIC = 2
    BAD_VERSION = 3
    BAD_PAYLOAD_LEN = 4
    BAD_CRC = 5
    BAD_MAC = 6
    BAD_TYPE = 7
    BAD_FLAGS = 8


_HEADER_STRUCT = struct.Struct("<BBBBBBHHHBBHI")
_SENSOR20 = struct.Struct("<HHhHHHHBBHH")


@dataclass
class AmpHeader:
    type: int
    flags: int = 0
    payload_len: int = 0
    sync_status: int = 0
    src: int = 0
    dst: int = AMP_GATEWAY_ID_DEFAULT
    prev_hop: int = 0
    ttl: int = 8
    hop_count: int = 0
    seq: int = 0
    timestamp: int = 0
    magic: int = AMP_MAGIC
    version: int = AMP_VERSION


@dataclass
class AmpFrame:
    hdr: AmpHeader
    payload: bytes
    wire_crc: int
    mac: bytes
    raw: bytes = b""


@dataclass
class SensorPayload:
    pm25_x10: int = 0
    pm10_x10: int = 0
    temp_c_x100: int = 0
    rh_x100: int = 0
    pressure_x10: int = 0
    gas_res: int = 0
    co2_ppm: int = 0
    batt_pct: int = 0
    status_flags: int = 0
    sample_id: int = 0
    reserved: int = 0


def crc16_ccitt_false(data: bytes) -> int:
    crc = 0xFFFF
    for byte in data:
        crc ^= byte << 8
        for _ in range(8):
            if crc & 0x8000:
                crc = ((crc << 1) ^ 0x1021) & 0xFFFF
            else:
                crc = (crc << 1) & 0xFFFF
    return crc


def pack_header(hdr: AmpHeader) -> bytes:
    return _HEADER_STRUCT.pack(
        AMP_MAGIC,
        AMP_VERSION,
        hdr.type,
        hdr.flags,
        hdr.payload_len,
        hdr.sync_status,
        hdr.src,
        hdr.dst,
        hdr.prev_hop,
        hdr.ttl,
        hdr.hop_count,
        hdr.seq,
        hdr.timestamp,
    )


def unpack_header(buf: bytes) -> AmpHeader:
    if len(buf) < AMP_HEADER_LEN:
        raise ValueError("short header")
    mag, ver, typ, flags, plen, sync, src, dst, prev, ttl, hop, seq, ts = _HEADER_STRUCT.unpack(
        buf[:AMP_HEADER_LEN]
    )
    return AmpHeader(
        magic=mag,
        version=ver,
        type=typ,
        flags=flags,
        payload_len=plen,
        sync_status=sync,
        src=src,
        dst=dst,
        prev_hop=prev,
        ttl=ttl,
        hop_count=hop,
        seq=seq,
        timestamp=ts,
    )


def amp_mac(k_net: bytes, header20: bytes, payload: bytes) -> bytes:
    himm = bytearray(header20)
    himm[10:12] = b"\x00\x00"
    himm[12] = 0
    himm[13] = 0
    digest = hmac.new(k_net, bytes(himm) + payload, hashlib.sha256).digest()
    return digest[:8]


def type_is_v1(typ: int) -> bool:
    return typ in (
        AmpType.SENSOR_DATA,
        AmpType.HEARTBEAT,
        AmpType.ACK,
        AmpType.NACK,
        AmpType.ROUTE_ADV,
        AmpType.ROUTE_UPDATE,
        AmpType.CONFIG_UPDATE,
        AmpType.DIAGNOSTICS,
        AmpType.TIME_SYNC,
        AmpType.EMERGENCY_ALERT,
    )


def flags_ok_v1(flags: int) -> bool:
    return not (flags & AMP_FLAG_FRAGMENT) and not (flags & AMP_FLAG_ENCRYPTED)


def pack_sensor(s: SensorPayload) -> bytes:
    """24-byte SENSOR_DATA (DOC-005 preferred length; matches amp_codec_pack_sensor)."""
    body = _SENSOR20.pack(
        s.pm25_x10 & 0xFFFF,
        s.pm10_x10 & 0xFFFF,
        int(s.temp_c_x100),
        s.rh_x100 & 0xFFFF,
        s.pressure_x10 & 0xFFFF,
        s.gas_res & 0xFFFF,
        s.co2_ppm & 0xFFFF,
        s.batt_pct & 0xFF,
        s.status_flags & 0xFF,
        s.sample_id & 0xFFFF,
        s.reserved & 0xFFFF,
    )
    return body + b"\x00\x00\x00\x00"


def unpack_sensor(payload: bytes) -> SensorPayload:
    if len(payload) not in (20, 24):
        raise ValueError("SENSOR_DATA length must be 20 or 24")
    vals = _SENSOR20.unpack(payload[:20])
    return SensorPayload(
        pm25_x10=vals[0],
        pm10_x10=vals[1],
        temp_c_x100=vals[2],
        rh_x100=vals[3],
        pressure_x10=vals[4],
        gas_res=vals[5],
        co2_ppm=vals[6],
        batt_pct=vals[7],
        status_flags=vals[8],
        sample_id=vals[9],
        reserved=vals[10],
    )


def encode_frame(k_net: bytes, hdr: AmpHeader, payload: bytes) -> bytes:
    if len(payload) > AMP_MAX_PAYLOAD:
        raise ValueError("payload too large")
    h = AmpHeader(**{**hdr.__dict__, "payload_len": len(payload)})
    h.flags = h.flags & ~AMP_FLAG_FRAGMENT & ~AMP_FLAG_ENCRYPTED
    h.magic = AMP_MAGIC
    h.version = AMP_VERSION
    header20 = pack_header(h)
    body = header20 + payload
    crc = crc16_ccitt_false(body)
    mac = amp_mac(k_net, header20, payload)
    frame = body + struct.pack("<H", crc) + mac
    if len(frame) > AMP_MAX_FRAME:
        raise ValueError("frame exceeds 64 bytes")
    return frame


def parse_frame(k_net: bytes, buf: bytes) -> tuple[ParseResult, Optional[AmpFrame]]:
    if buf is None or len(buf) < AMP_OVERHEAD or len(buf) > AMP_MAX_FRAME:
        return ParseResult.BAD_LEN, None
    if buf[0] != AMP_MAGIC:
        return ParseResult.BAD_MAGIC, None
    if buf[1] != AMP_VERSION:
        return ParseResult.BAD_VERSION, None
    plen = buf[4]
    if plen > AMP_MAX_PAYLOAD:
        return ParseResult.BAD_PAYLOAD_LEN, None
    expect = AMP_HEADER_LEN + plen + AMP_CRC_LEN + AMP_MAC_LEN
    if len(buf) != expect:
        return ParseResult.BAD_LEN, None
    crc_rx = buf[AMP_HEADER_LEN + plen] | (buf[AMP_HEADER_LEN + plen + 1] << 8)
    crc_calc = crc16_ccitt_false(buf[: AMP_HEADER_LEN + plen])
    if crc_rx != crc_calc:
        return ParseResult.BAD_CRC, None
    header20 = buf[:AMP_HEADER_LEN]
    payload = buf[AMP_HEADER_LEN : AMP_HEADER_LEN + plen]
    mac = buf[AMP_HEADER_LEN + plen + AMP_CRC_LEN :]
    if amp_mac(k_net, header20, payload) != mac:
        return ParseResult.BAD_MAC, None
    hdr = unpack_header(header20)
    if not type_is_v1(hdr.type):
        return ParseResult.BAD_TYPE, None
    if not flags_ok_v1(hdr.flags):
        return ParseResult.BAD_FLAGS, None
    frame = AmpFrame(hdr=hdr, payload=payload, wire_crc=crc_rx, mac=mac, raw=bytes(buf))
    return ParseResult.OK, frame


def pack_ack(ack_seq: int, ack_type: int, code: int = 0) -> bytes:
    return struct.pack("<HBB", ack_seq & 0xFFFF, ack_type & 0xFF, code & 0xFF)


def unpack_ack(payload: bytes) -> tuple[int, int, int]:
    if len(payload) != 4:
        raise ValueError("ACK length")
    return struct.unpack("<HBB", payload)


def pack_heartbeat(
    batt_pct: int,
    status_flags: int,
    uptime_hours: int,
    link_quality: int,
    parent: int,
    fw_abi: int,
) -> bytes:
    return struct.pack(
        "<BBBBHH",
        batt_pct & 0xFF,
        status_flags & 0xFF,
        min(255, uptime_hours),
        min(100, link_quality),
        parent & 0xFFFF,
        fw_abi & 0xFFFF,
    )


_EXT_OBS = struct.Struct("<BBHHHHBBBBBBBB")


def pack_extended_obs(
    pm1: float,
    n0p3: float,
    mq135_raw: float,
    mq135_index: float,
    heater_code: int,
    warmup_s: float,
    q_pms: float,
    q_scd: float,
    q_bme: float,
    q_mq: float,
    mq_present: bool,
) -> bytes:
    def u16(x: float) -> int:
        return max(0, min(65535, int(round(x))))

    def pct(q: float) -> int:
        return max(0, min(100, int(round(q * 100))))

    return _EXT_OBS.pack(
        DIAG_EXTENDED_OBS,
        0,
        u16(pm1 * 10.0),
        u16(n0p3),
        u16(mq135_raw),
        u16(mq135_index * 100.0),
        heater_code & 0xFF,
        min(255, int(warmup_s)),
        pct(q_pms),
        pct(q_scd),
        pct(q_bme),
        pct(q_mq),
        1 if mq_present else 0,
        0,
    )


def unpack_extended_obs(payload: bytes) -> Optional[dict]:
    if len(payload) != _EXT_OBS.size or payload[0] != DIAG_EXTENDED_OBS:
        return None
    vals = _EXT_OBS.unpack(payload)
    return {
        "pm1": vals[2] / 10.0,
        "n0p3": float(vals[3]),
        "mq135_raw": float(vals[4]),
        "mq135_index": vals[5] / 100.0,
        "heater_code": vals[6],
        "warmup_s": float(vals[7]),
        "q_pms": vals[8] / 100.0,
        "q_scd": vals[9] / 100.0,
        "q_bme": vals[10] / 100.0,
        "q_mq": vals[11] / 100.0,
        "mq_present": bool(vals[12]),
    }


_SAMP = struct.Struct("<BBBBBBBHBB")


def pack_sampling_diag(
    prev_mode: int,
    new_mode: int,
    trigger: int,
    confidence: float,
    eig: float,
    energy_mj: float,
    selected_sensor: int,
) -> bytes:
    return _SAMP.pack(
        DIAG_SAMPLING_DECISION,
        0,
        prev_mode & 0xFF,
        new_mode & 0xFF,
        trigger & 0xFF,
        max(0, min(100, int(round(confidence * 100)))),
        max(0, min(100, int(round(eig * 100)))),
        max(0, min(65535, int(round(energy_mj)))),
        selected_sensor & 0xFF,
        0,
    )


def unpack_sampling_diag(payload: bytes) -> Optional[dict]:
    if len(payload) != _SAMP.size or payload[0] != DIAG_SAMPLING_DECISION:
        return None
    vals = _SAMP.unpack(payload)
    return {
        "prev_mode": vals[2],
        "new_mode": vals[3],
        "trigger": vals[4],
        "confidence": vals[5] / 100.0,
        "eig": vals[6] / 100.0,
        "energy_mj": float(vals[7]),
        "selected_sensor": vals[8],
    }


HEATER_CODES = {
    "OFF": 0,
    "WARMING": 1,
    "READY": 2,
    "MEASURING": 3,
    "COOLING": 4,
    "FAULT": 5,
}
HEATER_FROM_CODE = {v: k for k, v in HEATER_CODES.items()}

MODE_CODES = {
    "NORMAL": 0,
    "WATCH": 1,
    "EVENT_CONFIRMATION": 2,
    "HIGH_RESOLUTION": 3,
    "LOW_BATTERY": 4,
    "DEGRADED": 5,
    "SAFE": 6,
}
MODE_FROM_CODE = {v: k for k, v in MODE_CODES.items()}
