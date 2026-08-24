#include "appcontroller.h"

#include <QCoreApplication>
#include <QDir>
#include <QFile>
#include <QGuiApplication>

namespace app {

AppController::AppController(QObject* parent) : QObject(parent) {}

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
    m_updater.check();
    return true;
}

} // namespace app
