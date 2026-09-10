#pragma once

#include <QObject>

#include "updater.h"
#include "core/cable.h"
#include "core/enedis_import.h"
#include "core/finance.h"
#include "core/hourly.h"
#include "core/horizon_engine.h"
#include "core/inverter.h"
#include "core/layout_3d.h"
#include "core/layout_roofs.h"
#include "core/offgrid.h"
#include "core/project_pipeline.h"
#include "core/shading_engine.h"
#include "core/site_shade.h"
#include "core/sizing.h"
#include "core/solar_math.h"
#include "core/year_pv.h"
#include "net/geocode_client.h"
#include "net/news_client.h"
#include "net/pvgis_client.h"
#include "net/terrain_client.h"
#include "net/weather_client.h"
#include "persist/catalog_store.h"
#include "persist/pdf_export.h"
#include "persist/project_share.h"
#include "persist/project_store.h"
#include "persist/snapshot_history.h"

namespace app {

class AppController : public QObject {
    Q_OBJECT
    Q_PROPERTY(Updater* updater READ updater CONSTANT)
    Q_PROPERTY(ose::ProjectStore* projects READ projects CONSTANT)
    Q_PROPERTY(ose::SolarMath* solarMath READ solarMath CONSTANT)
    Q_PROPERTY(ose::Finance* finance READ finance CONSTANT)
    Q_PROPERTY(ose::CableCalc* cableCalc READ cableCalc CONSTANT)
    Q_PROPERTY(ose::SizingEngine* sizing READ sizing CONSTANT)
    Q_PROPERTY(ose::OffgridSizing* offgrid READ offgrid CONSTANT)
    Q_PROPERTY(ose::EnedisImport* enedis READ enedis CONSTANT)
    Q_PROPERTY(ose::InverterSizing* inverter READ inverter CONSTANT)
    Q_PROPERTY(ose::WeatherClient* weather READ weather CONSTANT)
    Q_PROPERTY(ose::NewsClient* news READ news CONSTANT)
    Q_PROPERTY(ose::SnapshotHistory* history READ history CONSTANT)
    Q_PROPERTY(ose::PdfExport* pdf READ pdf CONSTANT)
    Q_PROPERTY(ose::ProjectShare* share READ share CONSTANT)
    Q_PROPERTY(ose::SiteShade* siteShade READ siteShade CONSTANT)
    Q_PROPERTY(ose::HourlyAnalysis* hourly READ hourly CONSTANT)
    Q_PROPERTY(ose::HorizonEngine* horizon READ horizon CONSTANT)
    Q_PROPERTY(ose::CatalogStore* catalog READ catalog CONSTANT)
    Q_PROPERTY(ose::GeocodeClient* geocode READ geocode CONSTANT)
    Q_PROPERTY(ose::PvgisClient* pvgis READ pvgis CONSTANT)
    Q_PROPERTY(ose::TerrainClient* terrain READ terrain CONSTANT)
    Q_PROPERTY(ose::Layout3D* layout3d READ layout3d CONSTANT)
    Q_PROPERTY(ose::LayoutRoofs* layoutRoofs READ layoutRoofs CONSTANT)
    Q_PROPERTY(ose::ShadingEngine* shadingEngine READ shadingEngine CONSTANT)
    Q_PROPERTY(ose::YearPv* yearPv READ yearPv CONSTANT)
    Q_PROPERTY(ose::ProjectPipeline* pipeline READ pipeline CONSTANT)
    Q_PROPERTY(QString currentTab READ currentTab WRITE setCurrentTab NOTIFY currentTabChanged)
    Q_PROPERTY(bool inWorkspace READ inWorkspace NOTIFY inWorkspaceChanged)

public:
    explicit AppController(QObject* parent = nullptr);
    bool init();

    Updater* updater() { return &m_updater; }
    ose::ProjectStore* projects() { return m_projects; }
    ose::SolarMath* solarMath() { return m_solar; }
    ose::Finance* finance() { return m_finance; }
    ose::CableCalc* cableCalc() { return m_cable; }
    ose::SizingEngine* sizing() { return m_sizing; }
    ose::OffgridSizing* offgrid() { return m_offgrid; }
    ose::EnedisImport* enedis() { return m_enedis; }
    ose::InverterSizing* inverter() { return m_inverter; }
    ose::WeatherClient* weather() { return m_weather; }
    ose::NewsClient* news() { return m_news; }
    ose::SnapshotHistory* history() { return m_history; }
    ose::PdfExport* pdf() { return m_pdf; }
    ose::ProjectShare* share() { return m_share; }
    ose::SiteShade* siteShade() { return m_siteShade; }
    ose::HourlyAnalysis* hourly() { return m_hourly; }
    ose::HorizonEngine* horizon() { return m_horizon; }
    ose::CatalogStore* catalog() { return m_catalog; }
    ose::GeocodeClient* geocode() { return m_geocode; }
    ose::PvgisClient* pvgis() { return m_pvgis; }
    ose::TerrainClient* terrain() { return m_terrain; }
    ose::ProjectPipeline* pipeline() { return m_pipeline; }
    ose::Layout3D* layout3d() { return m_layout3d; }
    ose::LayoutRoofs* layoutRoofs() { return m_layoutRoofs; }
    ose::ShadingEngine* shadingEngine() { return m_shadingEngine; }
    ose::YearPv* yearPv() { return m_yearPv; }

    QString currentTab() const { return m_currentTab; }
    void setCurrentTab(const QString& tab);
    bool inWorkspace() const { return m_inWorkspace; }

