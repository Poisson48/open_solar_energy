#pragma once

#include <QObject>
#include <QVariantList>
#include <QVariantMap>

namespace ose {

class HourlyAnalysis : public QObject {
    Q_OBJECT
public:
    explicit HourlyAnalysis(QObject* parent = nullptr);

    Q_INVOKABLE QVariantList simulateDailyBattery(const QVariantList& pvHours,
                                                  const QVariantList& consoHours, double battKwh,
                                                  double dod, double eta = 0.97) const;

    /** Profil conso 24 h à partir de kWh mensuel (ou day/night). */
    Q_INVOKABLE QVariantList syntheticLoadProfile(double dailyKwh, double dayShare = 0.55) const;

    /** PV 24 h pour un mois via SolarMath::hourlyIrradiance × Ppeak × PR approx. */
    Q_INVOKABLE QVariantList pvHourlyProfile(double lat, int month, double GHI, double DHI,
                                             double Ppeak, double tilt, double azimuth,
                                             double losses, double Tavg,
                                             const QVariantList& halfHourKeep = {}) const;

    Q_INVOKABLE QVariantMap analyzeMonth(const QVariantMap& params) const;
};

} // namespace ose
