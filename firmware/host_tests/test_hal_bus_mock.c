/**
 * HAL + bus mock coverage — time/sleep/WDT + GPIO/UART/I2C/SPI (host only).
 */
#include "test_util.h"
#include "aeios_hal_host.h"
#include "aeios_bus_host.h"
#include <stdio.h>
#include <string.h>

int main(void)
{
    uint8_t buf[16];
    uint8_t rx[16];
    uint8_t val = 0;
    size_t n = 0;

    printf("HAL+bus host mock\n");
    expect_true("hal init", aeios_hal_host_init() == AEIOS_HAL_HOST_OK);
    aeios_bus_host_reset();

    aeios_hal_host_advance_ms(100);
    aeios_hal_host_time_set_unix(42);
    expect_true("time", aeios_hal_host_time_unix() == 42);
    expect_true("wdt", aeios_hal_host_wdt_add_current_task() == AEIOS_HAL_HOST_OK);
    aeios_hal_host_wdt_feed();
    expect_true("feed", aeios_hal_host_wdt_feed_count() == 1);
    expect_true("light sleep", aeios_hal_host_light_sleep_us(1000) == AEIOS_HAL_HOST_OK);

    expect_true("gpio mode", aeios_gpio_mock_set_mode(5, AEIOS_GPIO_MODE_OUTPUT) == AEIOS_BUS_OK);
    expect_true("gpio set", aeios_gpio_mock_set_level(5, 1) == AEIOS_BUS_OK);
    expect_true("gpio get", aeios_gpio_mock_get_level(5) == 1);
    expect_true("gpio bad pin", aeios_gpio_mock_set_mode(999, AEIOS_GPIO_MODE_INPUT) == AEIOS_BUS_ERR);

    memset(buf, 0xA5, 8);
    expect_true("uart write", aeios_uart_mock_write(buf, 8) == 8);
    expect_true("uart avail", aeios_uart_mock_rx_avail() == 8);
    expect_true("uart read", aeios_uart_mock_read(rx, 8) == 8);
    expect_true("uart loopback", memcmp(buf, rx, 8) == 0);

    expect_true("i2c wr reg", aeios_i2c_mock_write_reg(0x76, 0xD0, 0x61) == AEIOS_BUS_OK);
    expect_true("i2c rd reg", aeios_i2c_mock_read_reg(0x76, 0xD0, &val) == AEIOS_BUS_OK);
    expect_true("i2c val", val == 0x61);
    buf[0] = 0x10;
    buf[1] = 0x22;
    expect_true("i2c write", aeios_i2c_mock_write(0x76, buf, 2) == AEIOS_BUS_OK);

    buf[0] = 0x12;
    expect_true("spi xfer", aeios_spi_mock_transfer(buf, rx, 1) == AEIOS_BUS_OK);
    expect_true("spi invert mock", rx[0] == (uint8_t)~0x12);
    expect_true("spi last", aeios_spi_mock_last_tx(&n)[0] == 0x12 && n == 1);

    return test_finish("hal_bus_mock");
}
