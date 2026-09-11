/**
 * TIME_SYNC — DOC-005 §7.9 / §12.
 */
#include "test_util.h"
#include "aeios/amp/timesync.h"
#include "aeios/amp/codec.h"
#include <stdio.h>
#include <string.h>

int main(void) {
    amp_timesync_t st;
    uint8_t payload[8];
    uint32_t gu;
    uint16_t sid;
    uint8_t skew;

    printf("AMP timesync\n");
    amp_timesync_init(&st);

    expect_true("pack", amp_codec_pack_time_sync(1710000000u, 42, 5, payload) == 8);
    expect_true("unpack", amp_codec_unpack_time_sync(payload, 8, &gu, &sid, &skew));
    expect_true("unix", gu == 1710000000u && sid == 42 && skew == 5);

    expect_true("reject !from_gw", !amp_timesync_apply(&st, false, payload, 8));
    expect_true("reject bad len", !amp_timesync_apply(&st, true, payload, 7));
    expect_true("apply", amp_timesync_apply(&st, true, payload, 8));
    expect_true("status synced", amp_timesync_status(&st) == 1);
    expect_true("unix set", amp_timesync_unix(&st) == 1710000000u);
    expect_true("sync_id", st.last_sync_id == 42);

    return test_finish("timesync");
}
