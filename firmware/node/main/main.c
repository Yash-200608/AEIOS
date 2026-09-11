/**
 * @file main.c
 * @brief FAS boot sequence (DOC-006 §9) — D1 platform bring-up.
 *
 * Power-on → early log → NVS flash → BSP → HAL → services → drivers →
 * self-test → app tasks → normal operation.
 *
 * Traceability: DOC-006 boot, SR-003/012, MVN boot item.
 */
#include "sdkconfig.h"
#include "esp_log.h"
#include "esp_system.h"
#include "nvs_flash.h"
#include "aeios_bsp.h"
#include "aeios_hal.h"
#include "aeios_services.h"
#include "aeios_config.h"
#include "aeios_driver.h"
#include "aeios_app.h"
#if CONFIG_AEIOS_TEST_MODE
#include "aeios_test_harness.h"
#endif

static const char *TAG = "aeios_boot";

static esp_err_t boot_nvs_flash(void)
{
    esp_err_t err = nvs_flash_init();
    if (err == ESP_ERR_NVS_NO_FREE_PAGES || err == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        ESP_LOGW(TAG, "NVS erase required");
        ESP_ERROR_CHECK(nvs_flash_erase());
        err = nvs_flash_init();
    }
    return err;
}

void app_main(void)
{
    ESP_LOGI(TAG, "==== AEIOS Sentinel boot (DOC-006) ====");
    ESP_LOGI(TAG, "reset_reason=%d", (int)esp_reset_reason());

    esp_err_t err = boot_nvs_flash();
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "NVS flash init FAILED: %s", esp_err_to_name(err));
        return;
    }
    ESP_LOGI(TAG, "NVS flash OK");

    err = aeios_bsp_init();
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "BSP FAILED");
        return;
    }
    ESP_LOGI(TAG, "BSP OK hw_rev=%s", aeios_bsp_hw_rev());

    err = aeios_hal_init();
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "HAL FAILED");
        return;
    }
    ESP_LOGI(TAG, "HAL OK");

    err = aeios_services_init();
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "SERVICES FAILED");
        return;
    }
    ESP_LOGI(TAG, "SERVICES OK");

    if (aeios_drivers_init_all() != 0) {
        ESP_LOGW(TAG, "driver init had failures (continuing D1)");
    } else {
        ESP_LOGI(TAG, "DRIVERS init OK");
    }

    if (aeios_drivers_self_test_all() != 0) {
        ESP_LOGE(TAG, "CRITICAL self-test FAIL (watchdog/rtc)");
    } else {
        ESP_LOGI(TAG, "SELF-TEST OK (wdt+rtc)");
    }

    const aeios_cfg_t *cfg = aeios_config_get();
    if (cfg) {
        ESP_LOGI(TAG, "config node_id=%u gw_id=%u", (unsigned)cfg->node_id,
                 (unsigned)cfg->gw_id);
    }

    /* AMP mesh join deferred to D3 — codec exists for host tests */
    ESP_LOGI(TAG, "AMP: host-tested codec linked; air TX deferred until D2 LoRa");

    err = aeios_app_start();
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "APP START FAILED");
        return;
    }

    ESP_LOGI(TAG, "==== Boot complete — normal operation (D1 skeleton) ====");

#if CONFIG_AEIOS_TEST_MODE
    /* Verification harness only — compiled out when AEIOS_TEST_MODE=n */
    aeios_test_harness_run();
#endif
}
