/**
 * @file validate.c
 * @brief DOC-005 v1 type/flag helpers (no wire format change).
 */
#include "aeios/amp/validate.h"

bool amp_type_is_v1(uint8_t type)
{
    switch (type) {
    case AMP_TYPE_SENSOR_DATA:
    case AMP_TYPE_HEARTBEAT:
    case AMP_TYPE_ACK:
    case AMP_TYPE_NACK:
    case AMP_TYPE_ROUTE_ADV:
    case AMP_TYPE_ROUTE_UPDATE:
    case AMP_TYPE_CONFIG_UPDATE:
    case AMP_TYPE_DIAGNOSTICS:
    case AMP_TYPE_TIME_SYNC:
    case AMP_TYPE_EMERGENCY_ALERT:
        return true;
    default:
        return false;
    }
}

bool amp_flags_ok_v1(uint8_t flags)
{
    if (flags & AMP_FLAG_FRAGMENT) {
        return false;
    }
    if (flags & AMP_FLAG_ENCRYPTED) {
        return false;
    }
    return true;
}
