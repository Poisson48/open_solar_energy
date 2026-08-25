#include "updater.h"
#include "platform.h"

#include <QDesktopServices>
#include <QDir>
#include <QFile>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QNetworkReply>
#include <QNetworkRequest>
#include <QSettings>
#include <QStandardPaths>
#include <QUrl>
#include <QDebug>

namespace app {

namespace {

constexpr const char* kReleasesApi =
    "https://api.github.com/repos/Poisson48/open_solar_energy/releases?per_page=30";
constexpr const char* kSeenNotesKey = "updater/seenNotesVersion";

#ifndef OSE_APP_VERSION
#  define OSE_APP_VERSION "0.0.0"
#endif

QString stripV(QString v)
{
    if (v.startsWith(QLatin1Char('v')) || v.startsWith(QLatin1Char('V')))
        v.remove(0, 1);
    return v;
}

} // namespace

Updater::Updater(QObject* parent) : QObject(parent) {}

QString Updater::currentVersion() const
{
    return QStringLiteral(OSE_APP_VERSION);
}

bool Updater::canInstall() const
{
#ifdef Q_OS_ANDROID
    return true;
#else
    return false;
#endif
}

QString Updater::notesFromBody(const QString& body)
{
    QStringList kept;
    for (const QString& line : body.split(QLatin1Char('\n'))) {
        if (line.trimmed() == QStringLiteral("---"))
            break;
        QString clean = line;
        while (clean.startsWith(QLatin1Char('#')))
            clean.remove(0, 1);
        kept << clean.trimmed();
    }
    while (!kept.isEmpty() && kept.last().isEmpty())
        kept.removeLast();
    return kept.join(QLatin1Char('\n')).trimmed();
}

bool Updater::isNewer(const QString& candidate, const QString& current)
{
    const auto parts = [](QString v) {
        if (v.startsWith(QLatin1Char('v')) || v.startsWith(QLatin1Char('V')))
            v.remove(0, 1);
        QList<int> out;
        for (const QString& p : v.split(QLatin1Char('.'))) {
            int digits = 0;
            while (digits < p.size() && p.at(digits).isDigit())
                ++digits;
            out << p.left(digits).toInt();
        }
        return out;
    };
    const QList<int> a = parts(candidate);
    const QList<int> b = parts(current);
    if (a.isEmpty())
        return false;
    for (int i = 0; i < std::max(a.size(), b.size()); ++i) {
        const int x = i < a.size() ? a[i] : 0;
        const int y = i < b.size() ? b[i] : 0;
        if (x != y)
            return x > y;
    }
    return false;
}

QString Updater::formatEntries(const QVariantList& entries)
{
    QStringList blocks;
    for (const QVariant& v : entries) {
        const QVariantMap m = v.toMap();
        const QString ver = m.value(QStringLiteral("version")).toString();
        const QString notes = m.value(QStringLiteral("notes")).toString().trimmed();
        if (ver.isEmpty())
            continue;
        blocks << (notes.isEmpty() ? QStringLiteral("Version %1").arg(ver)
                                   : QStringLiteral("Version %1\n\n%2").arg(ver, notes));
    }
    return blocks.join(QStringLiteral("\n\n————————————\n\n")).trimmed();
}

void Updater::rebuildDerivedNotes()
{
    const QString current = currentVersion();
    QSettings settings;
    const QString seen = stripV(settings.value(QLatin1String(kSeenNotesKey), QString()).toString());

    QVariantList pending;
    QVariantList whatsNew;
    for (const QVariant& v : m_changelog) {
        const QVariantMap m = v.toMap();
        const QString ver = m.value(QStringLiteral("version")).toString();
        if (ver.isEmpty())
            continue;
        if (isNewer(ver, current))
            pending.append(m);
        else if (seen.isEmpty() || isNewer(ver, seen))
            whatsNew.append(m);
    }
    m_releaseNotes = formatEntries(pending);
    if (seen.isEmpty()) {
        settings.setValue(QLatin1String(kSeenNotesKey), current);
        m_whatsNewNotes.clear();
    } else {
        m_whatsNewNotes = formatEntries(whatsNew);
    }
    emit changelogChanged();
}

void Updater::setState(State s)
{
    if (m_state == s)
        return;
    m_state = s;
    if (s == Available)
        qInfo() << "[Updater] version" << m_latestVersion << "disponible";
    else if (s == Failed)
        qWarning() << "[Updater] échec téléchargement" << m_apkUrl;
    emit stateChanged();
}

void Updater::check()
{
    if (m_state == Checking || m_state == Downloading)
        return;
    setState(Checking);

    QNetworkRequest req{ QUrl(QString::fromLatin1(kReleasesApi)) };
    req.setRawHeader("Accept", "application/vnd.github+json");
    req.setRawHeader("User-Agent", "OpenSolarEnergy");

    QNetworkReply* reply = m_net.get(req);
    m_reply = reply;
    connect(reply, &QNetworkReply::finished, this, [this, reply]() {
        reply->deleteLater();
        if (reply->error() != QNetworkReply::NoError) {
            setState(Idle);
            return;
        }
        const QJsonArray arr = QJsonDocument::fromJson(reply->readAll()).array();
        m_changelog.clear();
        m_apkUrl.clear();
        m_releaseUrl.clear();
        m_latestVersion.clear();
        const QString current = currentVersion();
        QString bestNewer;

        for (const QJsonValue& v : arr) {
            const QJsonObject obj = v.toObject();
            if (obj.value(QStringLiteral("draft")).toBool())
                continue;
            if (obj.value(QStringLiteral("prerelease")).toBool())
                continue;
            const QString ver = stripV(obj.value(QStringLiteral("tag_name")).toString());
            if (ver.isEmpty())
                continue;
            QVariantMap entry;
            entry.insert(QStringLiteral("version"), ver);
            entry.insert(QStringLiteral("notes"),
                         notesFromBody(obj.value(QStringLiteral("body")).toString()));
            entry.insert(QStringLiteral("publishedAt"),
                         obj.value(QStringLiteral("published_at")).toString());
            m_changelog.append(entry);

            if (isNewer(ver, current) && (bestNewer.isEmpty() || isNewer(ver, bestNewer))) {
                bestNewer = ver;
                m_releaseUrl = obj.value(QStringLiteral("html_url")).toString();
                m_apkUrl.clear();
                for (const QJsonValue& a : obj.value(QStringLiteral("assets")).toArray()) {
                    const QString name = a.toObject().value(QStringLiteral("name")).toString();
                    if (name.endsWith(QStringLiteral(".apk"), Qt::CaseInsensitive)) {
                        m_apkUrl = a.toObject().value(QStringLiteral("browser_download_url")).toString();
                        break;
                    }
                }
            }
        }
        rebuildDerivedNotes();
        if (bestNewer.isEmpty()) {
            setState(Idle);
            return;
        }
        m_latestVersion = bestNewer;
        setState(Available);
    });
}

void Updater::download()
{
    // Desktop : pas d'install APK in-app — ouvrir la page Release (AppImage).
    // Android : télécharger l'APK puis Platform::installApk.
    if (!canInstall() || m_apkUrl.isEmpty()) {
        install();
        return;
    }
    if (m_state == Downloading)
        return;
    const QString dir = QStandardPaths::writableLocation(QStandardPaths::CacheLocation);
    QDir().mkpath(dir);
    m_apkPath = dir + QStringLiteral("/opensolarenergy-") + m_latestVersion
              + QStringLiteral(".apk");
    QNetworkRequest req{ QUrl(m_apkUrl) };
    req.setRawHeader("User-Agent", "OpenSolarEnergy");
    req.setAttribute(QNetworkRequest::RedirectPolicyAttribute,
                     QNetworkRequest::NoLessSafeRedirectPolicy);
    m_progress = 0.0;
    emit progressChanged();
    setState(Downloading);
    QNetworkReply* reply = m_net.get(req);
    m_reply = reply;
    connect(reply, &QNetworkReply::downloadProgress, this,
            [this](qint64 received, qint64 total) {
        m_progress = total > 0 ? qreal(received) / qreal(total) : 0.0;
        emit progressChanged();
    });
    connect(reply, &QNetworkReply::finished, this, [this, reply]() {
        reply->deleteLater();
        if (reply->error() != QNetworkReply::NoError) {
            setState(Failed);
            return;
        }
        QFile out(m_apkPath);
        if (!out.open(QIODevice::WriteOnly | QIODevice::Truncate)) {
            setState(Failed);
            return;
        }
        const QByteArray body = reply->readAll();
        if (out.write(body) != body.size() || body.isEmpty()) {
            QFile::remove(m_apkPath);
            setState(Failed);
            return;
        }
        out.close();
        setState(Ready);
    });
}

void Updater::install()
{
    if (canInstall() && m_state == Ready && !m_apkPath.isEmpty()) {
        if (platformInstallApk(m_apkPath))
            return;
        setState(Failed);
        return;
    }
    if (!m_releaseUrl.isEmpty())
        QDesktopServices::openUrl(QUrl(m_releaseUrl));
}

void Updater::dismiss()
{
    if (m_reply)
        m_reply->abort();
    setState(Idle);
}

void Updater::acknowledgeNotes()
{
    QSettings settings;
    settings.setValue(QLatin1String(kSeenNotesKey), currentVersion());
    m_whatsNewNotes.clear();
    emit changelogChanged();
}

} // namespace app
