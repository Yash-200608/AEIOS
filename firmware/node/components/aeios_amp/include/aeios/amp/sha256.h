#pragma once
#include <stdint.h>
#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

void amp_sha256(const uint8_t *data, size_t len, uint8_t out[32]);
void amp_hmac_sha256(const uint8_t *key, size_t key_len, const uint8_t *data, size_t data_len,
                     uint8_t out[32]);

#ifdef __cplusplus
}
#endif
