#pragma once
#include <stdint.h>
#include <stddef.h>
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

#define AMP_MAGIC 0xAEu
#define AMP_VERSION 1u
#define AMP_HEADER_LEN 20u
#define AMP_CRC_LEN 2u
#define AMP_MAC_LEN 8u
#define AMP_MAX_PAYLOAD 34u
#define AMP_MAX_FRAME 64u
#define AMP_OVERHEAD (AMP_HEADER_LEN + AMP_CRC_LEN + AMP_MAC_LEN)

#define AMP_FLAG_ACK_REQ (1u << 0)
#define AMP_FLAG_PRIORITY (1u << 1)
#define AMP_FLAG_ENCRYPTED (1u << 2)
#define AMP_FLAG_FROM_GW (1u << 3)
#define AMP_FLAG_FRAGMENT (1u << 4)

#define AMP_TYPE_SENSOR_DATA 0x01u
#define AMP_TYPE_HEARTBEAT 0x02u
#define AMP_TYPE_ACK 0x03u
#define AMP_TYPE_NACK 0x04u
#define AMP_TYPE_ROUTE_ADV 0x05u
#define AMP_TYPE_ROUTE_UPDATE 0x06u
#define AMP_TYPE_CONFIG_UPDATE 0x07u
#define AMP_TYPE_DIAGNOSTICS 0x08u
#define AMP_TYPE_TIME_SYNC 0x09u
#define AMP_TYPE_EMERGENCY_ALERT 0x0Au

#define AMP_GATEWAY_ID_DEFAULT 0x0002u
#define AMP_BROADCAST_ID 0xFFFFu

#pragma pack(push, 1)
typedef struct {
    uint8_t magic;
    uint8_t version;
    uint8_t type;
    uint8_t flags;
    uint8_t payload_len;
    uint8_t sync_status;
    uint16_t src;
    uint16_t dst;
    uint16_t prev_hop;
    uint8_t ttl;
    uint8_t hop_count;
    uint16_t seq;
    uint32_t timestamp;
} amp_header_t;

typedef struct {
    uint16_t pm25;
    uint16_t pm10;
    int16_t temp_c;
    uint16_t rh;
    uint16_t pressure;
    uint16_t gas_res;
    uint16_t co2_ppm;
    uint8_t batt_pct;
    uint8_t status_flags;
    uint16_t sample_id;
    uint16_t reserved;
} amp_sensor_data_t;
#pragma pack(pop)

#ifdef __cplusplus
}
#endif
