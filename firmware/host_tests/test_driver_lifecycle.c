/**
 * Driver lifecycle for all skeleton instances — init..shutdown, mocks only.
 */
#include "test_util.h"
#include "driver_skel.h"
#include <stdio.h>
#include <string.h>

typedef struct {
    const char *name;
    aeios_drv_skel_ctx_t ctx;
} drv_slot_t;

static int lifecycle(const char *name, aeios_drv_skel_ctx_t *ctx)
{
    const aeios_driver_ops_t *ops = &aeios_drv_skel_ops;
    uint32_t flags = 0;
    char label[64];

    aeios_drv_skel_reset(ctx);

    snprintf(label, sizeof label, "%s init", name);
    if (ops->init(ctx) != 0) {
        expect_true(label, 0);
        return -1;
    }
    expect_true(label, 1);

    snprintf(label, sizeof label, "%s self_test", name);
    expect_true(label, ops->self_test(ctx) == 0);

    snprintf(label, sizeof label, "%s health", name);
    expect_true(label, ops->health(ctx, &flags) == 0);
    snprintf(label, sizeof label, "%s not_ready", name);
    expect_true(label, (flags & AEIOS_HEALTH_NOT_READY) != 0);

    snprintf(label, sizeof label, "%s sleep", name);
    expect_true(label, ops->sleep(ctx) == 0);
    snprintf(label, sizeof label, "%s wake", name);
    expect_true(label, ops->wake(ctx) == 0);
    snprintf(label, sizeof label, "%s shutdown", name);
    expect_true(label, ops->shutdown(ctx) == 0);
    snprintf(label, sizeof label, "%s uninit", name);
    expect_true(label, aeios_drv_skel_state(ctx) == AEIOS_DRV_STATE_UNINIT);
    return 0;
}

int main(void)
{
    static const char *names[] = {"watchdog", "rtc",     "battery", "scd41",
                                  "bme688",   "pms5003", "mq135",   "lora"};
    drv_slot_t slots[8];
    unsigned i;

    printf("Driver lifecycle (skeletons)\n");
    for (i = 0; i < 8; i++) {
        slots[i].name = names[i];
        lifecycle(names[i], &slots[i].ctx);
    }

    /* Double-init path after shutdown */
    expect_true("re-init battery", aeios_drv_skel_ops.init(&slots[2].ctx) == 0);
    expect_true("re-shutdown", aeios_drv_skel_ops.shutdown(&slots[2].ctx) == 0);

    return test_finish("driver_lifecycle");
}
