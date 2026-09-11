#pragma once
/**
 * @file retry.h
 * @brief Link ACK retry state machine — DOC-005 §9.3 (host-testable).
 */
#include <stdint.h>
#include <stddef.h>
#include <stdbool.h>
#include "aeios/amp/types.h"

#ifdef __cplusplus
extern "C" {
#endif

#define AMP_RETRY_MAX_ATTEMPTS 3u
#define AMP_RETRY_BASE_MS 2000u
#define AMP_RETRY_CAP_MS 8000u
#define AMP_RETRY_JITTER_MAX_MS 200u

typedef enum {
    AMP_RETRY_IDLE = 0,
    AMP_RETRY_WAITING,
    AMP_RETRY_NEED_TX, /* timeout — retransmit */
    AMP_RETRY_FAILED,  /* exhausted attempts */
    AMP_RETRY_ACKED
} amp_retry_result_t;

typedef struct {
    bool active;
    uint8_t attempt; /* 0..MAX-1 while waiting; increments on timeout */
    uint8_t frame_type;
    uint16_t seq;
    uint16_t peer; /* link peer expecting ACK from */
    uint32_t deadline_ms;
    uint8_t frame[AMP_MAX_FRAME];
    uint8_t frame_len;
} amp_retry_t;

typedef uint16_t (*amp_jitter_fn)(uint16_t max_inclusive, void *ctx);

void amp_retry_init(amp_retry_t *r);

/** Override jitter (tests: return 0). NULL restores default LCG. */
void amp_retry_set_jitter(amp_jitter_fn fn, void *ctx);

uint32_t amp_retry_timeout_ms(uint8_t attempt_index);

/**
 * Arm retry after TX with ACK_REQ. Copies frame. attempt starts at 0.
 * Returns false if busy or bad args.
 */
bool amp_retry_arm(amp_retry_t *r, uint32_t now_ms, uint16_t peer, uint16_t seq, uint8_t frame_type,
                   const uint8_t *frame, uint8_t frame_len);

/** Match Link ACK for seq from peer → success. */
bool amp_retry_on_ack(amp_retry_t *r, uint16_t ack_seq, uint16_t from_peer);

/**
 * Tick clock. NEED_TX: caller retransmits then must call amp_retry_rearmed.
 * FAILED: exhausted. WAITING/IDLE/ACKED as named.
 */
amp_retry_result_t amp_retry_tick(amp_retry_t *r, uint32_t now_ms);

/** After NEED_TX retransmit, re-arm deadline for next attempt. */
bool amp_retry_rearmed(amp_retry_t *r, uint32_t now_ms);

/** True if final failure should enter SF (SENSOR_DATA / EMERGENCY). */
bool amp_retry_should_store(const amp_retry_t *r);

#ifdef __cplusplus
}
#endif
