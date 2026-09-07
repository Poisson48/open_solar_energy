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
    // Aligné Hors réseau : nuit 21h–6h, répartition uniforme dans chaque tranche
    const double dayKwh = dailyKwh * std::clamp(dayShare, 0.0, 1.0);
    const double nightKwh = dailyKwh - dayKwh;
    int nDay = 0, nNight = 0;
    for (int h = 0; h < 24; ++h)
        ((h >= 21 || h < 6) ? nNight : nDay)++;
    const double perDay = nDay > 0 ? dayKwh / nDay : 0;
    const double perNight = nNight > 0 ? nightKwh / nNight : 0;
    QVariantList out;
    for (int h = 0; h < 24; ++h)
        out.append((h >= 21 || h < 6) ? perNight : perDay);
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
    const double dayShare = params.value(QStringLiteral("dayShare"), 0.55).toDouble();
    const double battKwh = params.value(QStringLiteral("battKwh"), 0).toDouble();
    const double dod = params.value(QStringLiteral("dod"), 80).toDouble();
    const QVariantList keep = params.value(QStringLiteral("halfHourlyKeep")).toList();

    const QVariantList pv = pvHourlyProfile(lat, month, GHI, DHI, Ppeak, tilt, azimuth, losses,
                                            Tavg, keep);
    const QVariantList load = syntheticLoadProfile(dailyKwh, dayShare);
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

QVariantMap HourlyAnalysis::analyzeYear(const QVariantMap& params) const
{
    const QVariantList weather = params.value(QStringLiteral("weatherData")).toList();
    QVariantList months;
    double pvY = 0, loadY = 0, acY = 0, surplusY = 0, gridY = 0;
    for (int m = 1; m <= 12; ++m) {
        QVariantMap p = params;
        p.insert(QStringLiteral("month"), m);
        if (m - 1 < weather.size()) {
            const QVariantMap w = weather[m - 1].toMap();
            p.insert(QStringLiteral("GHI"), w.value(QStringLiteral("GHI")));
            p.insert(QStringLiteral("DHI"), w.value(QStringLiteral("DHI")));
            p.insert(QStringLiteral("T_avg"), w.value(QStringLiteral("T_avg"), 15));
        }
        QVariantMap r = analyzeMonth(p);
        r.insert(QStringLiteral("month"), m);
        // Approx jours/mois
        static const int dim[] = {31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31};
        const int days = dim[m - 1];
        pvY += r.value(QStringLiteral("pvTotal")).toDouble() * days;
        loadY += r.value(QStringLiteral("loadTotal")).toDouble() * days;
        acY += r.value(QStringLiteral("autoconso")).toDouble() * days;
        surplusY += r.value(QStringLiteral("surplus")).toDouble() * days;
        gridY += r.value(QStringLiteral("grid")).toDouble() * days;
        months.append(r);
    }
    return {{QStringLiteral("months"), months},
            {QStringLiteral("pvYear"), std::round(pvY)},
            {QStringLiteral("loadYear"), std::round(loadY)},
            {QStringLiteral("autoconsoYear"), std::round(acY)},
            {QStringLiteral("surplusYear"), std::round(surplusY)},
            {QStringLiteral("gridYear"), std::round(gridY)},
            {QStringLiteral("autoconsoRate"),
             pvY > 0 ? std::round(acY / pvY * 1000) / 10 : 0}};
}

} // namespace ose
