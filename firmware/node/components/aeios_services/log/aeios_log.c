#include "aeios_log.h"
#include "esp_log.h"

static const char *TAG = "aeios_log";

esp_err_t aeios_log_init(void)
{
    ESP_LOGI(TAG, "logging service ready (level=INFO default)");
    return ESP_OK;
}
