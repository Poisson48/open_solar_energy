cmake_minimum_required(VERSION 3.24)

project(opensolarenergy VERSION 2.0.75 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

if(ANDROID)
    find_package(Qt6 REQUIRED COMPONENTS
        Core Network Quick QuickControls2 Sql Concurrent)
    find_package(Qt6 OPTIONAL_COMPONENTS
        Widgets Charts ChartsQml Quick3D Quick3DHelpers)
else()
    find_package(Qt6 REQUIRED COMPONENTS
        Core Network Quick QuickControls2 Widgets Test Sql Concurrent)
    find_package(Qt6 OPTIONAL_COMPONENTS Charts ChartsQml Pdf PdfWidgets Quick3D Quick3DHelpers)
endif()

qt_standard_project_setup()

add_subdirectory(src)

if(NOT ANDROID)
    enable_testing()
    add_subdirectory(tests)
endif()
