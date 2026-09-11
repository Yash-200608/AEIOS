/**
 * @file aeios_driver.h
 * @brief Uniform driver operations — DOC-006 §5 + ADR-008.
 */
#pragma once

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

/** Return 0 on success; negative on failure. */
typedef struct {
    int (*init)(void *ctx);
    int (*read)(void *ctx, void *out);
    int (*self_test)(void *ctx);
    int (*health)(void *ctx, uint32_t *flags);
    int (*sleep)(void *ctx);
    int (*wake)(void *ctx);
    int (*shutdown)(void *ctx);
} aeios_driver_ops_t;

/** Health flag bits (shared). */
#define AEIOS_HEALTH_OK           0u
#define AEIOS_HEALTH_FAULT        (1u << 0)
#define AEIOS_HEALTH_NOT_READY    (1u << 1)

int aeios_drivers_init_all(void);
int aeios_drivers_self_test_all(void);

#ifdef __cplusplus
}
#endif
