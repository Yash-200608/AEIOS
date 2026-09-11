/**
 * Driver skeleton ops — frozen aeios_driver_ops_t, no sensor I/O.
 */
#include "test_util.h"
#include "driver_skel.h"
#include <stdio.h>

int main(void) {
    aeios_drv_skel_ctx_t ctx;
    uint32_t flags = 0;
    const aeios_driver_ops_t *ops = &aeios_drv_skel_ops;

    printf("Driver skeleton\n");
    aeios_drv_skel_reset(&ctx);
    expect_true("uninit", aeios_drv_skel_state(&ctx) == AEIOS_DRV_STATE_UNINIT);
    expect_true("init", ops->init(&ctx) == 0);
    expect_true("ready", aeios_drv_skel_state(&ctx) == AEIOS_DRV_STATE_READY);
    expect_true("self_test", ops->self_test(&ctx) == 0);
    expect_true("health", ops->health(&ctx, &flags) == 0);
    expect_true("not ready flag", (flags & AEIOS_HEALTH_NOT_READY) != 0);
    expect_true("read no HW", ops->read(&ctx, NULL) == -2);
    expect_true("sleep", ops->sleep(&ctx) == 0);
    expect_true("sleeping", aeios_drv_skel_state(&ctx) == AEIOS_DRV_STATE_SLEEP);
    expect_true("wake", ops->wake(&ctx) == 0);
    expect_true("shutdown", ops->shutdown(&ctx) == 0);
    expect_true("uninit after shutdown", aeios_drv_skel_state(&ctx) == AEIOS_DRV_STATE_UNINIT);
    expect_true("init count", ctx.init_count == 1);

    return test_finish("driver_skel");
}
