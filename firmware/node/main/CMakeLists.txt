idf_component_register(
    SRCS "main.c" "aeios_test_harness.c"
    INCLUDE_DIRS "."
    REQUIRES
        aeios_bsp
        aeios_hal
        aeios_services
        aeios_drivers
        aeios_amp
        aeios_app
        nvs_flash
        esp_timer
)
