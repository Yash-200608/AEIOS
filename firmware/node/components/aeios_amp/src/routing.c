/**
 * @file routing.c
 * @brief DOC-005 §8 uplink routing + forward mutate.
 */
#include "aeios/amp/routing.h"
#include <string.h>

void amp_route_init(amp_route_t *rt) {
    if (!rt) {
        return;
    }
    memset(rt, 0, sizeof(*rt));
}

uint16_t amp_route_compute_cost(uint8_t hop_to_gw, uint8_t link_quality) {
    uint8_t q = link_quality;
    if (q > 100u) {
        q = 100u;
    }
    return (uint16_t)((uint16_t)hop_to_gw * 16u + (uint16_t)(100u - q));
}

bool amp_route_on_adv(amp_route_t *rt, const amp_route_adv_t *adv, uint8_t neighbor_link_quality) {
    uint8_t hops;
    uint16_t new_cost;
    uint16_t next;

    if (!rt || !adv) {
        return false;
    }
    if (adv->hop_to_gw == 0xFFu) {
        return false;
    }

    /* Path via advertising neighbor: one hop further than advertiser's hop_to_gw */
    hops = (uint8_t)(adv->hop_to_gw + 1u);
    new_cost = amp_route_compute_cost(hops, neighbor_link_quality);
    next = adv->advertiser;
    (void)adv->toward_gateway_cost;
    (void)adv->next_hop_suggest;

    if (!rt->valid || rt->stale) {
        rt->next_hop_to_gw = next;
        rt->cost_to_gw = new_cost;
        rt->hop_to_gw = hops;
        rt->route_seq = adv->seq_r;
        rt->valid = true;
        rt->stale = false;
        return true;
    }

    /* Hysteresis: switch only if new_cost + margin < old_cost */
    if ((uint32_t)new_cost + (uint32_t)AMP_ROUTE_HYSTERESIS < (uint32_t)rt->cost_to_gw) {
        rt->next_hop_to_gw = next;
        rt->cost_to_gw = new_cost;
        rt->hop_to_gw = hops;
        rt->route_seq = adv->seq_r;
        rt->stale = false;
        return true;
    }
    return false;
}

void amp_route_mark_stale(amp_route_t *rt) {
    if (rt) {
        rt->stale = true;
    }
}

uint16_t amp_route_next_hop(const amp_route_t *rt) {
    if (!rt || !rt->valid || rt->stale) {
        return 0;
    }
    return rt->next_hop_to_gw;
}

bool amp_forward_mutate(amp_header_t *hdr, uint16_t self_id) {
    if (!hdr) {
        return false;
    }
    if (hdr->ttl == 0u) {
        return false;
    }
    hdr->ttl = (uint8_t)(hdr->ttl - 1u);
    if (hdr->hop_count < 0xFFu) {
        hdr->hop_count = (uint8_t)(hdr->hop_count + 1u);
    }
    hdr->prev_hop = self_id;
    return true;
}
