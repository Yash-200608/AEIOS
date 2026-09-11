#pragma once
/**
 * @file queue.h
 * @brief Store-and-forward queue — DOC-005 §9.4 / FAS SF ring.
 */
#include <stdint.h>
#include <stddef.h>
#include <stdbool.h>
#include "aeios/amp/types.h"

#ifdef __cplusplus
extern "C" {
#endif

#ifndef AMP_SF_CAPACITY
#define AMP_SF_CAPACITY 16u
#endif

typedef enum { AMP_Q_CLASS_SENSOR = 0, AMP_Q_CLASS_EMERGENCY = 1 } amp_q_class_t;

typedef struct {
    uint8_t frame[AMP_MAX_FRAME];
    uint8_t len;
    amp_q_class_t cls;
} amp_q_item_t;

typedef struct {
    amp_q_item_t items[AMP_SF_CAPACITY];
    uint8_t head; /* pop index */
    uint8_t tail; /* push index */
    uint8_t count;
    uint32_t drops_sensor;
    uint32_t drops_emergency; /* should stay 0 under policy */
} amp_queue_t;

void amp_queue_init(amp_queue_t *q);

size_t amp_queue_depth(const amp_queue_t *q);
bool amp_queue_empty(const amp_queue_t *q);
bool amp_queue_full(const amp_queue_t *q);

/**
 * Enqueue. Under pressure: drop oldest SENSOR before any EMERGENCY.
 * Never drop EMERGENCY to make room for SENSOR.
 * Returns true if stored.
 */
bool amp_queue_push(amp_queue_t *q, amp_q_class_t cls, const uint8_t *frame, uint8_t len);

bool amp_queue_pop(amp_queue_t *q, amp_q_item_t *out);

/** Peek oldest without remove. */
bool amp_queue_peek(const amp_queue_t *q, amp_q_item_t *out);

#ifdef __cplusplus
}
#endif
