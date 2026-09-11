"""AMP codec + PMS5003 parser host tests (production contracts)."""

from __future__ import annotations

import unittest

import _paths  # noqa: F401

from gateway.amp import (
    AMP_FLAG_ACK_REQ,
    AMP_GATEWAY_ID_DEFAULT,
    AmpHeader,
    AmpType,
    DEFAULT_K_NET,
    ParseResult,
    SensorPayload,
    amp_mac,
    crc16_ccitt_false,
    encode_frame,
    pack_header,
    pack_sensor,
    parse_frame,
    unpack_sensor,
)
from gateway.pms import PmsParseError, PmsReading, corrupt_checksum, encode_frame as pms_encode, parse_frame as pms_parse


class AmpCodecTests(unittest.TestCase):
    def test_sensor_roundtrip_matches_c_layout(self) -> None:
        s = SensorPayload(
            pm25_x10=125,
            pm10_x10=200,
            temp_c_x100=2530,
            rh_x100=5510,
            pressure_x10=10132,
            gas_res=1000,
            co2_ppm=420,
            batt_pct=87,
            status_flags=0,
            sample_id=42,
        )
        payload = pack_sensor(s)
        self.assertEqual(len(payload), 24)
        hdr = AmpHeader(
            type=AmpType.SENSOR_DATA,
            flags=AMP_FLAG_ACK_REQ,
            src=0x0010,
            dst=AMP_GATEWAY_ID_DEFAULT,
            ttl=8,
            seq=7,
            timestamp=1710000000,
        )
        frame = encode_frame(DEFAULT_K_NET, hdr, payload)
        self.assertEqual(len(frame), 20 + 24 + 2 + 8)
        result, dec = parse_frame(DEFAULT_K_NET, frame)
        self.assertEqual(result, ParseResult.OK)
        assert dec is not None
        s2 = unpack_sensor(dec.payload)
        self.assertEqual(s2.co2_ppm, 420)
        self.assertEqual(s2.pm25_x10, 125)

        mutated = bytearray(frame)
        mutated[12] = 5
        mutated[13] = 2
        mutated[10] = 0x20
        mutated[11] = 0x00
        body_len = 20 + 24
        crc = crc16_ccitt_false(bytes(mutated[:body_len]))
        mutated[body_len] = crc & 0xFF
        mutated[body_len + 1] = (crc >> 8) & 0xFF
        ok, _ = parse_frame(DEFAULT_K_NET, bytes(mutated))
        self.assertEqual(ok, ParseResult.OK)

        mutated[20] = (mutated[20] + 1) & 0xFF
        crc = crc16_ccitt_false(bytes(mutated[:body_len]))
        mutated[body_len] = crc & 0xFF
        mutated[body_len + 1] = (crc >> 8) & 0xFF
        bad, _ = parse_frame(DEFAULT_K_NET, bytes(mutated))
        self.assertEqual(bad, ParseResult.BAD_MAC)

    def test_golden_heartbeat_matches_reference(self) -> None:
        payload = bytes([90, 0, 1, 50, 0x02, 0x00, 0x01, 0x00])
        hdr = AmpHeader(
            type=AmpType.HEARTBEAT,
            src=0x0010,
            dst=AMP_GATEWAY_ID_DEFAULT,
            ttl=8,
            seq=1,
            timestamp=1710000000,
            payload_len=8,
        )
        hdr20 = pack_header(hdr)
        crc = crc16_ccitt_false(hdr20 + payload)
        mac = amp_mac(DEFAULT_K_NET, hdr20, payload)
        ref = hdr20 + payload + crc.to_bytes(2, "little") + mac
        frame = encode_frame(DEFAULT_K_NET, hdr, payload)
        self.assertEqual(frame, ref)


class PmsParserTests(unittest.TestCase):
    def test_roundtrip_and_checksum_rejection(self) -> None:
        reading = PmsReading(
            pm1=8, pm25=12, pm10=20, pm1_cf1=9, pm25_cf1=13, pm10_cf1=21,
            n0p3=400, n0p5=200, n1p0=80, n2p5=20, n5p0=8, n10=2,
        )
        frame = pms_encode(reading)
        self.assertEqual(len(frame), 32)
        self.assertEqual(frame[:2], b"\x42\x4d")
        err, parsed = pms_parse(frame)
        self.assertEqual(err, PmsParseError.OK)
        assert parsed is not None
        self.assertEqual(parsed.pm25, 12)
        bad = corrupt_checksum(frame)
        err2, parsed2 = pms_parse(bad)
        self.assertEqual(err2, PmsParseError.BAD_CHECKSUM)
        self.assertIsNone(parsed2)


if __name__ == "__main__":
    unittest.main()
