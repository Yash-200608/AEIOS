/**
 * @file aeios_test_harness.c
 * @brief D1 verification harness — WDT trip + deep sleep (CONFIG_AEIOS_TEST_MODE only).
 *
 * Does not alter production layering; uses existing HAL/sleep APIs.
 * Sequenced via NVS namespace "aeios_tv" key "phase".
 */
#include "sdkconfig.h"

#if !CONFIG_AEIOS_TEST_MODE

void aeios_test_harness_run(void) {}

#else /* CONFIG_AEIOS_TEST_MODE */

#include "aeios_test_harness.h"
#include "aeios_sleep.h"
#include "aeios_hal.h"
#include "esp_log.h"
#include "esp_system.h"
#include "esp_sleep.h"
#include "esp_task_wdt.h"
#include "nvs.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include <stdio.h>

static const char *TAG = "aeios_test";

#define NVS_NS "aeios_tv"
#define NVS_KEY_PHASE "phase"

enum {
    PHASE_WDT_ARM = 0,     /* arm starve → expect TWDT reset */
    PHASE_AFTER_WDT = 1,   /* log recovery → deep sleep */
    PHASE_AFTER_SLEEP = 2, /* log wake → done */
    PHASE_DONE = 3,
};

static const char *reset_name(esp_reset_reason_t r)
{
    switch (r) {
    case ESP_RST_POWERON:
        return "POWERON";
    case ESP_RST_EXT:
        return "EXT";
    case ESP_RST_SW:
        return "SW";
    case ESP_RST_PANIC:
        return "PANIC";
    case ESP_RST_INT_WDT:
        return "INT_WDT";
    case ESP_RST_TASK_WDT:
        return "TASK_WDT";
    case ESP_RST_WDT:
        return "WDT";
    case ESP_RST_DEEPSLEEP:
        return "DEEPSLEEP";
    case ESP_RST_BROWNOUT:
        return "BROWNOUT";
    case ESP_RST_SDIO:
        return "SDIO";
    default:
        return "OTHER";
    }
}

static const char *wake_name(esp_sleep_wakeup_cause_t c)
{
    switch (c) {
    case ESP_SLEEP_WAKEUP_UNDEFINED:
        return "UNDEFINED";
    case ESP_SLEEP_WAKEUP_EXT0:
        return "EXT0";
    case ESP_SLEEP_WAKEUP_EXT1:
        return "EXT1";
    case ESP_SLEEP_WAKEUP_TIMER:
        return "TIMER";
    case ESP_SLEEP_WAKEUP_TOUCHPAD:
        return "TOUCHPAD";
    case ESP_SLEEP_WAKEUP_ULP:
        return "ULP";
    case ESP_SLEEP_WAKEUP_GPIO:
        return "GPIO";
    case ESP_SLEEP_WAKEUP_UART:
        return "UART";
    default:
        return "OTHER";
    }
}

static esp_err_t phase_get(uint8_t *out)
{
    nvs_handle_t h;
    esp_err_t err = nvs_open(NVS_NS, NVS_READONLY, &h);
    if (err != ESP_OK) {
        *out = PHASE_WDT_ARM;
        return ESP_OK;
    }
    err = nvs_get_u8(h, NVS_KEY_PHASE, out);
    nvs_close(h);
    if (err == ESP_ERR_NVS_NOT_FOUND) {
        *out = PHASE_WDT_ARM;
        return ESP_OK;
    }
    return err;
}

static esp_err_t phase_set(uint8_t v)
{
    nvs_handle_t h;
    esp_err_t err = nvs_open(NVS_NS, NVS_READWRITE, &h);
    if (err != ESP_OK) {
        return err;
    }
    err = nvs_set_u8(h, NVS_KEY_PHASE, v);
    if (err == ESP_OK) {
        err = nvs_commit(h);
    }
    nvs_close(h);
    return err;
}

static void wdt_starve_task(void *arg)
{
    (void)arg;
    ESP_LOGW(TAG, "AEIOS_TEST: WDT starve task starting");
    ESP_ERROR_CHECK(esp_task_wdt_add(NULL));
    ESP_LOGW(TAG, "AEIOS_TEST: STOPPING WDT feed — expect TASK_WDT reset");
    for (;;) {
        /* intentional: do not call esp_task_wdt_reset / aeios_hal_wdt_feed */
        vTaskDelay(pdMS_TO_TICKS(1000));
    }
}

