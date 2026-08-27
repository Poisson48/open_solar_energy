#include "updater.h"
#include "platform.h"

#include <QCoreApplication>
#include <QDesktopServices>
#include <QDir>
#include <QFile>
#include <QFileInfo>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QNetworkReply>
#include <QNetworkRequest>
#include <QProcess>
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

/** Score d’un asset AppImage (plus haut = mieux). -1 = à ignorer. */
int appImageScore(const QString& name)
{
    if (!name.endsWith(QStringLiteral(".AppImage"), Qt::CaseInsensitive))
        return -1;
    const QString n = name.toLower();
    if (n.contains(QStringLiteral("aarch64")) || n.contains(QStringLiteral("arm64"))
        || n.contains(QStringLiteral("armhf")) || n.contains(QStringLiteral("armv7")))
        return 0;
    if (n.contains(QStringLiteral("x86_64")) || n.contains(QStringLiteral("amd64"))
        || n.contains(QStringLiteral("x64")))
        return 3;
    return 1;
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
#elif defined(Q_OS_LINUX)
    return true; // AppImage : téléchargement + remplacement / relance
#else
    return false;
#endif
}

QString Updater::packageSuffix() const
{
#ifdef Q_OS_ANDROID
    return QStringLiteral(".apk");
#else
    return QStringLiteral(".AppImage");
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
    // check() seul (bouton « Vérifier ») : ne pas auto-télécharger sauf si startUpdate l’a demandé
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
            m_autoStartAfterCheck = false;
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
                m_apkApiUrl.clear();
                m_packageIsAppImage = false;
                int bestScore = -1;
                for (const QJsonValue& a : obj.value(QStringLiteral("assets")).toArray()) {
                    const QJsonObject asset = a.toObject();
                    const QString name = asset.value(QStringLiteral("name")).toString();
#ifdef Q_OS_ANDROID
                    if (!name.endsWith(QStringLiteral(".apk"), Qt::CaseInsensitive))
                        continue;
                    const int score = 1;
#else
                    const int score = appImageScore(name);
                    if (score <= 0)
                        continue;
#endif
                    if (score > bestScore) {
                        bestScore = score;
                        m_apkUrl = asset.value(QStringLiteral("browser_download_url")).toString();
                        m_apkApiUrl = asset.value(QStringLiteral("url")).toString();
#ifndef Q_OS_ANDROID
                        m_packageIsAppImage = true;
#endif
                    }
                }
            }
        }
        rebuildDerivedNotes();

        if (bestNewer.isEmpty()) {
            m_latestVersion.clear();
            m_autoStartAfterCheck = false;
            setState(Idle);
            return;
        }

        if (canInstall() && m_apkUrl.isEmpty() && m_apkApiUrl.isEmpty()) {
            qWarning() << "[Updater] release" << bestNewer << "sans paquet installable";
            m_statusMessage = QStringLiteral("Version %1 trouvée mais fichier d’install introuvable sur GitHub")
                                  .arg(bestNewer);
            m_latestVersion = bestNewer;
            m_autoStartAfterCheck = false;
            setState(Failed);
            return;
        }

        m_latestVersion = bestNewer;
        setState(Available);
        if (m_autoStartAfterCheck) {
            m_autoStartAfterCheck = false;
            download();
        }
    });
}

void Updater::startUpdate()
{
#ifdef Q_OS_ANDROID
    // Demander l’autorisation d’install tôt (pendant le téléchargement),
    // pour qu’elle soit déjà accordée quand l’APK est prêt.
    platformEnsureInstallPermission();
#endif
    // Si une vérif est déjà en cours (check au démarrage), ne pas abandonner :
    // enchaîner le téléchargement dès que Available.
    if (m_state == Checking) {
        m_autoStartAfterCheck = true;
        setStatusMessage(QStringLiteral("Vérification… téléchargement ensuite"));
        return;
    }
    if (m_state == Downloading)
        return;
    if (m_state == Ready) {
        install();
        return;
    }
    if (m_state == Available) {
        download();
        return;
    }
    if (m_state == Failed) {
        if (canInstall() && !m_apkPath.isEmpty() && QFile::exists(m_apkPath)) {
            install();
            return;
        }
        if (canInstall() && (!m_apkUrl.isEmpty() || !m_apkApiUrl.isEmpty())) {
            download();
            return;
        }
    }
    // Idle ou Failed sans APK : vérifier puis télécharger automatiquement
    m_autoStartAfterCheck = true;
    check();
}

