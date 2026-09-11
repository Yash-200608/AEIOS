#pragma once
#include <stdint.h>
#include <stddef.h>
#include <stdbool.h>
#include "aeios/amp/frame.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef enum {
    AMP_PARSE_OK = 0,
    AMP_PARSE_BAD_LEN = -1,
    AMP_PARSE_BAD_MAGIC = -2,
    AMP_PARSE_BAD_VERSION = -3,
    AMP_PARSE_BAD_CRC = -4,
    AMP_PARSE_BAD_MAC = -5,
    AMP_PARSE_BAD_PAYLOAD_LEN = -6,
} amp_parse_result_t;

amp_parse_result_t amp_parse(const uint8_t k_net[16], const uint8_t *buf, size_t len,
                             amp_frame_t *out);

#ifdef __cplusplus
}
#endif
