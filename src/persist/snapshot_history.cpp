#include "snapshot_history.h"

#include <QDateTime>
#include <QDir>
#include <QFile>
#include <QProcess>
#include <QRegularExpression>
#include <QStandardPaths>

namespace ose {

SnapshotHistory::SnapshotHistory(QObject* parent) : QObject(parent) {}

QString SnapshotHistory::safeId(const QString& projectId) const
{
    QString id = projectId;
    id.replace(QRegularExpression(QStringLiteral("[^a-zA-Z0-9_\\-]")), QStringLiteral("_"));
    return id.isEmpty() ? QStringLiteral("unknown") : id;
}

QString SnapshotHistory::safeBranch(const QString& name) const
{
    QString b = name.trimmed();
    b.replace(QRegularExpression(QStringLiteral("[^a-zA-Z0-9._\\-]")), QStringLiteral("-"));
    while (b.startsWith(QLatin1Char('-')))
        b.remove(0, 1);
    while (b.endsWith(QLatin1Char('-')))
        b.chop(1);
    if (b.isEmpty())
        b = QStringLiteral("main");
    return b.left(80);
}

QString SnapshotHistory::repoDir(const QString& projectId) const
{
    const QString base = QStandardPaths::writableLocation(QStandardPaths::AppDataLocation)
                         + QStringLiteral("/ose-git/") + safeId(projectId);
    QDir().mkpath(base);
    return base;
}

bool SnapshotHistory::gitAvailable() const
{
    QProcess p;
    p.start(QStringLiteral("git"), {QStringLiteral("--version")});
    if (!p.waitForFinished(3000))
        return false;
    return p.exitCode() == 0;
}

bool SnapshotHistory::runGit(const QString& projectId, const QStringList& args, QByteArray* stdoutOut,
                             QByteArray* stderrOut, int timeoutMs) const
{
    QProcess p;
    p.setWorkingDirectory(repoDir(projectId));
    p.setProcessChannelMode(QProcess::SeparateChannels);
    QProcessEnvironment env = QProcessEnvironment::systemEnvironment();
    env.insert(QStringLiteral("GIT_AUTHOR_NAME"), QStringLiteral("Open Solar Energy"));
    env.insert(QStringLiteral("GIT_AUTHOR_EMAIL"), QStringLiteral("autosave@open-solar-energy.local"));
    env.insert(QStringLiteral("GIT_COMMITTER_NAME"), QStringLiteral("Open Solar Energy"));
    env.insert(QStringLiteral("GIT_COMMITTER_EMAIL"), QStringLiteral("autosave@open-solar-energy.local"));
    p.setProcessEnvironment(env);
    p.start(QStringLiteral("git"), args);
    if (!p.waitForFinished(timeoutMs)) {
        p.kill();
        return false;
    }
    if (stdoutOut)
        *stdoutOut = p.readAllStandardOutput();
    if (stderrOut)
        *stderrOut = p.readAllStandardError();
    return p.exitCode() == 0;
}

bool SnapshotHistory::ensureRepo(const QString& projectId) const
{
    if (!gitAvailable() || projectId.isEmpty())
        return false;
    const QString dir = repoDir(projectId);
    if (!QDir(dir + QStringLiteral("/.git")).exists()) {
        QProcess p;
        p.setWorkingDirectory(dir);
        p.start(QStringLiteral("git"), {QStringLiteral("init"), QStringLiteral("-b"), QStringLiteral("main")});
        if (!p.waitForFinished(5000) || p.exitCode() != 0) {
            // git ancien sans -b
            p.start(QStringLiteral("git"), {QStringLiteral("init")});
            if (!p.waitForFinished(5000) || p.exitCode() != 0)
                return false;
            runGit(projectId, {QStringLiteral("checkout"), QStringLiteral("-b"), QStringLiteral("main")});
        }
        runGit(projectId, {QStringLiteral("config"), QStringLiteral("user.name"),
                           QStringLiteral("Open Solar Energy")});
        runGit(projectId, {QStringLiteral("config"), QStringLiteral("user.email"),
                           QStringLiteral("autosave@open-solar-energy.local")});
    }
    m_lastProjectId = projectId;
    return true;
}

bool SnapshotHistory::saveSnapshot(const QString& projectId, const QString& json,
                                   const QString& message)
{
    if (projectId.isEmpty() || json.isEmpty())
        return false;
    if (!ensureRepo(projectId))
        return false;

    const QString dir = repoDir(projectId);
    {
        QFile f(dir + QStringLiteral("/project.json"));
        if (!f.open(QIODevice::WriteOnly | QIODevice::Truncate))
            return false;
        f.write(json.toUtf8());
    }
    {
        // Garantit un commit même si le JSON est identique (comme .ose-stamp web)
        QFile s(dir + QStringLiteral("/.ose-stamp"));
        if (s.open(QIODevice::WriteOnly | QIODevice::Truncate)) {
            s.write(QByteArray::number(QDateTime::currentMSecsSinceEpoch()) + '\n');
            s.write(message.toUtf8().left(120) + '\n');
        }
    }

    if (!runGit(projectId, {QStringLiteral("add"), QStringLiteral("project.json"),
                            QStringLiteral(".ose-stamp")}))
        return false;

    const QString msg = message.trimmed().isEmpty() ? QStringLiteral("Sauvegarde") : message.trimmed().left(200);
    if (!runGit(projectId, {QStringLiteral("commit"), QStringLiteral("-m"), msg}))
        return false;

    emit historyChanged();
    return true;
}

QVariantList SnapshotHistory::list(const QString& projectId) const
{
    QVariantList out;
    if (!ensureRepo(projectId))
        return out;

    QByteArray stdoutOut;
    // format: hash<TAB>iso-date<TAB>subject
    if (!runGit(projectId,
                {QStringLiteral("log"), QStringLiteral("-n"), QStringLiteral("80"),
                 QStringLiteral("--pretty=format:%H\t%aI\t%s")},
                &stdoutOut)) {
        return out;
    }

    const QList<QByteArray> lines = stdoutOut.split('\n');
    for (const QByteArray& line : lines) {
        if (line.trimmed().isEmpty())
            continue;
        const QList<QByteArray> parts = line.split('\t');
        if (parts.size() < 3)
            continue;
        const QString hash = QString::fromUtf8(parts[0]);
        const QString date = QString::fromUtf8(parts[1]);
        QString message = QString::fromUtf8(parts.mid(2).join('\t'));
        out.append(QVariantMap{
            {QStringLiteral("id"), hash},
            {QStringLiteral("hash"), hash},
            {QStringLiteral("createdAt"), date},
            {QStringLiteral("date"), date},
            {QStringLiteral("message"), message},
        });
    }
    return out;
}

QString SnapshotHistory::loadSnapshot(const QString& projectId, const QString& snapshotId) const
{
    if (!ensureRepo(projectId) || snapshotId.isEmpty())
        return {};
    QByteArray stdoutOut;
    // Lire le blob sans détacher HEAD
    if (!runGit(projectId,
                {QStringLiteral("show"), snapshotId + QStringLiteral(":project.json")},
                &stdoutOut))
        return {};
    return QString::fromUtf8(stdoutOut);
}

QString SnapshotHistory::readWorkingTree(const QString& projectId) const
{
    if (!ensureRepo(projectId))
        return {};
    QFile f(repoDir(projectId) + QStringLiteral("/project.json"));
    if (!f.open(QIODevice::ReadOnly))
        return {};
    return QString::fromUtf8(f.readAll());
}

QVariantList SnapshotHistory::branches(const QString& projectId) const
{
    QVariantList out;
    if (!ensureRepo(projectId))
        return out;

    const QString cur = currentBranch(projectId);
    QByteArray stdoutOut;
    if (!runGit(projectId, {QStringLiteral("branch"), QStringLiteral("--format=%(refname:short)")},
                &stdoutOut)) {
        if (cur.isEmpty())
            out.append(QVariantMap{{QStringLiteral("name"), QStringLiteral("main")},
                                   {QStringLiteral("current"), true}});
        return out;
    }
    const QList<QByteArray> lines = stdoutOut.split('\n');
    for (const QByteArray& line : lines) {
        const QString name = QString::fromUtf8(line).trimmed();
        if (name.isEmpty())
            continue;
        out.append(QVariantMap{
            {QStringLiteral("name"), name},
            {QStringLiteral("current"), name == cur},
        });
    }
    if (out.isEmpty())
        out.append(QVariantMap{{QStringLiteral("name"), QStringLiteral("main")},
                               {QStringLiteral("current"), true}});
    return out;
}

QString SnapshotHistory::currentBranch(const QString& projectId) const
{
    const QString pid = projectId.isEmpty() ? m_lastProjectId : projectId;
    if (pid.isEmpty() || !ensureRepo(pid))
        return QStringLiteral("main");
    QByteArray stdoutOut;
    if (!runGit(pid, {QStringLiteral("branch"), QStringLiteral("--show-current")}, &stdoutOut))
        return QStringLiteral("main");
    const QString b = QString::fromUtf8(stdoutOut).trimmed();
    return b.isEmpty() ? QStringLiteral("main") : b;
}

bool SnapshotHistory::createBranch(const QString& projectId, const QString& branchName)
{
    if (!ensureRepo(projectId))
        return false;
    const QString name = safeBranch(branchName);
    if (!runGit(projectId, {QStringLiteral("checkout"), QStringLiteral("-b"), name}))
        return false;
    emit historyChanged();
    return true;
}

bool SnapshotHistory::switchBranch(const QString& projectId, const QString& branchName)
{
    if (!ensureRepo(projectId))
        return false;
    const QString name = safeBranch(branchName);
    // Évite l’échec si working tree dirty : commit stamp ou reset soft non
    runGit(projectId, {QStringLiteral("checkout"), QStringLiteral("--"), QStringLiteral("project.json"),
                        QStringLiteral(".ose-stamp")});
    if (!runGit(projectId, {QStringLiteral("checkout"), name}))
        return false;
    emit historyChanged();
    return true;
}

} // namespace ose
