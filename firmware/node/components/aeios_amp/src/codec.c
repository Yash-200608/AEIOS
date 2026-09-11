#include "aeios/amp/codec.h"
#include <string.h>

size_t amp_codec_pack_sensor(const amp_sensor_data_t *s, uint8_t out[AMP_MAX_PAYLOAD]) {
    if (!s || !out) {
        return 0;
    }
    /* Prefer 24-byte payload: 20 fields + 4 reserved2 zero */
    memset(out, 0, 24);
    memcpy(out, s, 20);
    return 24;
}

bool amp_codec_unpack_sensor(const uint8_t *in, uint8_t len, amp_sensor_data_t *s) {
    if (!in || !s || (len != 20 && len != 24)) {
        return false;
    }
    memset(s, 0, sizeof(*s));
    memcpy(s, in, 20);
    return true;
}

size_t amp_codec_pack_time_sync(uint32_t gateway_unix, uint16_t sync_id, uint8_t max_hop_skew_s,
                                uint8_t out[8]) {
    if (!out) {
        return 0;
    }
    memset(out, 0, 8);
    memcpy(out + 0, &gateway_unix, 4);
    memcpy(out + 4, &sync_id, 2);
    out[6] = max_hop_skew_s;
    out[7] = 0;
    return 8;
}

bool amp_codec_unpack_time_sync(const uint8_t *in, uint8_t len, uint32_t *gateway_unix,
                                uint16_t *sync_id, uint8_t *max_hop_skew_s) {
    if (!in || len != 8u) {
        return false;
    }
    if (gateway_unix) {
        memcpy(gateway_unix, in + 0, 4);
    }
    if (sync_id) {
        memcpy(sync_id, in + 4, 2);
    }
    if (max_hop_skew_s) {
        *max_hop_skew_s = in[6];
    }
    return true;
}

size_t amp_codec_pack_route_adv(uint16_t advertiser, uint16_t cost, uint8_t hop_to_gw,
                                uint8_t seq_r, uint16_t next_hop_suggest, uint8_t out[12]) {
    if (!out) {
        return 0;
    }
    memset(out, 0, 12);
    memcpy(out + 0, &advertiser, 2);
    memcpy(out + 2, &cost, 2);
    out[4] = hop_to_gw;
    out[5] = seq_r;
    memcpy(out + 6, &next_hop_suggest, 2);
    return 12;
}

bool amp_codec_unpack_route_adv(const uint8_t *in, uint8_t len, uint16_t *advertiser,
                                uint16_t *cost, uint8_t *hop_to_gw, uint8_t *seq_r,
                                uint16_t *next_hop_suggest) {
    if (!in || len != 12u) {
        return false;
    }
    if (advertiser) {
        memcpy(advertiser, in + 0, 2);
    }
    if (cost) {
        memcpy(cost, in + 2, 2);
    }
    if (hop_to_gw) {
        *hop_to_gw = in[4];
    }
    if (seq_r) {
        *seq_r = in[5];
    }
    if (next_hop_suggest) {
        memcpy(next_hop_suggest, in + 6, 2);
    }
    return true;
}
