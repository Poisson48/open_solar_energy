cmake_minimum_required(VERSION 3.24)

project(opensolarenergy VERSION 2.0.49 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

if(ANDROID)
    find_package(Qt6 REQUIRED COMPONENTS Core Network Quick QuickControls2 WebView)
    find_package(Qt6 OPTIONAL_COMPONENTS Widgets)
else()
    find_package(Qt6 REQUIRED COMPONENTS Core Network Quick QuickControls2 Widgets Test)
    find_package(Qt6 OPTIONAL_COMPONENTS WebEngineQuick WebChannel WebView)
endif()

qt_standard_project_setup()

add_subdirectory(src)

if(NOT ANDROID)
    enable_testing()
    add_subdirectory(tests)
endif()
