idf_component_register(
    SRCS "aeios_hal.c"
    INCLUDE_DIRS "include"
    REQUIRES esp_timer esp_hw_support log
)
