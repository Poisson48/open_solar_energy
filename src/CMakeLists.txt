set(OSE_WARN_FLAGS -Wall -Wextra -Wpedantic -Wno-unused-parameter)

set(OSE_VERSION_NAME "2.0.9" CACHE STRING "Version affichée")
set(OSE_VERSION_CODE "209" CACHE STRING "versionCode Android")

add_library(applib STATIC
    app/theme.cpp
    app/webbridge.cpp
    app/webhost.cpp
    app/appcontroller.cpp
    app/updater.cpp
    app/platform.cpp
)
target_include_directories(applib PUBLIC ${CMAKE_CURRENT_SOURCE_DIR})
target_link_libraries(applib PUBLIC Qt6::Core Qt6::Network Qt6::Quick)
if(TARGET Qt6::Widgets)
    target_link_libraries(applib PUBLIC Qt6::Widgets)
    target_compile_definitions(applib PUBLIC OSE_HAS_WIDGETS)
endif()
target_compile_options(applib PRIVATE ${OSE_WARN_FLAGS})
target_compile_definitions(applib PUBLIC OSE_APP_VERSION="${OSE_VERSION_NAME}")

# Web embarqué (APK + fallback hors AppImage)
file(GLOB_RECURSE OSE_WEB_FILES CONFIGURE_DEPENDS
    "${CMAKE_SOURCE_DIR}/index.html"
    "${CMAKE_SOURCE_DIR}/css/*.css"
    "${CMAKE_SOURCE_DIR}/js/*.js"
    "${CMAKE_SOURCE_DIR}/js/*/*.js"
    "${CMAKE_SOURCE_DIR}/js/*/*/*.js"
    "${CMAKE_SOURCE_DIR}/data/*"
    "${CMAKE_SOURCE_DIR}/data/*/*"
    "${CMAKE_SOURCE_DIR}/packaging/*.png"
    "${CMAKE_SOURCE_DIR}/assets/emoji/*.png"
)
list(FILTER OSE_WEB_FILES EXCLUDE REGEX "/build-")
list(FILTER OSE_WEB_FILES EXCLUDE REGEX "/build/")
list(FILTER OSE_WEB_FILES EXCLUDE REGEX "/node_modules/")
qt_add_resources(applib "web_assets"
    PREFIX "/web"
    BASE "${CMAKE_SOURCE_DIR}"
    FILES ${OSE_WEB_FILES}
)

set(OSE_CAN_BUILD_APP OFF)
if(ANDROID AND TARGET Qt6::WebView)
    set(OSE_CAN_BUILD_APP ON)
elseif(TARGET Qt6::WebEngineQuick OR TARGET Qt6::WebView)
    set(OSE_CAN_BUILD_APP ON)
endif()

if(NOT OSE_CAN_BUILD_APP)
    message(STATUS "Qt WebEngine/WebView absent — installez le module Qt puis reconfigurez")
    return()
endif()

qt_add_executable(opensolarenergy app/main.cpp)

set(OSE_QML_FILES
    qml/Main.qml
    qml/WebContainerMobile.qml
    qml/OseDialog.qml
    qml/ChangelogDialog.qml
    qml/OseTextField.qml
)
if(TARGET Qt6::WebEngineQuick)
    list(APPEND OSE_QML_FILES qml/WebContainerDesktop.qml)
endif()

qt_add_qml_module(opensolarenergy
    URI OpenSolarEnergy
    VERSION 1.0
    QML_FILES ${OSE_QML_FILES}
)

target_link_libraries(opensolarenergy PRIVATE
    applib
    Qt6::Quick Qt6::QuickControls2
)

if(ANDROID)
    target_link_libraries(opensolarenergy PRIVATE Qt6::WebView)
    set_property(TARGET opensolarenergy PROPERTY QT_ANDROID_PACKAGE_SOURCE_DIR "${CMAKE_SOURCE_DIR}/android")
    set_property(TARGET opensolarenergy PROPERTY QT_ANDROID_TARGET_SDK_VERSION 34)
    set_property(TARGET opensolarenergy PROPERTY QT_ANDROID_VERSION_NAME "${OSE_VERSION_NAME}")
    set_property(TARGET opensolarenergy PROPERTY QT_ANDROID_VERSION_CODE "${OSE_VERSION_CODE}")
else()
    if(TARGET Qt6::WebEngineQuick)
        target_link_libraries(opensolarenergy PRIVATE Qt6::WebEngineQuick Qt6::WebChannel)
        target_compile_definitions(opensolarenergy PRIVATE OSE_HAS_WEBENGINE)
    else()
        target_link_libraries(opensolarenergy PRIVATE Qt6::WebView)
    endif()
endif()
