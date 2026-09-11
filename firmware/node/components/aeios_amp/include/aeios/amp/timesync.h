#pragma once
/**
 * @file timesync.h
 * @brief TIME_SYNC apply — DOC-005 §7.9 / §12 (host-testable).
 */
#include <stdint.h>
#include <stdbool.h>
#include "aeios/amp/types.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef struct {
    uint32_t gateway_unix;
    uint16_t sync_id;
    uint8_t max_hop_skew_bound_s;
    uint8_t reserved;
} amp_time_sync_payload_t;

typedef struct {
    uint32_t unix_s;
    uint8_t sync_status; /* 0 = unsynced; ≥1 synced */
    uint16_t last_sync_id;
    bool valid;
} amp_timesync_t;

void amp_timesync_init(amp_timesync_t *st);

/**
 * Apply TIME_SYNC if FROM_GW semantics satisfied (caller verified MAC).
 * Sets sync_status to 1 on accept. Rejects if !from_gw or bad len.
 */
bool amp_timesync_apply(amp_timesync_t *st, bool from_gw, const uint8_t *payload, uint8_t len);

uint32_t amp_timesync_unix(const amp_timesync_t *st);
uint8_t amp_timesync_status(const amp_timesync_t *st);

#ifdef __cplusplus
}
#endif
