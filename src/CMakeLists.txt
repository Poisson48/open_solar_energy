set(OSE_WARN_FLAGS -Wall -Wextra -Wpedantic -Wno-unused-parameter)

set(OSE_VERSION_NAME "2.0.75" CACHE STRING "Version affichée")
set(OSE_VERSION_CODE "20075" CACHE STRING "versionCode Android")

# OpenSSL : KDAB prebuilts sur Android, système ailleurs
if(ANDROID)
    include("${CMAKE_SOURCE_DIR}/third_party/android_openssl/android_openssl.cmake")
else()
    find_package(OpenSSL REQUIRED)
endif()

# secp256k1 : préférer le tree vendored (API schnorrsig_sign32), sinon système
set(OSE_USE_VENDORED_SECP OFF)
if(ANDROID OR EXISTS "${CMAKE_SOURCE_DIR}/third_party/secp256k1/CMakeLists.txt")
    set(OSE_USE_VENDORED_SECP ON)
else()
    find_library(SECP256K1_LIBRARY NAMES secp256k1)
    find_path(SECP256K1_INCLUDE_DIR NAMES secp256k1.h)
    if(NOT SECP256K1_LIBRARY)
        set(OSE_USE_VENDORED_SECP ON)
    endif()
endif()

if(OSE_USE_VENDORED_SECP)
    set(SECP256K1_DISABLE_SHARED ON CACHE BOOL "" FORCE)
    set(SECP256K1_BUILD_BENCHMARK OFF CACHE BOOL "" FORCE)
    set(SECP256K1_BUILD_TESTS OFF CACHE BOOL "" FORCE)
    set(SECP256K1_BUILD_EXHAUSTIVE_TESTS OFF CACHE BOOL "" FORCE)
    set(SECP256K1_BUILD_CTIME_TESTS OFF CACHE BOOL "" FORCE)
    set(SECP256K1_BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)
    set(SECP256K1_INSTALL OFF CACHE BOOL "" FORCE)
    set(SECP256K1_ENABLE_MODULE_EXTRAKEYS ON CACHE BOOL "" FORCE)
    set(SECP256K1_ENABLE_MODULE_SCHNORRSIG ON CACHE BOOL "" FORCE)
    add_subdirectory("${CMAKE_SOURCE_DIR}/third_party/secp256k1"
                     "${CMAKE_BINARY_DIR}/third_party/secp256k1" EXCLUDE_FROM_ALL)
endif()

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
    core/horizon_engine.cpp
    core/year_pv.cpp
    core/layout_3d.cpp
    core/layout_roofs.cpp
    core/shading_engine.cpp
    core/project_pipeline.cpp
    persist/project_store.cpp
    persist/snapshot_history.cpp
    persist/pdf_export.cpp
    persist/project_share.cpp
    persist/catalog_store.cpp
    net/weather_client.cpp
    net/news_client.cpp
    net/geocode_client.cpp
    net/pvgis_client.cpp
    net/terrain_client.cpp
    net/osm_tile_provider.cpp
    ../third_party/qrcodegen/qrcodegen.cpp
)
target_include_directories(applib PUBLIC
    ${CMAKE_CURRENT_SOURCE_DIR}
    ${CMAKE_SOURCE_DIR}/third_party/qrcodegen
)
if(OSE_USE_VENDORED_SECP)
    target_include_directories(applib PUBLIC
        "${CMAKE_SOURCE_DIR}/third_party/secp256k1/include")
    target_link_libraries(applib PUBLIC secp256k1)
elseif(SECP256K1_LIBRARY)
    if(SECP256K1_INCLUDE_DIR)
        target_include_directories(applib PUBLIC ${SECP256K1_INCLUDE_DIR})
    endif()
    target_link_libraries(applib PUBLIC ${SECP256K1_LIBRARY})
else()
    message(FATAL_ERROR "libsecp256k1 introuvable — apt install libsecp256k1-dev")
endif()

target_link_libraries(applib PUBLIC
    Qt6::Core Qt6::Network Qt6::Quick Qt6::Sql Qt6::Concurrent
    OpenSSL::SSL OpenSSL::Crypto
)
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
if(TARGET Qt6::Pdf)
    target_compile_definitions(applib PUBLIC OSE_HAS_QPDFDOCUMENT=1)
