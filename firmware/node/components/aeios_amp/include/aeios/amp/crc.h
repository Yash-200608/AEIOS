#pragma once
#include <stdint.h>
#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

/** CRC-16/CCITT-FALSE over buf[0..len). */
uint16_t amp_crc16(const uint8_t *buf, size_t len);

#ifdef __cplusplus
}
#endif
