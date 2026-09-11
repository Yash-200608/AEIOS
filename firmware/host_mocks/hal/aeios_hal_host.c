/**
 * @file aeios_hal_host.c
 * @brief Host-side HAL mock — DOC-006 semantics without ESP-IDF.
 */
#include "aeios_hal_host.h"

static uint64_t s_uptime_ms;
static uint32_t s_unix_base;
static uint64_t s_unix_base_uptime_ms;
static bool s_time_valid;
static bool s_wdt_armed;
static uint32_t s_wdt_feeds;
static bool s_deep_sleep;

void aeios_hal_host_reset(void) {
    s_uptime_ms = 0;
    s_unix_base = 0;
    s_unix_base_uptime_ms = 0;
    s_time_valid = false;
    s_wdt_armed = false;
    s_wdt_feeds = 0;
    s_deep_sleep = false;
}

int aeios_hal_host_init(void)
{
    aeios_hal_host_reset();
    return AEIOS_HAL_HOST_OK;
}

/** Optional: include bus mock reset from tests via aeios_bus_host_reset(). */

uint64_t aeios_hal_host_uptime_ms(void) {
    return s_uptime_ms;
}

void aeios_hal_host_advance_ms(uint64_t delta_ms) {
    s_uptime_ms += delta_ms;
}

uint32_t aeios_hal_host_time_unix(void) {
    if (!s_time_valid) {
        return 0;
    }
    return s_unix_base + (uint32_t)((s_uptime_ms - s_unix_base_uptime_ms) / 1000ULL);
}

void aeios_hal_host_time_set_unix(uint32_t unix_s) {
    s_unix_base = unix_s;
    s_unix_base_uptime_ms = s_uptime_ms;
    s_time_valid = true;
}

bool aeios_hal_host_time_valid(void) {
    return s_time_valid;
}

int aeios_hal_host_wdt_add_current_task(void) {
    s_wdt_armed = true;
    return AEIOS_HAL_HOST_OK;
}

void aeios_hal_host_wdt_feed(void) {
    if (s_wdt_armed) {
        s_wdt_feeds++;
    }
}

uint32_t aeios_hal_host_wdt_feed_count(void) {
    return s_wdt_feeds;
}

int aeios_hal_host_light_sleep_us(uint64_t duration_us) {
    if (duration_us == 0) {
        return AEIOS_HAL_HOST_ERR_ARG;
    }
    s_uptime_ms += duration_us / 1000ULL;
    return AEIOS_HAL_HOST_OK;
}

int aeios_hal_host_deep_sleep_us(uint64_t duration_us) {
    if (duration_us == 0) {
        return AEIOS_HAL_HOST_ERR_ARG;
    }
    s_uptime_ms += duration_us / 1000ULL;
    s_deep_sleep = true;
    return AEIOS_HAL_HOST_OK;
}

bool aeios_hal_host_deep_sleep_entered(void) {
    return s_deep_sleep;
}
