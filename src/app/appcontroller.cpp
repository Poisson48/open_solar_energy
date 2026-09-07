#include "appcontroller.h"

#include "platform.h"

#include <QDesktopServices>
#include <QFile>
#include <QStandardPaths>
#include <QUrl>
#include <cmath>
#ifdef OSE_HAS_WIDGETS
#  include <QtWidgets/QFileDialog>
#endif

namespace app {

AppController::AppController(QObject* parent) : QObject(parent)
{
    m_projects = new ose::ProjectStore(this);
    m_solar = new ose::SolarMath(this);
    m_finance = new ose::Finance(this);
    m_cable = new ose::CableCalc(this);
    m_sizing = new ose::SizingEngine(this);
    m_offgrid = new ose::OffgridSizing(this);
    m_enedis = new ose::EnedisImport(this);
    m_inverter = new ose::InverterSizing(this);
    m_weather = new ose::WeatherClient(this);
    m_news = new ose::NewsClient(this);
    m_history = new ose::SnapshotHistory(this);
    m_pdf = new ose::PdfExport(this);
    m_share = new ose::ProjectShare(this);
    m_siteShade = new ose::SiteShade(this);
    m_hourly = new ose::HourlyAnalysis(this);
    m_catalog = new ose::CatalogStore(this);
    m_geocode = new ose::GeocodeClient(this);
    m_pvgis = new ose::PvgisClient(this);
}

bool AppController::init()
{
    m_projects->load();
    m_catalog->load();
    m_news->refresh();
    m_updater.check();
    return true;
}

void AppController::setCurrentTab(const QString& tab)
{
    if (m_currentTab == tab)
        return;
    m_currentTab = tab;
    emit currentTabChanged();
}

void AppController::openWorkspace()
{
    if (m_inWorkspace)
        return;
    m_inWorkspace = true;
    emit inWorkspaceChanged();
}

void AppController::closeWorkspace()
{
    m_projects->closeCurrent();
    if (!m_inWorkspace)
        return;
    m_inWorkspace = false;
    emit inWorkspaceChanged();
}

bool AppController::shareFile(const QString& filename, const QString& mime,
                              const QString& base64Data)
{
    const QByteArray raw = QByteArray::fromBase64(base64Data.toLatin1());
    if (raw.isEmpty() && !base64Data.isEmpty())
        return false;
    return platformShareFile(filename, mime, raw);
}

bool AppController::openPdf(const QString& filename, const QString& base64Data)
{
    const QByteArray raw = QByteArray::fromBase64(base64Data.toLatin1());
    if (raw.isEmpty())
        return false;
    return platformOpenPdf(filename, raw);
}

bool AppController::openPdfFromUrl(const QString& url)
{
    return platformOpenPdfFromUrl(url);
}

bool AppController::openLocalFile(const QString& path)
{
    if (path.isEmpty())
        return false;
    return QDesktopServices::openUrl(QUrl::fromLocalFile(path));
}

bool AppController::pickImportFile()
{
    return platformPickImportFile();
}

QString AppController::pollImportResult()
{
    return platformPollImportResult();
}

bool AppController::requestCameraPermission()
{
    return platformRequestCameraPermission();
}

QString AppController::pollCameraPermission()
{
    return platformPollCameraPermission();
}

bool AppController::hasCameraPermission()
{
    return platformHasCameraPermission();
}

bool AppController::ensureInstallPermission()
{
    return platformEnsureInstallPermission();
}

QString AppController::openFileDialog(const QString& filter)
{
#ifdef OSE_HAS_WIDGETS
    return QFileDialog::getOpenFileName(
        nullptr, QStringLiteral("Ouvrir"),
        QStandardPaths::writableLocation(QStandardPaths::DocumentsLocation),
        filter.isEmpty() ? QStringLiteral("Tous (*.*)") : filter);
#else
    Q_UNUSED(filter);
    return {};
#endif
}

bool AppController::saveTextFile(const QString& suggestedName, const QString& content)
{
#ifdef OSE_HAS_WIDGETS
    const QString path = QFileDialog::getSaveFileName(
        nullptr, QStringLiteral("Enregistrer"),
        QStandardPaths::writableLocation(QStandardPaths::DocumentsLocation) + QLatin1Char('/')
            + suggestedName,
        QStringLiteral("Tous (*.*)"));
    if (path.isEmpty())
        return false;
    QFile f(path);
    if (!f.open(QIODevice::WriteOnly | QIODevice::Truncate))
        return false;
    f.write(content.toUtf8());
    return true;
#else
    Q_UNUSED(suggestedName);
    Q_UNUSED(content);
    return false;
#endif
}

bool AppController::handleBack()
{
    if (m_inWorkspace) {
        closeWorkspace();
        return true;
    }
    return false;
}

QVariantMap AppController::latLonToTile(double lat, double lon, int zoom) const
{
    const double latRad = lat * M_PI / 180.0;
    const int n = 1 << zoom;
    const int x = int(std::floor((lon + 180.0) / 360.0 * n));
    const int y = int(std::floor((1.0 - std::log(std::tan(latRad) + 1.0 / std::cos(latRad)) / M_PI)
                                 / 2.0 * n));
    return {{QStringLiteral("x"), x}, {QStringLiteral("y"), y}, {QStringLiteral("z"), zoom}};
}

QVariantMap AppController::tileToLatLon(int x, int y, int zoom) const
{
    const int n = 1 << zoom;
    const double lon = x / double(n) * 360.0 - 180.0;
    const double latRad = std::atan(std::sinh(M_PI * (1 - 2.0 * y / n)));
    const double lat = latRad * 180.0 / M_PI;
    return {{QStringLiteral("lat"), lat}, {QStringLiteral("lon"), lon}};
}

} // namespace app
