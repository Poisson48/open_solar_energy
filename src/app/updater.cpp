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

void Updater::setStatusMessage(const QString& msg)
{
    if (m_statusMessage == msg)
        return;
    m_statusMessage = msg;
    emit statusMessageChanged();
}

void Updater::setState(State s)
{
    if (m_state == s)
        return;
    const State prev = m_state;
    m_state = s;

    if (s == Checking)
        setStatusMessage(QStringLiteral("Vérification des mises à jour…"));
    else if (s == Available) {
        qInfo() << "[Updater] version" << m_latestVersion << "disponible (nous sommes en"
                << currentVersion() << ")";
        setStatusMessage(QStringLiteral("Version %1 disponible — touchez « Mettre à jour » en haut")
                             .arg(m_latestVersion));
    } else if (s == Downloading)
        setStatusMessage(QStringLiteral("Téléchargement de la version %1…").arg(m_latestVersion));
    else if (s == Ready)
        setStatusMessage(QStringLiteral("Version %1 prête — touchez « Installer » en haut")
                             .arg(m_latestVersion));
    else if (s == Failed)
        setStatusMessage(m_statusMessage.isEmpty()
                             ? QStringLiteral("Échec de la mise à jour")
                             : m_statusMessage);
    else if (s == Idle && prev == Checking && m_latestVersion.isEmpty())
        setStatusMessage(QStringLiteral("Vous avez la dernière version (v%1)").arg(currentVersion()));
    else if (s == Idle)
        setStatusMessage(QString());

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
            qWarning() << "[Updater] check failed:" << reply->errorString();
            const QString err = QStringLiteral("Impossible de contacter GitHub : %1")
                                    .arg(reply->errorString());
            // Pas de maj en cours → toast, pas de bandeau rouge trompeur
            if (m_apkUrl.isEmpty() && m_latestVersion.isEmpty()) {
                if (m_state != Idle) {
                    m_state = Idle;
                    emit stateChanged();
                }
                setStatusMessage(err);
                return;
            }
            m_statusMessage = err;
            setState(Failed);
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
            m_latestVersion.clear();
            setState(Idle);
            return;
        }

        if (canInstall() && m_apkUrl.isEmpty()) {
            qWarning() << "[Updater] release" << bestNewer << "sans APK";
            m_statusMessage = QStringLiteral("Version %1 trouvée mais APK introuvable sur GitHub")
                                  .arg(bestNewer);
            m_latestVersion = bestNewer;
            setState(Failed);
            return;
        }

        m_latestVersion = bestNewer;
        setState(Available);
    });
}

void Updater::download()
{
    if (m_apkUrl.isEmpty()) {
        install();
        return;
    }
    if (m_state == Downloading)
        return;

    const QString dir = QStandardPaths::writableLocation(QStandardPaths::CacheLocation);
    QDir().mkpath(dir);
    m_apkPath = dir + QStringLiteral("/opensolarenergy-") + m_latestVersion
              + QStringLiteral(".apk");
    QFile::remove(m_apkPath);

    // Écriture en flux : readAll() d’un APK ~25 Mo provoque souvent un OOM / échec
    // silencieux sur Android (le bandeau « Échec du téléchargement »).
    auto* file = new QFile(m_apkPath);
    if (!file->open(QIODevice::WriteOnly | QIODevice::Truncate)) {
        delete file;
        m_statusMessage = QStringLiteral("Impossible d'écrire l'APK");
        setState(Failed);
        return;
    }

    QNetworkRequest req{ QUrl(m_apkUrl) };
    req.setRawHeader("User-Agent", "OpenSolarEnergy");
    req.setRawHeader("Accept", "application/octet-stream");
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
    connect(reply, &QNetworkReply::readyRead, this, [reply, file]() {
        if (file->isOpen())
            file->write(reply->readAll());
    });
    connect(reply, &QNetworkReply::finished, this, [this, reply, file]() {
        if (file->isOpen()) {
            file->write(reply->readAll());
            file->close();
        }
        const qint64 size = file->size();
        file->deleteLater();
        reply->deleteLater();

        if (reply->error() != QNetworkReply::NoError || size <= 0) {
            QFile::remove(m_apkPath);
            qWarning() << "[Updater] download failed:" << reply->errorString()
                       << "size=" << size << m_apkUrl;
            m_statusMessage = reply->error() != QNetworkReply::NoError
                ? QStringLiteral("Téléchargement impossible : %1").arg(reply->errorString())
                : QStringLiteral("APK téléchargé vide ou incomplet");
            setState(Failed);
            return;
        }

        qInfo() << "[Updater] APK téléchargé" << m_apkPath << size << "octets";
        setState(Ready);
    });
}

void Updater::install()
{
    if (canInstall() && m_state == Ready && !m_apkPath.isEmpty()) {
        if (platformInstallApk(m_apkPath))
            return;
        m_statusMessage = QStringLiteral("Installation impossible — autorisez « sources inconnues »");
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
    m_statusMessage.clear();
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
