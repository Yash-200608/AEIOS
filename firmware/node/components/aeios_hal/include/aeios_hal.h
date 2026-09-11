/**
 * @file aeios_hal.h
 * @brief Hardware Abstraction — time, sleep arming, WDT feed (DOC-006).
 *
 * Upper layers (services/app) use this API instead of calling esp_sleep / esp_timer directly.
 * Limitations: Deep sleep does not return; caller must finish flush before invoke.
 */
#pragma once

#include "esp_err.h"
#include <stdint.h>
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

esp_err_t aeios_hal_init(void);

uint64_t aeios_hal_uptime_ms(void);

/** Unix-ish seconds from RTC driver cache if set; else uptime-based stub. */
uint32_t aeios_hal_time_unix(void);

void aeios_hal_time_set_unix(uint32_t unix_s);

/** Subscribe calling task to TWDT. */
esp_err_t aeios_hal_wdt_add_current_task(void);

void aeios_hal_wdt_feed(void);

/**
 * Arm timer wakeup and enter deep sleep.
 * @param duration_us sleep duration
 */
esp_err_t aeios_hal_deep_sleep_us(uint64_t duration_us);

/** Light sleep for short duty-cycle pauses (returns). */
esp_err_t aeios_hal_light_sleep_us(uint64_t duration_us);

#ifdef __cplusplus
}
#endif
