/**
 * @file header.c
 * @brief AMP header helpers — DOC-005 §5.1.
 */
#include "aeios/amp/types.h"
#include <string.h>

void amp_header_init_defaults(amp_header_t *h) {
    if (!h) {
        return;
    }
    memset(h, 0, sizeof(*h));
    h->magic = AMP_MAGIC;
    h->version = AMP_VERSION;
    h->ttl = 8;
}
