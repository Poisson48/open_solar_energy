#pragma once

#include <QObject>
#include <QVariantList>
#include <QVariantMap>

namespace ose {

/** Orchestration parcours installateur : fingerprint, quote, invalidation. */
class ProjectPipeline : public QObject {
    Q_OBJECT
public:
    explicit ProjectPipeline(QObject* parent = nullptr);

    /** Empreinte des entrées qui invalident les résultats calculés. */
    Q_INVOKABLE QString fingerprint(const QVariantMap& project) const;

    /** Parties lisibles de l’empreinte (pour diagnostic / affichage). */
    Q_INVOKABLE QVariantMap fingerprintParts(const QVariantMap& project) const;

    /** True si resultsFingerprint du projet ne match plus les entrées. */
    Q_INVOKABLE bool isStale(const QVariantMap& project) const;

    /**
     * Diagnostic UI : { stale, summary, changes[], actions[{tab,label}], canRefresh }.
     * Explique quoi a changé et quels onglets recalculer.
     */
    Q_INVOKABLE QVariantMap staleDiagnosis(const QVariantMap& project) const;


    /** Construit les lignes de devis à partir du projet (sizing/offgrid/grid/catalog). */
    Q_INVOKABLE QVariantList buildQuoteLines(const QVariantMap& project) const;

    /** Résumé chantier pour PDF / UI. */
    Q_INVOKABLE QVariantMap buildQuoteMeta(const QVariantMap& project) const;

    /** Nombre de panneaux estimé depuis Ppeak et Wp catalogue. */
    Q_INVOKABLE int estimatePanelCount(double Ppeak, double panelWp = 400) const;

    /** Applique pertes ombrage mensuelles à une liste E_month. */
    Q_INVOKABLE QVariantList applyMonthlyShade(const QVariantList& eMonth,
                                               const QVariantList& monthlyLoss) const;
};

} // namespace ose
