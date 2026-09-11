#pragma once
/**
 * @file routing.h
 * @brief Uplink-centric routing — DOC-005 §8 (host-testable, no radio I/O).
 */
#include <stdint.h>
#include <stdbool.h>
#include "aeios/amp/types.h"

#ifdef __cplusplus
extern "C" {
#endif

#ifndef AMP_ROUTE_HYSTERESIS
#define AMP_ROUTE_HYSTERESIS 8u
#endif

typedef struct {
    uint16_t next_hop_to_gw;
    uint16_t cost_to_gw;
    uint8_t hop_to_gw;
    uint8_t route_seq;
    bool valid;
    bool stale;
} amp_route_t;

typedef struct {
    uint16_t advertiser;
    uint16_t toward_gateway_cost;
    uint8_t hop_to_gw;
    uint8_t seq_r;
    uint16_t next_hop_suggest;
    uint32_t reserved;
} amp_route_adv_t;

void amp_route_init(amp_route_t *rt);

/** cost = hop_to_gw * 16 + (100 - link_quality); link_quality clamped 0..100. */
uint16_t amp_route_compute_cost(uint8_t hop_to_gw, uint8_t link_quality);

/**
 * Apply ROUTE_ADV/UPDATE. Switch only if new_cost + hysteresis < old_cost,
 * or route invalid/stale. Returns true if table updated.
 */
bool amp_route_on_adv(amp_route_t *rt, const amp_route_adv_t *adv, uint8_t neighbor_link_quality);

void amp_route_mark_stale(amp_route_t *rt);

/** Next hop toward gateway, or 0 if no usable route. */
uint16_t amp_route_next_hop(const amp_route_t *rt);

/**
 * Prepare header for forward: if ttl would go to 0, return false.
 * Else decrement ttl, increment hop_count, set prev_hop = self_id.
 * Caller recomputes wire CRC; MUST NOT recompute MAC (DOC-005 §8.4/§10.3).
 */
bool amp_forward_mutate(amp_header_t *hdr, uint16_t self_id);

#ifdef __cplusplus
}
#endif
