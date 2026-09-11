#include "aeios/amp/frame.h"
#include "aeios/amp/crc.h"
#include "aeios/amp/mac.h"
#include <string.h>

static void wr_u16_le(uint8_t *p, uint16_t v) {
    p[0] = (uint8_t)(v & 0xffu);
    p[1] = (uint8_t)((v >> 8) & 0xffu);
}

static uint16_t rd_u16_le(const uint8_t *p) {
    return (uint16_t)(p[0] | ((uint16_t)p[1] << 8));
}

size_t amp_frame_encode(const uint8_t k_net[16], const amp_header_t *hdr, const uint8_t *payload,
                        uint8_t payload_len, uint8_t out_buf[AMP_MAX_FRAME]) {
    amp_header_t h = *hdr;
    if (payload_len > AMP_MAX_PAYLOAD) {
        return 0;
    }
    h.magic = AMP_MAGIC;
    h.version = AMP_VERSION;
    h.payload_len = payload_len;
    h.flags = (uint8_t)(h.flags & (uint8_t)~AMP_FLAG_FRAGMENT);
    h.flags = (uint8_t)(h.flags & (uint8_t)~AMP_FLAG_ENCRYPTED);

    memcpy(out_buf, &h, AMP_HEADER_LEN);
    if (payload_len && payload) {
        memcpy(out_buf + AMP_HEADER_LEN, payload, payload_len);
    }

    uint16_t crc = amp_crc16(out_buf, AMP_HEADER_LEN + payload_len);
    wr_u16_le(out_buf + AMP_HEADER_LEN + payload_len, crc);

    uint8_t mac[AMP_MAC_LEN];
    amp_mac_compute(k_net, &h, payload, payload_len, mac);
    memcpy(out_buf + AMP_HEADER_LEN + payload_len + AMP_CRC_LEN, mac, AMP_MAC_LEN);

    return AMP_HEADER_LEN + payload_len + AMP_CRC_LEN + AMP_MAC_LEN;
}

bool amp_frame_decode(const uint8_t k_net[16], const uint8_t *buf, size_t len, amp_frame_t *out) {
    if (!buf || !out || len < AMP_OVERHEAD || len > AMP_MAX_FRAME) {
        return false;
    }
    amp_header_t h;
    memcpy(&h, buf, AMP_HEADER_LEN);
    if (h.magic != AMP_MAGIC || h.version != AMP_VERSION) {
        return false;
    }
    if (h.payload_len > AMP_MAX_PAYLOAD) {
        return false;
    }
    size_t expect = AMP_HEADER_LEN + h.payload_len + AMP_CRC_LEN + AMP_MAC_LEN;
    if (len != expect) {
        return false;
    }

    uint16_t crc_rx = rd_u16_le(buf + AMP_HEADER_LEN + h.payload_len);
    uint16_t crc_calc = amp_crc16(buf, AMP_HEADER_LEN + h.payload_len);
    if (crc_rx != crc_calc) {
        return false;
    }

    const uint8_t *payload = h.payload_len ? buf + AMP_HEADER_LEN : NULL;
    const uint8_t *mac = buf + AMP_HEADER_LEN + h.payload_len + AMP_CRC_LEN;
    if (!amp_mac_verify(k_net, &h, payload, h.payload_len, mac)) {
        return false;
    }

    out->hdr = h;
    if (h.payload_len) {
        memcpy(out->payload, payload, h.payload_len);
    }
    out->wire_crc = crc_rx;
    memcpy(out->mac, mac, AMP_MAC_LEN);
    return true;
}
