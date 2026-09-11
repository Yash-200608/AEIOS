/**
 * @file aeios_sleep.h
 * @brief Sleep manager — duty-cycle sleep via HAL (DOC-006 power).
 */
#pragma once

#include "esp_err.h"
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

esp_err_t aeios_sleep_init(void);

/** Light sleep for duration_ms (returns). */
esp_err_t aeios_sleep_light_ms(uint32_t duration_ms);

/**
 * Deep sleep for duration_ms (does not return on success).
 * Call only after drivers shutdown / flush.
 */
esp_err_t aeios_sleep_deep_ms(uint32_t duration_ms);

#ifdef __cplusplus
}
#endif
