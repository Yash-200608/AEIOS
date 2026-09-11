/* Shared tiny assert helpers for host tests */
#pragma once
#include <stdio.h>

static int g_failures;

static void expect_true(const char *name, int cond)
{
    if (!cond) {
        printf("FAIL: %s\n", name);
        g_failures++;
    } else {
        printf("PASS: %s\n", name);
    }
}

static int test_finish(const char *suite)
{
    if (g_failures) {
        printf("%s: %d failure(s)\n", suite, g_failures);
        return 1;
    }
    printf("%s: all tests passed\n", suite);
    return 0;
}
