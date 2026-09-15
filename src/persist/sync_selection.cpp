#include "sync_selection.h"

#include <QHash>
#include <QVariant>

namespace ose {

QList<SyncGroupInfo> syncGroupCatalog()
{
    return {
        {QString::fromUtf8(SyncGroup::Meta), QStringLiteral("Méta")},
        {QString::fromUtf8(SyncGroup::Location), QStringLiteral("Lieu")},
        {QString::fromUtf8(SyncGroup::Weather), QStringLiteral("Météo")},
        {QString::fromUtf8(SyncGroup::Orientation), QStringLiteral("Orientation")},
        {QString::fromUtf8(SyncGroup::SiteSurvey), QStringLiteral("Diagramme solaire / ombrage")},
        {QString::fromUtf8(SyncGroup::Layout), QStringLiteral("Implantation")},
        {QString::fromUtf8(SyncGroup::Sizing), QStringLiteral("Dimensionnement / matériel")},
        {QString::fromUtf8(SyncGroup::Consumption), QStringLiteral("Conso")},
        {QString::fromUtf8(SyncGroup::Results), QStringLiteral("Résultats")},
        {QString::fromUtf8(SyncGroup::Quote), QStringLiteral("Devis")},
        {QString::fromUtf8(SyncGroup::History), QStringLiteral("Historique Git")},
    };
}

QStringList syncGroupPaths(const QString& groupId)
{
    if (groupId == QLatin1String(SyncGroup::Meta))
        return {QStringLiteral("name"), QStringLiteral("client"), QStringLiteral("installType"),
                QStringLiteral("createdAt")};
    if (groupId == QLatin1String(SyncGroup::Location))
        return {QStringLiteral("location"), QStringLiteral("terrain")};
    if (groupId == QLatin1String(SyncGroup::Weather))
        return {QStringLiteral("weatherData"), QStringLiteral("weatherMeta"),
                QStringLiteral("pvgisPvcalc"), QStringLiteral("pvsystBalances")};
    if (groupId == QLatin1String(SyncGroup::Orientation))
        return {QStringLiteral("formState.tilt"), QStringLiteral("formState.azimuth"),
                QStringLiteral("formState.terrainElev"), QStringLiteral("formState.trackerType")};
    if (groupId == QLatin1String(SyncGroup::SiteSurvey))
        return {QStringLiteral("siteSurvey")};
    if (groupId == QLatin1String(SyncGroup::Layout))
        return {QStringLiteral("layout")};
    if (groupId == QLatin1String(SyncGroup::Consumption))
        return {QStringLiteral("enedisImport"), QStringLiteral("monthlyKwh")};
    if (groupId == QLatin1String(SyncGroup::Results))
        return {QStringLiteral("sizingResult"), QStringLiteral("offgridResult"),
                QStringLiteral("gridResult"), QStringLiteral("hourlyResult"),
                QStringLiteral("hourlyYear"), QStringLiteral("horizonResult"),
                QStringLiteral("cableResult"), QStringLiteral("resultsFingerprint"),
                QStringLiteral("resultsBasis"), QStringLiteral("summary")};
    if (groupId == QLatin1String(SyncGroup::Quote))
        return {QStringLiteral("quoteLines"), QStringLiteral("quoteMeta"),
                QStringLiteral("quoteExtraLines")};
    return {};
}

SyncSelection SyncSelection::fromVariantMap(const QVariantMap& m)
{
    SyncSelection s;
    s.catalogsPanels = m.value(QStringLiteral("catalogsPanels")).toBool();
    s.catalogsInverters = m.value(QStringLiteral("catalogsInverters")).toBool();
    const QVariantMap projects = m.value(QStringLiteral("projects")).toMap();
    for (auto it = projects.constBegin(); it != projects.constEnd(); ++it) {
        const QVariantMap entry = it.value().toMap();
        QStringList groups = entry.value(QStringLiteral("groups")).toStringList();
        if (entry.value(QStringLiteral("history")).toBool()
            && !groups.contains(QLatin1String(SyncGroup::History)))
            groups.append(QString::fromUtf8(SyncGroup::History));
        // Also accept groups as QVariantList
        if (groups.isEmpty()) {
            const QVariantList gl = entry.value(QStringLiteral("groups")).toList();
            for (const QVariant& g : gl)
                groups.append(g.toString());
        }
        groups.removeAll(QString());
        if (!groups.isEmpty())
            s.projectGroups.insert(it.key(), groups);
    }
    return s;
}

QVariantMap SyncSelection::toVariantMap() const
{
    QVariantMap m;
    m.insert(QStringLiteral("catalogsPanels"), catalogsPanels);
    m.insert(QStringLiteral("catalogsInverters"), catalogsInverters);
    QVariantMap projects;
    for (auto it = projectGroups.constBegin(); it != projectGroups.constEnd(); ++it) {
        QVariantMap entry;
        QStringList groups = it.value();
        const bool hist = groups.contains(QLatin1String(SyncGroup::History));
        groups.removeAll(QString::fromUtf8(SyncGroup::History));
        entry.insert(QStringLiteral("groups"), groups);
        entry.insert(QStringLiteral("history"), hist);
        projects.insert(it.key(), entry);
    }
    m.insert(QStringLiteral("projects"), projects);
    return m;
}

bool SyncSelection::isEmpty() const
{
    return !catalogsPanels && !catalogsInverters && projectGroups.isEmpty();
}

bool SyncSelection::hasProject(const QString& id) const
{
    return projectGroups.contains(id) && !projectGroups.value(id).isEmpty();
}

QStringList SyncSelection::groupsFor(const QString& id) const
{
    return projectGroups.value(id);
}

bool SyncSelection::wantsHistory(const QString& id) const
{
    return projectGroups.value(id).contains(QLatin1String(SyncGroup::History));
}

} // namespace ose
