/**
 * @file aeios_config.h
 * @brief NVS configuration — DOC-006 §8.1 namespaces.
 */
#pragma once

#include "esp_err.h"
#include <stdint.h>
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct {
    uint16_t node_id;
    uint16_t gw_id;
    uint16_t sample_interval_s;
    uint16_t heartbeat_interval_s;
} aeios_cfg_t;

esp_err_t aeios_config_init(void);
esp_err_t aeios_config_load(aeios_cfg_t *out);
esp_err_t aeios_config_save(const aeios_cfg_t *in);
const aeios_cfg_t *aeios_config_get(void);

#ifdef __cplusplus
}
#endif
