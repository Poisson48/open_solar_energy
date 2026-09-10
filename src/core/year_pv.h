#pragma once

#include <QObject>
#include <QVariantList>
#include <QVariantMap>
#include <QVector>

namespace ose {

/**
 * Production annuelle slot-par-slot (30 min) depuis météo horaire réelle,
 * arbre de pertes nommé, et keep d’ombrage (géométrique ou électrique).
 */
class YearPv : public QObject {
    Q_OBJECT
public:
    explicit YearPv(QObject* parent = nullptr);

    /** Facteur multiplicatif (0–1) depuis lossTree ou losses % legacy. */
    Q_INVOKABLE static double effectiveLossFactor(const QVariantMap& params);

    /** Arbre de pertes par défaut ≈ totalLossPct (défaut 14 %). */
    Q_INVOKABLE static QVariantMap defaultLossTree(double totalLossPct = 14);

    /** Yield mensuel kWh/kWc (12 valeurs) depuis météo horaire + keep. */
    Q_INVOKABLE static QVariantList monthlyYieldPerKwc(const QVariantMap& hourly,
                                                      const QVariantMap& params);

    /** Keep 0–1 pour mois 0–11 et slot 0–47 (30 min). */
    Q_INVOKABLE static double keepAt(const QVariantList& halfHourlyKeep, int month0, int slot);

    /**
     * Heuristique bypass : fraction ombrée → facteur puissance ≤ irradiance.
     * nBypass = 3 substrings typiques.
     */
    Q_INVOKABLE static double irradianceKeepToElectrical(double irrKeep, int nBypass = 3,
                                                         double aggressiveness = 1.0);

    /** Transforme une table halfHourlyKeep [12][48] en keep électrique. */
    Q_INVOKABLE static QVariantList electricalKeepTable(const QVariantList& halfHourlyKeep,
                                                        int nBypass = 3,
                                                        double aggressiveness = 1.0);

    /**
     * Construit Float32-like list de nHours×2 slots (kWh / kWc / 30 min).
     * hourly: { ghi[], dhi[], temp[], year?, lon? }
     * params: lat, tilt, azimuth, losses|lossTree, halfHourlyKeep, tech, useElectricalShade
     */
    Q_INVOKABLE static QVariantList buildYearPvSlots(const QVariantMap& hourly,
                                                     const QVariantMap& params);

    /**
     * Analyse année study : PV × Ppeak, charge synthétique ou profil, batterie optionnelle,
     * onduleur η + clipping optionnel.
     */
    Q_INVOKABLE static QVariantMap analyzeStudyYear(const QVariantMap& params);

    /**
     * Horizon multi-années en mode study : réutilise les slots année × dégradation.
     */
    Q_INVOKABLE static QVariantMap simulateHorizonStudy(const QVariantMap& params);

    /** Onduleur : DC → AC avec η Euro (ou courbe simple) + clipping Pnom. */
    Q_INVOKABLE static QVariantMap acFromDc(double dcKw, double pacNomKw, double etaEuro = 0.97);

    /** Température cellule : NOCT classique ou modèle U / vent (study). */
    Q_INVOKABLE static double cellTemperature(double tAir, double poaWm2,
                                             const QVariantMap& thermal = {});

    /**
     * Rapport type PVsyst : balances mensuelles (GlobHor…PR), KPI Yr/Ya/Yf/Lc/Ls,
     * et lossDiagram séquentiel (énergies kWh + % relatifs).
     * params: lat,tilt,azimuth,Ppeak,weatherData,losses|lossTree,halfHourlyKeep,
     *         monthlyLoss,annualLossPct,pacNom,etaEuro,useInverterModel,thermal,tech
     */
    Q_INVOKABLE static QVariantMap buildBalancesReport(const QVariantMap& params);
};

} // namespace ose
