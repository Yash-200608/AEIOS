#pragma once
#include <stdint.h>
#include <stddef.h>
#include <stdbool.h>
#include "aeios/amp/types.h"

#ifdef __cplusplus
extern "C" {
#endif

/** Build immutable header view (ttl, hop_count, prev_hop zeroed). */
void amp_header_immutable(const amp_header_t *in, amp_header_t *out);

/**
 * trunc64(HMAC-SHA256(K_net, H_imm || payload))
 * k_net must be 16 bytes.
 */
void amp_mac_compute(const uint8_t k_net[16], const amp_header_t *hdr_wire, const uint8_t *payload,
                     uint8_t payload_len, uint8_t out_mac[AMP_MAC_LEN]);

bool amp_mac_verify(const uint8_t k_net[16], const amp_header_t *hdr_wire, const uint8_t *payload,
                    uint8_t payload_len, const uint8_t mac[AMP_MAC_LEN]);

#ifdef __cplusplus
}
#endif
