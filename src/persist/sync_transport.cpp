#include "sync_transport.h"

#include <QDir>
#include <QFile>
#include <QFileInfo>
#include <QStandardPaths>

#ifdef Q_OS_ANDROID
#  include "app/platform.h"
#endif

#ifndef Q_OS_ANDROID
#  include <unistd.h>
#endif

namespace ose {
namespace {

bool ensureSyncLayout(const QString& dir)
{
    if (dir.isEmpty())
        return false;
    if (!QDir(dir).exists() && !QDir().mkpath(dir))
        return false;
    QDir().mkpath(dir + QStringLiteral("/inbox"));
    QDir().mkpath(dir + QStringLiteral("/outbox"));
    return true;
}

#ifndef Q_OS_ANDROID
QString findMtpSyncDir()
{
    const QString gvfs = QStringLiteral("/run/user/%1/gvfs").arg(getuid());
    QDir root(gvfs);
    if (!root.exists())
        return {};
    for (const QFileInfo& mount : root.entryInfoList(QDir::Dirs | QDir::NoDotAndDotDot)) {
        if (!mount.fileName().startsWith(QLatin1String("mtp:")))
            continue;
        QStringList candidates;
        candidates << mount.absoluteFilePath() + QStringLiteral("/Documents/OpenSolarEnergy/sync");
        candidates << mount.absoluteFilePath()
                          + QStringLiteral("/Internal shared storage/Documents/OpenSolarEnergy/sync");
        QDir mountDir(mount.absoluteFilePath());
        for (const QFileInfo& t : mountDir.entryInfoList(QDir::Dirs | QDir::NoDotAndDotDot)) {
            candidates << t.absoluteFilePath() + QStringLiteral("/Documents/OpenSolarEnergy/sync");
        }
        for (const QString& c : candidates) {
            if (QDir(c).exists() || QDir().mkpath(c))
                return c;
        }
    }
    return {};
}
#endif

} // namespace

UsbFileTransport::UsbFileTransport(QObject* parent) : SyncTransport(parent)
{
    refresh();
}

void UsbFileTransport::setSyncDirOverride(const QString& path)
{
    m_override = path;
    ensureSyncLayout(path);
    m_cachedDir = path;
    emit availableChanged();
}

void UsbFileTransport::clearSyncDirOverride()
{
    m_override.clear();
    refresh();
}

void UsbFileTransport::refresh()
{
    m_cachedDir = discoverSyncDir();
    emit availableChanged();
}

QString UsbFileTransport::ensureLocalDocumentsSync() const
{
    const QString sync = QStandardPaths::writableLocation(QStandardPaths::DocumentsLocation)
                         + QStringLiteral("/OpenSolarEnergy/sync");
    if (ensureSyncLayout(sync))
        return sync;
    const QString app = QStandardPaths::writableLocation(QStandardPaths::AppDataLocation)
                        + QStringLiteral("/sync");
    ensureSyncLayout(app);
    return app;
}

QString UsbFileTransport::discoverSyncDir() const
{
    if (!m_override.isEmpty()) {
        ensureSyncLayout(m_override);
        return m_override;
    }
#ifdef Q_OS_ANDROID
    const QString androidDocs = app::platformSyncDocumentsDir();
    if (!androidDocs.isEmpty() && ensureSyncLayout(androidDocs))
        return androidDocs;
#else
    const QString mtp = findMtpSyncDir();
    if (!mtp.isEmpty() && ensureSyncLayout(mtp))
        return mtp;
#endif
    return ensureLocalDocumentsSync();
}

QString UsbFileTransport::syncDir() const
{
    if (m_cachedDir.isEmpty())
        m_cachedDir = discoverSyncDir();
    return m_cachedDir;
}

bool UsbFileTransport::available() const
{
    return !syncDir().isEmpty() && QDir(syncDir()).exists();
}

bool UsbFileTransport::sendBundle(const QByteArray& zipBytes, bool toPhone)
{
    setLastError({});
    Q_UNUSED(toPhone);
    // Secours fichier uniquement — le chemin principal est SyncLan (réseau USB/Wi‑Fi).
    const QString dir = syncDir();
    if (dir.isEmpty()) {
        setLastError(QStringLiteral("Dossier sync introuvable"));
        return false;
    }
    ensureSyncLayout(dir);
    const QString name = toPhone ? fileNameToPhone() : fileNameToPc();
    QFile f(dir + QLatin1Char('/') + name);
    if (!f.open(QIODevice::WriteOnly | QIODevice::Truncate) || f.write(zipBytes) != zipBytes.size()) {
        setLastError(QStringLiteral("Écriture fichier échouée"));
        return false;
    }
#ifdef Q_OS_ANDROID
    app::platformPublishSyncFile(name, zipBytes);
#endif
    return true;
}

QByteArray UsbFileTransport::receiveBundle(bool fromPhone)
{
    setLastError({});
    const QString name = fromPhone ? fileNameToPc() : fileNameToPhone();
    const QString dir = syncDir();
    for (const QString& path : {dir + QLatin1Char('/') + name, dir + QStringLiteral("/inbox/") + name,
                                dir + QStringLiteral("/outbox/") + name}) {
        QFile f(path);
        if (f.open(QIODevice::ReadOnly)) {
            const QByteArray data = f.readAll();
            if (!data.isEmpty())
                return data;
        }
    }
#ifdef Q_OS_ANDROID
    const QByteArray pub = app::platformReadSyncFile(name);
    if (!pub.isEmpty())
        return pub;
#endif
    setLastError(QStringLiteral("Pas de fichier sync — utilisez la sync réseau (câble partage de connexion)."));
    return {};
}

} // namespace ose
