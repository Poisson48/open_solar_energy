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

    /** Direction soleil unitaire (Y-up) depuis azimut boussole (0°=Nord) + élévation. */
    Q_INVOKABLE QVariantMap sunDirection(double azimutNorthDeg, double elevDeg) const;

    /** eulerRotation DirectionalLight Quick3D (azimut 0°=Nord). */
    Q_INVOKABLE QVariantMap sunLightEuler(double azimutNorthDeg, double elevDeg) const;

    /** Converters azimut (délègue à Azimuth). */
    Q_INVOKABLE double northToPv(double azNorth) const;
    Q_INVOKABLE double pvToNorth(double azPv) const;

    /**
     * Ombre panneau×obstacles×soleil.
     * sunAz / obstacles.az : 0°=Nord. panels : yaw PV 0°=Sud.
     * Retourne {shadedFraction, litPanels, totalPanels, keep}.
     */
    Q_INVOKABLE QVariantMap sampleShading(const QVariantMap& layout,
                                          const QVariantList& obstacles,
                                          double sunAzNorth, double sunElev) const;

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
