/**
 * @file aeios_bsp.h
 * @brief Board Support Package — HW-NODE-r2 pin map (ADR-013).
 *
 * Assumptions: ESP32-DevKitC-32E (38-pin) + SX1278 @ 433 MHz.
 * GPS/GNSS UART is not present (ADR-010).
 * GPIO34 is MQ135 conditioned ADC only; battery ADC is hardware-pending.
 */
#pragma once

#include "esp_err.h"
#include <stdint.h>
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

/** Board revision string stored in firmware for field identification. */
#define AEIOS_HW_REV "HW-NODE-r2"

/** Unassigned / hardware-pending GPIO or ADC channel. */
#define AEIOS_BSP_PIN_UNASSIGNED (-1)

typedef struct {
    int i2c_sda;
    int i2c_scl;
    int i2c_port;
    int uart_pms_tx;
    int uart_pms_rx;
    int spi_lora_miso;
    int spi_lora_mosi;
    int spi_lora_sck;
    int spi_lora_cs;
    int lora_rst;
    int lora_dio0;
    int adc_mq135;
    int adc_battery; /* AEIOS_BSP_PIN_UNASSIGNED until a second ADC is validated */
    int gpio_status_led;
    int gpio_maint_btn;
} aeios_bsp_pins_t;

/**
 * Initialize BSP: load pin map, configure basic GPIO directions.
 * @return ESP_OK on success.
 */
esp_err_t aeios_bsp_init(void);

/** Pointer to static pin map (valid after init). */
const aeios_bsp_pins_t *aeios_bsp_pins(void);

const char *aeios_bsp_hw_rev(void);

#ifdef __cplusplus
}
#endif
