/**
 * Expanded deterministic AMP protocol coverage — HOST_SPRINT_2 Task 1.
 */
#include "test_util.h"
#include "aeios/amp/frame.h"
#include "aeios/amp/parser.h"
#include "aeios/amp/crc.h"
#include "aeios/amp/codec.h"
#include "aeios/amp/header.h"
#include "aeios/amp/validate.h"
#include "aeios/amp/replay.h"
#include "aeios/amp/routing.h"
#include "aeios/amp/queue.h"
#include <stdio.h>
#include <string.h>

static void key(uint8_t k[16]) { memset(k, 0x11, 16); }

static size_t mk_frame(uint8_t k[16], uint8_t out[AMP_MAX_FRAME], uint8_t type,
                       uint8_t flags, uint16_t seq, const uint8_t *pl, uint8_t plen)
{
    amp_header_t hdr;
    amp_header_init_defaults(&hdr);
    hdr.type = type;
    hdr.flags = flags;
    hdr.src = 0x10;
    hdr.dst = AMP_GATEWAY_ID_DEFAULT;
    hdr.seq = seq;
    hdr.timestamp = 1700000000u;
    hdr.ttl = 8;
    hdr.payload_len = plen;
    return amp_frame_encode(k, &hdr, pl, plen, out);
}

static size_t mk_sensor(uint8_t k[16], uint8_t out[AMP_MAX_FRAME], uint16_t seq)
{
    amp_sensor_data_t s;
    uint8_t payload[AMP_MAX_PAYLOAD];
    size_t plen;
    memset(&s, 0, sizeof s);
    s.pm25 = 10;
    plen = amp_codec_pack_sensor(&s, payload);
    return mk_frame(k, out, AMP_TYPE_SENSOR_DATA, AMP_FLAG_ACK_REQ, seq, payload, (uint8_t)plen);
}