void Updater::startApkDownload(const QUrl& url, bool apiAsset)
{
    const QString dir = QStandardPaths::writableLocation(QStandardPaths::CacheLocation);
    QDir().mkpath(dir);
    const QString suffix = packageSuffix();
    m_apkPath = dir + QStringLiteral("/opensolarenergy-") + m_latestVersion + suffix;
    QFile::remove(m_apkPath);

    auto* file = new QFile(m_apkPath);
    if (!file->open(QIODevice::WriteOnly | QIODevice::Truncate)) {
        delete file;
        m_statusMessage = QStringLiteral("Impossible d'écrire le fichier de mise à jour");
        setState(Failed);
        return;
    }

    QNetworkRequest req{ url };
    req.setRawHeader("User-Agent", "OpenSolarEnergy");
    if (apiAsset)
        req.setRawHeader("Accept", "application/octet-stream");
    req.setAttribute(QNetworkRequest::RedirectPolicyAttribute,
                     QNetworkRequest::NoLessSafeRedirectPolicy);
    req.setTransferTimeout(15 * 60 * 1000);

    m_progress = 0.0;
    m_bytesReceived = 0.0;
    m_lastProgressPct = -1;
    emit progressChanged();
    setState(Downloading);
    setStatusMessage(QStringLiteral("Téléchargement de la version %1…").arg(m_latestVersion));

    QNetworkReply* reply = m_net.get(req);
    m_reply = reply;
    connect(reply, &QNetworkReply::downloadProgress, this,
            [this](qint64 received, qint64 total) {
        m_bytesReceived = qreal(received);
        if (total > 0) {
            m_progress = qreal(received) / qreal(total);
            const int pct = int(m_progress * 100.0);
            if (pct != m_lastProgressPct && (pct % 2 == 0 || pct >= 99 || m_lastProgressPct < 0)) {
                m_lastProgressPct = pct;
                setStatusMessage(
                    QStringLiteral("Téléchargement… %1 % (%2 Mo / %3 Mo)")
                        .arg(pct)
                        .arg(received / 1e6, 0, 'f', 1)
                        .arg(total / 1e6, 0, 'f', 1));
            }
        } else {
            const qreal kEst = m_packageIsAppImage ? 140e6 : 30e6;
            m_progress = qMin(0.92, qreal(received) / kEst);
            const int pct = int(m_progress * 100.0);
            if (pct != m_lastProgressPct) {
                m_lastProgressPct = pct;
                setStatusMessage(
                    QStringLiteral("Téléchargement… %1 Mo")
                        .arg(received / 1e6, 0, 'f', 1));
            }
        }
        emit progressChanged();
    });
    connect(reply, &QNetworkReply::readyRead, this, [reply, file]() {
        if (file->isOpen())
            file->write(reply->readAll());
    });
    connect(reply, &QNetworkReply::finished, this, [this, reply, file, apiAsset]() {
        if (file->isOpen()) {
            file->write(reply->readAll());
            file->close();
        }
        const qint64 size = file->size();
        file->deleteLater();
        reply->deleteLater();

        const qint64 minSize = m_packageIsAppImage ? 5000000 : 10000;
        if (reply->error() != QNetworkReply::NoError || size < minSize) {
            QFile::remove(m_apkPath);
            qWarning() << "[Updater] download failed:" << reply->errorString()
                       << "size=" << size << "api=" << apiAsset << reply->url();
            if (!apiAsset && !m_apkApiUrl.isEmpty() && !m_triedApiDownload) {
                m_triedApiDownload = true;
                setStatusMessage(QStringLiteral("Nouvel essai de téléchargement…"));
                startApkDownload(QUrl(m_apkApiUrl), true);
                return;
            }
            m_statusMessage = reply->error() != QNetworkReply::NoError
                ? QStringLiteral("Téléchargement impossible : %1").arg(reply->errorString())
                : QStringLiteral("Fichier téléchargé vide ou incomplet (%1 Mo)")
                      .arg(QString::number(size / 1e6, 'f', 1));
            setState(Failed);
            return;
        }

        m_progress = 1.0;
        m_bytesReceived = qreal(size);
        emit progressChanged();
        if (m_packageIsAppImage) {
            QFile::setPermissions(m_apkPath,
                QFile::permissions(m_apkPath)
                    | QFileDevice::ExeOwner | QFileDevice::ExeUser
                    | QFileDevice::ExeGroup | QFileDevice::ExeOther);
        }
        qInfo() << "[Updater] paquet téléchargé" << m_apkPath << size << "octets";
        setState(Ready);
#ifdef Q_OS_ANDROID
        install();
#endif
    });
}

void Updater::download()
{
    if (m_apkUrl.isEmpty() && m_apkApiUrl.isEmpty()) {
        install();
        return;
    }
    if (m_state == Downloading)
        return;

    m_triedApiDownload = false;
    if (!m_apkUrl.isEmpty())
        startApkDownload(QUrl(m_apkUrl), false);
    else
        startApkDownload(QUrl(m_apkApiUrl), true);
}

