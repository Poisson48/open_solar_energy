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
