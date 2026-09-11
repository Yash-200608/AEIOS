#pragma once
#include <stdint.h>
#include <stddef.h>
#include <stdbool.h>
#include "aeios/amp/types.h"

#ifdef __cplusplus
extern "C" {
#endif

size_t amp_codec_pack_sensor(const amp_sensor_data_t *s, uint8_t out[AMP_MAX_PAYLOAD]);
bool amp_codec_unpack_sensor(const uint8_t *in, uint8_t len, amp_sensor_data_t *s);

size_t amp_codec_pack_time_sync(uint32_t gateway_unix, uint16_t sync_id, uint8_t max_hop_skew_s,
                                uint8_t out[8]);
bool amp_codec_unpack_time_sync(const uint8_t *in, uint8_t len, uint32_t *gateway_unix,
                                uint16_t *sync_id, uint8_t *max_hop_skew_s);

size_t amp_codec_pack_route_adv(uint16_t advertiser, uint16_t cost, uint8_t hop_to_gw,
                                uint8_t seq_r, uint16_t next_hop_suggest, uint8_t out[12]);
bool amp_codec_unpack_route_adv(const uint8_t *in, uint8_t len, uint16_t *advertiser,
                                uint16_t *cost, uint8_t *hop_to_gw, uint8_t *seq_r,
                                uint16_t *next_hop_suggest);

#ifdef __cplusplus
}
#endif
