idf_component_register(
    SRCS
        "src/crc.c"
        "src/mac.c"
        "src/frame.c"
        "src/codec.c"
        "src/parser.c"
        "src/header.c"
        "src/routing.c"
        "src/retry.c"
        "src/queue.c"
        "src/timesync.c"
        "src/replay.c"
        "src/validate.c"
        "src/crypto/sha256.c"
    INCLUDE_DIRS "include"
)
