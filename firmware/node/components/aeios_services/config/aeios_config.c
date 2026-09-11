/**
 * @file aeios_config.c
 * Traceability: DOC-006 NVS schema, FR-CFG-001, FR-PWR recovery.
 */
#include "aeios_config.h"
#include "nvs.h"
#include "esp_log.h"
#include <string.h>

static const char *TAG = "aeios_cfg";
static aeios_cfg_t s_cfg;
static bool s_ready;

esp_err_t aeios_config_init(void)
{
    memset(&s_cfg, 0, sizeof(s_cfg));
    s_cfg.node_id = 0x0010;
    s_cfg.gw_id = 0x0002;
    s_cfg.sample_interval_s = 60;
    s_cfg.heartbeat_interval_s = 120;

    nvs_handle_t h;
    esp_err_t err = nvs_open("aeios_cfg", NVS_READWRITE, &h);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "nvs_open failed: %s", esp_err_to_name(err));
        return err;
    }

    uint16_t v;
    if (nvs_get_u16(h, "node_id", &v) == ESP_OK) {
        s_cfg.node_id = v;
    } else {
        nvs_set_u16(h, "node_id", s_cfg.node_id);
    }
    if (nvs_get_u16(h, "gw_id", &v) == ESP_OK) {
        s_cfg.gw_id = v;
    } else {
        nvs_set_u16(h, "gw_id", s_cfg.gw_id);
    }
    if (nvs_get_u16(h, "sample_s", &v) == ESP_OK) {
        s_cfg.sample_interval_s = v;
    } else {
        nvs_set_u16(h, "sample_s", s_cfg.sample_interval_s);
    }
    if (nvs_get_u16(h, "hb_s", &v) == ESP_OK) {
        s_cfg.heartbeat_interval_s = v;
    } else {
        nvs_set_u16(h, "hb_s", s_cfg.heartbeat_interval_s);
    }
    nvs_commit(h);
    nvs_close(h);

    s_ready = true;
    ESP_LOGI(TAG, "config loaded node=%u gw=%u sample=%us hb=%us", (unsigned)s_cfg.node_id,
             (unsigned)s_cfg.gw_id, (unsigned)s_cfg.sample_interval_s,
             (unsigned)s_cfg.heartbeat_interval_s);
    return ESP_OK;
}

esp_err_t aeios_config_load(aeios_cfg_t *out)
{
    if (!s_ready || !out) {
        return ESP_ERR_INVALID_STATE;
    }
    *out = s_cfg;
    return ESP_OK;
}

esp_err_t aeios_config_save(const aeios_cfg_t *in)
{
    if (!in) {
        return ESP_ERR_INVALID_ARG;
    }
    nvs_handle_t h;
    esp_err_t err = nvs_open("aeios_cfg", NVS_READWRITE, &h);
    if (err != ESP_OK) {
        return err;
    }
    nvs_set_u16(h, "node_id", in->node_id);
    nvs_set_u16(h, "gw_id", in->gw_id);
    nvs_set_u16(h, "sample_s", in->sample_interval_s);
    nvs_set_u16(h, "hb_s", in->heartbeat_interval_s);
    err = nvs_commit(h);
    nvs_close(h);
    if (err == ESP_OK) {
        s_cfg = *in;
    }
    return err;
}

const aeios_cfg_t *aeios_config_get(void)
{
    return s_ready ? &s_cfg : NULL;
}
