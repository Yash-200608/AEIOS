/**
 * Malformed frames + protocol parse negatives — DOC-005.
 */
#include "test_util.h"
#include "aeios/amp/frame.h"
#include "aeios/amp/parser.h"
#include "aeios/amp/crc.h"
#include "aeios/amp/codec.h"
#include "aeios/amp/header.h"
#include <string.h>
#include <stdio.h>

static void fill_key(uint8_t k[16]) {
    memset(k, 0x11, 16);
}

static size_t make_sensor_frame(uint8_t k[16], uint8_t out[AMP_MAX_FRAME], uint16_t seq) {
    amp_sensor_data_t s;
    uint8_t payload[AMP_MAX_PAYLOAD];
    amp_header_t hdr;
    size_t plen;

    memset(&s, 0, sizeof s);
    s.co2_ppm = 400;
    plen = amp_codec_pack_sensor(&s, payload);
    amp_header_init_defaults(&hdr);
    hdr.type = AMP_TYPE_SENSOR_DATA;
    hdr.flags = AMP_FLAG_ACK_REQ;
    hdr.src = 0x10;
    hdr.dst = AMP_GATEWAY_ID_DEFAULT;
    hdr.seq = seq;
    hdr.timestamp = 1700000000u;
    hdr.payload_len = (uint8_t)plen;
    return amp_frame_encode(k, &hdr, payload, (uint8_t)plen, out);
}

int main(void) {
    uint8_t k[16];
    uint8_t frame[AMP_MAX_FRAME];
    amp_frame_t out;
    size_t flen;

    fill_key(k);
    printf("AMP malformed / conformance negatives\n");

    expect_true("reject null/empty", amp_parse(k, NULL, 0, &out) == AMP_PARSE_BAD_LEN);
    expect_true("reject short", amp_parse(k, frame, 10, &out) == AMP_PARSE_BAD_LEN);

    flen = make_sensor_frame(k, frame, 1);
    expect_true("good frame ok", amp_parse(k, frame, flen, &out) == AMP_PARSE_OK);

    frame[0] = 0x00;
    expect_true("bad magic", amp_parse(k, frame, flen, &out) == AMP_PARSE_BAD_MAGIC);

    flen = make_sensor_frame(k, frame, 2);
    frame[1] = 0x99;
    expect_true("bad version", amp_parse(k, frame, flen, &out) == AMP_PARSE_BAD_VERSION);

    flen = make_sensor_frame(k, frame, 3);
    frame[AMP_HEADER_LEN]++; /* tamper payload */
    {
        uint16_t crc = amp_crc16(frame, AMP_HEADER_LEN + frame[4]);
        frame[AMP_HEADER_LEN + frame[4]] = (uint8_t)(crc & 0xff);
        frame[AMP_HEADER_LEN + frame[4] + 1] = (uint8_t)((crc >> 8) & 0xff);
    }
    expect_true("mac fail on tamper", amp_parse(k, frame, flen, &out) == AMP_PARSE_BAD_MAC);

    flen = make_sensor_frame(k, frame, 4);
    frame[AMP_HEADER_LEN + frame[4]] ^= 0xFF; /* corrupt CRC only */
    expect_true("crc fail", amp_parse(k, frame, flen, &out) == AMP_PARSE_BAD_CRC);

    flen = make_sensor_frame(k, frame, 5);
    expect_true("wrong total len", amp_parse(k, frame, flen - 1, &out) != AMP_PARSE_OK);

    frame[4] = 60; /* illegal payload_len */
    expect_true("bad payload len field",
                amp_parse(k, frame, AMP_MAX_FRAME, &out) == AMP_PARSE_BAD_PAYLOAD_LEN ||
                    amp_parse(k, frame, AMP_MAX_FRAME, &out) == AMP_PARSE_BAD_LEN);

    return test_finish("malformed");
}
