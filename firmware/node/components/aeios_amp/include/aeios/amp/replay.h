#pragma once
/**
 * @file replay.h
 * @brief Seq window + timestamp replay defense — DOC-005 §9.1 / §11.
 */
#include <stdint.h>
#include <stdbool.h>
#include "aeios/amp/types.h"

#ifdef __cplusplus
extern "C" {
#endif

#ifndef AMP_SEQ_WINDOW
#define AMP_SEQ_WINDOW 32u
#endif

#ifndef AMP_T_REPLAY_S
#define AMP_T_REPLAY_S 300u
#endif

typedef struct {
    uint16_t src;
    uint8_t type;
    uint16_t last_seq;
    uint32_t bitmap; /* bit i set => (last_seq - i) seen, i in 0..31 */
    bool primed;
} amp_replay_entry_t;

#ifndef AMP_REPLAY_TABLE_SIZE
#define AMP_REPLAY_TABLE_SIZE 16u
#endif

typedef struct {
    amp_replay_entry_t entries[AMP_REPLAY_TABLE_SIZE];
} amp_replay_t;

void amp_replay_init(amp_replay_t *rp);

/**
 * Check (src,type,seq,timestamp).
 * @param sync_status local sync_status (≥1 enables T_replay check)
 * @param local_unix  local clock when synced
 * @return true if packet should be accepted (and records seq)
 */
bool amp_replay_accept(amp_replay_t *rp, uint16_t src, uint8_t type, uint16_t seq,
                       uint32_t timestamp, uint8_t sync_status, uint32_t local_unix);

#ifdef __cplusplus
}
#endif
