/**
 * @file timesync.c
 * @brief DOC-005 §7.9 / §12.
 */
#include "aeios/amp/timesync.h"
#include <string.h>

void amp_timesync_init(amp_timesync_t *st) {
    if (!st) {
        return;
    }
    memset(st, 0, sizeof(*st));
}

bool amp_timesync_apply(amp_timesync_t *st, bool from_gw, const uint8_t *payload, uint8_t len) {
    amp_time_sync_payload_t p;

    if (!st || !payload || len != 8u || !from_gw) {
        return false;
    }
    memset(&p, 0, sizeof(p));
    memcpy(&p.gateway_unix, payload + 0, 4);
    memcpy(&p.sync_id, payload + 4, 2);
    p.max_hop_skew_bound_s = payload[6];
    p.reserved = payload[7];

    st->unix_s = p.gateway_unix;
    st->last_sync_id = p.sync_id;
    st->sync_status = 1u;
    st->valid = true;
    (void)p.max_hop_skew_bound_s;
    return true;
}

uint32_t amp_timesync_unix(const amp_timesync_t *st) {
    return (st && st->valid) ? st->unix_s : 0u;
}

uint8_t amp_timesync_status(const amp_timesync_t *st) {
    return st ? st->sync_status : 0u;
}
