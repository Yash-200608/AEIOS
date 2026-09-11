/**
 * @file aeios_test_harness.h
 * @brief Compile-time D1 verification harness — active only if CONFIG_AEIOS_TEST_MODE.
 */
#pragma once

#ifdef __cplusplus
extern "C" {
#endif

/**
 * Run after normal boot sequence. No-op when AEIOS_TEST_MODE is disabled
 * (call site is #if-guarded in main.c so production omits the call entirely).
 */
void aeios_test_harness_run(void);

#ifdef __cplusplus
}
#endif