void Updater::install()
{
    const bool pkgReady = !m_apkPath.isEmpty() && QFile::exists(m_apkPath);
    if (canInstall() && pkgReady && (m_state == Ready || m_state == Failed)) {
        if (m_state == Failed)
            setState(Ready);
        setStatusMessage(QStringLiteral("Lancement de l'installation…"));
        if (installDownloadedPackage())
            return;
        if (m_state != Failed) {
            m_statusMessage = QStringLiteral(
                "Installation impossible — réessayez ou lancez le fichier téléchargé");
            setState(Failed);
        }
        return;
    }
    if (canInstall() && (!m_apkUrl.isEmpty() || !m_apkApiUrl.isEmpty())) {
        download();
        return;
    }
    if (!m_releaseUrl.isEmpty())
        QDesktopServices::openUrl(QUrl(m_releaseUrl));
}

bool Updater::installDownloadedPackage()
{
#ifdef Q_OS_ANDROID
    if (platformInstallApk(m_apkPath))
        return true;
    const QString st = platformPollInstallStatus();
    if (st.startsWith(QLatin1String("need_perm\t"))) {
        m_statusMessage = st.mid(10);
        setState(Failed);
        return false;
    }
    if (st.startsWith(QLatin1String("err\t"))) {
        m_statusMessage = st.mid(4);
        setState(Failed);
        return false;
    }
    m_statusMessage = QStringLiteral(
        "Installation impossible — autorisez « Installer des apps inconnues » pour Open Solar, puis réessayez");
    setState(Failed);
    return false;
#else
    QFile::setPermissions(m_apkPath,
        QFile::permissions(m_apkPath)
            | QFileDevice::ExeOwner | QFileDevice::ExeUser
            | QFileDevice::ExeGroup | QFileDevice::ExeOther);

    const QString currentAppImage = QString::fromLocal8Bit(qgetenv("APPIMAGE"));
    if (!currentAppImage.isEmpty() && QFile::exists(currentAppImage)) {
        const QString dir = QStandardPaths::writableLocation(QStandardPaths::CacheLocation);
        QDir().mkpath(dir);
        const QString scriptPath = dir + QStringLiteral("/ose-apply-appimage.sh");
        QFile script(scriptPath);
        if (!script.open(QIODevice::WriteOnly | QIODevice::Truncate | QIODevice::Text)) {
            m_statusMessage = QStringLiteral("Impossible d’écrire le script de mise à jour");
            setState(Failed);
            return false;
        }
        script.write(QByteArrayLiteral(
            "#!/bin/bash\n"
            "NEW=\"$1\"\n"
            "OLD=\"$2\"\n"
            "for i in $(seq 1 40); do\n"
            "  if ! pgrep -f \"$OLD\" >/dev/null 2>&1; then break; fi\n"
            "  sleep 0.25\n"
            "done\n"
            "sleep 0.4\n"
            "chmod +x \"$NEW\" || true\n"
            "if cp -f \"$NEW\" \"$OLD\" 2>/dev/null; then\n"
            "  chmod +x \"$OLD\" || true\n"
            "  rm -f \"$NEW\"\n"
            "  exec \"$OLD\"\n"
            "else\n"
            "  exec \"$NEW\"\n"
            "fi\n"));
        script.close();
        QFile::setPermissions(scriptPath,
            QFile::permissions(scriptPath)
                | QFileDevice::ExeOwner | QFileDevice::ExeUser);
        if (!QProcess::startDetached(QStringLiteral("/bin/bash"),
                                     { scriptPath, m_apkPath, currentAppImage })) {
            m_statusMessage = QStringLiteral("Impossible de lancer le script de mise à jour");
            setState(Failed);
            return false;
        }
        setStatusMessage(QStringLiteral("Redémarrage pour appliquer la v%1…").arg(m_latestVersion));
        QCoreApplication::quit();
        return true;
    }

    if (!QProcess::startDetached(m_apkPath, {})) {
        QDesktopServices::openUrl(QUrl::fromLocalFile(QFileInfo(m_apkPath).absolutePath()));
        m_statusMessage = QStringLiteral("AppImage téléchargée — lancez-la depuis le dossier ouvert");
        setState(Failed);
        return false;
    }
    setStatusMessage(QStringLiteral("Nouvelle version lancée"));
    QCoreApplication::quit();
    return true;
#endif
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

void Updater::pollNativeInstallStatus()
{
    const QString st = platformPollInstallStatus();
    if (st.isEmpty())
        return;
    if (st.startsWith(QLatin1String("ok\t"))) {
        setStatusMessage(st.mid(3));
        return;
    }
    if (st.startsWith(QLatin1String("pending\t"))) {
        setStatusMessage(st.mid(8));
        return;
    }
    if (st.startsWith(QLatin1String("need_perm\t"))) {
        m_statusMessage = st.mid(10);
        setState(Failed);
        return;
    }
    if (st.startsWith(QLatin1String("err\t"))) {
        m_statusMessage = st.mid(4);
        setState(Failed);
    }
}

} // namespace app
