#pragma once

#include <QObject>
#include <QVariantList>
#include <QVariantMap>

namespace ose {

/** Calculs d'implantation 3D : grille panneaux, soleil, ombres sur obstacles. */
class Layout3D : public QObject {
    Q_OBJECT
public:
    explicit Layout3D(QObject* parent = nullptr);

    /** Disposition : surface, fits, cols/rows, positions monde [{x,y,z,yaw,tilt}]. */
    Q_INVOKABLE QVariantMap computeLayout(const QVariantMap& cfg) const;

    /** Direction soleil unitaire (Y-up) depuis azimut/élévation app (0°=Sud). */
    Q_INVOKABLE QVariantMap sunDirection(double azimutDeg, double elevDeg) const;

    /** eulerRotation DirectionalLight Quick3D pour viser le soleil. */
    Q_INVOKABLE QVariantMap sunLightEuler(double azimutDeg, double elevDeg) const;

    /**
     * Ombre panneau×obstacles×soleil.
     * obstacles: [{az, elev, dist?}] horizon ; panels depuis computeLayout.
     * Retourne {shadedFraction, litPanels, totalPanels, keep}.
     */
    Q_INVOKABLE QVariantMap sampleShading(const QVariantMap& layout,
                                          const QVariantList& obstacles,
                                          double sunAz, double sunElev) const;

    /** Profil 48 demi-heures keep[0..1] pour un mois (jour mid-month). */
    Q_INVOKABLE QVariantList halfHourlyKeepForMonth(double lat, int month,
                                                   const QVariantMap& layout,
                                                   const QVariantList& obstacles) const;

    /** Agrège ombrage annuel mensuel à partir de la scène 3D. */
    Q_INVOKABLE QVariantMap computeSceneShading(double lat, const QVariantMap& layoutCfg,
                                                const QVariantList& obstacles,
                                                const QVariantList& weatherData) const;
};

} // namespace ose
