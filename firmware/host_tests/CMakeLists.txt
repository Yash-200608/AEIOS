cmake_minimum_required(VERSION 3.16)
project(aeios_amp_host_tests C)

set(CMAKE_C_STANDARD 11)
set(CMAKE_C_STANDARD_REQUIRED ON)
add_compile_options(-Wall -Wextra -Werror)

set(AMP_ROOT "${CMAKE_CURRENT_SOURCE_DIR}/../node/components/aeios_amp")
set(MOCK_ROOT "${CMAKE_CURRENT_SOURCE_DIR}/../host_mocks")
set(DRV_INC "${CMAKE_CURRENT_SOURCE_DIR}/../node/components/aeios_drivers/include")

add_library(aeios_amp STATIC
    ${AMP_ROOT}/src/crc.c
    ${AMP_ROOT}/src/mac.c
    ${AMP_ROOT}/src/frame.c
    ${AMP_ROOT}/src/codec.c
    ${AMP_ROOT}/src/parser.c
    ${AMP_ROOT}/src/header.c
    ${AMP_ROOT}/src/routing.c
    ${AMP_ROOT}/src/retry.c
    ${AMP_ROOT}/src/queue.c
    ${AMP_ROOT}/src/timesync.c
    ${AMP_ROOT}/src/replay.c
    ${AMP_ROOT}/src/validate.c
    ${AMP_ROOT}/src/crypto/sha256.c
)
target_include_directories(aeios_amp PUBLIC ${AMP_ROOT}/include)

add_library(aeios_host_mocks STATIC
    ${MOCK_ROOT}/hal/aeios_hal_host.c
    ${MOCK_ROOT}/hal/aeios_bus_host.c
    ${MOCK_ROOT}/drivers/driver_skel.c
)
target_include_directories(aeios_host_mocks PUBLIC
    ${MOCK_ROOT}/include
    ${DRV_INC}
)

enable_testing()

function(aeios_add_test name src)
    add_executable(${name} ${src})
    target_link_libraries(${name} PRIVATE aeios_amp)
    target_include_directories(${name} PRIVATE ${CMAKE_CURRENT_SOURCE_DIR})
    add_test(NAME ${name} COMMAND ${name})
endfunction()

aeios_add_test(test_amp_golden test_amp_golden.c)
aeios_add_test(test_amp_malformed test_amp_malformed.c)
aeios_add_test(test_amp_replay test_amp_replay.c)
aeios_add_test(test_amp_routing test_amp_routing.c)
aeios_add_test(test_amp_queue test_amp_queue.c)
aeios_add_test(test_amp_retry test_amp_retry.c)
aeios_add_test(test_amp_timesync test_amp_timesync.c)
aeios_add_test(test_amp_expanded test_amp_expanded.c)
aeios_add_test(test_amp_fuzz test_amp_fuzz.c)

add_executable(test_hal_mock test_hal_mock.c)
target_link_libraries(test_hal_mock PRIVATE aeios_host_mocks)
target_include_directories(test_hal_mock PRIVATE ${CMAKE_CURRENT_SOURCE_DIR})
add_test(NAME test_hal_mock COMMAND test_hal_mock)

add_executable(test_hal_bus_mock test_hal_bus_mock.c)
target_link_libraries(test_hal_bus_mock PRIVATE aeios_host_mocks)
target_include_directories(test_hal_bus_mock PRIVATE ${CMAKE_CURRENT_SOURCE_DIR})
add_test(NAME test_hal_bus_mock COMMAND test_hal_bus_mock)

add_executable(test_driver_skel test_driver_skel.c)
target_link_libraries(test_driver_skel PRIVATE aeios_host_mocks)
target_include_directories(test_driver_skel PRIVATE ${CMAKE_CURRENT_SOURCE_DIR})
add_test(NAME test_driver_skel COMMAND test_driver_skel)

add_executable(test_driver_lifecycle test_driver_lifecycle.c)
target_link_libraries(test_driver_lifecycle PRIVATE aeios_host_mocks)
target_include_directories(test_driver_lifecycle PRIVATE ${CMAKE_CURRENT_SOURCE_DIR})
add_test(NAME test_driver_lifecycle COMMAND test_driver_lifecycle)
