#pragma once
#include <stdint.h>
#include <stddef.h>
#include <stdbool.h>
#include "aeios/amp/types.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef struct {
    amp_header_t hdr;
    uint8_t payload[AMP_MAX_PAYLOAD];
    uint16_t wire_crc;
    uint8_t mac[AMP_MAC_LEN];
} amp_frame_t;

/** Encode frame into out_buf; returns total length or 0 on error. */
size_t amp_frame_encode(const uint8_t k_net[16], const amp_header_t *hdr, const uint8_t *payload,
                        uint8_t payload_len, uint8_t out_buf[AMP_MAX_FRAME]);

/** Decode and verify CRC+MAC. Returns true on success. */
bool amp_frame_decode(const uint8_t k_net[16], const uint8_t *buf, size_t len, amp_frame_t *out);

#ifdef __cplusplus
}
#endif
