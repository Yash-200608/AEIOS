/**
 * @file aeios_sleep.c
 * Traceability: FR-PWR-002, FR-PWR-003, DOC-006 sleep manager.
 */
#include "aeios_sleep.h"
#include "aeios_hal.h"
#include "esp_log.h"

static const char *TAG = "aeios_sleep";

esp_err_t aeios_sleep_init(void)
{
    ESP_LOGI(TAG, "sleep manager ready");
    return ESP_OK;
}

esp_err_t aeios_sleep_light_ms(uint32_t duration_ms)
{
    if (duration_ms == 0) {
        ESP_LOGE(TAG, "light_ms=0 rejected");
        return ESP_ERR_INVALID_ARG;
    }
    ESP_LOGI(TAG, "light sleep %u ms", (unsigned)duration_ms);
    return aeios_hal_light_sleep_us((uint64_t)duration_ms * 1000ULL);
}

esp_err_t aeios_sleep_deep_ms(uint32_t duration_ms)
{
    if (duration_ms == 0) {
        ESP_LOGE(TAG, "deep_ms=0 rejected");
        return ESP_ERR_INVALID_ARG;
    }
    ESP_LOGW(TAG, "deep sleep %u ms (no return)", (unsigned)duration_ms);
    return aeios_hal_deep_sleep_us((uint64_t)duration_ms * 1000ULL);
}
