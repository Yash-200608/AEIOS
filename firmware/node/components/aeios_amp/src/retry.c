/**
 * @file retry.c
 * @brief DOC-005 §9.3 Link ACK retry.
 */
#include "aeios/amp/retry.h"
#include <string.h>

static amp_jitter_fn s_jitter;
static void *s_jitter_ctx;
static uint32_t s_lcg = 1u;

static uint16_t default_jitter(uint16_t max_inclusive, void *ctx) {
    (void)ctx;
    if (max_inclusive == 0u) {
        return 0;
    }
    s_lcg = s_lcg * 1664525u + 1013904223u;
    return (uint16_t)(s_lcg % ((uint32_t)max_inclusive + 1u));
}

void amp_retry_init(amp_retry_t *r) {
    if (!r) {
        return;
    }
    memset(r, 0, sizeof(*r));
}

void amp_retry_set_jitter(amp_jitter_fn fn, void *ctx) {
    s_jitter = fn;
    s_jitter_ctx = ctx;
}

uint32_t amp_retry_timeout_ms(uint8_t attempt_index) {
    uint32_t t = AMP_RETRY_BASE_MS;
    uint8_t i;
    for (i = 0; i < attempt_index; i++) {
        if (t >= AMP_RETRY_CAP_MS / 2u) {
            t = AMP_RETRY_CAP_MS;
            break;
        }
        t *= 2u;
    }
    if (t > AMP_RETRY_CAP_MS) {
        t = AMP_RETRY_CAP_MS;
    }
    {
        amp_jitter_fn fn = s_jitter ? s_jitter : default_jitter;
        t += fn(AMP_RETRY_JITTER_MAX_MS, s_jitter_ctx);
    }
    return t;
}

bool amp_retry_arm(amp_retry_t *r, uint32_t now_ms, uint16_t peer, uint16_t seq, uint8_t frame_type,
                   const uint8_t *frame, uint8_t frame_len) {
    if (!r || !frame || frame_len == 0u || frame_len > AMP_MAX_FRAME) {
        return false;
    }
    if (r->active) {
        return false;
    }
    memset(r, 0, sizeof(*r));
    r->active = true;
    r->attempt = 0;
    r->peer = peer;
    r->seq = seq;
    r->frame_type = frame_type;
    r->frame_len = frame_len;
    memcpy(r->frame, frame, frame_len);
    r->deadline_ms = now_ms + amp_retry_timeout_ms(0);
    return true;
}

bool amp_retry_on_ack(amp_retry_t *r, uint16_t ack_seq, uint16_t from_peer) {
    if (!r || !r->active) {
        return false;
    }
    if (ack_seq == r->seq && from_peer == r->peer) {
        r->active = false;
        return true;
    }
    return false;
}

amp_retry_result_t amp_retry_tick(amp_retry_t *r, uint32_t now_ms) {
    if (!r) {
        return AMP_RETRY_IDLE;
    }
    if (!r->active) {
        return AMP_RETRY_IDLE;
    }
    if (now_ms < r->deadline_ms) {
        return AMP_RETRY_WAITING;
    }
    /* Timeout on current attempt */
    if ((uint16_t)r->attempt + 1u >= AMP_RETRY_MAX_ATTEMPTS) {
        r->active = false;
        return AMP_RETRY_FAILED;
    }
    return AMP_RETRY_NEED_TX;
}

bool amp_retry_rearmed(amp_retry_t *r, uint32_t now_ms) {
    if (!r || !r->active) {
        return false;
    }
    r->attempt = (uint8_t)(r->attempt + 1u);
    if (r->attempt >= AMP_RETRY_MAX_ATTEMPTS) {
        r->active = false;
        return false;
    }
    r->deadline_ms = now_ms + amp_retry_timeout_ms(r->attempt);
    return true;
}

bool amp_retry_should_store(const amp_retry_t *r) {
    if (!r) {
        return false;
    }
    return r->frame_type == AMP_TYPE_SENSOR_DATA || r->frame_type == AMP_TYPE_EMERGENCY_ALERT;
}
