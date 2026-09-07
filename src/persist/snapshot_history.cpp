#include "snapshot_history.h"

#include <QDateTime>
#include <QDir>
#include <QFile>
#include <QJsonDocument>
#include <QJsonObject>
#include <QStandardPaths>
#include <QUuid>

namespace ose {

SnapshotHistory::SnapshotHistory(QObject* parent) : QObject(parent) {}

QString SnapshotHistory::historyDir(const QString& projectId) const
{
    const QString base = QStandardPaths::writableLocation(QStandardPaths::AppDataLocation)
                         + QStringLiteral("/history/") + projectId;
    QDir().mkpath(base);
    return base;
}

bool SnapshotHistory::saveSnapshot(const QString& projectId, const QString& json,
                                   const QString& message)
{
    if (projectId.isEmpty() || json.isEmpty())
        return false;
    const QString id = QDateTime::currentDateTimeUtc().toString(QStringLiteral("yyyyMMdd_hhmmss"))
                       + QLatin1Char('_')
                       + QUuid::createUuid().toString(QUuid::Id128).left(6);
    QJsonObject meta{{QStringLiteral("id"), id},
                     {QStringLiteral("message"), message},
                     {QStringLiteral("createdAt"),
                      QDateTime::currentDateTimeUtc().toString(Qt::ISODate)}};
    QFile mf(historyDir(projectId) + QLatin1Char('/') + id + QStringLiteral(".meta.json"));
    QFile df(historyDir(projectId) + QLatin1Char('/') + id + QStringLiteral(".json"));
    if (!mf.open(QIODevice::WriteOnly) || !df.open(QIODevice::WriteOnly))
        return false;
    mf.write(QJsonDocument(meta).toJson(QJsonDocument::Compact));
    df.write(json.toUtf8());
    return true;
}

QVariantList SnapshotHistory::list(const QString& projectId) const
{
    QVariantList out;
    QDir dir(historyDir(projectId));
    const QStringList metas = dir.entryList({QStringLiteral("*.meta.json")}, QDir::Files,
                                            QDir::Name | QDir::Reversed);
    for (const QString& name : metas) {
        QFile f(dir.filePath(name));
        if (!f.open(QIODevice::ReadOnly))
            continue;
        const QJsonObject o = QJsonDocument::fromJson(f.readAll()).object();
        out.append(o.toVariantMap());
    }
    return out;
}

QString SnapshotHistory::loadSnapshot(const QString& projectId, const QString& snapshotId) const
{
    QFile f(historyDir(projectId) + QLatin1Char('/') + snapshotId + QStringLiteral(".json"));
    if (!f.open(QIODevice::ReadOnly))
        return {};
    return QString::fromUtf8(f.readAll());
}

} // namespace ose
