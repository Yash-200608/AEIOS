/**
 * @file aeios_bsp.c
 * @brief BSP pin table for HW-NODE-r2 (ADR-013).
 * Traceability: ADR-009 radio, ADR-010 no GPS, ADR-011 MQ135 ADC34.
 */
#include "aeios_bsp.h"
#include "driver/gpio.h"
#include "esp_log.h"

static const char *TAG = "aeios_bsp";

static aeios_bsp_pins_t s_pins = {
    .i2c_sda = 21,
    .i2c_scl = 22,
    .i2c_port = 0,
    .uart_pms_tx = 17,
    .uart_pms_rx = 16,
    .spi_lora_miso = 19,
    .spi_lora_mosi = 23,
    .spi_lora_sck = 18,
    .spi_lora_cs = 5,
    .lora_rst = 14,
    .lora_dio0 = 25,
    .adc_mq135 = 34,
    .adc_battery = AEIOS_BSP_PIN_UNASSIGNED,
    .gpio_status_led = 2,
    .gpio_maint_btn = 0,
};

static bool s_ready;

esp_err_t aeios_bsp_init(void)
{
    ESP_LOGI(TAG, "BSP init rev=%s (no GPS; MQ135 ADC=%d battery ADC pending)", AEIOS_HW_REV,
             s_pins.adc_mq135);

    gpio_config_t io = {
        .pin_bit_mask = (1ULL << s_pins.gpio_status_led),
        .mode = GPIO_MODE_OUTPUT,
        .pull_up_en = GPIO_PULLUP_DISABLE,
        .pull_down_en = GPIO_PULLDOWN_DISABLE,
        .intr_type = GPIO_INTR_DISABLE,
    };
    esp_err_t err = gpio_config(&io);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "status LED gpio_config failed: %s", esp_err_to_name(err));
        return err;
    }
    gpio_set_level(s_pins.gpio_status_led, 0);

    io.pin_bit_mask = (1ULL << s_pins.gpio_maint_btn);
    io.mode = GPIO_MODE_INPUT;
    io.pull_up_en = GPIO_PULLUP_ENABLE;
    err = gpio_config(&io);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "maint btn gpio_config failed: %s", esp_err_to_name(err));
        return err;
    }

    s_ready = true;
    ESP_LOGI(TAG, "BSP ready (I2C sda=%d scl=%d LoRa cs=%d dio0=%d)", s_pins.i2c_sda,
             s_pins.i2c_scl, s_pins.spi_lora_cs, s_pins.lora_dio0);
    return ESP_OK;
}

const aeios_bsp_pins_t *aeios_bsp_pins(void)
{
    return s_ready ? &s_pins : NULL;
}

const char *aeios_bsp_hw_rev(void)
{
    return AEIOS_HW_REV;
}
