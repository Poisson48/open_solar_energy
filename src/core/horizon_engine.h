#pragma once

#include <QObject>
#include <QVariantList>
#include <QVariantMap>

namespace ose {

/**
 * Moteur de simulation longue durée : pas 30 min, ombrage halfHourlyKeep,
 * batterie chronologique, dégradation panneaux. Conçu pour des sweeps
 * (centaines de milliers à millions de pas) sans QVariant dans la boucle chaude.
 */
class HorizonEngine : public QObject {
    Q_OBJECT
public:
    explicit HorizonEngine(QObject* parent = nullptr);

    /**
     * params:
     *  lat, weatherData[{GHI,DHI,T_avg}], halfHourlyKeep[12][48],
     *  Ppeak, tilt, azimuth, losses, dailyKwh, dayShare,
     *  battKwh, dod, years (défaut 30), stepMin (30),
     *  panelDegradation (0.005 / an), etaBatt (0.97)
     *
     * retourne totaux multi-années, séries annuelles, steps, elapsedMs.
     */
    Q_INVOKABLE QVariantMap simulate(const QVariantMap& params) const;
};

} // namespace ose
