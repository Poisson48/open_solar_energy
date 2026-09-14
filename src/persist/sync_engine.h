#pragma once

#include "sync_bundle.h"
#include "sync_selection.h"

#include <QJsonObject>
#include <QObject>
#include <QVariantMap>

namespace ose {

class ProjectStore;
class CatalogStore;
class SnapshotHistory;

/**
 * Construit / prévisualise / applique un .osebundle avec sélection granulaire.
 * Les chemins cochés écrasent la cible ; le reste local est conservé.
 */
class SyncEngine : public QObject {
    Q_OBJECT
    Q_PROPERTY(QString lastError READ lastError NOTIFY lastErrorChanged)
    Q_PROPERTY(QString status READ status NOTIFY statusChanged)

public:
    explicit SyncEngine(QObject* parent = nullptr);

    void setStores(ProjectStore* projects, CatalogStore* catalog, SnapshotHistory* history);

    QString lastError() const { return m_lastError; }
    QString status() const { return m_status; }

    /** Groupes disponibles pour l’UI (id + label). */
    Q_INVOKABLE QVariantList groupCatalog() const;

    /** Arbre local pour cocher (projets + catalogues). */
    Q_INVOKABLE QVariantMap localSelectionTree() const;

    /** Construit le bundle selon la sélection (bytes ZIP). */
    Q_INVOKABLE QByteArray buildBundle(const QVariantMap& selection) const;

    /** Aperçu du contenu distant (noms projets, flags catalogues). */
    Q_INVOKABLE QVariantMap previewBundle(const QByteArray& zipBytes) const;

    /**
     * Applique le bundle : seuls les éléments de `selection` sont écrasés localement.
     * Si selection est vide, utilise la sélection embarquée dans le manifest.
     */
    Q_INVOKABLE bool applyBundle(const QByteArray& zipBytes, const QVariantMap& selection = {});

    /** Sélection « tout » à partir de l’arbre local (sans historique git par défaut). */
    Q_INVOKABLE QVariantMap selectionAll(bool includeHistory = false) const;

    /** Merge d’un projet source → dest selon groupes (exposé pour tests). */
    static QJsonObject mergeProjectGroups(const QJsonObject& dest, const QJsonObject& src,
                                          const QStringList& groups);

signals:
    void lastErrorChanged();
    void statusChanged();
    void applied();

private:
    void setError(const QString& e) const;
    void setStatus(const QString& s) const;
    SyncBundle buildBundleInternal(const SyncSelection& sel) const;
    bool applyBundleInternal(const SyncBundle& bundle, const SyncSelection& sel);

    ProjectStore* m_projects = nullptr;
    CatalogStore* m_catalog = nullptr;
    SnapshotHistory* m_history = nullptr;
    mutable QString m_lastError;
    mutable QString m_status;
};

} // namespace ose
