idf_component_register(
    SRCS
        "aeios_services.c"
        "log/aeios_log.c"
        "config/aeios_config.c"
        "sleep/aeios_sleep.c"
    INCLUDE_DIRS "include"
    REQUIRES nvs_flash aeios_hal log
)
