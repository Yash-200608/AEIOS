#include "aeios/amp/mac.h"
#include "aeios/amp/sha256.h"
#include <string.h>

void amp_header_immutable(const amp_header_t *in, amp_header_t *out) {
    *out = *in;
    out->ttl = 0;
    out->hop_count = 0;
    out->prev_hop = 0;
}

void amp_mac_compute(const uint8_t k_net[16], const amp_header_t *hdr_wire, const uint8_t *payload,
                     uint8_t payload_len, uint8_t out_mac[AMP_MAC_LEN]) {
    amp_header_t himm;
    uint8_t msg[AMP_HEADER_LEN + AMP_MAX_PAYLOAD];
    uint8_t full[32];

    amp_header_immutable(hdr_wire, &himm);
    memcpy(msg, &himm, AMP_HEADER_LEN);
    if (payload_len && payload) {
        memcpy(msg + AMP_HEADER_LEN, payload, payload_len);
    }
    amp_hmac_sha256(k_net, 16, msg, AMP_HEADER_LEN + payload_len, full);
    memcpy(out_mac, full, AMP_MAC_LEN);
}

bool amp_mac_verify(const uint8_t k_net[16], const amp_header_t *hdr_wire, const uint8_t *payload,
                    uint8_t payload_len, const uint8_t mac[AMP_MAC_LEN]) {
    uint8_t calc[AMP_MAC_LEN];
    amp_mac_compute(k_net, hdr_wire, payload, payload_len, calc);
    uint8_t diff = 0;
    for (int i = 0; i < (int)AMP_MAC_LEN; i++) {
        diff |= (uint8_t)(calc[i] ^ mac[i]);
    }
    return diff == 0;
}
