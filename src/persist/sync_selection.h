#pragma once

#include <QHash>
#include <QString>
#include <QStringList>
#include <QVariantList>
#include <QVariantMap>

namespace ose {

/** Identifiants de groupes de champs projet (sélection sync). */
namespace SyncGroup {
inline constexpr auto Meta = "meta";
inline constexpr auto Location = "location";
inline constexpr auto Weather = "weather";
inline constexpr auto Orientation = "orientation";
inline constexpr auto SiteSurvey = "siteSurvey";
inline constexpr auto Layout = "layout";
inline constexpr auto Sizing = "sizing";
inline constexpr auto Consumption = "consumption";
inline constexpr auto Results = "results";
inline constexpr auto Quote = "quote";
inline constexpr auto History = "history";
} // namespace SyncGroup

/** Métadonnées UI : id, label, chemins top-level (sauf sizing/orientation spéciaux). */
struct SyncGroupInfo {
    QString id;
    QString label;
};

QList<SyncGroupInfo> syncGroupCatalog();

/** Chemins JSON simples pour un groupe (hors sizing / orientation / history). */
QStringList syncGroupPaths(const QString& groupId);

/**
 * Sélection sync (depuis QML) :
 * {
 *   catalogsPanels: bool,
 *   catalogsInverters: bool,
 *   projects: { "<id>": { groups: ["siteSurvey", ...], history: bool } }
 * }
 */
class SyncSelection {
public:
    bool catalogsPanels = false;
    bool catalogsInverters = false;
    /** projectId → groupes cochés (+ history via SyncGroup::History dans la liste). */
    QHash<QString, QStringList> projectGroups;

    static SyncSelection fromVariantMap(const QVariantMap& m);
    QVariantMap toVariantMap() const;
    bool isEmpty() const;
    bool hasProject(const QString& id) const;
    QStringList groupsFor(const QString& id) const;
    bool wantsHistory(const QString& id) const;
};

} // namespace ose
