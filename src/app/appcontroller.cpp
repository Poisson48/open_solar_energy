#include "appcontroller.h"

#include "platform.h"

#include <QDesktopServices>
#include <QDir>
#include <QDateTime>
#include <QFile>
#include <QHash>
#include <QImage>
#include <QJsonDocument>
#include <QJsonObject>
#include <QProcess>
#include <QRegularExpression>
#include <QStandardPaths>
#include <QUrl>
#include <cmath>

#include "qrcodegen.hpp"
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
    m_horizon = new ose::HorizonEngine(this);
    m_catalog = new ose::CatalogStore(this);
    m_geocode = new ose::GeocodeClient(this);
    m_pvgis = new ose::PvgisClient(this);
    m_terrain = new ose::TerrainClient(this);
    m_pipeline = new ose::ProjectPipeline(this);
    m_layout3d = new ose::Layout3D(this);
    m_layoutRoofs = new ose::LayoutRoofs(this);
    m_shadingEngine = new ose::ShadingEngine(this);
    m_yearPv = new ose::YearPv(this);
}

bool AppController::init()
{
    m_projects->load();
    m_catalog->load();
    m_news->refresh();
    // Pas de check MAJ automatique au démarrage (bruyant en dev ; bouton Hub / menu).
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
    // D’abord quitter le workspace (Loader détruit l’UI), puis fermer le projet.
    // Sinon currentChanged avec id vide pendant que ProjectBar / Pipeline sont encore montés.
    if (m_inWorkspace) {
        m_inWorkspace = false;
        emit inWorkspaceChanged();
    }
    m_projects->closeCurrent();
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

QString AppController::tempExportPath(const QString& prefix, const QString& ext)
{
    const QString dir = QStandardPaths::writableLocation(QStandardPaths::TempLocation);
    QDir().mkpath(dir);
    const QString safePrefix = prefix.isEmpty() ? QStringLiteral("ose") : prefix;
    const QString safeExt = ext.isEmpty() ? QStringLiteral("png") : ext;
    return dir + QLatin1Char('/') + safePrefix + QLatin1Char('-')
           + QString::number(QDateTime::currentMSecsSinceEpoch()) + QLatin1Char('.') + safeExt;
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

bool AppController::saveBinaryFile(const QString& suggestedName, const QString& base64Data)
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
    f.write(QByteArray::fromBase64(base64Data.toLatin1()));
    return true;
#else
    Q_UNUSED(suggestedName);
    Q_UNUSED(base64Data);
    return false;
#endif
}

void AppController::toast(const QString& message, int ms)
{
    emit toastRequested(message, ms);
}

void AppController::openMateriel()
{
    emit materielRequested();
}

bool AppController::autoSave(const QString& message)
{
    if (!m_projects || !m_history || m_projects->currentId().isEmpty())
        return false;
    const QString json = m_projects->exportCurrentJson();
    if (json.isEmpty())
        return false;
    const bool ok = m_history->saveSnapshot(m_projects->currentId(), json, message);
    return ok;
}

bool AppController::createGitBranch(const QString& branchName)
{
    if (!m_projects || !m_history || m_projects->currentId().isEmpty())
        return false;
    autoSave(QStringLiteral("Sauvegarde avant nouvelle variante"));
    if (!m_history->createBranch(m_projects->currentId(), branchName)) {
        toast(QStringLiteral("Impossible de créer la variante"), 3000);
        return false;
    }
    toast(QStringLiteral("Variante « %1 » créée").arg(branchName.trimmed()), 2800);
    return true;
}

bool AppController::switchGitBranch(const QString& branchName)
{
    if (!m_projects || !m_history || m_projects->currentId().isEmpty())
        return false;
    autoSave(QStringLiteral("Sauvegarde avant changement de variante"));
    const QString pid = m_projects->currentId();
    if (!m_history->switchBranch(pid, branchName)) {
        toast(QStringLiteral("Impossible de changer de variante"), 3000);
        return false;
    }
    const QString json = m_history->readWorkingTree(pid);
    if (json.isEmpty()) {
        toast(QStringLiteral("Variante changée mais projet illisible"), 3500);
        return false;
    }
    QJsonParseError err;
    QJsonDocument doc = QJsonDocument::fromJson(json.toUtf8(), &err);
    if (err.error != QJsonParseError::NoError || !doc.isObject()) {
        toast(QStringLiteral("JSON variante invalide"), 3000);
        return false;
    }
    QJsonObject o = doc.object();
    o.insert(QStringLiteral("id"), pid);
    m_projects->importProjectJson(QString::fromUtf8(QJsonDocument(o).toJson(QJsonDocument::Compact)));
    toast(QStringLiteral("Variante « %1 » chargée").arg(branchName.trimmed()), 2800);
    return true;
}

bool AppController::restoreGitCommit(const QString& hash)
{
    if (!m_projects || !m_history || m_projects->currentId().isEmpty() || hash.isEmpty())
        return false;
    const QString pid = m_projects->currentId();
    const QString json = m_history->loadSnapshot(pid, hash);
    if (json.isEmpty()) {
        toast(QStringLiteral("Commit introuvable"), 3000);
        return false;
    }
    QJsonParseError err;
    QJsonDocument doc = QJsonDocument::fromJson(json.toUtf8(), &err);
    if (err.error != QJsonParseError::NoError || !doc.isObject()) {
        toast(QStringLiteral("Snapshot invalide"), 3000);
        return false;
    }
    QJsonObject o = doc.object();
    o.insert(QStringLiteral("id"), pid);
    if (!m_projects->importProjectJson(QString::fromUtf8(QJsonDocument(o).toJson(QJsonDocument::Compact))))
        return false;
    // Commit la restauration sur la branche courante
    autoSave(QStringLiteral("Restauration %1").arg(hash.left(7)));
    toast(QStringLiteral("Version restaurée"), 2800);
    return true;
}

QVariantMap AppController::refreshStaleResults()
{
    QVariantMap out{{QStringLiteral("ok"), false}};
    if (!m_projects || m_projects->currentId().isEmpty()) {
        out.insert(QStringLiteral("error"), QStringLiteral("Aucun projet ouvert"));
        toast(out.value(QStringLiteral("error")).toString());
        return out;
    }

    QVariantMap project = m_projects->currentProject();
    const QVariantList weather = project.value(QStringLiteral("weatherData")).toList();
    if (weather.size() < 12) {
        out.insert(QStringLiteral("error"), QStringLiteral("Chargez une météo dans Lieu avant de recalculer"));
        toast(out.value(QStringLiteral("error")).toString(), 3500);
        setCurrentTab(QStringLiteral("location"));
        return out;
    }

    const QVariantMap loc = project.value(QStringLiteral("location")).toMap();
    QVariantMap form = project.value(QStringLiteral("formState")).toMap();
    const QVariantMap site = project.value(QStringLiteral("siteSurvey")).toMap();
    const QString install = project.value(QStringLiteral("installType")).toString();
    const double lat = loc.value(QStringLiteral("lat"), 43.6).toDouble();
    const double tilt = form.value(QStringLiteral("tilt"), 30).toDouble();
    const double azimuth = form.value(QStringLiteral("azimuth"), 0).toDouble();

    QVariantList monthly = project.value(QStringLiteral("monthlyKwh")).toList();
    const double annual = form.value(QStringLiteral("annualKwh"), 4500).toDouble();
    if (monthly.size() < 12) {
        monthly.clear();
        const double v = annual / 12.0;
        for (int i = 0; i < 12; ++i)
            monthly.append(v);
    }

    const bool wantSizing = project.contains(QStringLiteral("sizingResult"))
                            || install == QLatin1String("grid")
                            || install == QLatin1String("hybrid");
    const bool wantOff = project.contains(QStringLiteral("offgridResult"))
                         || install == QLatin1String("offgrid")
                         || install == QLatin1String("hybrid");
    const bool wantGrid = project.contains(QStringLiteral("gridResult"))
                          || install == QLatin1String("grid")
                          || (install == QLatin1String("hybrid")
                              && project.contains(QStringLiteral("gridResult")));

    QStringList done;
    QVariantMap patch;

    if (wantSizing && m_sizing) {
        QVariantMap input{
            {QStringLiteral("lat"), lat},
            {QStringLiteral("weatherData"), weather},
            {QStringLiteral("monthlyKwh"), monthly},
            {QStringLiteral("tilt"), tilt},
            {QStringLiteral("azimuth"), azimuth},
            {QStringLiteral("strategy"), form.value(QStringLiteral("strategy"), QStringLiteral("roi"))},
            {QStringLiteral("installType"), install},
            {QStringLiteral("battKwh"), form.value(QStringLiteral("battKwh"), 0)},
            {QStringLiteral("dod"), form.value(QStringLiteral("battDod"),
                                               form.value(QStringLiteral("dod"), 80))},
            {QStringLiteral("dayShare"), form.value(QStringLiteral("dayShare"), 0.55)},
            {QStringLiteral("losses"), form.value(QStringLiteral("losses"), 14)},
            {QStringLiteral("costPerKwc"), form.value(QStringLiteral("costPerKwc"), 1200)},
            {QStringLiteral("coverageTarget"), form.value(QStringLiteral("coverageTarget"), 70)},
            {QStringLiteral("limitMode"), form.value(QStringLiteral("limitMode"), QStringLiteral("none"))},
            {QStringLiteral("roofArea"), form.value(QStringLiteral("roofArea"), 0)},
            {QStringLiteral("fixedPpeak"), form.value(QStringLiteral("fixedPpeak"), 0)},
            {QStringLiteral("panelWp"), form.value(QStringLiteral("panelWp"), 400)},
            {QStringLiteral("monthlyLoss"), site.value(QStringLiteral("monthlyLoss"))},
            {QStringLiteral("annualLossPct"), site.value(QStringLiteral("annualLossPct"))},
        };
        const QVariantMap sizing = m_sizing->run(input);
        const QVariantMap best = sizing.value(QStringLiteral("best")).toMap();
        patch.insert(QStringLiteral("sizingResult"), sizing);
        if (best.value(QStringLiteral("Ppeak")).toDouble() > 0)
            form.insert(QStringLiteral("Ppeak"), best.value(QStringLiteral("Ppeak")));
        if (best.value(QStringLiteral("systemCost")).toDouble() > 0)
            form.insert(QStringLiteral("systemCost"), best.value(QStringLiteral("systemCost")));
        done.append(QStringLiteral("Dimensionnement"));
    }

    if (wantOff && m_offgrid) {
        const double dayK = form.value(QStringLiteral("loadDayKwh"), 5).toDouble();
        const double nightK = form.value(QStringLiteral("loadNightKwh"), 3).toDouble();
        double dailyWh = form.value(QStringLiteral("dailyWh")).toDouble();
        if (dailyWh <= 0)
            dailyWh = (dayK + nightK) * 1000.0;
        QVariantMap input{
            {QStringLiteral("lat"), lat},
            {QStringLiteral("weatherData"), weather},
            {QStringLiteral("dayKwhPerDay"), dayK},
            {QStringLiteral("nightKwhPerDay"), nightK},
            {QStringLiteral("dailyConsumptionWh"), dailyWh},
            {QStringLiteral("dod"), form.value(QStringLiteral("dod"),
                                               form.value(QStringLiteral("battDod"), 80))},
            {QStringLiteral("coverageTarget"), form.value(QStringLiteral("coverageTarget"), 90)},
            {QStringLiteral("tilt"), tilt},
            {QStringLiteral("azimuth"), azimuth},
            {QStringLiteral("battCostPerKwh"), 400},
            {QStringLiteral("pvCostPerKwc"), 1000},
            {QStringLiteral("mode"), form.value(QStringLiteral("offgridMode"), QStringLiteral("autonomy"))},
            {QStringLiteral("monthlyLoss"), site.value(QStringLiteral("monthlyLoss"))},
            {QStringLiteral("halfHourlyKeep"), site.value(QStringLiteral("halfHourlyKeep"))},
            {QStringLiteral("annualLossPct"), site.value(QStringLiteral("annualLossPct"))},
        };
        const QVariantMap en = project.value(QStringLiteral("enedisImport")).toMap();
        if (en.value(QStringLiteral("halfHourly")).toBool()
            && en.value(QStringLiteral("halfHourlyProfile")).toList().size() >= 48)
            input.insert(QStringLiteral("halfHourlyLoadProfile"),
                         en.value(QStringLiteral("halfHourlyProfile")));

        const QVariantMap off = m_offgrid->run(input);
        const QVariantMap best = off.value(QStringLiteral("best")).toMap();
        patch.insert(QStringLiteral("offgridResult"), off);
        if (best.value(QStringLiteral("Ppeak")).toDouble() > 0)
            form.insert(QStringLiteral("Ppeak"), best.value(QStringLiteral("Ppeak")));
        if (best.value(QStringLiteral("battKwh")).toDouble() > 0)
            form.insert(QStringLiteral("battKwh"), best.value(QStringLiteral("battKwh")));
        done.append(QStringLiteral("Hors réseau"));
    }

    if (wantGrid && m_solar) {
        const double ppeak = form.value(QStringLiteral("Ppeak"), 3).toDouble();
        const QVariantMap grid = m_solar->gridSystemAnnual({
            {QStringLiteral("lat"), lat},
            {QStringLiteral("weatherData"), weather},
            {QStringLiteral("Ppeak"), ppeak},
            {QStringLiteral("losses"), form.value(QStringLiteral("losses"), 14)},
            {QStringLiteral("tilt"), tilt},
            {QStringLiteral("azimuth"), azimuth},
            {QStringLiteral("systemCost"), form.value(QStringLiteral("systemCost"), ppeak * 1200.0)},
            {QStringLiteral("kwhPrice"), form.value(QStringLiteral("priceBase"), 0.25)},
        });
        patch.insert(QStringLiteral("gridResult"), grid);
        done.append(QStringLiteral("Système PV"));
    }

    if (done.isEmpty()) {
        out.insert(QStringLiteral("error"), QStringLiteral("Rien à recalculer — lancez d’abord un calcul dans Dim. / Hors réseau / PV"));
        toast(out.value(QStringLiteral("error")).toString(), 4000);
        return out;
    }

    patch.insert(QStringLiteral("formState"), form);
    patch.insert(QStringLiteral("monthlyKwh"), monthly);
    m_projects->updateCurrent(patch);

    // Empreinte après patch (projet rechargé)
    project = m_projects->currentProject();
    m_projects->updateCurrent({
        {QStringLiteral("resultsFingerprint"), m_pipeline->fingerprint(project)},
        {QStringLiteral("resultsBasis"), m_pipeline->fingerprintParts(project)},
    });

    out.insert(QStringLiteral("ok"), true);
    out.insert(QStringLiteral("done"), done);
    const QString msg = QStringLiteral("Résultats mis à jour (%1)").arg(done.join(QStringLiteral(", ")));
    out.insert(QStringLiteral("message"), msg);
    toast(msg, 3500);
    autoSave(QStringLiteral("Recalcul — %1").arg(done.join(QStringLiteral(", "))));
    return out;
}

bool AppController::exportProjectsZip(const QString& suggestedName)
{
#ifdef OSE_HAS_WIDGETS
    const QString name = suggestedName.isEmpty()
                             ? QStringLiteral("ose-projets.zip")
                             : suggestedName;
    const QString path = QFileDialog::getSaveFileName(
        nullptr, QStringLiteral("Exporter tous les projets"),
        QStandardPaths::writableLocation(QStandardPaths::DocumentsLocation) + QLatin1Char('/')
            + name,
        QStringLiteral("ZIP (*.zip)"));
    if (path.isEmpty())
        return false;
    const QString tmpDir =
        QStandardPaths::writableLocation(QStandardPaths::TempLocation) + QStringLiteral("/ose-export");
    QDir().mkpath(tmpDir);
    const QString jsonPath = tmpDir + QStringLiteral("/projects.json");
    {
        QFile f(jsonPath);
        if (!f.open(QIODevice::WriteOnly | QIODevice::Truncate))
            return false;
        f.write(m_projects->exportAllJson().toUtf8());
    }
    QProcess zip;
    zip.setWorkingDirectory(tmpDir);
    zip.start(QStringLiteral("zip"), {QStringLiteral("-j"), path, jsonPath});
    if (!zip.waitForFinished(15000) || zip.exitCode() != 0) {
        // Fallback : écrire le JSON à côté
        QFile::copy(jsonPath, path.endsWith(QLatin1String(".zip"))
                                  ? path.left(path.size() - 4) + QStringLiteral(".json")
                                  : path + QStringLiteral(".json"));
        toast(QStringLiteral("ZIP indisponible — export JSON écrit"), 3500);
        return true;
    }
    toast(QStringLiteral("Export ZIP enregistré"), 2500);
    return true;
#else
    Q_UNUSED(suggestedName);
    return false;
#endif
}

QString AppController::makeQrPng(const QString& text) const
{
    if (text.isEmpty())
        return {};
    const QString path =
        QStandardPaths::writableLocation(QStandardPaths::TempLocation)
        + QStringLiteral("/ose-qr-")
        + QString::number(qHash(text)) + QStringLiteral(".png");

    try {
        using qrcodegen::QrCode;
        const QrCode qr = QrCode::encodeText(text.toUtf8().constData(), QrCode::Ecc::MEDIUM);
        const int size = qr.getSize();
        const int scale = 6;
        const int border = 2;
        const int img = (size + border * 2) * scale;
        QImage image(img, img, QImage::Format_RGB32);
        image.fill(Qt::white);
        for (int y = 0; y < size; ++y) {
            for (int x = 0; x < size; ++x) {
                if (!qr.getModule(x, y))
                    continue;
                const int px = (x + border) * scale;
                const int py = (y + border) * scale;
                for (int dy = 0; dy < scale; ++dy)
                    for (int dx = 0; dx < scale; ++dx)
                        image.setPixel(px + dx, py + dy, qRgb(0, 0, 0));
            }
        }
        if (!image.save(path, "PNG"))
            return {};
        return path;
    } catch (...) {
        // Fallback CLI si le générateur embarqué échoue
        QProcess p;
        p.start(QStringLiteral("qrencode"),
                {QStringLiteral("-o"), path, QStringLiteral("-s"), QStringLiteral("6"),
                 QStringLiteral("-m"), QStringLiteral("1"), text});
        if (!p.waitForFinished(8000) || p.exitCode() != 0 || !QFile::exists(path))
            return {};
        return path;
    }
}

QString AppController::readTextFile(const QString& path) const
{
    QFile f(path);
    if (!f.open(QIODevice::ReadOnly | QIODevice::Text))
        return {};
    return QString::fromUtf8(f.readAll());
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
    const QVariantMap f = latLonToTileF(lat, lon, zoom);
    return {{QStringLiteral("x"), int(std::floor(f.value(QStringLiteral("x")).toDouble()))},
            {QStringLiteral("y"), int(std::floor(f.value(QStringLiteral("y")).toDouble()))},
            {QStringLiteral("z"), zoom}};
}

QVariantMap AppController::latLonToTileF(double lat, double lon, double zoom) const
{
    zoom = qBound(0.0, zoom, 22.0);
    lat = qBound(-85.05112878, lat, 85.05112878);
    lon = std::fmod(lon + 180.0, 360.0);
    if (lon < 0)
        lon += 360.0;
    lon -= 180.0;

    const double latRad = lat * M_PI / 180.0;
    const double n = std::pow(2.0, zoom);
    double x = (lon + 180.0) / 360.0 * n;
    double y = (1.0 - std::log(std::tan(latRad) + 1.0 / std::cos(latRad)) / M_PI) / 2.0 * n;
    x = std::fmod(x, n);
    if (x < 0)
        x += n;
    y = qBound(0.0, y, n);
    return {{QStringLiteral("x"), x}, {QStringLiteral("y"), y}, {QStringLiteral("z"), zoom}};
}

QVariantMap AppController::tileToLatLon(int x, int y, int zoom) const
{
    return tileFToLatLon(double(x), double(y), double(zoom));
}

QVariantMap AppController::tileFToLatLon(double x, double y, double zoom) const
{
    zoom = qBound(0.0, zoom, 22.0);
    const double n = std::pow(2.0, zoom);
    x = std::fmod(x, n);
    if (x < 0)
        x += n;
    y = qBound(0.0, y, n);
    const double lon = x / n * 360.0 - 180.0;
    const double latRad = std::atan(std::sinh(M_PI * (1.0 - 2.0 * y / n)));
    const double lat = latRad * 180.0 / M_PI;
    return {{QStringLiteral("lat"), lat}, {QStringLiteral("lon"), lon}};
}

QVariantMap AppController::panByPixels(double lat, double lon, double zoom, double dxPx,
                                       double dyPx, double tileSize) const
{
    if (tileSize < 1)
        tileSize = 256;
    const QVariantMap t0 = latLonToTileF(lat, lon, zoom);
    const double x = t0.value(QStringLiteral("x")).toDouble() - dxPx / tileSize;
    const double y = t0.value(QStringLiteral("y")).toDouble() - dyPx / tileSize;
    return tileFToLatLon(x, y, zoom);
}

QVariantMap AppController::bearingBetween(double lat1, double lon1, double lat2,
                                          double lon2) const
{
    const double rlat1 = lat1 * M_PI / 180.0;
    const double rlat2 = lat2 * M_PI / 180.0;
    const double dLon = (lon2 - lon1) * M_PI / 180.0;
    const double y = std::sin(dLon) * std::cos(rlat2);
    const double x = std::cos(rlat1) * std::sin(rlat2)
                     - std::sin(rlat1) * std::cos(rlat2) * std::cos(dLon);
    double bearing = std::atan2(y, x) * 180.0 / M_PI;
    bearing = std::fmod(bearing + 360.0, 360.0);
    // Convention app : 0 = Sud, +Ouest, −Est
    double pv = bearing - 180.0;
    while (pv > 180.0)
        pv -= 360.0;
    while (pv < -180.0)
        pv += 360.0;
    const double distM = 6371000.0 * 2.0
                         * std::asin(std::sqrt(
                               std::pow(std::sin((rlat2 - rlat1) / 2.0), 2)
                               + std::cos(rlat1) * std::cos(rlat2)
                                     * std::pow(std::sin(dLon / 2.0), 2)));
    return {{QStringLiteral("bearingNorth"), bearing},
            {QStringLiteral("pvAzimuth"), pv},
            {QStringLiteral("distanceM"), distM}};
}

QVariantList AppController::primaryTabFlow() const
{
    const QString type = m_projects->currentProject().value(QStringLiteral("installType")).toString();
    if (type == QLatin1String("offgrid")) {
        return {QStringLiteral("location"), QStringLiteral("site"), QStringLiteral("offgrid"),
                QStringLiteral("daily"),    QStringLiteral("layout"), QStringLiteral("cables"),
                QStringLiteral("quote")};
    }
    return {QStringLiteral("location"), QStringLiteral("site"), QStringLiteral("sizing"),
            QStringLiteral("grid"),     QStringLiteral("daily"), QStringLiteral("layout"),
            QStringLiteral("cables"),   QStringLiteral("quote")};
}

QString AppController::nextPrimaryTab() const
{
    const QVariantList flow = primaryTabFlow();
    const int i = flow.indexOf(m_currentTab);
    if (i < 0)
        return flow.isEmpty() ? QString() : flow.first().toString();
    if (i + 1 >= flow.size())
        return {};
    return flow.at(i + 1).toString();
}

QString AppController::goNextPrimaryTab()
{
    const QString next = nextPrimaryTab();
    if (!next.isEmpty())
        setCurrentTab(next);
    return next;
}

QString AppController::tabLabel(const QString& tabId) const
{
    static const QHash<QString, QString> labels{
        {QStringLiteral("location"), QStringLiteral("Lieu et météo")},
        {QStringLiteral("site"), QStringLiteral("Site et ombrage")},
        {QStringLiteral("sizing"), QStringLiteral("Dimensionnement")},
        {QStringLiteral("offgrid"), QStringLiteral("Hors réseau")},
        {QStringLiteral("grid"), QStringLiteral("Système PV")},
        {QStringLiteral("daily"), QStringLiteral("Analyse horaire")},
        {QStringLiteral("layout"), QStringLiteral("Implantation")},
        {QStringLiteral("cables"), QStringLiteral("Câbles")},
        {QStringLiteral("quote"), QStringLiteral("Devis")},
        {QStringLiteral("irradiation"), QStringLiteral("Météo mensuelle")},
        {QStringLiteral("optimizer"), QStringLiteral("Optimisation")},
        {QStringLiteral("tracker"), QStringLiteral("Suiveur PV")},
    };
    return labels.value(tabId, tabId);
}

QVariantMap AppController::runSelfTest()
{
    QStringList errors;
    auto fail = [&](const QString& msg) { errors.append(msg); };

    if (!m_catalog || m_catalog->catalogPanelCount() < 80)
        fail(QStringLiteral("catalogue Rexel panneaux manquant (<80)"));
    if (!m_catalog || m_catalog->catalogInverterCount() < 150)
        fail(QStringLiteral("catalogue Rexel onduleurs manquant (<150)"));

    m_weather->loadDemo(QStringLiteral("toulouse"));
    const QVariantList weather = m_weather->weatherData();
    if (weather.size() < 12)
        fail(QStringLiteral("weather demo < 12 mois"));

    const QString pid = m_projects->createProject(QStringLiteral("__selftest__"),
                                                  QStringLiteral("hybrid"),
                                                  QStringLiteral("SelfTest"));
    if (pid.isEmpty())
        fail(QStringLiteral("createProject failed"));

    QVariantList monthly;
    for (int i = 0; i < 12; ++i)
        monthly.append(375.0);

    // ── Site ombrage ──
    QVariantList horizon;
    horizon.append(QVariantMap{{QStringLiteral("az"), 160}, {QStringLiteral("elev"), 35}});
    horizon.append(QVariantMap{{QStringLiteral("az"), 180}, {QStringLiteral("elev"), 45}});
    horizon.append(QVariantMap{{QStringLiteral("az"), 200}, {QStringLiteral("elev"), 30}});
    const QVariantMap shade = m_siteShade->computeShading(43.6045, horizon, weather);
    const double shadeLoss = shade.value(QStringLiteral("annualLossPct")).toDouble();
    if (shadeLoss < 1.0)
        fail(QStringLiteral("shade annualLossPct too low for test horizon"));

    // ── ShadingEngine 3D (panneaux + obstacle) → sizing ──
    double shade3dLoss = 0;
    {
        const QVariantMap layoutRaw = m_layout3d->computeLayout({
            {QStringLiteral("roofW"), 10},
            {QStringLiteral("roofD"), 6},
            {QStringLiteral("nPanels"), 8},
            {QStringLiteral("rows"), 2},
            {QStringLiteral("tilt"), 30},
            {QStringLiteral("azimuth"), 0},
        });
        {
            // Grille 2×4 : centres espacés > largeur panneau (contrat rendu 3D m/100)
            const QVariantMap grid = m_layoutRoofs->generateGrid(
                m_layoutRoofs->migrate({}), 2, 4,
                {{QStringLiteral("roofW"), 10},
                 {QStringLiteral("roofD"), 6},
                 {QStringLiteral("panelW"), 1.13},
                 {QStringLiteral("panelH"), 1.76},
                 {QStringLiteral("gap"), 0.03},
                 {QStringLiteral("tilt"), 30}},
                {});
            const QVariantList gp =
                m_layoutRoofs->getActiveRoof(grid).value(QStringLiteral("positions")).toList();
            if (gp.size() != 8)
                fail(QStringLiteral("generateGrid expected 8 panels, got %1").arg(gp.size()));
            else {
                const double x0 = gp[0].toMap().value(QStringLiteral("x")).toDouble();
                const double x1 = gp[1].toMap().value(QStringLiteral("x")).toDouble();
                const double pw = gp[0].toMap().value(QStringLiteral("w")).toDouble();
                if (std::abs(x1 - x0) < pw * 0.9)
                    fail(QStringLiteral("generateGrid panels overlap in data (dx=%1 pw=%2)")
                             .arg(std::abs(x1 - x0))
                             .arg(pw));
            }
        }
        const QVariantMap migrated = m_layoutRoofs->migrate({
            {QStringLiteral("roofL"), 10},
            {QStringLiteral("roofW"), 6},
            {QStringLiteral("nPanels"), 8},
            {QStringLiteral("positions"), layoutRaw.value(QStringLiteral("positions"))},
            {QStringLiteral("tilt"), 30},
            {QStringLiteral("azimuth"), 0},
        });
        const QVariantMap clear3d = m_shadingEngine->computeFull({
            {QStringLiteral("lat"), 43.6045},
            {QStringLiteral("weatherData"), weather},
            {QStringLiteral("layout"), migrated},
            {QStringLiteral("obstacles"), QVariantList{}},
            {QStringLiteral("horizonPoints"), QVariantList{}},
        });
        const QVariantList boxObs{
            QVariantMap{{QStringLiteral("x"), 0},
                        {QStringLiteral("y"), 0},
                        {QStringLiteral("w"), 4},
                        {QStringLiteral("d"), 4},
                        {QStringLiteral("h"), 8},
                        {QStringLiteral("type"), QStringLiteral("box")}}};
        const QVariantMap box3d = m_shadingEngine->computeFull({
            {QStringLiteral("lat"), 43.6045},
            {QStringLiteral("weatherData"), weather},
            {QStringLiteral("layout"), migrated},
            {QStringLiteral("obstacles"), boxObs},
            {QStringLiteral("horizonPoints"), QVariantList{}},
        });
        shade3dLoss = box3d.value(QStringLiteral("annualLossPct")).toDouble();
        if (!(shade3dLoss > clear3d.value(QStringLiteral("annualLossPct")).toDouble() + 0.5))
            fail(QStringLiteral("3d obstacle should increase annualLossPct"));
        const QVariantMap sizing3d = m_sizing->run({
            {QStringLiteral("lat"), 43.6045},
            {QStringLiteral("weatherData"), weather},
            {QStringLiteral("monthlyKwh"), monthly},
            {QStringLiteral("tilt"), 30},
            {QStringLiteral("azimuth"), 0},
            {QStringLiteral("strategy"), QStringLiteral("roi")},
            {QStringLiteral("installType"), QStringLiteral("grid")},
            {QStringLiteral("monthlyLoss"), box3d.value(QStringLiteral("monthlyLoss"))},
            {QStringLiteral("annualLossPct"), shade3dLoss},
        });
        if (!sizing3d.value(QStringLiteral("shadeApplied")).toBool())
            fail(QStringLiteral("sizing from shading3d missing shadeApplied"));
    }

    const QString qrPath = makeQrPng(QStringLiteral("ose://selftest"));
    if (qrPath.isEmpty() || !QFile::exists(qrPath))
        fail(QStringLiteral("embedded QR generation failed"));

    m_projects->updateCurrent({
        {QStringLiteral("location"),
         QVariantMap{{QStringLiteral("name"), QStringLiteral("Toulouse")},
                     {QStringLiteral("lat"), 43.6045},
                     {QStringLiteral("lon"), 1.444}}},
        {QStringLiteral("weatherData"), weather},
        {QStringLiteral("weatherMeta"), QVariantMap{{QStringLiteral("source"), QStringLiteral("demo")}}},
        {QStringLiteral("monthlyKwh"), monthly},
        {QStringLiteral("siteSurvey"),
         QVariantMap{{QStringLiteral("points"), horizon},
                     {QStringLiteral("monthlyLoss"), shade.value(QStringLiteral("monthly"))},
                     {QStringLiteral("halfHourlyKeep"), shade.value(QStringLiteral("halfHourlyKeep"))},
                     {QStringLiteral("annualLossPct"), shadeLoss}}},
        {QStringLiteral("formState"),
         QVariantMap{{QStringLiteral("tilt"), 30},
                     {QStringLiteral("azimuth"), 0},
                     {QStringLiteral("annualKwh"), 4500},
                     {QStringLiteral("battKwh"), 5},
                     {QStringLiteral("strategy"), QStringLiteral("roi")}}},
    });

    // ── Sizing clear vs shaded ──
    const QVariantMap sizingClear = m_sizing->run({
        {QStringLiteral("lat"), 43.6045},
        {QStringLiteral("weatherData"), weather},
        {QStringLiteral("monthlyKwh"), monthly},
        {QStringLiteral("tilt"), 30},
        {QStringLiteral("azimuth"), 0},
        {QStringLiteral("strategy"), QStringLiteral("roi")},
        {QStringLiteral("installType"), QStringLiteral("grid")},
    });
    const QVariantMap sizingShade = m_sizing->run({
        {QStringLiteral("lat"), 43.6045},
        {QStringLiteral("weatherData"), weather},
        {QStringLiteral("monthlyKwh"), monthly},
        {QStringLiteral("tilt"), 30},
        {QStringLiteral("azimuth"), 0},
        {QStringLiteral("strategy"), QStringLiteral("roi")},
        {QStringLiteral("installType"), QStringLiteral("grid")},
        {QStringLiteral("monthlyLoss"), shade.value(QStringLiteral("monthly"))},
        {QStringLiteral("annualLossPct"), shadeLoss},
    });
    const double pClear = sizingClear.value(QStringLiteral("best")).toMap().value(QStringLiteral("Ppeak")).toDouble();
    const double pShade = sizingShade.value(QStringLiteral("best")).toMap().value(QStringLiteral("Ppeak")).toDouble();
    if (pClear <= 0 || pShade <= 0)
        fail(QStringLiteral("sizing Ppeak invalid"));
    // Avec ombrage, pour même stratégie ROI, production baisse → souvent Ppeak plus élevé ou E plus bas
    const double eClear = sizingClear.value(QStringLiteral("best")).toMap().value(QStringLiteral("E_annual")).toDouble();
    const double eShade = sizingShade.value(QStringLiteral("best")).toMap().value(QStringLiteral("E_annual")).toDouble();
    if (!(eShade < eClear || pShade >= pClear))
        fail(QStringLiteral("shade should reduce E or increase Ppeak"));
    if (!sizingShade.value(QStringLiteral("shadeApplied")).toBool())
        fail(QStringLiteral("sizing shadeApplied flag missing"));

    // ── Hybrid battery improves autoconso vs same Ppeak clear ──
    const QVariantMap sizingHybrid = m_sizing->run({
        {QStringLiteral("lat"), 43.6045},
        {QStringLiteral("weatherData"), weather},
        {QStringLiteral("monthlyKwh"), monthly},
        {QStringLiteral("tilt"), 30},
        {QStringLiteral("azimuth"), 0},
        {QStringLiteral("strategy"), QStringLiteral("autoconso")},
        {QStringLiteral("installType"), QStringLiteral("hybrid")},
        {QStringLiteral("battKwh"), 8},
        {QStringLiteral("dod"), 80},
        {QStringLiteral("dayShare"), 0.55},
        {QStringLiteral("monthlyLoss"), shade.value(QStringLiteral("monthly"))},
    });
    const QVariantMap bestHybrid = sizingHybrid.value(QStringLiteral("best")).toMap();
    if (!bestHybrid.value(QStringLiteral("hybrid")).toBool())
        fail(QStringLiteral("hybrid flag not set"));
    if (bestHybrid.value(QStringLiteral("savings")).toDouble() <= 0)
        fail(QStringLiteral("hybrid savings <= 0"));
    if (bestHybrid.value(QStringLiteral("battKwh")).toDouble() < 1)
        fail(QStringLiteral("hybrid battKwh missing"));

    // Persist sizing on project (parcours)
    const QVariantMap best = bestHybrid;
    m_projects->updateCurrent({
        {QStringLiteral("sizingResult"), sizingHybrid},
        {QStringLiteral("formState"),
         QVariantMap{{QStringLiteral("tilt"), 30},
                     {QStringLiteral("azimuth"), 0},
                     {QStringLiteral("Ppeak"), best.value(QStringLiteral("Ppeak"))},
                     {QStringLiteral("systemCost"), best.value(QStringLiteral("systemCost"))},
                     {QStringLiteral("battKwh"), 8},
                     {QStringLiteral("panelWp"), 400},
                     {QStringLiteral("panelModel"), QStringLiteral("Module 400 Wc")},
                     {QStringLiteral("inverterModel"), QStringLiteral("Onduleur 5 kVA")},
                     {QStringLiteral("annualKwh"), 4500}}},
    });
    m_projects->updateCurrent({
        {QStringLiteral("resultsFingerprint"), m_pipeline->fingerprint(m_projects->currentProject())},
        {QStringLiteral("resultsBasis"), m_pipeline->fingerprintParts(m_projects->currentProject())},
    });

    // ── Grid annual ──
    const QVariantMap grid = m_solar->gridSystemAnnual({
        {QStringLiteral("lat"), 43.6045},
        {QStringLiteral("weatherData"), weather},
        {QStringLiteral("Ppeak"), best.value(QStringLiteral("Ppeak"))},
        {QStringLiteral("losses"), 14},
        {QStringLiteral("tilt"), 30},
        {QStringLiteral("azimuth"), 0},
        {QStringLiteral("systemCost"), best.value(QStringLiteral("systemCost"))},
        {QStringLiteral("kwhPrice"), 0.25},
    });
    if (grid.value(QStringLiteral("E_annual")).toDouble() <= 0)
        fail(QStringLiteral("grid E_annual <= 0"));
    m_projects->updateCurrent({{QStringLiteral("gridResult"), grid}});

    // ── Offgrid shade ──
    const QVariantMap offClear = m_offgrid->run({
        {QStringLiteral("lat"), 43.6045},
        {QStringLiteral("weatherData"), weather},
        {QStringLiteral("dailyConsumptionWh"), 8000},
        {QStringLiteral("dod"), 80},
        {QStringLiteral("coverageTarget"), 90},
    });
    const QVariantMap offShade = m_offgrid->run({
        {QStringLiteral("lat"), 43.6045},
        {QStringLiteral("weatherData"), weather},
        {QStringLiteral("dailyConsumptionWh"), 8000},
        {QStringLiteral("dod"), 80},
        {QStringLiteral("coverageTarget"), 90},
        {QStringLiteral("annualLossPct"), shadeLoss},
        {QStringLiteral("monthlyLoss"), shade.value(QStringLiteral("monthly"))},
    });
    const double offPClear = offClear.value(QStringLiteral("best")).toMap().value(QStringLiteral("Ppeak")).toDouble();
    const double offPShade = offShade.value(QStringLiteral("best")).toMap().value(QStringLiteral("Ppeak")).toDouble();
    if (offPClear <= 0 || offPShade <= 0)
        fail(QStringLiteral("offgrid best empty"));
    if (offPShade < offPClear)
        fail(QStringLiteral("offgrid shaded Ppeak should be >= clear"));
    if (!offShade.value(QStringLiteral("shadeApplied")).toBool())
        fail(QStringLiteral("offgrid shadeApplied missing"));

    // ── Cable + inverter ──
    const QVariantMap cable = m_cable->calcSection({
        {QStringLiteral("I"), 10},
        {QStringLiteral("L"), 20},
        {QStringLiteral("U_system"), 400},
        {QStringLiteral("circuit"), QStringLiteral("dc")},
        {QStringLiteral("material"), QStringLiteral("Cu")},
    });
    if (cable.value(QStringLiteral("sectionRecommended")).toDouble() <= 0)
        fail(QStringLiteral("cable section missing"));

    const QVariantMap inv = m_inverter->calcStringing(
        {{QStringLiteral("voc"), 49.5},
         {QStringLiteral("vmp"), 41.0},
         {QStringLiteral("isc"), 10.5},
         {QStringLiteral("imp"), 9.8},
         {QStringLiteral("pmax"), 400}},
        {{QStringLiteral("maxInputV"), 600},
         {QStringLiteral("mpptMinV"), 120},
         {QStringLiteral("mpptMaxV"), 550},
         {QStringLiteral("maxInputI"), 20},
         {QStringLiteral("pac"), 5},
         {QStringLiteral("mpptCount"), 2}});
    if (inv.value(QStringLiteral("options")).toList().isEmpty())
        fail(QStringLiteral("inverter options empty"));

    // ── Hourly with shade mask ──
    const QVariantMap w0 = weather.value(5).toMap();
    const QVariantMap hourly = m_hourly->analyzeMonth({
        {QStringLiteral("lat"), 43.6045},
        {QStringLiteral("month"), 6},
        {QStringLiteral("GHI"), w0.value(QStringLiteral("GHI"))},
        {QStringLiteral("DHI"), w0.value(QStringLiteral("DHI"))},
        {QStringLiteral("T_avg"), w0.value(QStringLiteral("T_avg"), 20)},
        {QStringLiteral("Ppeak"), best.value(QStringLiteral("Ppeak"), 3)},
        {QStringLiteral("tilt"), 30},
        {QStringLiteral("azimuth"), 0},
        {QStringLiteral("losses"), 14},
        {QStringLiteral("dailyKwh"), 12},
        {QStringLiteral("dayShare"), 0.55},
        {QStringLiteral("battKwh"), 8},
        {QStringLiteral("dod"), 80},
        {QStringLiteral("halfHourlyKeep"), shade.value(QStringLiteral("halfHourlyKeep"))},
    });
    if (hourly.value(QStringLiteral("pvTotal")).toDouble() <= 0)
        fail(QStringLiteral("hourly pvTotal <= 0"));
    if (hourly.value(QStringLiteral("hours")).toList().size() != 24)
        fail(QStringLiteral("hourly hours != 24"));

    // ── Quote pipeline ──
    const QVariantList quoteLines = m_pipeline->buildQuoteLines(m_projects->currentProject());
    if (quoteLines.size() < 4)
        fail(QStringLiteral("quote lines too few"));
    bool hasAnnex = false;
    double ht = 0;
    for (const QVariant& v : quoteLines) {
        const QVariantMap m = v.toMap();
        ht += m.value(QStringLiteral("amount")).toDouble();
        if (m.value(QStringLiteral("note")).toBool())
            hasAnnex = true;
    }
    if (ht <= 0)
        fail(QStringLiteral("quote HT <= 0"));
    if (!hasAnnex)
        fail(QStringLiteral("quote missing annex note"));

    const int nPanels = m_pipeline->estimatePanelCount(best.value(QStringLiteral("Ppeak")).toDouble(), 400);
    if (nPanels < 2)
        fail(QStringLiteral("panel count too low"));
    if (best.value(QStringLiteral("Ppeak")).toDouble() < 1.0)
        fail(QStringLiteral("hybrid Ppeak too small"));

    const QString pdf = m_pdf->exportQuote(QStringLiteral("SelfTest Journey"),
                                           QStringLiteral("CI Client"), quoteLines, 0.1);
    if (pdf.isEmpty() || !QFile::exists(pdf))
        fail(QStringLiteral("pdf export failed"));

    // ── Stale fingerprint ──
    if (m_pipeline->isStale(m_projects->currentProject()))
        fail(QStringLiteral("project should not be stale after fingerprint set"));
    m_projects->updateCurrent({
        {QStringLiteral("formState"),
         QVariantMap{{QStringLiteral("tilt"), 40},
                     {QStringLiteral("azimuth"), 0},
                     {QStringLiteral("Ppeak"), best.value(QStringLiteral("Ppeak"))},
                     {QStringLiteral("battKwh"), 8}}},
    });
    if (!m_pipeline->isStale(m_projects->currentProject()))
        fail(QStringLiteral("project should be stale after tilt change"));

    // ── Tab flow ──
    const QVariantList flow = primaryTabFlow();
    if (flow.size() < 7)
        fail(QStringLiteral("primary flow too short"));
    if (flow.first().toString() != QLatin1String("location")
        || flow.last().toString() != QLatin1String("quote"))
        fail(QStringLiteral("primary flow ends malformed"));

    // ── Enedis ──
    const QVariantMap en = m_enedis->parse(QStringLiteral(
        "Date;Valeur\n2024-01-15;300\n2024-02-15;280\n2024-03-15;310\n2024-04-15;290\n"
        "2024-05-15;320\n2024-06-15;340\n2024-07-15;360\n2024-08-15;350\n"
        "2024-09-15;330\n2024-10-15;300\n2024-11-15;270\n2024-12-15;260\n"));
    if (!en.value(QStringLiteral("ok")).toBool())
        fail(QStringLiteral("enedis parse failed"));

    // ── Import/export JSON roundtrip ──
    const QString json = m_projects->exportCurrentJson();
    if (json.size() < 50)
        fail(QStringLiteral("export json too small"));

    m_projects->removeProject(pid);

    const bool ok = errors.isEmpty();
    return {{QStringLiteral("ok"), ok},
            {QStringLiteral("errors"), errors},
            {QStringLiteral("sizingPpeak"), best.value(QStringLiteral("Ppeak"))},
            {QStringLiteral("sizingPpeakClear"), pClear},
            {QStringLiteral("sizingPpeakShade"), pShade},
            {QStringLiteral("eClear"), eClear},
            {QStringLiteral("eShade"), eShade},
            {QStringLiteral("offgridPpeakClear"), offPClear},
            {QStringLiteral("offgridPpeakShade"), offPShade},
            {QStringLiteral("pdf"), pdf},
            {QStringLiteral("hourlyPv"), hourly.value(QStringLiteral("pvTotal"))},
            {QStringLiteral("shadeLoss"), shadeLoss},
            {QStringLiteral("shade3dLoss"), shade3dLoss},
            {QStringLiteral("qr"), qrPath},
            {QStringLiteral("quoteLines"), quoteLines.size()},
            {QStringLiteral("quoteHt"), ht},
            {QStringLiteral("nPanels"), nPanels},
            {QStringLiteral("hybrid"), true},
            {QStringLiteral("journey"), QStringLiteral("location>site>sizing>grid>daily>layout>cables>quote")}};
}

} // namespace app
