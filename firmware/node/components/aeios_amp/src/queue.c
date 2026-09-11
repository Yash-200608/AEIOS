/**
 * @file queue.c
 * @brief DOC-005 §9.4 store-and-forward.
 */
#include "aeios/amp/queue.h"
#include <string.h>

void amp_queue_init(amp_queue_t *q) {
    if (!q) {
        return;
    }
    memset(q, 0, sizeof(*q));
}

size_t amp_queue_depth(const amp_queue_t *q) {
    return q ? (size_t)q->count : 0u;
}

bool amp_queue_empty(const amp_queue_t *q) {
    return !q || q->count == 0u;
}

bool amp_queue_full(const amp_queue_t *q) {
    return q && q->count >= AMP_SF_CAPACITY;
}

static void drop_oldest_sensor(amp_queue_t *q) {
    uint8_t i;
    uint8_t idx = q->head;
    for (i = 0; i < q->count; i++) {
        if (q->items[idx].cls == AMP_Q_CLASS_SENSOR) {
            /* Remove by shifting — keep FIFO order of remaining */
            uint8_t j;
            uint8_t cur = idx;
            for (j = i; j + 1u < q->count; j++) {
                uint8_t nxt = (uint8_t)((cur + 1u) % AMP_SF_CAPACITY);
                q->items[cur] = q->items[nxt];
                cur = nxt;
            }
            q->count--;
            q->tail = (uint8_t)((q->head + q->count) % AMP_SF_CAPACITY);
            q->drops_sensor++;
            return;
        }
        idx = (uint8_t)((idx + 1u) % AMP_SF_CAPACITY);
    }
}

bool amp_queue_push(amp_queue_t *q, amp_q_class_t cls, const uint8_t *frame, uint8_t len) {
    if (!q || !frame || len == 0u || len > AMP_MAX_FRAME) {
        return false;
    }

    if (q->count >= AMP_SF_CAPACITY) {
        if (cls == AMP_Q_CLASS_EMERGENCY) {
            drop_oldest_sensor(q);
            if (q->count >= AMP_SF_CAPACITY) {
                /* Only emergencies left — never drop them for another emergency?
                 * Policy: EMERGENCY never dropped before SENSOR; if only EMERGENCY,
                 * drop oldest EMERGENCY to accept newer (still prefer keep all if possible).
                 * Spec: "EMERGENCY never dropped before SENSOR" — if no SENSOR, allow
                 * drop-oldest EMERGENCY under extreme pressure. */
                /* Remove oldest item (must be emergency) */
                q->head = (uint8_t)((q->head + 1u) % AMP_SF_CAPACITY);
                q->count--;
                q->drops_emergency++;
            }
        } else {
            /* SENSOR under pressure: drop oldest SENSOR; if none, reject */
            size_t before = q->count;
            drop_oldest_sensor(q);
            if (q->count == before) {
                return false; /* queue full of emergencies */
            }
        }
    }

    if (q->count >= AMP_SF_CAPACITY) {
        return false;
    }

    amp_q_item_t *slot = &q->items[q->tail];
    memset(slot, 0, sizeof(*slot));
    slot->cls = cls;
    slot->len = len;
    memcpy(slot->frame, frame, len);
    q->tail = (uint8_t)((q->tail + 1u) % AMP_SF_CAPACITY);
    q->count++;
    return true;
}

bool amp_queue_pop(amp_queue_t *q, amp_q_item_t *out) {
    if (!q || !out || q->count == 0u) {
        return false;
    }
    *out = q->items[q->head];
    q->head = (uint8_t)((q->head + 1u) % AMP_SF_CAPACITY);
    q->count--;
    return true;
}

bool amp_queue_peek(const amp_queue_t *q, amp_q_item_t *out) {
    if (!q || !out || q->count == 0u) {
        return false;
    }
    *out = q->items[q->head];
    return true;
}
