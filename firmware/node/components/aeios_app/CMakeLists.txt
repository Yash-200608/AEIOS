idf_component_register(
    SRCS "aeios_app.c"
    INCLUDE_DIRS "include"
    REQUIRES aeios_hal aeios_drivers aeios_services freertos log
)
