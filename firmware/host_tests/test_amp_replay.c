/**
 * Replay protection + duplicate detection — DOC-005 §9.1 / §11.
 */
#include "test_util.h"
#include "aeios/amp/replay.h"
#include <stdio.h>

int main(void) {
    amp_replay_t rp;
    amp_replay_init(&rp);

    printf("AMP replay / duplicate\n");

    expect_true("first accept", amp_replay_accept(&rp, 0x10, AMP_TYPE_SENSOR_DATA, 1, 1000, 0, 0));
    expect_true("dup reject", !amp_replay_accept(&rp, 0x10, AMP_TYPE_SENSOR_DATA, 1, 1000, 0, 0));
    expect_true("next seq ok", amp_replay_accept(&rp, 0x10, AMP_TYPE_SENSOR_DATA, 2, 1001, 0, 0));
    expect_true("old in window reject",
                !amp_replay_accept(&rp, 0x10, AMP_TYPE_SENSOR_DATA, 1, 1002, 0, 0));
    expect_true("other type independent",
                amp_replay_accept(&rp, 0x10, AMP_TYPE_HEARTBEAT, 1, 1000, 0, 0));
    expect_true("other src independent",
                amp_replay_accept(&rp, 0x11, AMP_TYPE_SENSOR_DATA, 1, 1000, 0, 0));

    /* Synced: old timestamp rejected */
    amp_replay_init(&rp);
    expect_true("synced fresh ok",
                amp_replay_accept(&rp, 0x10, AMP_TYPE_CONFIG_UPDATE, 5, 10000, 1, 10000));
    expect_true("synced stale reject", !amp_replay_accept(&rp, 0x10, AMP_TYPE_CONFIG_UPDATE, 6,
                                                          10000 - AMP_T_REPLAY_S - 1, 1, 10000));
    expect_true("synced within window ok",
                amp_replay_accept(&rp, 0x10, AMP_TYPE_CONFIG_UPDATE, 7, 10000 - 10, 1, 10000));

    return test_finish("replay");
}
