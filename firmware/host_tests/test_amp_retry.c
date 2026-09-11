/**
 * Link ACK retry — DOC-005 §9.3.
 */
#include "test_util.h"
#include "aeios/amp/retry.h"
#include <stdio.h>
#include <string.h>

static uint16_t zero_jitter(uint16_t max_inclusive, void *ctx) {
    (void)max_inclusive;
    (void)ctx;
    return 0;
}

int main(void) {
    amp_retry_t r;
    uint8_t frame[16];
    uint32_t now = 1000;
    int ignored;

    printf("AMP retry\n");
    amp_retry_set_jitter(zero_jitter, NULL);
    amp_retry_init(&r);
    memset(frame, 0xAB, sizeof frame);

    expect_true("timeout0", amp_retry_timeout_ms(0) == 2000);
    expect_true("timeout1", amp_retry_timeout_ms(1) == 4000);
    expect_true("timeout2", amp_retry_timeout_ms(2) == 8000);

    expect_true("arm", amp_retry_arm(&r, now, 0x02, 7, AMP_TYPE_SENSOR_DATA, frame, 16));
    expect_true("busy reject", !amp_retry_arm(&r, now, 0x02, 8, AMP_TYPE_SENSOR_DATA, frame, 16));
    expect_true("waiting", amp_retry_tick(&r, now + 100) == AMP_RETRY_WAITING);
    expect_true("ack ok", amp_retry_on_ack(&r, 7, 0x02));
    expect_true("idle after ack", amp_retry_tick(&r, now + 5000) == AMP_RETRY_IDLE);

    amp_retry_init(&r);
    amp_retry_arm(&r, now, 0x02, 9, AMP_TYPE_SENSOR_DATA, frame, 16);
    expect_true("need tx after t0", amp_retry_tick(&r, now + 2000) == AMP_RETRY_NEED_TX);
    expect_true("rearm1", amp_retry_rearmed(&r, now + 2000));
    expect_true("need tx after t1", amp_retry_tick(&r, now + 2000 + 4000) == AMP_RETRY_NEED_TX);
    expect_true("rearm2", amp_retry_rearmed(&r, now + 6000));
    expect_true("failed after 3", amp_retry_tick(&r, now + 6000 + 8000) == AMP_RETRY_FAILED);
    expect_true("should SF", amp_retry_should_store(&r));

    amp_retry_init(&r);
    amp_retry_arm(&r, now, 0x02, 1, AMP_TYPE_HEARTBEAT, frame, 8);
    (void)amp_retry_tick(&r, now + 2000);
    (void)amp_retry_rearmed(&r, now + 2000);
    (void)amp_retry_tick(&r, now + 6000);
    (void)amp_retry_rearmed(&r, now + 6000);
    (void)amp_retry_tick(&r, now + 14000);
    expect_true("heartbeat not SF", !amp_retry_should_store(&r));

    amp_retry_init(&r);
    amp_retry_arm(&r, now, 0x02, 3, AMP_TYPE_SENSOR_DATA, frame, 16);
    ignored = amp_retry_on_ack(&r, 3, 0x99);
    expect_true("wrong peer ack ignored", !ignored);

    return test_finish("retry");
}
