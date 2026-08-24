cmake_minimum_required(VERSION 3.24)

if(NOT TARGET Qt6::Test)
    return()
endif()

add_executable(tst_webhost ${CMAKE_CURRENT_SOURCE_DIR}/app/webhost_smoke.cpp)
target_link_libraries(tst_webhost PRIVATE applib Qt6::Test Qt6::Core Qt6::Network)
add_test(NAME webhost COMMAND tst_webhost)
