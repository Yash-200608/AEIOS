#include "aeios/amp/parser.h"
#include "aeios/amp/crc.h"
#include "aeios/amp/mac.h"
#include <string.h>

amp_parse_result_t amp_parse(const uint8_t k_net[16], const uint8_t *buf, size_t len,
                             amp_frame_t *out) {
    if (!buf || !out) {
        return AMP_PARSE_BAD_LEN;
    }
    if (len < AMP_OVERHEAD || len > AMP_MAX_FRAME) {
        return AMP_PARSE_BAD_LEN;
    }
    if (buf[0] != AMP_MAGIC) {
        return AMP_PARSE_BAD_MAGIC;
    }
    if (buf[1] != AMP_VERSION) {
        return AMP_PARSE_BAD_VERSION;
    }
    uint8_t plen = buf[4];
    if (plen > AMP_MAX_PAYLOAD) {
        return AMP_PARSE_BAD_PAYLOAD_LEN;
    }
    if (len != (size_t)AMP_HEADER_LEN + plen + AMP_CRC_LEN + AMP_MAC_LEN) {
        return AMP_PARSE_BAD_LEN;
    }

    uint16_t crc_rx =
        (uint16_t)(buf[AMP_HEADER_LEN + plen] | ((uint16_t)buf[AMP_HEADER_LEN + plen + 1] << 8));
    if (crc_rx != amp_crc16(buf, AMP_HEADER_LEN + plen)) {
        return AMP_PARSE_BAD_CRC;
    }

    amp_header_t h;
    memcpy(&h, buf, AMP_HEADER_LEN);
    const uint8_t *payload = plen ? buf + AMP_HEADER_LEN : NULL;
    const uint8_t *mac = buf + AMP_HEADER_LEN + plen + AMP_CRC_LEN;
    if (!amp_mac_verify(k_net, &h, payload, plen, mac)) {
        return AMP_PARSE_BAD_MAC;
    }

    out->hdr = h;
    if (plen) {
        memcpy(out->payload, payload, plen);
    }
    out->wire_crc = crc_rx;
    memcpy(out->mac, mac, AMP_MAC_LEN);
    return AMP_PARSE_OK;
}
