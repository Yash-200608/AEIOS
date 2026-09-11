#include "aeios_services.h"
#include "aeios_log.h"
#include "aeios_config.h"
#include "aeios_sleep.h"
#include "esp_log.h"

static const char *TAG = "aeios_svc";

esp_err_t aeios_services_init(void)
{
    esp_err_t err = aeios_log_init();
    if (err != ESP_OK) {
        return err;
    }
    err = aeios_config_init();
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "config_init failed");
        return err;
    }
    err = aeios_sleep_init();
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "sleep_init failed");
        return err;
    }
    ESP_LOGI(TAG, "services OK");
    return ESP_OK;
}
