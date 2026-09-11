#pragma once
/**
 * @file aeios_bus_host.h
 * @brief Desktop bus mocks (GPIO/UART/I2C/SPI) — not production HAL; no ESP registers.
 */

#include <stdint.h>
#include <stddef.h>
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

#define AEIOS_BUS_OK 0
#define AEIOS_BUS_ERR -1

#ifndef AEIOS_GPIO_MAX
#define AEIOS_GPIO_MAX 40u
#endif

typedef enum {
    AEIOS_GPIO_MODE_DISABLE = 0,
    AEIOS_GPIO_MODE_INPUT,
    AEIOS_GPIO_MODE_OUTPUT
} aeios_gpio_mode_t;

void aeios_bus_host_reset(void);

/* --- GPIO mock (level table only) --- */
int aeios_gpio_mock_set_mode(unsigned pin, aeios_gpio_mode_t mode);
int aeios_gpio_mock_set_level(unsigned pin, int level);
int aeios_gpio_mock_get_level(unsigned pin);
aeios_gpio_mode_t aeios_gpio_mock_get_mode(unsigned pin);

/* --- UART mock (byte ring) --- */
#ifndef AEIOS_UART_RING
#define AEIOS_UART_RING 256u
#endif
int aeios_uart_mock_write(const uint8_t *data, size_t len);
int aeios_uart_mock_read(uint8_t *data, size_t maxlen);
size_t aeios_uart_mock_rx_avail(void);
size_t aeios_uart_mock_tx_logged(void); /* bytes accepted into TX path */

/* --- I2C mock (simple register map per 7-bit addr) --- */
int aeios_i2c_mock_write_reg(uint8_t addr7, uint8_t reg, uint8_t val);
int aeios_i2c_mock_read_reg(uint8_t addr7, uint8_t reg, uint8_t *val);
int aeios_i2c_mock_write(uint8_t addr7, const uint8_t *data, size_t len);
int aeios_i2c_mock_read(uint8_t addr7, uint8_t *data, size_t len);

/* --- SPI mock (shift exchange buffer) --- */
int aeios_spi_mock_transfer(const uint8_t *tx, uint8_t *rx, size_t len);
const uint8_t *aeios_spi_mock_last_tx(size_t *len_out);

#ifdef __cplusplus
}
#endif
