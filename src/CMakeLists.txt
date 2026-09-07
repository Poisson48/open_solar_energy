set(OSE_WARN_FLAGS -Wall -Wextra -Wpedantic -Wno-unused-parameter)

set(OSE_VERSION_NAME "2.0.73" CACHE STRING "Version affichée")
set(OSE_VERSION_CODE "20066" CACHE STRING "versionCode Android")

find_package(OpenSSL REQUIRED)
find_library(SECP256K1_LIBRARY NAMES secp256k1)
find_path(SECP256K1_INCLUDE_DIR NAMES secp256k1.h)

add_library(applib STATIC
    app/theme.cpp
    app/appcontroller.cpp
    app/updater.cpp
    app/platform.cpp
    core/solar_math.cpp
    core/finance.cpp
    core/cable.cpp
    core/sizing.cpp
    core/offgrid.cpp
    core/enedis_import.cpp
    core/inverter.cpp
    core/site_shade.cpp
    core/hourly.cpp
    persist/project_store.cpp
    persist/snapshot_history.cpp
    persist/pdf_export.cpp
    persist/project_share.cpp
    persist/catalog_store.cpp
    net/weather_client.cpp
    net/news_client.cpp
    net/geocode_client.cpp
    net/pvgis_client.cpp
    net/osm_tile_provider.cpp
)
target_include_directories(applib PUBLIC ${CMAKE_CURRENT_SOURCE_DIR})
if(SECP256K1_INCLUDE_DIR)
    target_include_directories(applib PUBLIC ${SECP256K1_INCLUDE_DIR})
endif()
target_link_libraries(applib PUBLIC
    Qt6::Core Qt6::Network Qt6::Quick Qt6::Sql Qt6::Concurrent
    OpenSSL::SSL OpenSSL::Crypto
)
if(SECP256K1_LIBRARY)
    target_link_libraries(applib PUBLIC ${SECP256K1_LIBRARY})
else()
    message(FATAL_ERROR "libsecp256k1 introuvable — apt install libsecp256k1-dev")
endif()
if(TARGET Qt6::Widgets)
    target_link_libraries(applib PUBLIC Qt6::Widgets)
    target_compile_definitions(applib PUBLIC OSE_HAS_WIDGETS)
endif()
if(TARGET Qt6::Pdf)
    target_link_libraries(applib PUBLIC Qt6::Pdf)
endif()
if(TARGET Qt6::Charts)
    target_link_libraries(applib PUBLIC Qt6::Charts)
endif()
target_compile_options(applib PRIVATE ${OSE_WARN_FLAGS})
target_compile_definitions(applib PUBLIC OSE_APP_VERSION="${OSE_VERSION_NAME}")

set(OSE_ASSET_FILES
    "${CMAKE_SOURCE_DIR}/packaging/open-solar-energy.png"
    "${CMAKE_SOURCE_DIR}/packaging/icon-192.png"
    "${CMAKE_SOURCE_DIR}/packaging/favicon-32.png"
    "${CMAKE_SOURCE_DIR}/data/demo_weather.json"
)
qt_add_resources(applib "native_assets"
    PREFIX "/"
    BASE "${CMAKE_SOURCE_DIR}"
    FILES ${OSE_ASSET_FILES}
)

qt_add_executable(opensolarenergy app/main.cpp)

set(OSE_QML_FILES
    qml/Main.qml
    qml/OseDialog.qml
    qml/OseTextField.qml
    qml/ChangelogDialog.qml
    qml/HubView.qml
    qml/ProjectBar.qml
    qml/TabBarNav.qml
    qml/WorkspaceView.qml
    qml/TabLocation.qml
    qml/TabSizing.qml
    qml/TabOffgrid.qml
    qml/TabGrid.qml
    qml/TabDaily.qml
    qml/TabSite.qml
    qml/TabLayout.qml
    qml/TabCables.qml
    qml/TabQuote.qml
    qml/TabIrradiation.qml
    qml/TabOptimizer.qml
    qml/TabTracker.qml
    qml/KpiCard.qml
    qml/SimpleBarChart.qml
    qml/NewProjectDialog.qml
    qml/HistoryDialog.qml
    qml/MaterielDialog.qml
    qml/ShareDialog.qml
    qml/JoinDialog.qml
)

qt_policy(SET QTP0001 NEW)

qt_add_qml_module(opensolarenergy
    URI OpenSolarEnergy
    VERSION 1.0
    QML_FILES ${OSE_QML_FILES}
)

target_link_libraries(opensolarenergy PRIVATE
    applib
    Qt6::Quick Qt6::QuickControls2
)

if(TARGET Qt6::ChartsQml)
    target_link_libraries(opensolarenergy PRIVATE Qt6::ChartsQml)
endif()

if(ANDROID)
    set_property(TARGET opensolarenergy PROPERTY QT_ANDROID_PACKAGE_SOURCE_DIR "${CMAKE_SOURCE_DIR}/android")
    set_property(TARGET opensolarenergy PROPERTY QT_ANDROID_TARGET_SDK_VERSION 34)
    set_property(TARGET opensolarenergy PROPERTY QT_ANDROID_VERSION_NAME "${OSE_VERSION_NAME}")
    set_property(TARGET opensolarenergy PROPERTY QT_ANDROID_VERSION_CODE "${OSE_VERSION_CODE}")
endif()