    Q_INVOKABLE void openWorkspace();
    Q_INVOKABLE void closeWorkspace();
    Q_INVOKABLE bool shareFile(const QString& filename, const QString& mime,
                               const QString& base64Data);
    Q_INVOKABLE bool openPdf(const QString& filename, const QString& base64Data);
    Q_INVOKABLE bool openPdfFromUrl(const QString& url);
    Q_INVOKABLE bool openLocalFile(const QString& path);
    /** Chemin writable pour export image (PNG layout, etc.). */
    Q_INVOKABLE QString tempExportPath(const QString& prefix, const QString& ext = QStringLiteral("png"));
    Q_INVOKABLE bool pickImportFile();
    Q_INVOKABLE QString pollImportResult();
    Q_INVOKABLE bool requestCameraPermission();
    Q_INVOKABLE QString pollCameraPermission();
    Q_INVOKABLE bool hasCameraPermission();
    Q_INVOKABLE bool ensureInstallPermission();
    Q_INVOKABLE QString openFileDialog(const QString& filter = {});
    Q_INVOKABLE bool saveTextFile(const QString& suggestedName, const QString& content);
    Q_INVOKABLE bool saveBinaryFile(const QString& suggestedName, const QString& base64Data);
    Q_INVOKABLE QString readTextFile(const QString& path) const;
    Q_INVOKABLE void toast(const QString& message, int ms = 2800);
    Q_INVOKABLE void openMateriel();
    /** Commit git autosave du projet courant (message d’action). */
    Q_INVOKABLE bool autoSave(const QString& message);
    /** Crée une variante (branche) puis recharge le working tree. */
    Q_INVOKABLE bool createGitBranch(const QString& branchName);
    /** Change de variante et restaure le projet de cette branche. */
    Q_INVOKABLE bool switchGitBranch(const QString& branchName);
    /** Restaure un commit git en gardant l’id du projet ouvert. */
    Q_INVOKABLE bool restoreGitCommit(const QString& hash);
    Q_INVOKABLE bool exportProjectsZip(const QString& suggestedName = {});
    /** Génère un PNG QR via qrencode (si installé) ; chemin temporaire ou vide. */
    Q_INVOKABLE QString makeQrPng(const QString& text) const;
    Q_INVOKABLE bool handleBack();
    /** Conversion lat/lon → tuile OSM z/x/y pour image://osm/ */
    Q_INVOKABLE QVariantMap latLonToTile(double lat, double lon, int zoom) const;
    /** Tuile WebMercator fractionnaire ; zoom peut être non entier. */
    Q_INVOKABLE QVariantMap latLonToTileF(double lat, double lon, double zoom) const;
    Q_INVOKABLE QVariantMap tileToLatLon(int x, int y, int zoom) const;
    Q_INVOKABLE QVariantMap tileFToLatLon(double x, double y, double zoom) const;
    /** Déplacement pan : delta pixels écran → nouveau centre lat/lon. */
    Q_INVOKABLE QVariantMap panByPixels(double lat, double lon, double zoom, double dxPx,
                                        double dyPx, double tileSize = 256) const;
    /**
     * Cap géographique entre deux points.
     * bearingNorth : 0=N, 90=E (sens A→B).
     * pvAzimuth : convention projet 0=Sud, +Ouest, −Est (−180…180).
     */
    Q_INVOKABLE QVariantMap bearingBetween(double lat1, double lon1, double lat2,
                                           double lon2) const;

    /** Parcours principal selon installType du projet courant. */
    Q_INVOKABLE QVariantList primaryTabFlow() const;
    Q_INVOKABLE QString nextPrimaryTab() const;
    Q_INVOKABLE QString goNextPrimaryTab();
    Q_INVOKABLE QString tabLabel(const QString& tabId) const;

    /** Smoke headless : create→weather→sizing→offgrid→cable→shade→hourly→pdf. */
    Q_INVOKABLE QVariantMap runSelfTest();
    /** Recalcule sizing / hors-réseau / PV selon le projet et met à jour l’empreinte. */
    Q_INVOKABLE QVariantMap refreshStaleResults();

signals:
    void currentTabChanged();
    void inWorkspaceChanged();
    void toastRequested(const QString& message, int ms);
    void materielRequested();

private:
    Updater m_updater;
    ose::ProjectStore* m_projects = nullptr;
    ose::SolarMath* m_solar = nullptr;
    ose::Finance* m_finance = nullptr;
    ose::CableCalc* m_cable = nullptr;
    ose::SizingEngine* m_sizing = nullptr;
    ose::OffgridSizing* m_offgrid = nullptr;
    ose::EnedisImport* m_enedis = nullptr;
    ose::InverterSizing* m_inverter = nullptr;
    ose::WeatherClient* m_weather = nullptr;
    ose::NewsClient* m_news = nullptr;
    ose::SnapshotHistory* m_history = nullptr;
    ose::PdfExport* m_pdf = nullptr;
    ose::ProjectShare* m_share = nullptr;
    ose::SiteShade* m_siteShade = nullptr;
    ose::HourlyAnalysis* m_hourly = nullptr;
    ose::HorizonEngine* m_horizon = nullptr;
    ose::CatalogStore* m_catalog = nullptr;
    ose::GeocodeClient* m_geocode = nullptr;
    ose::PvgisClient* m_pvgis = nullptr;
    ose::TerrainClient* m_terrain = nullptr;
    ose::ProjectPipeline* m_pipeline = nullptr;
    ose::Layout3D* m_layout3d = nullptr;
    ose::LayoutRoofs* m_layoutRoofs = nullptr;
    ose::ShadingEngine* m_shadingEngine = nullptr;
    ose::YearPv* m_yearPv = nullptr;
    QString m_currentTab = QStringLiteral("location");
    bool m_inWorkspace = false;
};

} // namespace app
