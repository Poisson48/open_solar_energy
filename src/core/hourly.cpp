#include "hourly.h"

#include "constants.h"
#include "solar_math.h"

#include <algorithm>
#include <cmath>

namespace ose {

HourlyAnalysis::HourlyAnalysis(QObject* parent) : QObject(parent) {}

QVariantList HourlyAnalysis::simulateDailyBattery(const QVariantList& pvHours,
                                                  const QVariantList& consoHours, double battKwh,
                                                  double dod, double eta) const
{
    const double usable = battKwh * (dod / 100.0);
    double soc = usable * 0.5;
    QVariantList out;
    const int n = std::max(pvHours.size(), consoHours.size());
    for (int h = 0; h < n; ++h) {
        const double pv = h < pvHours.size() ? pvHours[h].toDouble() : 0;
        const double conso = h < consoHours.size() ? consoHours[h].toDouble() : 0;
        const double balance = pv - conso;
        double autoconso = 0;
        double surplus = 0;
        double grid = 0;
        if (balance >= 0) {
            autoconso = conso;
            const double charge = std::min(balance * eta, usable - soc);
            soc += charge;
            surplus = balance - charge / std::max(1e-9, eta);
            grid = 0;
        } else {
            autoconso = pv;
            const double needed = -balance;
            const double fromBatt = std::min(needed, soc);
            soc -= fromBatt;
            surplus = 0;
            grid = needed - fromBatt;
            autoconso += fromBatt;
        }
        out.append(QVariantMap{{QStringLiteral("hour"), h},
                               {QStringLiteral("pv"), pv},
                               {QStringLiteral("conso"), conso},
                               {QStringLiteral("soc"), std::round(soc * 100) / 100},
                               {QStringLiteral("autoconso"), autoconso},
                               {QStringLiteral("surplus"), surplus},
                               {QStringLiteral("grid"), grid}});
    }
    return out;
}

QVariantList HourlyAnalysis::syntheticLoadProfile(double dailyKwh, double dayShare) const
{
    // Profil type résidentiel : pic matin/soir, bas la nuit
    const double weights[24] = {
        0.02, 0.015, 0.012, 0.012, 0.015, 0.025, 0.045, 0.06,
        0.05, 0.04,  0.035, 0.035, 0.04,  0.04,  0.035, 0.035,
        0.04, 0.055, 0.07,  0.075, 0.065, 0.05,  0.035, 0.025};
    double sumW = 0;
    for (double w : weights)
        sumW += w;
    QVariantList out;
    for (int h = 0; h < 24; ++h) {
        const bool day = h >= 7 && h < 22;
        const double base = dailyKwh * (weights[h] / sumW);
        // Ajuste légèrement dayShare
        const double adj = day ? (dayShare / 0.55) : ((1 - dayShare) / 0.45);
        out.append(base * adj);
    }
    return out;
}

QVariantList HourlyAnalysis::pvHourlyProfile(double lat, int month, double GHI, double DHI,
                                             double Ppeak, double tilt, double azimuth,
                                             double losses, double Tavg,
                                             const QVariantList& halfHourKeep) const
{
    QVariantList out;
    const double lossF = std::max(0.5, 1.0 - losses / 100.0);
    for (int h = 0; h < 24; ++h) {
        double irr = SolarMath::hourlyIrradiance(lat, month, h, GHI, DHI, tilt, azimuth);
        // Ombrage : moyenne des 2 demi-heures si fourni
        if (month >= 1 && month <= 12 && halfHourKeep.size() >= month) {
            const QVariantList row = halfHourKeep[month - 1].toList();
            if (row.size() >= 48) {
                const double k0 = row[h * 2].toDouble();
                const double k1 = row[h * 2 + 1].toDouble();
                irr *= (k0 + k1) / 2.0;
            }
        }
        // Wh/m² → kWh pour Ppeak kWc : irr/1000 * Ppeak * PR
        const double Tcell = Tavg + 25 * irr / 800.0;
        const double PRtemp = 1 - 0.0045 * std::max(0.0, Tcell - 25);
        const double e = (irr / 1000.0) * Ppeak * lossF * std::min(1.0, PRtemp);
        out.append(e);
    }
    return out;
}

QVariantMap HourlyAnalysis::analyzeMonth(const QVariantMap& params) const
{
    const double lat = params.value(QStringLiteral("lat"), 43.6).toDouble();
    const int month = params.value(QStringLiteral("month"), 6).toInt();
    const double GHI = params.value(QStringLiteral("GHI")).toDouble();
    const double DHI = params.value(QStringLiteral("DHI")).toDouble();
    const double Tavg = params.value(QStringLiteral("T_avg"), 15).toDouble();
    const double Ppeak = params.value(QStringLiteral("Ppeak"), 3).toDouble();
    const double tilt = params.value(QStringLiteral("tilt"), 30).toDouble();
    const double azimuth = params.value(QStringLiteral("azimuth"), 0).toDouble();
    const double losses = params.value(QStringLiteral("losses"), 14).toDouble();
    const double dailyKwh = params.value(QStringLiteral("dailyKwh"), 12).toDouble();
    const double battKwh = params.value(QStringLiteral("battKwh"), 0).toDouble();
    const double dod = params.value(QStringLiteral("dod"), 80).toDouble();
    const QVariantList keep = params.value(QStringLiteral("halfHourlyKeep")).toList();

    const QVariantList pv = pvHourlyProfile(lat, month, GHI, DHI, Ppeak, tilt, azimuth, losses,
                                            Tavg, keep);
    const QVariantList load = syntheticLoadProfile(dailyKwh);
    const QVariantList sim = battKwh > 0 ? simulateDailyBattery(pv, load, battKwh, dod)
                                         : [&]() {
                                               QVariantList r;
                                               for (int h = 0; h < 24; ++h) {
                                                   const double p = pv[h].toDouble();
                                                   const double c = load[h].toDouble();
                                                   r.append(QVariantMap{
                                                       {QStringLiteral("hour"), h},
                                                       {QStringLiteral("pv"), p},
                                                       {QStringLiteral("conso"), c},
                                                       {QStringLiteral("soc"), 0},
                                                       {QStringLiteral("autoconso"), std::min(p, c)},
                                                       {QStringLiteral("surplus"), std::max(0.0, p - c)},
                                                       {QStringLiteral("grid"), std::max(0.0, c - p)},
                                                   });
                                               }
                                               return r;
                                           }();

    double pvTot = 0, loadTot = 0, ac = 0, surplus = 0, grid = 0;
    for (const QVariant& v : sim) {
        const QVariantMap m = v.toMap();
        pvTot += m.value(QStringLiteral("pv")).toDouble();
        loadTot += m.value(QStringLiteral("conso")).toDouble();
        ac += m.value(QStringLiteral("autoconso")).toDouble();
        surplus += m.value(QStringLiteral("surplus")).toDouble();
        grid += m.value(QStringLiteral("grid")).toDouble();
    }

    return {{QStringLiteral("hours"), sim},
            {QStringLiteral("pvTotal"), std::round(pvTot * 100) / 100},
            {QStringLiteral("loadTotal"), std::round(loadTot * 100) / 100},
            {QStringLiteral("autoconso"), std::round(ac * 100) / 100},
            {QStringLiteral("surplus"), std::round(surplus * 100) / 100},
            {QStringLiteral("grid"), std::round(grid * 100) / 100},
            {QStringLiteral("autoconsoRate"),
             pvTot > 0 ? std::round(ac / pvTot * 1000) / 10 : 0}};
}

} // namespace ose