static void arm_wdt_trip(void)
{
    esp_task_wdt_config_t cfg = {
        .timeout_ms = (uint32_t)CONFIG_AEIOS_TEST_WDT_TIMEOUT_S * 1000u,
        .idle_core_mask = 0,
        .trigger_panic = true,
    };
    esp_err_t err = esp_task_wdt_reconfigure(&cfg);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "AEIOS_TEST: wdt_reconfigure failed: %s", esp_err_to_name(err));
    } else {
        ESP_LOGW(TAG, "AEIOS_TEST: TWDT timeout set to %d s (panic=1)",
                 CONFIG_AEIOS_TEST_WDT_TIMEOUT_S);
    }
    ESP_ERROR_CHECK(phase_set(PHASE_AFTER_WDT));
    if (xTaskCreate(wdt_starve_task, "wdt_starve", 2048, NULL, configMAX_PRIORITIES - 1,
                    NULL) != pdPASS) {
        ESP_LOGE(TAG, "AEIOS_TEST: failed to create starve task");
    }
}

static void restore_idle_wdt(void)
{
    esp_task_wdt_config_t cfg = {
        .timeout_ms = 30000,
        .idle_core_mask = (1u << 0) | (1u << 1),
        .trigger_panic = false,
    };
    (void)esp_task_wdt_reconfigure(&cfg);
    (void)esp_task_wdt_delete(NULL);
}

static void do_deep_sleep(void)
{
    uint32_t ms = (uint32_t)CONFIG_AEIOS_TEST_DEEP_SLEEP_MS;
    ESP_LOGW(TAG, "AEIOS_TEST: entering deep sleep for %u ms (timer wake)", (unsigned)ms);
    ESP_ERROR_CHECK(phase_set(PHASE_AFTER_SLEEP));
    /* Allow UART flush */
    vTaskDelay(pdMS_TO_TICKS(200));
    (void)aeios_sleep_deep_ms(ms);
    /* no return */
}

void aeios_test_harness_run(void)
{
    esp_reset_reason_t rr = esp_reset_reason();
    esp_sleep_wakeup_cause_t wc = esp_sleep_get_wakeup_cause();
    uint8_t phase = PHASE_WDT_ARM;

    ESP_LOGW(TAG, "==== AEIOS_TEST_MODE ACTIVE (not production) ====");
    ESP_LOGI(TAG, "AEIOS_TEST: reset_reason=%d (%s)", (int)rr, reset_name(rr));
    ESP_LOGI(TAG, "AEIOS_TEST: wake_cause=%d (%s)", (int)wc, wake_name(wc));

    if (phase_get(&phase) != ESP_OK) {
        ESP_LOGE(TAG, "AEIOS_TEST: phase_get failed; defaulting to WDT arm");
        phase = PHASE_WDT_ARM;
    }
    ESP_LOGI(TAG, "AEIOS_TEST: phase=%u", (unsigned)phase);

    if (phase == PHASE_AFTER_WDT) {
        if (rr == ESP_RST_TASK_WDT || rr == ESP_RST_WDT || rr == ESP_RST_PANIC) {
            ESP_LOGW(TAG, "AEIOS_TEST: WDT RECOVERY OK (reset=%s)", reset_name(rr));
            do_deep_sleep();
            return;
        }
        /* Stale phase (e.g. power-cycle mid-test) — re-arm trip */
        ESP_LOGW(TAG, "AEIOS_TEST: phase=AFTER_WDT but reset=%s — re-arming WDT trip",
                 reset_name(rr));
        arm_wdt_trip();
        return;
    }

    if (phase == PHASE_AFTER_SLEEP) {
        ESP_LOGW(TAG, "AEIOS_TEST: DEEP SLEEP WAKE (wake=%s reset=%s)", wake_name(wc),
                 reset_name(rr));
        if (wc == ESP_SLEEP_WAKEUP_TIMER) {
            ESP_LOGW(TAG, "AEIOS_TEST: TIMER WAKE CONFIRMED");
        }
        ESP_LOGI(TAG, "AEIOS_TEST: config persistence check — see aeios_cfg line above");
        ESP_ERROR_CHECK(phase_set(PHASE_DONE));
        restore_idle_wdt();
        ESP_LOGW(TAG, "AEIOS_TEST: sequence COMPLETE — rebuild with TEST_MODE=n for production");
        return;
    }

    if (phase == PHASE_DONE) {
        ESP_LOGI(TAG, "AEIOS_TEST: already complete (phase=DONE); idle");
        restore_idle_wdt();
        return;
    }

    /* PHASE_WDT_ARM */
    ESP_LOGW(TAG, "AEIOS_TEST: arming WDT trip");
    arm_wdt_trip();
}

#endif /* CONFIG_AEIOS_TEST_MODE */
