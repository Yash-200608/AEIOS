idf_component_register(
    SRCS
        "aeios_drivers.c"
        "watchdog/drv_watchdog.c"
        "rtc/drv_rtc.c"
        "stubs/driver_stubs.c"
    INCLUDE_DIRS "include"
    REQUIRES aeios_hal log
)
