/**
 * @file aeios_log.h
 * @brief Logging service facade — keeps app from scattering esp_log includes later.
 */
#pragma once

#include "esp_err.h"
#include "esp_log.h"

#ifdef __cplusplus
extern "C" {
#endif

esp_err_t aeios_log_init(void);

#define AEIOS_LOGE(tag, fmt, ...) ESP_LOGE(tag, fmt, ##__VA_ARGS__)
#define AEIOS_LOGW(tag, fmt, ...) ESP_LOGW(tag, fmt, ##__VA_ARGS__)
#define AEIOS_LOGI(tag, fmt, ...) ESP_LOGI(tag, fmt, ##__VA_ARGS__)
#define AEIOS_LOGD(tag, fmt, ...) ESP_LOGD(tag, fmt, ##__VA_ARGS__)

#ifdef __cplusplus
}
#endif
