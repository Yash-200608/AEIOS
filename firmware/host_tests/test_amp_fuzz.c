/**
 * Deterministic AMP parser fuzz — HOST_SPRINT_2 Task 2.
 * Seeded LCG; fixed iteration count; no heap allocation in parser path.
 */
#include "aeios/amp/frame.h"
#include "aeios/amp/parser.h"
#include "aeios/amp/codec.h"
#include "aeios/amp/header.h"
#include "aeios/amp/crc.h"
#include <stdio.h>
#include <string.h>
#include <stdint.h>
#include <stdlib.h>

#define FUZZ_SEED 0xA5105u
#define FUZZ_ITERS 20000u

static uint32_t s_rng;

static uint32_t rnd(void)
{
    s_rng = s_rng * 1664525u + 1013904223u;
    return s_rng;
}

static uint8_t rnd_u8(void) { return (uint8_t)(rnd() & 0xFFu); }

static void fill_key(uint8_t k[16]) { memset(k, 0x11, 16); }

static size_t make_valid(uint8_t k[16], uint8_t out[AMP_MAX_FRAME])
{
    amp_sensor_data_t s;
    uint8_t payload[AMP_MAX_PAYLOAD];
    amp_header_t hdr;
    size_t plen;
    memset(&s, 0, sizeof s);
    s.co2_ppm = (uint16_t)(rnd() % 2000u);
    plen = amp_codec_pack_sensor(&s, payload);
    amp_header_init_defaults(&hdr);
    hdr.type = AMP_TYPE_SENSOR_DATA;
    hdr.flags = AMP_FLAG_ACK_REQ;
    hdr.src = (uint16_t)(rnd() & 0xFFFFu);
    hdr.dst = AMP_GATEWAY_ID_DEFAULT;
    hdr.seq = (uint16_t)(rnd() & 0xFFFFu);
    hdr.timestamp = rnd();
    hdr.ttl = (uint8_t)(1u + (rnd() % 8u));
    return amp_frame_encode(k, &hdr, payload, (uint8_t)plen, out);
}

int main(void)
{
    uint8_t k[16];
    uint8_t buf[AMP_MAX_FRAME + 8];
    amp_frame_t out;
    uint32_t i;
    uint32_t ok = 0, reject = 0, valid_base = 0;
    amp_parse_result_t rc;

    fill_key(k);
    s_rng = FUZZ_SEED;

    printf("AMP fuzz seed=0x%08X iters=%u\n", FUZZ_SEED, (unsigned)FUZZ_ITERS);

    for (i = 0; i < FUZZ_ITERS; i++) {
        size_t len;
        unsigned mode = rnd() % 5u;

        memset(buf, 0, sizeof buf);
        memset(&out, 0xA5, sizeof out); /* poison — parser must not require clean out on fail */

        if (mode == 0u) {
            /* valid frame */
            len = make_valid(k, buf);
            valid_base++;
            rc = amp_parse(k, buf, len, &out);
            if (rc == AMP_PARSE_OK) {
                ok++;
            } else {
                printf("FAIL: valid frame rejected iter=%u rc=%d\n", (unsigned)i, (int)rc);
                return 1;
            }
        } else if (mode == 1u) {
            /* mutate valid */
            len = make_valid(k, buf);
            buf[rnd() % len] ^= (uint8_t)(1u + (rnd() % 255u));
            rc = amp_parse(k, buf, len, &out);
            if (rc == AMP_PARSE_OK) {
                ok++; /* rare: mutation may still verify */
            } else {
                reject++;
            }
        } else if (mode == 2u) {
            /* random length buffer */
            len = rnd() % (AMP_MAX_FRAME + 1u);
            for (size_t j = 0; j < len; j++) {
                buf[j] = rnd_u8();
            }
            rc = amp_parse(k, buf, len, &out);
            if (rc == AMP_PARSE_OK) {
                ok++;
            } else {
                reject++;
            }
        } else if (mode == 3u) {
            /* oversized claim */
            len = make_valid(k, buf);
            if (len > 4) {
                buf[4] = 60;
            }
            rc = amp_parse(k, buf, AMP_MAX_FRAME, &out);
            if (rc == AMP_PARSE_OK) {
                ok++;
            } else {
                reject++;
            }
        } else {
            /* null / zero */
            rc = amp_parse(k, NULL, 0, &out);
            if (rc != AMP_PARSE_BAD_LEN) {
                printf("FAIL: null handling iter=%u\n", (unsigned)i);
                return 1;
            }
            reject++;
        }
        (void)rc;
    }

    printf("fuzz done: ok=%u reject=%u valid_base=%u\n", (unsigned)ok, (unsigned)reject,
           (unsigned)valid_base);
    printf("PASS: no crash across %u iterations\n", (unsigned)FUZZ_ITERS);
    return 0;
}
