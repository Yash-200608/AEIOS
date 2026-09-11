/**
 * Desktop HAL mock tests.
 */
#include "test_util.h"
#include "aeios_hal_host.h"
#include <stdio.h>

int main(void) {
    printf("HAL host mock\n");
    expect_true("init", aeios_hal_host_init() == AEIOS_HAL_HOST_OK);
    expect_true("uptime0", aeios_hal_host_uptime_ms() == 0);
    aeios_hal_host_advance_ms(1500);
    expect_true("uptime", aeios_hal_host_uptime_ms() == 1500);
    expect_true("time invalid", !aeios_hal_host_time_valid());
    aeios_hal_host_time_set_unix(1000000);
    expect_true("time valid", aeios_hal_host_time_valid());
    expect_true("unix", aeios_hal_host_time_unix() == 1000000);
    aeios_hal_host_advance_ms(5000);
    expect_true("unix advances", aeios_hal_host_time_unix() == 1000005);

    expect_true("wdt add", aeios_hal_host_wdt_add_current_task() == AEIOS_HAL_HOST_OK);
    aeios_hal_host_wdt_feed();
    aeios_hal_host_wdt_feed();
    expect_true("feeds", aeios_hal_host_wdt_feed_count() == 2);

    expect_true("light reject 0", aeios_hal_host_light_sleep_us(0) == AEIOS_HAL_HOST_ERR_ARG);
    expect_true("light ok", aeios_hal_host_light_sleep_us(2000000) == AEIOS_HAL_HOST_OK);
    expect_true("deep ok", aeios_hal_host_deep_sleep_us(1000000) == AEIOS_HAL_HOST_OK);
    expect_true("deep flag", aeios_hal_host_deep_sleep_entered());

    return test_finish("hal_mock");
}
