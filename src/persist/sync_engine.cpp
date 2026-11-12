#include "sync_engine.h"

#include "catalog_store.h"
#include "project_store.h"
#include "snapshot_history.h"
#include "sync_paths.h"

#include <QDateTime>
#include <QDir>
#include <QFile>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QSet>
#include <QSysInfo>
#include <QTemporaryDir>
#include <QUuid>

namespace ose {
namespace {

const QSet<QString> kOrientationFormKeys = {
    QStringLiteral("tilt"),
    QStringLiteral("azimuth"),
    QStringLiteral("terrainElev"),
    QStringLiteral("trackerType"),
};

void applySizingGroup(QJsonObject& dest, const QJsonObject& src)
{
    const QJsonObject srcFs = src.value(QStringLiteral("formState")).toObject();
    QJsonObject dstFs = dest.value(QStringLiteral("formState")).toObject();
    for (auto it = srcFs.begin(); it != srcFs.end(); ++it) {
        if (!kOrientationFormKeys.contains(it.key()))
            dstFs.insert(it.key(), it.value());
    }
    dest.insert(QStringLiteral("formState"), dstFs);
    if (src.contains(QStringLiteral("bill")))
        dest.insert(QStringLiteral("bill"), src.value(QStringLiteral("bill")));
}

QString deviceLabel()
{
    const QString host = QSysInfo::machineHostName();
    return host.isEmpty() ? QStringLiteral("device") : host;
}

} // namespace

SyncEngine::SyncEngine(QObject* parent) : QObject(parent) {}

void SyncEngine::setStores(ProjectStore* projects, CatalogStore* catalog, SnapshotHistory* history)
{
    m_projects = projects;
    m_catalog = catalog;
    m_history = history;
}

void SyncEngine::setError(const QString& e) const
{
    m_lastError = e;
    emit const_cast<SyncEngine*>(this)->lastErrorChanged();
}

void SyncEngine::setStatus(const QString& s) const
{
    m_status = s;
    emit const_cast<SyncEngine*>(this)->statusChanged();
}

QVariantList SyncEngine::groupCatalog() const
{
    QVariantList out;
    for (const SyncGroupInfo& g : syncGroupCatalog()) {
        QVariantMap m;
        m.insert(QStringLiteral("id"), g.id);
        m.insert(QStringLiteral("label"), g.label);
        out.append(m);
    }
    return out;
}

QVariantMap SyncEngine::localSelectionTree() const
{
    QVariantMap root;
    root.insert(QStringLiteral("catalogsPanels"), m_catalog && m_catalog->userPanelCount() > 0);
    root.insert(QStringLiteral("catalogsInverters"), m_catalog && m_catalog->userInverterCount() > 0);
    QVariantList projects;
    if (m_projects) {
        for (const QString& id : m_projects->projectIds()) {
            const QJsonObject o = m_projects->projectObject(id);
            QVariantMap p;
            p.insert(QStringLiteral("id"), id);
            p.insert(QStringLiteral("name"), o.value(QStringLiteral("name")).toString());
            p.insert(QStringLiteral("updatedAt"), o.value(QStringLiteral("updatedAt")).toString());
            projects.append(p);
        }
    }
    root.insert(QStringLiteral("projects"), projects);
    root.insert(QStringLiteral("groups"), groupCatalog());
    return root;
}

QVariantMap SyncEngine::selectionAll(bool includeHistory) const
{
    QVariantMap sel;
    sel.insert(QStringLiteral("catalogsPanels"), true);
    sel.insert(QStringLiteral("catalogsInverters"), true);
    QVariantMap projects;
    QStringList allGroups;
    for (const SyncGroupInfo& g : syncGroupCatalog()) {
        if (g.id == QLatin1String(SyncGroup::History) && !includeHistory)
            continue;
        allGroups.append(g.id);
    }
    if (m_projects) {
        for (const QString& id : m_projects->projectIds()) {
            QVariantMap entry;
            entry.insert(QStringLiteral("groups"), allGroups);
            entry.insert(QStringLiteral("history"), includeHistory);
            projects.insert(id, entry);
        }
    }
    sel.insert(QStringLiteral("projects"), projects);
    return sel;
}

QJsonObject SyncEngine::mergeProjectGroups(const QJsonObject& destIn, const QJsonObject& src,
                                          const QStringList& groups)
{
    QJsonObject dest = destIn;
    if (dest.isEmpty()) {
        dest.insert(QStringLiteral("id"), src.value(QStringLiteral("id")));
        dest.insert(QStringLiteral("name"), src.value(QStringLiteral("name")));
        dest.insert(QStringLiteral("installType"),
                    src.value(QStringLiteral("installType")).toString(QStringLiteral("grid")));
        dest.insert(QStringLiteral("formState"), QJsonObject{});
        dest.insert(QStringLiteral("createdAt"), src.value(QStringLiteral("createdAt")));
    }

    for (const QString& g : groups) {
        if (g == QLatin1String(SyncGroup::History))
            continue;
        if (g == QLatin1String(SyncGroup::Sizing)) {
            applySizingGroup(dest, src);
            continue;
        }
        for (const QString& path : syncGroupPaths(g)) {
            const QJsonValue v = jsonGetPath(src, path);
            if (!v.isUndefined() && !v.isNull())
                jsonSetPath(dest, path, v);
            else if (src.contains(path.split(QLatin1Char('.')).first()) && !path.contains(QLatin1Char('.')))
                jsonSetPath(dest, path, src.value(path));
        }
    }

    // Toujours conserver id source
    if (src.contains(QStringLiteral("id")))
        dest.insert(QStringLiteral("id"), src.value(QStringLiteral("id")));
    dest.insert(QStringLiteral("updatedAt"), QDateTime::currentDateTimeUtc().toString(Qt::ISODate));
    return dest;
}

SyncBundle SyncEngine::buildBundleInternal(const SyncSelection& sel) const
{
    SyncBundle bundle;
    QJsonObject manifest;
    manifest.insert(QStringLiteral("version"), 1);
    manifest.insert(QStringLiteral("format"), QStringLiteral("osebundle"));
    manifest.insert(QStringLiteral("createdAt"), QDateTime::currentDateTimeUtc().toString(Qt::ISODate));
    manifest.insert(QStringLiteral("deviceId"), QUuid::createUuid().toString(QUuid::WithoutBraces));
    manifest.insert(QStringLiteral("deviceLabel"), deviceLabel());
    manifest.insert(QStringLiteral("selection"), QJsonObject::fromVariantMap(sel.toVariantMap()));

    QJsonArray projectIds;
    if (m_projects) {
        for (auto it = sel.projectGroups.constBegin(); it != sel.projectGroups.constEnd(); ++it) {
            const QString id = it.key();
            const QJsonObject proj = m_projects->projectObject(id);
            if (proj.isEmpty())
                continue;
            const QByteArray json =
                QJsonDocument(proj).toJson(QJsonDocument::Compact);
            bundle.put(QStringLiteral("projects/%1.json").arg(id), json);
            projectIds.append(id);

            if (sel.wantsHistory(id) && m_history && m_history->gitAvailable()) {
                QTemporaryDir tmp;
                if (tmp.isValid()) {
                    const QString bundlePath = tmp.path() + QStringLiteral("/repo.bundle");
                    if (m_history->exportGitBundle(id, bundlePath)) {
                        QFile f(bundlePath);
                        if (f.open(QIODevice::ReadOnly))
                            bundle.put(QStringLiteral("git/%1.bundle").arg(id), f.readAll());
                    }
                }
            }
        }
    }
    manifest.insert(QStringLiteral("projectIds"), projectIds);

    if (sel.catalogsPanels && m_catalog) {
        bundle.put(QStringLiteral("catalogs/panels.json"),
                   QJsonDocument(m_catalog->userPanelsArray()).toJson(QJsonDocument::Compact));
    }
    if (sel.catalogsInverters && m_catalog) {
        bundle.put(QStringLiteral("catalogs/inverters.json"),
                   QJsonDocument(m_catalog->userInvertersArray()).toJson(QJsonDocument::Compact));
    }

    bundle.put(QStringLiteral("manifest.json"),
               QJsonDocument(manifest).toJson(QJsonDocument::Indented));
    return bundle;
}

QByteArray SyncEngine::buildBundle(const QVariantMap& selection) const
{
    setError({});
    if (!m_projects) {
        setError(QStringLiteral("Stores non initialisés"));
        return {};
    }
    const SyncSelection sel = SyncSelection::fromVariantMap(selection);
    if (sel.isEmpty()) {
        setError(QStringLiteral("Sélection vide"));
        return {};
    }
    const SyncBundle bundle = buildBundleInternal(sel);
    setStatus(QStringLiteral("Bundle prêt"));
    return bundle.toZipBytes();
}

QVariantMap SyncEngine::previewBundle(const QByteArray& zipBytes) const
{
    setError({});
    SyncBundle bundle;
    if (!bundle.fromZipBytes(zipBytes)) {
        setError(QStringLiteral("Bundle illisible"));
        return {};
    }
    const QJsonObject manifest =
        QJsonDocument::fromJson(bundle.get(QStringLiteral("manifest.json"))).object();
    QVariantMap out;
    out.insert(QStringLiteral("version"), manifest.value(QStringLiteral("version")).toInt());
    out.insert(QStringLiteral("createdAt"), manifest.value(QStringLiteral("createdAt")).toString());
    out.insert(QStringLiteral("deviceLabel"), manifest.value(QStringLiteral("deviceLabel")).toString());
    out.insert(QStringLiteral("selection"),
               manifest.value(QStringLiteral("selection")).toObject().toVariantMap());
    out.insert(QStringLiteral("hasPanels"), bundle.contains(QStringLiteral("catalogs/panels.json")));
    out.insert(QStringLiteral("hasInverters"),
               bundle.contains(QStringLiteral("catalogs/inverters.json")));

    QVariantList projects;
    for (const QString& path : bundle.paths()) {
        if (!path.startsWith(QLatin1String("projects/")) || !path.endsWith(QLatin1String(".json")))
            continue;
        const QJsonObject proj = QJsonDocument::fromJson(bundle.get(path)).object();
        QVariantMap p;
        p.insert(QStringLiteral("id"), proj.value(QStringLiteral("id")).toString());
        p.insert(QStringLiteral("name"), proj.value(QStringLiteral("name")).toString());
        p.insert(QStringLiteral("updatedAt"), proj.value(QStringLiteral("updatedAt")).toString());
        p.insert(QStringLiteral("hasHistory"),
                 bundle.contains(QStringLiteral("git/%1.bundle").arg(p.value(QStringLiteral("id")).toString())));
        projects.append(p);
    }
    out.insert(QStringLiteral("projects"), projects);
    out.insert(QStringLiteral("groups"), groupCatalog());
    return out;
}

bool SyncEngine::applyBundleInternal(const SyncBundle& bundle, const SyncSelection& sel)
{
    if (!m_projects) {
        setError(QStringLiteral("Stores non initialisés"));
        return false;
    }

    if (sel.catalogsPanels && m_catalog && bundle.contains(QStringLiteral("catalogs/panels.json"))) {
        const QJsonArray arr =
            QJsonDocument::fromJson(bundle.get(QStringLiteral("catalogs/panels.json"))).array();
        m_catalog->upsertUserPanels(arr);
    }
    if (sel.catalogsInverters && m_catalog
        && bundle.contains(QStringLiteral("catalogs/inverters.json"))) {
        const QJsonArray arr =
            QJsonDocument::fromJson(bundle.get(QStringLiteral("catalogs/inverters.json"))).array();
        m_catalog->upsertUserInverters(arr);
    }

    for (auto it = sel.projectGroups.constBegin(); it != sel.projectGroups.constEnd(); ++it) {
        const QString id = it.key();
        const QString path = QStringLiteral("projects/%1.json").arg(id);
        if (!bundle.contains(path))
            continue;
        const QJsonObject src = QJsonDocument::fromJson(bundle.get(path)).object();
        if (src.isEmpty())
            continue;

        QStringList groups = it.value();
        groups.removeAll(QString::fromUtf8(SyncGroup::History));

        // Si tous les groupes « données » (hors history) → remplacement presque complet
        // sinon merge sélectif
        QJsonObject dest = m_projects->projectObject(id);
        QJsonObject merged = mergeProjectGroups(dest, src, groups);
        if (!m_projects->replaceProjectObject(merged)) {
            setError(QStringLiteral("Échec écriture projet %1").arg(id));
            return false;
        }

        if (sel.wantsHistory(id) && m_history) {
            const QString gpath = QStringLiteral("git/%1.bundle").arg(id);
            if (bundle.contains(gpath)) {
                QTemporaryDir tmp;
                if (tmp.isValid()) {
                    const QString bf = tmp.path() + QStringLiteral("/in.bundle");
                    QFile f(bf);
                    if (f.open(QIODevice::WriteOnly)) {
                        f.write(bundle.get(gpath));
                        f.close();
                        m_history->importGitBundle(id, bf);
                    }
                }
            }
        }
    }

    setStatus(QStringLiteral("Import appliqué"));
    emit applied();
    return true;
}

bool SyncEngine::applyBundle(const QByteArray& zipBytes, const QVariantMap& selection)
{
    setError({});
    SyncBundle bundle;
    if (!bundle.fromZipBytes(zipBytes)) {
        setError(QStringLiteral("Bundle illisible"));
        return false;
    }
    SyncSelection sel = SyncSelection::fromVariantMap(selection);
    if (sel.isEmpty()) {
        const QJsonObject manifest =
            QJsonDocument::fromJson(bundle.get(QStringLiteral("manifest.json"))).object();
        sel = SyncSelection::fromVariantMap(
            manifest.value(QStringLiteral("selection")).toObject().toVariantMap());
    }
    if (sel.isEmpty()) {
        setError(QStringLiteral("Aucune sélection à appliquer"));
        return false;
    }
    return applyBundleInternal(bundle, sel);
}

} // namespace ose
