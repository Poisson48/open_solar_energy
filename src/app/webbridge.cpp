#include "webbridge.h"

#include "platform.h"

#include <QDesktopServices>
#include <QDir>
#include <QFile>
#ifdef OSE_HAS_WIDGETS
#include <QtWidgets/QFileDialog>
#endif
#include <QJsonDocument>
#include <QProcess>
#include <QRegularExpression>
#include <QStandardPaths>
#include <QUrl>
#include <QByteArray>

namespace app {

WebBridge::WebBridge(QObject* parent) : QObject(parent) {}

QString WebBridge::projectDir(const QString& projectId) const
{
    const QString base = QStandardPaths::writableLocation(QStandardPaths::HomeLocation)
        + QStringLiteral("/OpenSolarEnergy/projects/");
    const QString dir = base + projectId;
    QDir().mkpath(dir);
    return dir;
}

bool WebBridge::gitAvailable() const
{
    QProcess p;
    p.start(QStringLiteral("git"), {QStringLiteral("--version")});
    return p.waitForFinished(3000) && p.exitCode() == 0;
}

bool WebBridge::ensureGitRepo(const QString& dir) const
{
    if (!QDir(dir + QStringLiteral("/.git")).exists()) {
        QProcess init;
        init.setWorkingDirectory(dir);
        init.start(QStringLiteral("git"), {QStringLiteral("init")});
        if (!init.waitForFinished(10000) || init.exitCode() != 0)
            return false;
        QProcess cfg;
        cfg.setWorkingDirectory(dir);
        cfg.start(QStringLiteral("git"), {QStringLiteral("config"), QStringLiteral("user.email"),
                                          QStringLiteral("autosave@open-solar-energy")});
        cfg.waitForFinished(5000);
        QProcess cfg2;
        cfg2.setWorkingDirectory(dir);
        cfg2.start(QStringLiteral("git"), {QStringLiteral("config"), QStringLiteral("user.name"),
                                           QStringLiteral("Open Solar Energy")});
        cfg2.waitForFinished(5000);
    }
    return true;
}

void WebBridge::openExternal(const QString& url)
{
    QString u = url.trimmed();
    if (u.isEmpty())
        return;
    if (u.startsWith(QStringLiteral("http://")) || u.startsWith(QStringLiteral("https://"))) {
        QDesktopServices::openUrl(QUrl(u));
        return;
    }
    if (u.startsWith(QStringLiteral("file://"))) {
        QDesktopServices::openUrl(QUrl(u));
        return;
    }
    // Chemin local absolu → visioneuse système (PDF, etc.)
    if (u.startsWith(QLatin1Char('/')) || (u.size() > 2 && u.at(1) == QLatin1Char(':'))) {
        QDesktopServices::openUrl(QUrl::fromLocalFile(u));
    }
}

bool WebBridge::openPdf(const QString& filename, const QString& base64Data)
{
    const QByteArray raw = QByteArray::fromBase64(base64Data.toLatin1());
    if (raw.isEmpty())
        return false;
    return platformOpenPdf(filename, raw);
}

bool WebBridge::openPdfFromUrl(const QString& url)
{
    return platformOpenPdfFromUrl(url.trimmed());
}

void WebBridge::checkForUpdates()
{
    emit checkUpdatesRequested();
}

QString WebBridge::openFileDialog()
{
#ifdef OSE_HAS_WIDGETS
    return QFileDialog::getOpenFileName(
        nullptr, QStringLiteral("Sélectionner un fichier"),
        QStandardPaths::writableLocation(QStandardPaths::DocumentsLocation),
        QStringLiteral("Documents (*.pdf *.png *.jpg *.jpeg *.webp);;Tous (*.*)"));
#else
    return QString();
#endif
}

QJsonObject WebBridge::gitSave(const QString& projectId, const QString& projectJson,
                               const QString& message)
{
    if (!gitAvailable())
        return {{QStringLiteral("ok"), false}, {QStringLiteral("reason"), QStringLiteral("git_unavailable")}};
    const QString dir = projectDir(projectId);
    if (!ensureGitRepo(dir))
        return {{QStringLiteral("ok"), false}, {QStringLiteral("reason"), QStringLiteral("git_init_failed")}};
    QFile f(dir + QStringLiteral("/project.json"));
    if (!f.open(QIODevice::WriteOnly | QIODevice::Text))
        return {{QStringLiteral("ok"), false}, {QStringLiteral("reason"), f.errorString()}};
    f.write(projectJson.toUtf8());
    f.close();
    QProcess add;
    add.setWorkingDirectory(dir);
    add.start(QStringLiteral("git"), {QStringLiteral("add"), QStringLiteral("project.json")});
    add.waitForFinished(10000);
    QString safeMsg = message;
    safeMsg.replace('"', '\'');
    safeMsg.replace('`', '\'');
    safeMsg.replace('$', QString());
    safeMsg = safeMsg.left(200);
    QProcess commit;
    commit.setWorkingDirectory(dir);
    commit.start(QStringLiteral("git"), {QStringLiteral("commit"), QStringLiteral("-m"), safeMsg});
    commit.waitForFinished(10000);
    return {{QStringLiteral("ok"), true}};
}

QJsonArray WebBridge::gitLog(const QString& projectId)
{
    QJsonArray out;
    if (!gitAvailable())
        return out;
    const QString dir = projectDir(projectId);
    ensureGitRepo(dir);
    QProcess p;
    p.setWorkingDirectory(dir);
    p.start(QStringLiteral("git"),
            {QStringLiteral("log"), QStringLiteral("--max-count=50"),
             QStringLiteral("--pretty=format:%H|%ai|%s")});
    if (!p.waitForFinished(10000))
        return out;
    const QStringList lines = QString::fromUtf8(p.readAllStandardOutput()).split('\n', Qt::SkipEmptyParts);
    for (const QString& line : lines) {
        const int i1 = line.indexOf('|');
        const int i2 = line.indexOf('|', i1 + 1);
        if (i1 < 0 || i2 < 0)
            continue;
        out.append(QJsonObject{
            {QStringLiteral("hash"), line.left(i1)},
            {QStringLiteral("date"), line.mid(i1 + 1, i2 - i1 - 1)},
            {QStringLiteral("message"), line.mid(i2 + 1)}
        });
    }
    return out;
}

QString WebBridge::gitCheckout(const QString& projectId, const QString& hash)
{
    if (!gitAvailable())
        return QString();
    static const QRegularExpression hexRe(QStringLiteral("^[a-f0-9]{4,64}$"),
                                          QRegularExpression::CaseInsensitiveOption);
    if (!hexRe.match(hash).hasMatch())
        return QString();
    const QString dir = projectDir(projectId);
    QProcess p;
    p.setWorkingDirectory(dir);
    p.start(QStringLiteral("git"), {QStringLiteral("checkout"), hash, QStringLiteral("--"),
                                   QStringLiteral("project.json")});
    p.waitForFinished(10000);
    return QString::fromUtf8(QFile(dir + QStringLiteral("/project.json")).readAll());
}

QString WebBridge::gitRead(const QString& projectId)
{
    const QString file = projectDir(projectId) + QStringLiteral("/project.json");
    if (!QFile::exists(file))
        return QString();
    return QString::fromUtf8(QFile(file).readAll());
}

QJsonArray WebBridge::gitBranches(const QString& projectId)
{
    QJsonArray out;
    if (!gitAvailable())
        return out;
    const QString dir = projectDir(projectId);
    ensureGitRepo(dir);
    QProcess p;
    p.setWorkingDirectory(dir);
    p.start(QStringLiteral("git"), {QStringLiteral("branch")});
    p.waitForFinished(5000);
    for (const QString& line : QString::fromUtf8(p.readAllStandardOutput()).split('\n', Qt::SkipEmptyParts)) {
        const bool cur = line.startsWith('*');
        out.append(QJsonObject{
            {QStringLiteral("name"), line.mid(cur ? 2 : 0).trimmed()},
            {QStringLiteral("current"), cur}
        });
    }
    return out;
}

QJsonObject WebBridge::gitCreateBranch(const QString& projectId, const QString& branchName)
{
    if (!gitAvailable())
        return {{QStringLiteral("ok"), false}, {QStringLiteral("reason"), QStringLiteral("git_unavailable")}};
    const QString dir = projectDir(projectId);
    QString safe = branchName;
    safe.replace(QRegularExpression(QStringLiteral("[^a-zA-Z0-9._\\-]")), QStringLiteral("-"));
    safe = safe.left(80);
    QProcess p;
    p.setWorkingDirectory(dir);
    p.start(QStringLiteral("git"), {QStringLiteral("checkout"), QStringLiteral("-b"), safe});
    p.waitForFinished(10000);
    return {{QStringLiteral("ok"), true}, {QStringLiteral("branchName"), safe}};
}

QJsonObject WebBridge::gitSwitchBranch(const QString& projectId, const QString& branchName)
{
    if (!gitAvailable())
        return {{QStringLiteral("ok"), false}, {QStringLiteral("reason"), QStringLiteral("git_unavailable")}};
    const QString dir = projectDir(projectId);
    QString safe = branchName;
    safe.replace(QRegularExpression(QStringLiteral("[^a-zA-Z0-9._\\-]")), QStringLiteral("-"));
    safe = safe.left(80);
    QProcess p;
    p.setWorkingDirectory(dir);
    p.start(QStringLiteral("git"), {QStringLiteral("checkout"), safe});
    p.waitForFinished(10000);
    return {{QStringLiteral("ok"), true}};
}

} // namespace app
