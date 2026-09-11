/**
 * @file aeios_hal_host.h
 * @brief Desktop mock of DOC-006 HAL — does not replace firmware aeios_hal.h.
 *
 * Same semantic operations for host unit tests. Uses int status codes
 * (0 = OK) instead of esp_err_t so ESP-IDF headers are not required.
 */
#pragma once

#include <stdint.h>
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

#define AEIOS_HAL_HOST_OK 0
#define AEIOS_HAL_HOST_ERR_ARG -1
#define AEIOS_HAL_HOST_ERR_STATE -2

int aeios_hal_host_init(void);
void aeios_hal_host_reset(void);

uint64_t aeios_hal_host_uptime_ms(void);
void aeios_hal_host_advance_ms(uint64_t delta_ms);

uint32_t aeios_hal_host_time_unix(void);
void aeios_hal_host_time_set_unix(uint32_t unix_s);
bool aeios_hal_host_time_valid(void);

int aeios_hal_host_wdt_add_current_task(void);
void aeios_hal_host_wdt_feed(void);
uint32_t aeios_hal_host_wdt_feed_count(void);

/** Light sleep: advances virtual clock, returns. */
int aeios_hal_host_light_sleep_us(uint64_t duration_us);

/**
 * Deep sleep mock: advances clock and sets deep_sleep_entered flag.
 * Does not abort process (unlike real HAL).
 */
int aeios_hal_host_deep_sleep_us(uint64_t duration_us);
bool aeios_hal_host_deep_sleep_entered(void);

#ifdef __cplusplus
}
#endif
