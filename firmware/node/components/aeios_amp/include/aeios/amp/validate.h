#pragma once
/**
 * @file validate.h
 * @brief Host-usable v1 type/flag checks — DOC-005; does not alter on-wire layout.
 */
#include <stdint.h>
#include <stdbool.h>
#include "aeios/amp/types.h"

#ifdef __cplusplus
extern "C" {
#endif

/** True if type is a defined Protocol Version 1 packet type. */
bool amp_type_is_v1(uint8_t type);

/**
 * True if flags are legal for v1 TX/accept:
 * FRAGMENT must be 0; ENCRYPTED must be 0 (RFU).
 */
bool amp_flags_ok_v1(uint8_t flags);

#ifdef __cplusplus
}
#endif
