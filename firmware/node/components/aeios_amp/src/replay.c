/**
 * @file replay.c
 * @brief DOC-005 §9.1 duplicate window + §11 timestamp replay.
 */
#include "aeios/amp/replay.h"
#include <string.h>

void amp_replay_init(amp_replay_t *rp)
{
    if (!rp) {
        return;
    }
    memset(rp, 0, sizeof(*rp));
}

static amp_replay_entry_t *find_or_alloc(amp_replay_t *rp, uint16_t src, uint8_t type)
{
    unsigned i;
    amp_replay_entry_t *free_slot = NULL;
    for (i = 0; i < AMP_REPLAY_TABLE_SIZE; i++) {
        amp_replay_entry_t *e = &rp->entries[i];
        if (e->primed && e->src == src && e->type == type) {
            return e;
        }
        if (!e->primed && !free_slot) {
            free_slot = e;
        }
    }
    return free_slot;
}

static bool seq_in_window(const amp_replay_entry_t *e, uint16_t seq)
{
    uint16_t delta;
    if (!e->primed) {
        return false;
    }
    delta = (uint16_t)(e->last_seq - seq);
    if (delta == 0u) {
        return true;
    }
    if (delta < AMP_SEQ_WINDOW) {
        return (e->bitmap & (1u << delta)) != 0u;
    }
    return false;
}

static void record_seq(amp_replay_entry_t *e, uint16_t seq)
{
    uint16_t forward;

    if (!e->primed) {
        e->last_seq = seq;
        e->bitmap = 1u;
        e->primed = true;
        return;
    }
    if (seq == e->last_seq) {
        return;
    }

    forward = (uint16_t)(seq - e->last_seq);
    if (forward > 0u && forward < 0x8000u) {
        if (forward >= AMP_SEQ_WINDOW) {
            e->bitmap = 1u;
        } else {
            e->bitmap <<= forward;
            e->bitmap |= 1u;
        }
        e->last_seq = seq;
        return;
    }

    /* Older but inside window — mark seen bit */
    {
        uint16_t back = (uint16_t)(e->last_seq - seq);
        if (back < AMP_SEQ_WINDOW) {
            e->bitmap |= (1u << back);
        }
    }
}

bool amp_replay_accept(amp_replay_t *rp, uint16_t src, uint8_t type, uint16_t seq,
                       uint32_t timestamp, uint8_t sync_status, uint32_t local_unix)
{
    amp_replay_entry_t *e;
    uint16_t forward;
    uint16_t back;

    if (!rp) {
        return false;
    }

    if (sync_status >= 1u) {
        if (timestamp + AMP_T_REPLAY_S < local_unix) {
            return false;
        }
    }

    e = find_or_alloc(rp, src, type);
    if (!e) {
        return false;
    }

    if (seq_in_window(e, seq)) {
        return false; /* duplicate inside window */
    }

    if (e->primed) {
        forward = (uint16_t)(seq - e->last_seq);
        back = (uint16_t)(e->last_seq - seq);
        if (forward == 0u) {
            return false;
        }
        /* Accept if ahead, or older-but-inside-window gap fill; else stale/replay */
        if (!(forward < 0x8000u) && !(back < AMP_SEQ_WINDOW)) {
            return false;
        }
    }

    if (!e->primed) {
        e->src = src;
        e->type = type;
    }
    record_seq(e, seq);
    return true;
}