int main(void)
{
    uint8_t k[16];
    uint8_t frame[AMP_MAX_FRAME];
    uint8_t payload[AMP_MAX_PAYLOAD];
    amp_frame_t decoded;
    size_t flen;
    amp_replay_t rp;
    amp_route_t rt;
    amp_route_adv_t adv;
    amp_queue_t q;
    amp_q_item_t item;
    amp_header_t hdr;
    unsigned i;

    key(k);
    printf("AMP expanded protocol suite\n");

    /* --- invalid version --- */
    flen = mk_sensor(k, frame, 1);
    frame[1] = 0;
    expect_true("invalid version 0", amp_parse(k, frame, flen, &decoded) == AMP_PARSE_BAD_VERSION);
    frame[1] = 2;
    expect_true("invalid version 2", amp_parse(k, frame, flen, &decoded) == AMP_PARSE_BAD_VERSION);

    /* --- invalid / unknown packet type (validate helper) --- */
    expect_true("type SENSOR known", amp_type_is_v1(AMP_TYPE_SENSOR_DATA));
    expect_true("type 0x00 unknown", !amp_type_is_v1(0x00));
    expect_true("type 0x0B unknown", !amp_type_is_v1(0x0B));
    expect_true("type 0xFF unknown", !amp_type_is_v1(0xFF));
    flen = mk_frame(k, frame, 0x0B, 0, 9, payload, 0);
    expect_true("unknown type encodes", flen > 0);
    expect_true("unknown type parses wire", amp_parse(k, frame, flen, &decoded) == AMP_PARSE_OK);
    expect_true("unknown type rejected by v1 check", !amp_type_is_v1(decoded.hdr.type));

    /* --- invalid payload length --- */
    flen = mk_sensor(k, frame, 2);
    frame[4] = AMP_MAX_PAYLOAD + 1;
    expect_true("payload len > max",
                amp_parse(k, frame, AMP_MAX_FRAME, &decoded) == AMP_PARSE_BAD_PAYLOAD_LEN);

    /* --- CRC mismatch --- */
    flen = mk_sensor(k, frame, 3);
    frame[AMP_HEADER_LEN + frame[4]] ^= 0xA5;
    expect_true("CRC mismatch", amp_parse(k, frame, flen, &decoded) == AMP_PARSE_BAD_CRC);

    /* --- MAC mismatch --- */
    flen = mk_sensor(k, frame, 4);
    frame[flen - 1] ^= 0x5A;
    expect_true("MAC mismatch", amp_parse(k, frame, flen, &decoded) == AMP_PARSE_BAD_MAC);

    /* --- min / max payload --- */
    flen = mk_frame(k, frame, AMP_TYPE_ACK, AMP_FLAG_ACK_REQ, 1, NULL, 0);
    expect_true("min payload 0 encode", flen == AMP_OVERHEAD);
    expect_true("min payload parse", amp_parse(k, frame, flen, &decoded) == AMP_PARSE_OK);
    memset(payload, 0xCD, AMP_MAX_PAYLOAD);
    flen = mk_frame(k, frame, AMP_TYPE_DIAGNOSTICS, 0, 2, payload, AMP_MAX_PAYLOAD);
    expect_true("max payload encode", flen == AMP_MAX_FRAME);
    expect_true("max payload parse", amp_parse(k, frame, flen, &decoded) == AMP_PARSE_OK);
    expect_true("max payload_len field", decoded.hdr.payload_len == AMP_MAX_PAYLOAD);

    /* --- malformed frame --- */
    expect_true("malformed null", amp_parse(k, NULL, 40, &decoded) == AMP_PARSE_BAD_LEN);
    memset(frame, 0xAE, sizeof frame);
    expect_true("malformed garbage", amp_parse(k, frame, 40, &decoded) != AMP_PARSE_OK);

    /* --- unknown / illegal flags --- */
    expect_true("flags ACK_REQ ok", amp_flags_ok_v1(AMP_FLAG_ACK_REQ));
    expect_true("flags PRIORITY ok", amp_flags_ok_v1(AMP_FLAG_PRIORITY));
    expect_true("flags FRAGMENT illegal", !amp_flags_ok_v1(AMP_FLAG_FRAGMENT));
    expect_true("flags ENCRYPTED illegal", !amp_flags_ok_v1(AMP_FLAG_ENCRYPTED));
    /* Encoder strips RFU/FRAGMENT per v1 (frame.c) — regression for that contract */
    flen = mk_frame(k, frame, AMP_TYPE_HEARTBEAT, AMP_FLAG_FRAGMENT, 5, payload, 8);
    expect_true("fragment request encodes", flen > 0);
    expect_true("fragment stripped parse ok", amp_parse(k, frame, flen, &decoded) == AMP_PARSE_OK);
    expect_true("encoder cleared FRAGMENT", (decoded.hdr.flags & AMP_FLAG_FRAGMENT) == 0);
    expect_true("cleared flags ok_v1", amp_flags_ok_v1(decoded.hdr.flags));
    /* Raw illegal flag still rejected by helper */
    expect_true("raw unknown flags rejected", !amp_flags_ok_v1(AMP_FLAG_FRAGMENT | AMP_FLAG_ENCRYPTED));

    /* --- duplicate sequence + stale + replay window --- */
    amp_replay_init(&rp);
    expect_true("seq first", amp_replay_accept(&rp, 1, AMP_TYPE_SENSOR_DATA, 10, 5000, 0, 0));
    expect_true("duplicate sequence",
                !amp_replay_accept(&rp, 1, AMP_TYPE_SENSOR_DATA, 10, 5001, 0, 0));
    expect_true("stale packet",
                !amp_replay_accept(&rp, 2, AMP_TYPE_CONFIG_UPDATE, 1, 100, 1, 100 + AMP_T_REPLAY_S + 50));

    /* fill forward window then revisit old → reject (overflow / window) */
    amp_replay_init(&rp);
    for (i = 0; i < AMP_SEQ_WINDOW + 5u; i++) {
        expect_true("window advance",
                    amp_replay_accept(&rp, 3, AMP_TYPE_SENSOR_DATA, (uint16_t)(100 + i), 8000, 0, 0));
    }
    expect_true("replay window overflow old reject",
                !amp_replay_accept(&rp, 3, AMP_TYPE_SENSOR_DATA, 100, 8000, 0, 0));

    /* --- TTL expiry --- */
    amp_header_init_defaults(&hdr);
    hdr.ttl = 0;
    expect_true("TTL expiry", !amp_forward_mutate(&hdr, 0x10));
    hdr.ttl = 1;
    expect_true("TTL last hop ok", amp_forward_mutate(&hdr, 0x10));
    expect_true("TTL now expired", !amp_forward_mutate(&hdr, 0x10));

    /* --- routing hysteresis --- */
    amp_route_init(&rt);
    memset(&adv, 0, sizeof adv);
    adv.advertiser = 0x02;
    adv.hop_to_gw = 0;
    expect_true("route seed", amp_route_on_adv(&rt, &adv, 100));
    {
        uint16_t cost_good = rt.cost_to_gw;
        amp_route_adv_t alt;
        memset(&alt, 0, sizeof alt);
        alt.advertiser = 0x30;
        alt.hop_to_gw = 0;
        /* Identical hop, worse LQ → higher cost; must not switch (hysteresis) */
        expect_true("hysteresis reject worse", !amp_route_on_adv(&rt, &alt, 50));
        expect_true("still original next", amp_route_next_hop(&rt) == 0x02);
        expect_true("cost stable", rt.cost_to_gw == cost_good);
        /* After stale, accept alternative */
        amp_route_mark_stale(&rt);
        expect_true("hysteresis after stale", amp_route_on_adv(&rt, &alt, 100));
        expect_true("switched after stale", amp_route_next_hop(&rt) == 0x30);
    }

    /* --- queue overflow + emergency prioritization --- */
    amp_queue_init(&q);
    memset(payload, 0x11, 16);
    for (i = 0; i < AMP_SF_CAPACITY; i++) {
        expect_true("queue fill", amp_queue_push(&q, AMP_Q_CLASS_SENSOR, payload, 16));
    }
    expect_true("queue overflow full", amp_queue_full(&q));
    memset(payload, 0xEE, 16);
    expect_true("emergency prioritization",
                amp_queue_push(&q, AMP_Q_CLASS_EMERGENCY, payload, 16));
    expect_true("sensor drop counted", q.drops_sensor >= 1);
    {
        int found_em = 0;
        while (amp_queue_pop(&q, &item)) {
            if (item.cls == AMP_Q_CLASS_EMERGENCY) {
                found_em = 1;
                break;
            }
        }
        expect_true("emergency retained under overflow", found_em);
    }

    return test_finish("amp_expanded");
}
