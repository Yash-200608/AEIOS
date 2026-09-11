/**
 * Routing edge cases — DOC-005 §8.
 */
#include "test_util.h"
#include "aeios/amp/routing.h"
#include "aeios/amp/header.h"
#include <stdio.h>
#include <string.h>

int main(void) {
    amp_route_t rt;
    amp_route_adv_t adv;
    amp_header_t hdr;

    printf("AMP routing\n");
    amp_route_init(&rt);

    expect_true("cost formula", amp_route_compute_cost(1, 100) == 16);
    expect_true("cost poor link", amp_route_compute_cost(1, 0) == 116);
    expect_true("no route", amp_route_next_hop(&rt) == 0);

    memset(&adv, 0, sizeof adv);
    adv.advertiser = 0x0002;
    adv.hop_to_gw = 0;
    adv.toward_gateway_cost = 0;
    adv.seq_r = 1;
    expect_true("accept first ADV", amp_route_on_adv(&rt, &adv, 90));
    expect_true("next hop GW", amp_route_next_hop(&rt) == 0x0002);
    expect_true("hop=1", rt.hop_to_gw == 1);

    {
        uint16_t old = rt.cost_to_gw;
        amp_route_adv_t worse;
        memset(&worse, 0, sizeof worse);
        worse.advertiser = 0x0030;
        worse.hop_to_gw = 3;
        worse.seq_r = 2;
        expect_true("reject worse without hysteresis", !amp_route_on_adv(&rt, &worse, 50));
        expect_true("cost unchanged", rt.cost_to_gw == old);
        expect_true("still GW next", amp_route_next_hop(&rt) == 0x0002);
    }

    {
        amp_route_adv_t better;
        /* Force high cost then improved path */
        amp_route_mark_stale(&rt);
        expect_true("stale => no next", amp_route_next_hop(&rt) == 0);
        memset(&better, 0, sizeof better);
        better.advertiser = 0x0020;
        better.hop_to_gw = 0;
        better.seq_r = 3;
        expect_true("stale accepts new", amp_route_on_adv(&rt, &better, 100));
        expect_true("new next", amp_route_next_hop(&rt) == 0x0020);
    }

    /* Hysteresis: need new_cost + 8 < old */
    amp_route_init(&rt);
    memset(&adv, 0, sizeof adv);
    adv.advertiser = 0xA;
    adv.hop_to_gw = 5;               /* hops via = 6 → cost = 96 + (100-q) */
    amp_route_on_adv(&rt, &adv, 50); /* cost = 96+50 = 146 */
    {
        amp_route_adv_t mild;
        memset(&mild, 0, sizeof mild);
        mild.advertiser = 0xB;
        mild.hop_to_gw = 4; /* hops=5 → 80+(100-50)=130; 130+8=138 < 146 → switch */
        expect_true("hysteresis allows clear improve", amp_route_on_adv(&rt, &mild, 50));
        expect_true("switched to B", amp_route_next_hop(&rt) == 0xB);
    }

    amp_header_init_defaults(&hdr);
    hdr.ttl = 1;
    hdr.hop_count = 0;
    expect_true("forward ok", amp_forward_mutate(&hdr, 0x10));
    expect_true("ttl 0", hdr.ttl == 0);
    expect_true("hop 1", hdr.hop_count == 1);
    expect_true("prev self", hdr.prev_hop == 0x10);
    expect_true("ttl exhausted", !amp_forward_mutate(&hdr, 0x10));

    return test_finish("routing");
}
