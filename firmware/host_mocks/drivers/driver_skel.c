/**
 * @file driver_skel.c
 * @brief Skeleton driver state machine — no bus/sensor traffic.
 */
#include "driver_skel.h"
#include <string.h>

void aeios_drv_skel_reset(aeios_drv_skel_ctx_t *ctx) {
    if (!ctx) {
        return;
    }
    memset(ctx, 0, sizeof(*ctx));
    ctx->state = AEIOS_DRV_STATE_UNINIT;
    ctx->health_flags = AEIOS_HEALTH_NOT_READY;
}

aeios_drv_state_t aeios_drv_skel_state(const aeios_drv_skel_ctx_t *ctx) {
    return ctx ? ctx->state : AEIOS_DRV_STATE_FAULT;
}

int aeios_drv_skel_init(void *ctx) {
    aeios_drv_skel_ctx_t *c = (aeios_drv_skel_ctx_t *)ctx;
    if (!c) {
        return -1;
    }
    c->init_count++;
    c->state = AEIOS_DRV_STATE_READY;
    /* HW not present — ready for ops API but NOT_READY health */
    c->health_flags = AEIOS_HEALTH_NOT_READY;
    return 0;
}

int aeios_drv_skel_read(void *ctx, void *out) {
    aeios_drv_skel_ctx_t *c = (aeios_drv_skel_ctx_t *)ctx;
    (void)out;
    if (!c || c->state != AEIOS_DRV_STATE_READY) {
        return -1;
    }
    c->read_count++;
    /* No sensor communication in skeleton */
    return -2; /* not implemented / no HW */
}

int aeios_drv_skel_self_test(void *ctx) {
    aeios_drv_skel_ctx_t *c = (aeios_drv_skel_ctx_t *)ctx;
    if (!c || c->state == AEIOS_DRV_STATE_UNINIT) {
        return -1;
    }
    /* Skeleton self-test: ops reachable */
    return 0;
}

int aeios_drv_skel_health(void *ctx, uint32_t *flags) {
    aeios_drv_skel_ctx_t *c = (aeios_drv_skel_ctx_t *)ctx;
    if (!c) {
        return -1;
    }
    if (flags) {
        *flags = c->health_flags;
    }
    return 0;
}

int aeios_drv_skel_sleep(void *ctx) {
    aeios_drv_skel_ctx_t *c = (aeios_drv_skel_ctx_t *)ctx;
    if (!c || c->state != AEIOS_DRV_STATE_READY) {
        return -1;
    }
    c->sleep_count++;
    c->state = AEIOS_DRV_STATE_SLEEP;
    return 0;
}

int aeios_drv_skel_wake(void *ctx) {
    aeios_drv_skel_ctx_t *c = (aeios_drv_skel_ctx_t *)ctx;
    if (!c || c->state != AEIOS_DRV_STATE_SLEEP) {
        return -1;
    }
    c->wake_count++;
    c->state = AEIOS_DRV_STATE_READY;
    return 0;
}

int aeios_drv_skel_shutdown(void *ctx) {
    aeios_drv_skel_ctx_t *c = (aeios_drv_skel_ctx_t *)ctx;
    if (!c) {
        return -1;
    }
    c->shutdown_count++;
    c->state = AEIOS_DRV_STATE_UNINIT;
    c->health_flags = AEIOS_HEALTH_NOT_READY;
    return 0;
}

const aeios_driver_ops_t aeios_drv_skel_ops = {
    .init = aeios_drv_skel_init,
    .read = aeios_drv_skel_read,
    .self_test = aeios_drv_skel_self_test,
    .health = aeios_drv_skel_health,
    .sleep = aeios_drv_skel_sleep,
    .wake = aeios_drv_skel_wake,
    .shutdown = aeios_drv_skel_shutdown,
};
