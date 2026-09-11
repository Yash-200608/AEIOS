/**
 * @file drv_watchdog.c
 * @brief Task Watchdog driver — wraps TWDT via HAL subscribe pattern.
 * Traceability: DOC-006 recovery, FAS watchdog task.
 *
 * read() returns seconds since last feed estimate (0 stub).
 * self_test() verifies TWDT can be petted after add.
 */
#include "aeios_driver.h"
#include "aeios_hal.h"
#include "esp_log.h"
#include "esp_task_wdt.h"
#include <string.h>

static const char *TAG = "drv_wdt";
static int s_inited;

static int wdt_init(void *ctx)
{
    (void)ctx;
    ESP_LOGI(TAG, "watchdog driver init");
    s_inited = 1;
    return 0;
}

static int wdt_read(void *ctx, void *out)
{
    (void)ctx;
    if (out) {
        *(uint32_t *)out = 0;
    }
    return s_inited ? 0 : -1;
}

static int wdt_self_test(void *ctx)
{
    (void)ctx;
    if (!s_inited) {
        return -1;
    }
    esp_err_t err = aeios_hal_wdt_add_current_task();
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "self_test: wdt_add failed");
        return -2;
    }
    aeios_hal_wdt_feed();
    ESP_LOGI(TAG, "self_test PASS");
    return 0;
}

static int wdt_health(void *ctx, uint32_t *flags)
{
    (void)ctx;
    if (flags) {
        *flags = s_inited ? AEIOS_HEALTH_OK : AEIOS_HEALTH_NOT_READY;
    }
    return 0;
}

static int wdt_sleep(void *ctx)
{
    (void)ctx;
    return 0;
}

static int wdt_wake(void *ctx)
{
    (void)ctx;
    return 0;
}

static int wdt_shutdown(void *ctx)
{
    (void)ctx;
    s_inited = 0;
    ESP_LOGI(TAG, "watchdog shutdown");
    return 0;
}

const aeios_driver_ops_t aeios_drv_watchdog = {
    .init = wdt_init,
    .read = wdt_read,
    .self_test = wdt_self_test,
    .health = wdt_health,
    .sleep = wdt_sleep,
    .wake = wdt_wake,
    .shutdown = wdt_shutdown,
};
