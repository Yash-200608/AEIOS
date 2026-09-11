#!/usr/bin/env python3
"""DOC-005 reference vectors — mirrors aeios_amp C codec algorithms."""
from __future__ import annotations

import hashlib
import hmac
import struct


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


def amp_mac(k_net: bytes, header20: bytes, payload: bytes) -> bytes:
    assert len(header20) == 20
    himm = bytearray(header20)
    himm[10:12] = b"\x00\x00"  # prev_hop
    himm[12] = 0  # ttl
    himm[13] = 0  # hop_count
    msg = bytes(himm) + payload
    digest = hmac.new(k_net, msg, hashlib.sha256).digest()
    return digest[:8]


def pack_header(
    typ: int,
    flags: int,
    payload_len: int,
    sync: int,
    src: int,
    dst: int,
    prev_hop: int,
    ttl: int,
    hop: int,
    seq: int,
    ts: int,
) -> bytes:
    return struct.pack(
        "<BBBBBBHHHBBHI",
        0xAE,
        1,
        typ,
        flags,
        payload_len,
        sync,
        src,
        dst,
        prev_hop,
        ttl,
        hop,
        seq,
        ts,
    )


def main() -> None:
    assert hashlib.sha256(b"abc").hexdigest() == (
        "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    )
    print("PASS: sha256(abc)")

    k = bytes([0x11] * 16)
    payload = bytes([90, 0, 1, 50, 0x02, 0x00, 0x01, 0x00])
    hdr = pack_header(0x02, 0, len(payload), 0, 0x0010, 0x0002, 0, 8, 0, 1, 1710000000)
    assert len(hdr) == 20
    body = hdr + payload
    crc = crc16_ccitt_false(body)
    mac = amp_mac(k, hdr, payload)
    frame = body + struct.pack("<H", crc) + mac
    assert len(frame) == 20 + 8 + 2 + 8

    # Hop mutate should not change MAC input
    hdr2 = bytearray(hdr)
    hdr2[12] = 3
    hdr2[13] = 1
    hdr2[10] = 0x20
    hdr2[11] = 0x00
    mac2 = amp_mac(k, bytes(hdr2), payload)
    assert mac == mac2
    print("PASS: mac immutable under hop mutate")

    print("GOLDEN HEARTBEAT:", frame.hex())
    print("CRC=", f"{crc:04x}", "MAC=", mac.hex())
    print("All Python reference checks passed")


if __name__ == "__main__":
    main()
