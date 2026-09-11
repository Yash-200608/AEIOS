/**
 * @file driver_stubs.c
 * @brief Sensor/radio driver skeletons — aeios_driver_ops_t only; no bus I/O.
 * Bring-up (ADR-013): battery → SCD41/BME688 → PMS → MQ135 → LoRa. No GPS.
 */
#include "aeios_driver.h"
#include "esp_log.h"

static const char *TAG = "drv_stub";

typedef enum {
    ST_UNINIT = 0,
    ST_READY,
    ST_SLEEP
} stub_state_t;

typedef struct {
    const char *name;
    stub_state_t state;
} stub_ctx_t;

static stub_ctx_t s_bme = {"bme688", ST_UNINIT};
static stub_ctx_t s_scd = {"scd41", ST_UNINIT};
static stub_ctx_t s_pms = {"pms5003", ST_UNINIT};
static stub_ctx_t s_bat = {"battery", ST_UNINIT};
static stub_ctx_t s_mq = {"mq135", ST_UNINIT}; /* gas-response stub; never publish as ppm */
static stub_ctx_t s_lora = {"lora", ST_UNINIT};

static int stub_init(void *ctx)
{
    stub_ctx_t *c = (stub_ctx_t *)ctx;
    if (!c) {
        return -1;
    }
    c->state = ST_READY;
    ESP_LOGI(TAG, "%s skeleton init (no sensor I/O)", c->name);
    return 0;
}

static int stub_read(void *ctx, void *out)
{
    stub_ctx_t *c = (stub_ctx_t *)ctx;
    (void)out;
    if (!c || c->state != ST_READY) {
        return -1;
    }
    /* Intentionally no sensor communication */
    return -2;
}

static int stub_self_test(void *ctx)
{
    stub_ctx_t *c = (stub_ctx_t *)ctx;
    if (!c || c->state == ST_UNINIT) {
        return -1;
    }
    return 0;
}

static int stub_health(void *ctx, uint32_t *flags)
{
    stub_ctx_t *c = (stub_ctx_t *)ctx;
    (void)c;
    if (flags) {
        *flags = AEIOS_HEALTH_NOT_READY;
    }
    return 0;
}

static int stub_sleep(void *ctx)
{
    stub_ctx_t *c = (stub_ctx_t *)ctx;
    if (!c || c->state != ST_READY) {
        return -1;
    }
    c->state = ST_SLEEP;
    return 0;
}

static int stub_wake(void *ctx)
{
    stub_ctx_t *c = (stub_ctx_t *)ctx;
    if (!c || c->state != ST_SLEEP) {
        return -1;
    }
    c->state = ST_READY;
    return 0;
}

static int stub_shutdown(void *ctx)
{
    stub_ctx_t *c = (stub_ctx_t *)ctx;
    if (!c) {
        return -1;
    }
    c->state = ST_UNINIT;
    return 0;
}

#define STUB_OPS(sym, ctxvar)                                                  \
    static int sym##_init(void *c)                                             \
    {                                                                          \
        (void)c;                                                               \
        return stub_init(&ctxvar);                                             \
    }                                                                          \
    static int sym##_read(void *c, void *o)                                    \
    {                                                                          \
        (void)c;                                                               \
        return stub_read(&ctxvar, o);                                          \
    }                                                                          \
    static int sym##_self_test(void *c)                                        \
    {                                                                          \
        (void)c;                                                               \
        return stub_self_test(&ctxvar);                                        \
    }                                                                          \
    static int sym##_health(void *c, uint32_t *f)                              \
    {                                                                          \
        (void)c;                                                               \
        return stub_health(&ctxvar, f);                                        \
    }                                                                          \
    static int sym##_sleep(void *c)                                            \
    {                                                                          \
        (void)c;                                                               \
        return stub_sleep(&ctxvar);                                            \
    }                                                                          \
    static int sym##_wake(void *c)                                             \
    {                                                                          \
        (void)c;                                                               \
        return stub_wake(&ctxvar);                                             \
    }                                                                          \
    static int sym##_shutdown(void *c)                                         \
    {                                                                          \
        (void)c;                                                               \
        return stub_shutdown(&ctxvar);                                         \
    }                                                                          \
    const aeios_driver_ops_t sym = {                                           \
        .init = sym##_init,                                                    \
        .read = sym##_read,                                                    \
        .self_test = sym##_self_test,                                          \
        .health = sym##_health,                                                \
        .sleep = sym##_sleep,                                                  \
        .wake = sym##_wake,                                                    \
        .shutdown = sym##_shutdown,                                            \
    }

STUB_OPS(aeios_drv_bme688, s_bme);
STUB_OPS(aeios_drv_scd41, s_scd);
STUB_OPS(aeios_drv_pms5003, s_pms);
STUB_OPS(aeios_drv_battery, s_bat);
STUB_OPS(aeios_drv_mq135, s_mq);
STUB_OPS(aeios_drv_lora, s_lora);
