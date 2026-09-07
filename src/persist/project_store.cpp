#include "project_store.h"

#include <QDateTime>
#include <QDir>
#include <QFile>
#include <QJsonDocument>
#include <QRandomGenerator>
#include <QStandardPaths>

#include <algorithm>

namespace ose {

ProjectStore::ProjectStore(QObject* parent) : QAbstractListModel(parent) {}

int ProjectStore::rowCount(const QModelIndex& parent) const
{
    if (parent.isValid())
        return 0;
    return m_projects.size();
}

QHash<int, QByteArray> ProjectStore::roleNames() const
{
    return {
        {IdRole, "projectId"},
        {NameRole, "name"},
        {InstallTypeRole, "installType"},
        {LocationRole, "locationLabel"},
        {UpdatedAtRole, "updatedAt"},
        {ClientRole, "client"},
        {IsDemoRole, "isDemo"},
        {SummaryRole, "summary"},
    };
}

QVariant ProjectStore::data(const QModelIndex& index, int role) const
{
    if (!index.isValid() || index.row() < 0 || index.row() >= m_projects.size())
        return {};
    const QJsonObject o = m_projects.at(index.row()).toObject();
    switch (role) {
    case IdRole:
        return o.value(QStringLiteral("id")).toString();
    case NameRole:
        return o.value(QStringLiteral("name")).toString();
    case InstallTypeRole:
        return o.value(QStringLiteral("installType")).toString(QStringLiteral("grid"));
    case LocationRole: {
        const QJsonObject loc = o.value(QStringLiteral("location")).toObject();
        const QString n = loc.value(QStringLiteral("name")).toString();
        if (!n.isEmpty())
            return n;
        if (loc.contains(QStringLiteral("lat")))
            return QStringLiteral("%1, %2")
                .arg(loc.value(QStringLiteral("lat")).toDouble(), 0, 'f', 3)
                .arg(loc.value(QStringLiteral("lon")).toDouble(), 0, 'f', 3);
        return QStringLiteral("—");
    }
    case UpdatedAtRole:
        return o.value(QStringLiteral("updatedAt")).toString();
    case ClientRole:
        return o.value(QStringLiteral("client")).toString();
    case IsDemoRole:
        return o.value(QStringLiteral("isDemo")).toBool();
    case SummaryRole:
        return o.value(QStringLiteral("summary")).toObject().toVariantMap();
    default:
        return {};
    }
}

QVariantMap ProjectStore::currentProject() const
{
    const int i = indexOfId(m_currentId);
    if (i < 0)
        return {};
    return m_projects.at(i).toObject().toVariantMap();
}

QString ProjectStore::backupPath() const
{
    const QString dir = QStandardPaths::writableLocation(QStandardPaths::AppDataLocation);
    QDir().mkpath(dir);
    return dir + QStringLiteral("/projects_backup.json");
}

QString ProjectStore::newId() const
{
    return QStringLiteral("proj_%1_%2")
        .arg(QDateTime::currentMSecsSinceEpoch())
        .arg(QRandomGenerator::global()->bounded(0x10000), 4, 16, QLatin1Char('0'));
}

int ProjectStore::indexOfId(const QString& id) const
{
    for (int i = 0; i < m_projects.size(); ++i) {
        if (m_projects.at(i).toObject().value(QStringLiteral("id")).toString() == id)
            return i;
    }
    return -1;
}

void ProjectStore::sortByUpdated()
{
    QVector<QJsonObject> objs;
    objs.reserve(m_projects.size());
    for (const QJsonValue& v : m_projects)
        objs.append(v.toObject());
    std::sort(objs.begin(), objs.end(), [](const QJsonObject& a, const QJsonObject& b) {
        return a.value(QStringLiteral("updatedAt")).toString()
               > b.value(QStringLiteral("updatedAt")).toString();
    });
    m_projects = QJsonArray();
    for (const QJsonObject& o : objs)
        m_projects.append(o);
}

bool ProjectStore::load()
{
    beginResetModel();
    m_projects = QJsonArray();
    QFile f(backupPath());
    if (f.open(QIODevice::ReadOnly)) {
        QJsonParseError err;
        const QJsonDocument doc = QJsonDocument::fromJson(f.readAll(), &err);
        if (err.error == QJsonParseError::NoError && doc.isArray())
            m_projects = doc.array();
    }
    sortByUpdated();
    endResetModel();
    emit countChanged();
    seedDemosIfEmpty();
    return true;
}

bool ProjectStore::saveAll()
{
    sortByUpdated();
    QFile f(backupPath());
    if (!f.open(QIODevice::WriteOnly | QIODevice::Truncate)) {
        emit errorOccurred(QStringLiteral("Impossible d'écrire la sauvegarde projets"));
        return false;
    }
    f.write(QJsonDocument(m_projects).toJson(QJsonDocument::Compact));
    emit countChanged();
    // refresh model order
    beginResetModel();
    endResetModel();
    return true;
}

void ProjectStore::seedDemosIfEmpty()
{
    if (!m_projects.isEmpty())
        return;
    const QString now = QDateTime::currentDateTimeUtc().toString(Qt::ISODate);
    QJsonObject demo;
    demo.insert(QStringLiteral("id"), QStringLiteral("demo_ose_v2"));
    demo.insert(QStringLiteral("name"), QStringLiteral("Démo — Maison Toulouse"));
    demo.insert(QStringLiteral("installType"), QStringLiteral("grid"));
    demo.insert(QStringLiteral("isDemo"), true);
    demo.insert(QStringLiteral("createdAt"), now);
    demo.insert(QStringLiteral("updatedAt"), now);
    demo.insert(QStringLiteral("client"), QStringLiteral("Client démo"));
    demo.insert(QStringLiteral("location"),
                QJsonObject{{QStringLiteral("name"), QStringLiteral("Toulouse")},
                            {QStringLiteral("lat"), 43.6045},
                            {QStringLiteral("lon"), 1.444},
                            {QStringLiteral("alt"), 150}});
    demo.insert(QStringLiteral("formState"), QJsonObject{
                                                 {QStringLiteral("tilt"), 30},
                                                 {QStringLiteral("azimuth"), 0},
                                                 {QStringLiteral("losses"), 14},
                                                 {QStringLiteral("Ppeak"), 3},
                                             });
    beginInsertRows({}, 0, 0);
    m_projects.append(demo);
    endInsertRows();
    saveAll();
    emit countChanged();
}

QString ProjectStore::createProject(const QString& name, const QString& installType,
                                    const QString& client)
{
    const QString now = QDateTime::currentDateTimeUtc().toString(Qt::ISODate);
    QJsonObject o;
    o.insert(QStringLiteral("id"), newId());
    o.insert(QStringLiteral("name"), name.isEmpty() ? QStringLiteral("Nouveau projet") : name);
    o.insert(QStringLiteral("installType"),
             installType.isEmpty() ? QStringLiteral("grid") : installType);
    o.insert(QStringLiteral("client"), client);
    o.insert(QStringLiteral("createdAt"), now);
    o.insert(QStringLiteral("updatedAt"), now);
    o.insert(QStringLiteral("isDemo"), false);
    o.insert(QStringLiteral("location"), QJsonObject());
    o.insert(QStringLiteral("formState"), QJsonObject());
    o.insert(QStringLiteral("weatherData"), QJsonArray());

    beginInsertRows({}, 0, 0);
    m_projects.prepend(o);
    endInsertRows();
    saveAll();
    emit countChanged();
    openProject(o.value(QStringLiteral("id")).toString());
    return o.value(QStringLiteral("id")).toString();
}

bool ProjectStore::openProject(const QString& id)
{
    if (indexOfId(id) < 0)
        return false;
    m_currentId = id;
    emit currentChanged();
    return true;
}

bool ProjectStore::removeProject(const QString& id)
{
    const int i = indexOfId(id);
    if (i < 0)
        return false;
    beginRemoveRows({}, i, i);
    m_projects.removeAt(i);
    endRemoveRows();
    if (m_currentId == id) {
        m_currentId.clear();
        emit currentChanged();
    }
    saveAll();
    emit countChanged();
    return true;
}

QString ProjectStore::cloneProject(const QString& id, const QString& newName)
{
    const int i = indexOfId(id);
    if (i < 0)
        return {};
    QJsonObject copy = m_projects.at(i).toObject();
    const QString now = QDateTime::currentDateTimeUtc().toString(Qt::ISODate);
    copy.insert(QStringLiteral("id"), newId());
    copy.insert(QStringLiteral("name"),
                newName.isEmpty()
                    ? copy.value(QStringLiteral("name")).toString() + QStringLiteral(" (copie)")
                    : newName);
    copy.insert(QStringLiteral("isDemo"), false);
    copy.insert(QStringLiteral("createdAt"), now);
    copy.insert(QStringLiteral("updatedAt"), now);
    copy.remove(QStringLiteral("share"));
    beginInsertRows({}, 0, 0);
    m_projects.prepend(copy);
    endInsertRows();
    saveAll();
    emit countChanged();
    return copy.value(QStringLiteral("id")).toString();
}

bool ProjectStore::updateCurrent(const QVariantMap& patch)
{
    const int i = indexOfId(m_currentId);
    if (i < 0)
        return false;
    QJsonObject o = m_projects.at(i).toObject();
    for (auto it = patch.begin(); it != patch.end(); ++it)
        o.insert(it.key(), QJsonValue::fromVariant(it.value()));
    o.insert(QStringLiteral("updatedAt"), QDateTime::currentDateTimeUtc().toString(Qt::ISODate));
    m_projects.replace(i, o);
    const QModelIndex idx = index(i);
    emit dataChanged(idx, idx);
    emit currentChanged();
    return saveAll();
}

bool ProjectStore::setCurrentField(const QString& key, const QVariant& value)
{
    return updateCurrent({{key, value}});
}

bool ProjectStore::closeCurrent()
{
    m_currentId.clear();
    emit currentChanged();
    return true;
}

QString ProjectStore::exportCurrentJson() const
{
    const int i = indexOfId(m_currentId);
    if (i < 0)
        return {};
    return QString::fromUtf8(
        QJsonDocument(m_projects.at(i).toObject()).toJson(QJsonDocument::Indented));
}

bool ProjectStore::importProjectJson(const QString& json)
{
    QJsonParseError err;
    const QJsonDocument doc = QJsonDocument::fromJson(json.toUtf8(), &err);
    if (err.error != QJsonParseError::NoError || !doc.isObject()) {
        emit errorOccurred(QStringLiteral("JSON projet invalide"));
        return false;
    }
    QJsonObject o = doc.object();
    if (!o.contains(QStringLiteral("id")))
        o.insert(QStringLiteral("id"), newId());
    o.insert(QStringLiteral("updatedAt"), QDateTime::currentDateTimeUtc().toString(Qt::ISODate));
    const int existing = indexOfId(o.value(QStringLiteral("id")).toString());
    if (existing >= 0) {
        m_projects.replace(existing, o);
        emit dataChanged(index(existing), index(existing));
    } else {
        beginInsertRows({}, 0, 0);
        m_projects.prepend(o);
        endInsertRows();
    }
    saveAll();
    emit countChanged();
    openProject(o.value(QStringLiteral("id")).toString());
    return true;
}

} // namespace ose
