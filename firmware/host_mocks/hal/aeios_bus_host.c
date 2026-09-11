/**
 * @file aeios_bus_host.c
 * @brief In-memory bus mocks for host driver tests — not hardware simulation.
 */
#include "aeios_bus_host.h"
#include <string.h>

static aeios_gpio_mode_t s_gpio_mode[AEIOS_GPIO_MAX];
static int s_gpio_level[AEIOS_GPIO_MAX];

static uint8_t s_uart_rx[AEIOS_UART_RING];
static size_t s_uart_rx_r, s_uart_rx_w, s_uart_rx_n;
static size_t s_uart_tx_count;

/* sparse: last device + 256 regs */
static uint8_t s_i2c_addr;
static uint8_t s_i2c_regs[256];
static uint8_t s_i2c_last[64];
static size_t s_i2c_last_len;

static uint8_t s_spi_last_tx[128];
static size_t s_spi_last_len;

void aeios_bus_host_reset(void)
{
    memset(s_gpio_mode, 0, sizeof s_gpio_mode);
    memset(s_gpio_level, 0, sizeof s_gpio_level);
    memset(s_uart_rx, 0, sizeof s_uart_rx);
    s_uart_rx_r = s_uart_rx_w = s_uart_rx_n = 0;
    s_uart_tx_count = 0;
    s_i2c_addr = 0;
    memset(s_i2c_regs, 0, sizeof s_i2c_regs);
    memset(s_i2c_last, 0, sizeof s_i2c_last);
    s_i2c_last_len = 0;
    memset(s_spi_last_tx, 0, sizeof s_spi_last_tx);
    s_spi_last_len = 0;
}

int aeios_gpio_mock_set_mode(unsigned pin, aeios_gpio_mode_t mode)
{
    if (pin >= AEIOS_GPIO_MAX) {
        return AEIOS_BUS_ERR;
    }
    s_gpio_mode[pin] = mode;
    return AEIOS_BUS_OK;
}

int aeios_gpio_mock_set_level(unsigned pin, int level)
{
    if (pin >= AEIOS_GPIO_MAX) {
        return AEIOS_BUS_ERR;
    }
    if (s_gpio_mode[pin] != AEIOS_GPIO_MODE_OUTPUT &&
        s_gpio_mode[pin] != AEIOS_GPIO_MODE_INPUT) {
        /* allow set for test injection even if input */
    }
    s_gpio_level[pin] = level ? 1 : 0;
    return AEIOS_BUS_OK;
}

int aeios_gpio_mock_get_level(unsigned pin)
{
    if (pin >= AEIOS_GPIO_MAX) {
        return AEIOS_BUS_ERR;
    }
    return s_gpio_level[pin];
}

aeios_gpio_mode_t aeios_gpio_mock_get_mode(unsigned pin)
{
    if (pin >= AEIOS_GPIO_MAX) {
        return AEIOS_GPIO_MODE_DISABLE;
    }
    return s_gpio_mode[pin];
}

int aeios_uart_mock_write(const uint8_t *data, size_t len)
{
    size_t i;
    if (!data && len) {
        return AEIOS_BUS_ERR;
    }
    /* loopback into RX for host tests */
    for (i = 0; i < len; i++) {
        if (s_uart_rx_n >= AEIOS_UART_RING) {
            break;
        }
        s_uart_rx[s_uart_rx_w] = data[i];
        s_uart_rx_w = (s_uart_rx_w + 1u) % AEIOS_UART_RING;
        s_uart_rx_n++;
        s_uart_tx_count++;
    }
    return (int)i;
}

int aeios_uart_mock_read(uint8_t *data, size_t maxlen)
{
    size_t n = 0;
    if (!data) {
        return AEIOS_BUS_ERR;
    }
    while (n < maxlen && s_uart_rx_n > 0) {
        data[n++] = s_uart_rx[s_uart_rx_r];
        s_uart_rx_r = (s_uart_rx_r + 1u) % AEIOS_UART_RING;
        s_uart_rx_n--;
    }
    return (int)n;
}

size_t aeios_uart_mock_rx_avail(void) { return s_uart_rx_n; }
size_t aeios_uart_mock_tx_logged(void) { return s_uart_tx_count; }

int aeios_i2c_mock_write_reg(uint8_t addr7, uint8_t reg, uint8_t val)
{
    s_i2c_addr = addr7;
    s_i2c_regs[reg] = val;
    return AEIOS_BUS_OK;
}

int aeios_i2c_mock_read_reg(uint8_t addr7, uint8_t reg, uint8_t *val)
{
    if (!val) {
        return AEIOS_BUS_ERR;
    }
    (void)addr7;
    *val = s_i2c_regs[reg];
    return AEIOS_BUS_OK;
}

int aeios_i2c_mock_write(uint8_t addr7, const uint8_t *data, size_t len)
{
    if (!data || len == 0 || len > sizeof s_i2c_last) {
        return AEIOS_BUS_ERR;
    }
    s_i2c_addr = addr7;
    memcpy(s_i2c_last, data, len);
    s_i2c_last_len = len;
    if (len >= 2) {
        s_i2c_regs[data[0]] = data[1];
    }
    return AEIOS_BUS_OK;
}

int aeios_i2c_mock_read(uint8_t addr7, uint8_t *data, size_t len)
{
    size_t i;
    if (!data || len == 0) {
        return AEIOS_BUS_ERR;
    }
    (void)addr7;
    for (i = 0; i < len; i++) {
        data[i] = s_i2c_regs[i & 0xFFu];
    }
    return AEIOS_BUS_OK;
}

int aeios_spi_mock_transfer(const uint8_t *tx, uint8_t *rx, size_t len)
{
    size_t i;
    if ((!tx && len) || len > sizeof s_spi_last_tx) {
        return AEIOS_BUS_ERR;
    }
    if (tx) {
        memcpy(s_spi_last_tx, tx, len);
    }
    s_spi_last_len = len;
    if (rx) {
        for (i = 0; i < len; i++) {
            rx[i] = tx ? (uint8_t)~tx[i] : 0xFF; /* deterministic invert mock */
        }
    }
    return AEIOS_BUS_OK;
}

const uint8_t *aeios_spi_mock_last_tx(size_t *len_out)
{
    if (len_out) {
        *len_out = s_spi_last_len;
    }
    return s_spi_last_tx;
}
