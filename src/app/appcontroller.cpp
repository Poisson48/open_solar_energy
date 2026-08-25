#include "appcontroller.h"

#include "platform.h"
#include "webbridge.h"
#include "updater.h"

#include <QByteArray>
#include <QCoreApplication>
#include <QDir>
#include <QFile>
#include <QGuiApplication>

namespace app {

AppController::AppController(QObject* parent) : QObject(parent) {}

bool AppController::shareFile(const QString& filename, const QString& mime,
                              const QString& base64Data)
{
    const QByteArray raw = QByteArray::fromBase64(base64Data.toLatin1());
    if (raw.isEmpty() && !base64Data.isEmpty())
        return false;
    return platformShareFile(filename, mime, raw);
}

bool AppController::pickImportFile()
{
    return platformPickImportFile();
}

QString AppController::pollImportResult()
{
    return platformPollImportResult();
}

QString AppController::resolveWebRoot() const
{
    const QByteArray env = qgetenv("OSE_WEB_ROOT");
    if (!env.isEmpty()) {
        const QString p = QFileInfo(QString::fromUtf8(env)).canonicalFilePath();
        if (QFile::exists(p + QStringLiteral("/index.html")))
            return p;
    }
    const QString appDir = QCoreApplication::applicationDirPath();
    const QStringList candidates = {
        QDir(appDir).filePath(QStringLiteral("../share/opensolarenergy/web")),
        QDir(appDir).filePath(QStringLiteral("../../..")),
        QDir(appDir).filePath(QStringLiteral("../..")),
        QDir(appDir).filePath(QStringLiteral("..")),
    };
    for (const QString& c : candidates) {
        const QString canon = QFileInfo(c).canonicalFilePath();
        if (QFile::exists(canon + QStringLiteral("/index.html")))
            return canon;
    }
    return {};
}

bool AppController::init()
{
    const QString root = resolveWebRoot();
    if (!m_host.start(root))
        return false;
    m_webUrl = m_host.baseUrl();
    emit webUrlChanged();
    QObject::connect(&m_bridge, &WebBridge::checkUpdatesRequested,
                     &m_updater, &Updater::check);
    m_updater.check();
    return true;
}

} // namespace app
