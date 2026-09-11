/**
 * @file aeios_hal.c
 * Traceability: DOC-006 HAL, FR-PWR-002, NFR-PWR-*.
 */
#include "aeios_hal.h"
#include "esp_log.h"
#include "esp_sleep.h"
#include "esp_timer.h"
#include "esp_task_wdt.h"
#include <inttypes.h>

static const char *TAG = "aeios_hal";
static uint32_t s_unix_base;
static uint64_t s_unix_base_uptime_ms;
static bool s_time_valid;

esp_err_t aeios_hal_init(void)
{
    ESP_LOGI(TAG, "HAL init");
    s_unix_base = 0;
    s_unix_base_uptime_ms = 0;
    s_time_valid = false;
    return ESP_OK;
}

uint64_t aeios_hal_uptime_ms(void)
{
    return (uint64_t)(esp_timer_get_time() / 1000ULL);
}

void aeios_hal_time_set_unix(uint32_t unix_s)
{
    s_unix_base = unix_s;
    s_unix_base_uptime_ms = aeios_hal_uptime_ms();
    s_time_valid = true;
}

uint32_t aeios_hal_time_unix(void)
{
    if (!s_time_valid) {
        return 0;
    }
    uint64_t delta_s = (aeios_hal_uptime_ms() - s_unix_base_uptime_ms) / 1000ULL;
    return s_unix_base + (uint32_t)delta_s;
}

esp_err_t aeios_hal_wdt_add_current_task(void)
{
    esp_err_t err = esp_task_wdt_add(NULL);
    if (err != ESP_OK && err != ESP_ERR_INVALID_STATE) {
        ESP_LOGE(TAG, "wdt_add failed: %s", esp_err_to_name(err));
        return err;
    }
    return ESP_OK;
}

void aeios_hal_wdt_feed(void)
{
    (void)esp_task_wdt_reset();
}

esp_err_t aeios_hal_deep_sleep_us(uint64_t duration_us)
{
    if (duration_us == 0) {
        ESP_LOGE(TAG, "deep_sleep duration_us=0 rejected");
        return ESP_ERR_INVALID_ARG;
    }
    ESP_LOGW(TAG, "Entering deep sleep for %" PRIu64 " us", duration_us);
    esp_err_t err = esp_sleep_enable_timer_wakeup(duration_us);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "enable_timer_wakeup failed: %s", esp_err_to_name(err));
        return err;
    }
    esp_deep_sleep_start();
    return ESP_OK;
}

esp_err_t aeios_hal_light_sleep_us(uint64_t duration_us)
{
    if (duration_us == 0) {
        return ESP_ERR_INVALID_ARG;
    }
    esp_err_t err = esp_sleep_enable_timer_wakeup(duration_us);
    if (err != ESP_OK) {
        return err;
    }
    return esp_light_sleep_start();
}
