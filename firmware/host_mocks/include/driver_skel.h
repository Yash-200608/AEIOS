/**
 * @file driver_skel.h
 * @brief Host-testable driver skeletons — frozen aeios_driver_ops_t, no sensor I/O.
 */
#pragma once

#include "aeios_driver.h"
#include <stdint.h>
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef enum {
    AEIOS_DRV_STATE_UNINIT = 0,
    AEIOS_DRV_STATE_READY,
    AEIOS_DRV_STATE_SLEEP,
    AEIOS_DRV_STATE_FAULT
} aeios_drv_state_t;

typedef struct {
    aeios_drv_state_t state;
    uint32_t health_flags;
    uint32_t init_count;
    uint32_t read_count;
    uint32_t sleep_count;
    uint32_t wake_count;
    uint32_t shutdown_count;
} aeios_drv_skel_ctx_t;

void aeios_drv_skel_reset(aeios_drv_skel_ctx_t *ctx);
aeios_drv_state_t aeios_drv_skel_state(const aeios_drv_skel_ctx_t *ctx);

/** Generic skeleton ops — ctx must be aeios_drv_skel_ctx_t*. */
int aeios_drv_skel_init(void *ctx);
int aeios_drv_skel_read(void *ctx, void *out);
int aeios_drv_skel_self_test(void *ctx);
int aeios_drv_skel_health(void *ctx, uint32_t *flags);
int aeios_drv_skel_sleep(void *ctx);
int aeios_drv_skel_wake(void *ctx);
int aeios_drv_skel_shutdown(void *ctx);

extern const aeios_driver_ops_t aeios_drv_skel_ops;

#ifdef __cplusplus
}
#endif
