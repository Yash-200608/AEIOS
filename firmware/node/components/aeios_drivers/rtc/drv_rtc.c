/**
 * @file drv_rtc.c
 * @brief Software RTC backed by HAL time — D1; HW RTC optional later.
 * Traceability: DOC-006 RTC driver, AMP timestamp.
 *
 * read() writes uint32_t unix seconds to out.
 */
#include "aeios_driver.h"
#include "aeios_hal.h"
#include "esp_log.h"

static const char *TAG = "drv_rtc";
static int s_inited;

static int rtc_init(void *ctx)
{
    (void)ctx;
    s_inited = 1;
    ESP_LOGI(TAG, "rtc driver init (HAL-backed)");
    return 0;
}

static int rtc_read(void *ctx, void *out)
{
    (void)ctx;
    if (!s_inited || !out) {
        return -1;
    }
    *(uint32_t *)out = aeios_hal_time_unix();
    return 0;
}

static int rtc_self_test(void *ctx)
{
    (void)ctx;
    if (!s_inited) {
        return -1;
    }
    /* Set a known epoch and read back monotonic advancement */
    aeios_hal_time_set_unix(1700000000u);
    uint32_t t1 = aeios_hal_time_unix();
    if (t1 < 1700000000u) {
        ESP_LOGE(TAG, "self_test FAIL t1=%u", (unsigned)t1);
        return -2;
    }
    ESP_LOGI(TAG, "self_test PASS t=%u", (unsigned)t1);
    return 0;
}

static int rtc_health(void *ctx, uint32_t *flags)
{
    (void)ctx;
    if (flags) {
        *flags = s_inited ? AEIOS_HEALTH_OK : AEIOS_HEALTH_NOT_READY;
    }
    return 0;
}

static int rtc_nop(void *ctx)
{
    (void)ctx;
    return 0;
}

const aeios_driver_ops_t aeios_drv_rtc = {
    .init = rtc_init,
    .read = rtc_read,
    .self_test = rtc_self_test,
    .health = rtc_health,
    .sleep = rtc_nop,
    .wake = rtc_nop,
    .shutdown = rtc_nop,
};
