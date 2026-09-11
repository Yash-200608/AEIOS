/**
 * Store-and-forward queue — DOC-005 §9.4.
 */
#include "test_util.h"
#include "aeios/amp/queue.h"
#include <stdio.h>
#include <string.h>

static void fill(uint8_t *f, uint8_t v, uint8_t len) {
    memset(f, v, len);
}

int main(void) {
    amp_queue_t q;
    amp_q_item_t item;
    uint8_t frame[32];
    unsigned i;

    printf("AMP queue\n");
    amp_queue_init(&q);
    expect_true("empty", amp_queue_empty(&q));

    fill(frame, 0x11, 32);
    expect_true("push sensor", amp_queue_push(&q, AMP_Q_CLASS_SENSOR, frame, 32));
    expect_true("depth 1", amp_queue_depth(&q) == 1);
    expect_true("peek", amp_queue_peek(&q, &item) && item.frame[0] == 0x11);
    expect_true("pop", amp_queue_pop(&q, &item) && item.cls == AMP_Q_CLASS_SENSOR);
    expect_true("empty after pop", amp_queue_empty(&q));

    /* Fill with sensors */
    for (i = 0; i < AMP_SF_CAPACITY; i++) {
        fill(frame, (uint8_t)i, 16);
        expect_true("fill", amp_queue_push(&q, AMP_Q_CLASS_SENSOR, frame, 16));
    }
    expect_true("full", amp_queue_full(&q));

    fill(frame, 0xEE, 16);
    expect_true("emergency drops oldest sensor",
                amp_queue_push(&q, AMP_Q_CLASS_EMERGENCY, frame, 16));
    expect_true("still full or depth cap", amp_queue_depth(&q) == AMP_SF_CAPACITY);
    expect_true("drop counted", q.drops_sensor >= 1);

    /* Pop until emergency found */
    {
        int found = 0;
        while (amp_queue_pop(&q, &item)) {
            if (item.cls == AMP_Q_CLASS_EMERGENCY && item.frame[0] == 0xEE) {
                found = 1;
                break;
            }
        }
        expect_true("emergency retained", found);
    }

    amp_queue_init(&q);
    for (i = 0; i < AMP_SF_CAPACITY; i++) {
        fill(frame, 0xAA, 8);
        amp_queue_push(&q, AMP_Q_CLASS_EMERGENCY, frame, 8);
    }
    fill(frame, 0x55, 8);
    expect_true("sensor rejected when only emergencies",
                !amp_queue_push(&q, AMP_Q_CLASS_SENSOR, frame, 8));

    return test_finish("queue");
}
