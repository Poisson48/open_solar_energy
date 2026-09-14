cmake_minimum_required(VERSION 3.24)

if(NOT TARGET Qt6::Test)
    return()
endif()

add_executable(tst_core ${CMAKE_CURRENT_SOURCE_DIR}/core/tst_core.cpp)
target_link_libraries(tst_core PRIVATE applib Qt6::Test Qt6::Core)
target_compile_definitions(tst_core PRIVATE
    OSE_FIXTURES_DIR="${CMAKE_CURRENT_SOURCE_DIR}/fixtures"
    OSE_DATA_DIR="${CMAKE_SOURCE_DIR}/data")
add_test(NAME core COMMAND tst_core)

add_executable(tst_updater ${CMAKE_CURRENT_SOURCE_DIR}/app/tst_updater.cpp)
target_link_libraries(tst_updater PRIVATE applib Qt6::Test Qt6::Core Qt6::Network)
target_compile_definitions(tst_updater PRIVATE
    OSE_SOURCE_DIR="${CMAKE_SOURCE_DIR}")
add_test(NAME updater COMMAND tst_updater)

add_executable(tst_sync ${CMAKE_CURRENT_SOURCE_DIR}/persist/tst_sync.cpp)
target_link_libraries(tst_sync PRIVATE applib Qt6::Test Qt6::Core)
add_test(NAME sync COMMAND tst_sync)
