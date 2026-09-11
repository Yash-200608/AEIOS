/**
 * @file aeios_drivers.c
 * @brief Driver registry — ADR-013 order (no GPS).
 */
#include "aeios_driver.h"
#include "esp_log.h"
#include <stddef.h>

extern const aeios_driver_ops_t aeios_drv_watchdog;
extern const aeios_driver_ops_t aeios_drv_rtc;
extern const aeios_driver_ops_t aeios_drv_battery;
extern const aeios_driver_ops_t aeios_drv_scd41;
extern const aeios_driver_ops_t aeios_drv_bme688;
extern const aeios_driver_ops_t aeios_drv_pms5003;
extern const aeios_driver_ops_t aeios_drv_mq135;
extern const aeios_driver_ops_t aeios_drv_lora;

static const char *TAG = "aeios_drv";

typedef struct {
    const char *name;
    const aeios_driver_ops_t *ops;
} drv_entry_t;

static const drv_entry_t s_table[] = {
    {"watchdog", &aeios_drv_watchdog},
    {"rtc", &aeios_drv_rtc},
    {"battery", &aeios_drv_battery},
    {"scd41", &aeios_drv_scd41},
    {"bme688", &aeios_drv_bme688},
    {"pms5003", &aeios_drv_pms5003},
    {"mq135", &aeios_drv_mq135},
    {"lora", &aeios_drv_lora},
};

static int call_init(const drv_entry_t *e)
{
    if (!e->ops || !e->ops->init) {
        ESP_LOGE(TAG, "%s missing init", e->name);
        return -1;
    }
    int rc = e->ops->init(NULL);
    if (rc != 0) {
        ESP_LOGE(TAG, "%s init failed rc=%d", e->name, rc);
    } else {
        ESP_LOGI(TAG, "%s init OK", e->name);
    }
    return rc;
}

int aeios_drivers_init_all(void)
{
    int fail = 0;
    for (unsigned i = 0; i < sizeof(s_table) / sizeof(s_table[0]); i++) {
        if (call_init(&s_table[i]) != 0) {
            fail++;
        }
    }
    return fail == 0 ? 0 : -1;
}

int aeios_drivers_self_test_all(void)
{
    int fail = 0;
    for (unsigned i = 0; i < sizeof(s_table) / sizeof(s_table[0]); i++) {
        const aeios_driver_ops_t *ops = s_table[i].ops;
        if (!ops || !ops->self_test) {
            continue;
        }
        int rc = ops->self_test(NULL);
        ESP_LOGI(TAG, "%s self_test -> %d", s_table[i].name, rc);
        /* Sensor stubs return 0; only hard-fail watchdog/rtc for D1 */
        if ((s_table[i].ops == &aeios_drv_watchdog || s_table[i].ops == &aeios_drv_rtc) &&
            rc != 0) {
            fail++;
        }
    }
    return fail == 0 ? 0 : -1;
}
