/**
 * @file aeios_app.c
 * @brief DOC-006 task set — D1 stubs (sensor/comm/power/diag).
 * Layer note: FreeRTOS + aeios_hal/log only; no direct esp_sleep.
 */
#include "aeios_app.h"
#include "aeios_hal.h"
#include "aeios_driver.h"
#include "aeios_config.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

static const char *TAG = "aeios_app";

static void sensor_task(void *arg)
{
    (void)arg;
    (void)aeios_hal_wdt_add_current_task();
    for (;;) {
        aeios_hal_wdt_feed();
        ESP_LOGD(TAG, "sensor_task tick (D2 read pending)");
        const aeios_cfg_t *cfg = aeios_config_get();
        uint32_t ms = cfg ? (uint32_t)cfg->sample_interval_s * 1000u : 5000u;
        if (ms < 1000u) {
            ms = 1000u;
        }
        vTaskDelay(pdMS_TO_TICKS(ms));
    }
}

static void comm_task(void *arg)
{
    (void)arg;
    (void)aeios_hal_wdt_add_current_task();
    for (;;) {
        aeios_hal_wdt_feed();
        ESP_LOGD(TAG, "comm_task tick (D3 AMP air pending)");
        vTaskDelay(pdMS_TO_TICKS(2000));
    }
}

static void power_task(void *arg)
{
    (void)arg;
    (void)aeios_hal_wdt_add_current_task();
    for (;;) {
        aeios_hal_wdt_feed();
        ESP_LOGD(TAG, "power_task uptime_ms=%llu", (unsigned long long)aeios_hal_uptime_ms());
        vTaskDelay(pdMS_TO_TICKS(10000));
    }
}

static void diag_task(void *arg)
{
    (void)arg;
    (void)aeios_hal_wdt_add_current_task();
    for (;;) {
        aeios_hal_wdt_feed();
        ESP_LOGI(TAG, "diag heartbeat uptime_ms=%llu unix=%u",
                 (unsigned long long)aeios_hal_uptime_ms(),
                 (unsigned)aeios_hal_time_unix());
        vTaskDelay(pdMS_TO_TICKS(15000));
    }
}

esp_err_t aeios_app_start(void)
{
    ESP_LOGI(TAG, "starting FreeRTOS tasks (DOC-006)");
    if (xTaskCreate(sensor_task, "sensor", 3072, NULL, 5, NULL) != pdPASS) {
        return ESP_FAIL;
    }
    if (xTaskCreate(comm_task, "comm", 4096, NULL, 6, NULL) != pdPASS) {
        return ESP_FAIL;
    }
    if (xTaskCreate(power_task, "power", 3072, NULL, 5, NULL) != pdPASS) {
        return ESP_FAIL;
    }
    if (xTaskCreate(diag_task, "diag", 3072, NULL, 3, NULL) != pdPASS) {
        return ESP_FAIL;
    }
    return ESP_OK;
}
