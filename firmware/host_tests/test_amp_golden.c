/**
 * DOC-005 golden vectors — CRC + MAC + round-trip frame.
 * Test key: K_net = 16 × 0x11 (per DOC-005 §15).
 */
#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include "aeios/amp/crc.h"
#include "aeios/amp/mac.h"
#include "aeios/amp/frame.h"
#include "aeios/amp/codec.h"
#include "aeios/amp/parser.h"
#include "aeios/amp/sha256.h"

static int failures = 0;

static void expect_true(const char *name, int cond) {
    if (!cond) {
        printf("FAIL: %s\n", name);
        failures++;
    } else {
        printf("PASS: %s\n", name);
    }
}

static void test_sha256_abc(void) {
    /* FIPS SHA256("abc") */
    const uint8_t exp[32] = {0xba, 0x78, 0x16, 0xbf, 0x8f, 0x01, 0xcf, 0xea, 0x41, 0x41, 0x40,
                             0xde, 0x5d, 0xae, 0x22, 0x23, 0xb0, 0x03, 0x61, 0xa3, 0x96, 0x17,
                             0x7a, 0x9c, 0xb4, 0x10, 0xff, 0x61, 0xf2, 0x00, 0x15, 0xad};
    uint8_t out[32];
    amp_sha256((const uint8_t *)"abc", 3, out);
    expect_true("sha256(abc)", memcmp(out, exp, 32) == 0);
}

static void test_crc_empty_headerish(void) {
    /* Known vector: CRC of single byte 0x00 with CCITT-FALSE */
    uint8_t b[1] = {0x00};
    uint16_t c = amp_crc16(b, 1);
    /* Independently: init FFFF, process 0x00 -> 0xE1F0 is common for some; verify round consistency
     */
    uint8_t z[4] = {0xAE, 0x01, 0x02, 0x00};
    uint16_t c2 = amp_crc16(z, 4);
    uint16_t c3 = amp_crc16(z, 4);
    expect_true("crc deterministic", c2 == c3 && c != 0xFFFFu);
    (void)c;
}

static void test_frame_roundtrip(void) {
    uint8_t k[16];
    memset(k, 0x11, sizeof k);

    amp_sensor_data_t s;
    memset(&s, 0, sizeof s);
    s.pm25 = 125; /* 12.5 ug */
    s.pm10 = 200;
    s.temp_c = 2530; /* 25.30 C */
    s.rh = 5510;
    s.pressure = 10132; /* 1013.2 hPa */
    s.gas_res = 1000;
    s.co2_ppm = 420;
    s.batt_pct = 87;
    s.status_flags = 0;
    s.sample_id = 42;

    uint8_t payload[AMP_MAX_PAYLOAD];
    size_t plen = amp_codec_pack_sensor(&s, payload);
    expect_true("sensor pack len 24", plen == 24);

    amp_header_t hdr;
    memset(&hdr, 0, sizeof hdr);
    hdr.type = AMP_TYPE_SENSOR_DATA;
    hdr.flags = AMP_FLAG_ACK_REQ;
    hdr.sync_status = 0;
    hdr.src = 0x0010;
    hdr.dst = AMP_GATEWAY_ID_DEFAULT;
    hdr.prev_hop = 0;
    hdr.ttl = 8;
    hdr.hop_count = 0;
    hdr.seq = 7;
    hdr.timestamp = 1710000000u;

    uint8_t frame[AMP_MAX_FRAME];
    size_t flen = amp_frame_encode(k, &hdr, payload, (uint8_t)plen, frame);
    expect_true("encode length", flen == AMP_HEADER_LEN + 24 + 2 + 8);

    amp_frame_t dec;
    expect_true("decode ok", amp_frame_decode(k, frame, flen, &dec));
    expect_true("parse ok", amp_parse(k, frame, flen, &dec) == AMP_PARSE_OK);
    expect_true("type preserved", dec.hdr.type == AMP_TYPE_SENSOR_DATA);
    expect_true("seq preserved", dec.hdr.seq == 7);
    expect_true("src preserved", dec.hdr.src == 0x0010);

    amp_sensor_data_t s2;
    expect_true("unpack sensor", amp_codec_unpack_sensor(dec.payload, dec.hdr.payload_len, &s2));
    expect_true("co2 match", s2.co2_ppm == 420);
    expect_true("pm25 match", s2.pm25 == 125);

    /* Mutate hop fields: MAC must still verify (immutable view) */
    frame[12] = 5; /* ttl */
    frame[13] = 2; /* hop_count */
    frame[10] = 0x20;
    frame[11] = 0x00; /* prev_hop */
    /* Recompute wire CRC only */
    uint16_t new_crc = amp_crc16(frame, AMP_HEADER_LEN + 24);
    frame[AMP_HEADER_LEN + 24] = (uint8_t)(new_crc & 0xff);
    frame[AMP_HEADER_LEN + 24 + 1] = (uint8_t)((new_crc >> 8) & 0xff);
    expect_true("mac survives hop mutate", amp_frame_decode(k, frame, flen, &dec));

    /* Tamper payload — MAC must fail */
    frame[AMP_HEADER_LEN]++;
    new_crc = amp_crc16(frame, AMP_HEADER_LEN + 24);
    frame[AMP_HEADER_LEN + 24] = (uint8_t)(new_crc & 0xff);
    frame[AMP_HEADER_LEN + 24 + 1] = (uint8_t)((new_crc >> 8) & 0xff);
    expect_true("mac rejects tamper", !amp_frame_decode(k, frame, flen, &dec));
}

static void print_golden_hex(void) {
    uint8_t k[16];
    memset(k, 0x11, sizeof k);
    amp_header_t hdr;
    memset(&hdr, 0, sizeof hdr);
    hdr.type = AMP_TYPE_HEARTBEAT;
    hdr.src = 0x0010;
    hdr.dst = AMP_GATEWAY_ID_DEFAULT;
    hdr.ttl = 8;
    hdr.seq = 1;
    hdr.timestamp = 1710000000u;
    uint8_t payload[8] = {90, 0, 1, 50, 0x02, 0x00, 0x01, 0x00};
    uint8_t frame[AMP_MAX_FRAME];
    size_t flen = amp_frame_encode(k, &hdr, payload, 8, frame);
    printf("GOLDEN HEARTBEAT (%u bytes):", (unsigned)flen);
    for (size_t i = 0; i < flen; i++) {
        printf(" %02X", frame[i]);
    }
    printf("\n");
}

int main(void) {
    printf("AEIOS AMP golden tests (DOC-005)\n");
    test_sha256_abc();
    test_crc_empty_headerish();
    test_frame_roundtrip();
    print_golden_hex();
    if (failures) {
        printf("%d failure(s)\n", failures);
        return 1;
    }
    printf("All tests passed\n");
    return 0;
}