endif()
target_compile_options(applib PRIVATE ${OSE_WARN_FLAGS})
target_compile_definitions(applib PUBLIC OSE_APP_VERSION="${OSE_VERSION_NAME}")

set(OSE_ASSET_FILES
    "${CMAKE_SOURCE_DIR}/packaging/open-solar-energy.png"
    "${CMAKE_SOURCE_DIR}/packaging/icon-192.png"
    "${CMAKE_SOURCE_DIR}/packaging/favicon-32.png"
    "${CMAKE_SOURCE_DIR}/data/demo_weather.json"
    "${CMAKE_SOURCE_DIR}/data/rexel_catalog/catalog.json"
)
qt_add_resources(applib "native_assets"
    PREFIX "/"
    BASE "${CMAKE_SOURCE_DIR}"
    FILES ${OSE_ASSET_FILES}
)

qt_add_executable(opensolarenergy app/main.cpp)

set(OSE_QML_FILES
    qml/Main.qml
    qml/Ui.qml
    qml/OseDialog.qml
    qml/OseTextField.qml
    qml/ChangelogDialog.qml
    qml/HubView.qml
    qml/ProjectBar.qml
    qml/TabBarNav.qml
    qml/WorkspaceView.qml
    qml/TabLocation.qml
    qml/OsmMapView.qml
    qml/TabSizing.qml
    qml/TabOffgrid.qml
    qml/TabGrid.qml
    qml/TabDaily.qml
    qml/TabSite.qml
    qml/TabLayout.qml
    qml/SceneRoof3D.qml
    qml/SolarScene3D.qml
    qml/RoofDeck3D.qml
    qml/PanelArray3D.qml
    qml/ObstacleLayer3D.qml
    qml/GridProof.qml
    qml/TabCables.qml
    qml/TabQuote.qml
    qml/TabIrradiation.qml
    qml/TabOptimizer.qml
    qml/TabTracker.qml
    qml/KpiCard.qml
    qml/SimpleBarChart.qml
    qml/SeasonShadeChart.qml
    qml/OffgridHeatmap.qml
    qml/NewProjectDialog.qml
    qml/HistoryDialog.qml
    qml/PdfPreviewDialog.qml
    qml/MaterielDialog.qml
    qml/ShareDialog.qml
    qml/JoinDialog.qml
    qml/EditClientDialog.qml
    qml/controls/OseBtn.qml
    qml/controls/OseCard.qml
    qml/controls/OseStep.qml
    qml/controls/OseInputUnit.qml
    qml/controls/OseAlert.qml
    qml/controls/OseToast.qml
    qml/controls/OseTabPage.qml
    qml/controls/OseFormResults.qml
)

set_source_files_properties(qml/Ui.qml PROPERTIES QT_QML_SINGLETON_TYPE TRUE)

if(COMMAND qt_policy)
    qt_policy(SET QTP0001 NEW)
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

if(TARGET Qt6::Quick3D)
    target_link_libraries(opensolarenergy PRIVATE Qt6::Quick3D)
    target_compile_definitions(opensolarenergy PRIVATE OSE_HAS_QUICK3D=1)
endif()
if(TARGET Qt6::Quick3DHelpers)
    target_link_libraries(opensolarenergy PRIVATE Qt6::Quick3DHelpers)
endif()

if(TARGET Qt6::ChartsQml)
    target_link_libraries(opensolarenergy PRIVATE Qt6::ChartsQml)
endif()

if(ANDROID)
    set_property(TARGET opensolarenergy PROPERTY QT_ANDROID_PACKAGE_SOURCE_DIR "${CMAKE_SOURCE_DIR}/android")
    set_property(TARGET opensolarenergy PROPERTY QT_ANDROID_TARGET_SDK_VERSION 34)
    set_property(TARGET opensolarenergy PROPERTY QT_ANDROID_VERSION_NAME "${OSE_VERSION_NAME}")
    set_property(TARGET opensolarenergy PROPERTY QT_ANDROID_VERSION_CODE "${OSE_VERSION_CODE}")
    if(COMMAND add_android_openssl_libraries)
        add_android_openssl_libraries(opensolarenergy)
    endif()
endif()
