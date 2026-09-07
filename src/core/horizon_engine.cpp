#include "horizon_engine.h"

#include "constants.h"
#include "solar_math.h"

#include <QElapsedTimer>

#include <algorithm>
#include <array>
#include <cmath>
#include <vector>

namespace ose {
namespace {

constexpr int kSlotsDay = 48; // 30 min

double keepAt(const std::array<std::array<double, kSlotsDay>, 12>& keep, int month0, int slot)
{
    if (month0 < 0 || month0 >= 12 || slot < 0 || slot >= kSlotsDay)
        return 1.0;
    return keep[static_cast<size_t>(month0)][static_cast<size_t>(slot)];
}

} // namespace

HorizonEngine::HorizonEngine(QObject* parent) : QObject(parent) {}

QVariantMap HorizonEngine::simulate(const QVariantMap& params) const
{
    QElapsedTimer timer;
    timer.start();

    const double lat = params.value(QStringLiteral("lat"), 43.6).toDouble();
    const double Ppeak0 = params.value(QStringLiteral("Ppeak"), 3).toDouble();
    const double tilt = params.value(QStringLiteral("tilt"), 30).toDouble();
    const double azimuth = params.value(QStringLiteral("azimuth"), 0).toDouble();
    const double losses = params.value(QStringLiteral("losses"), 14).toDouble();
    const double dailyKwh = params.value(QStringLiteral("dailyKwh"), 12).toDouble();
    const double dayShare = params.value(QStringLiteral("dayShare"), 0.55).toDouble();
    const double battKwh = params.value(QStringLiteral("battKwh"), 0).toDouble();
    const double dod = params.value(QStringLiteral("dod"), 80).toDouble();
    const int years = std::max(1, params.value(QStringLiteral("years"), 30).toInt());
    const int stepMin = params.value(QStringLiteral("stepMin"), 30).toInt();
    const double degr = params.value(QStringLiteral("panelDegradation"), kPanelDegradation).toDouble();
    const double eta = params.value(QStringLiteral("etaBatt"), 0.97).toDouble();
    const double lossF = std::max(0.5, 1.0 - losses / 100.0);
    const double usable0 = battKwh * (dod / 100.0);

    if (stepMin != 30) {
        return {{QStringLiteral("ok"), false},
                {QStringLiteral("error"), QStringLiteral("seul stepMin=30 est supporté pour l’instant")}};
    }

    const QVariantList weather = params.value(QStringLiteral("weatherData")).toList();
    std::array<double, 12> ghi{}, dhi{}, tavg{};
    for (int m = 0; m < 12; ++m) {
        ghi[static_cast<size_t>(m)] = 100;
        dhi[static_cast<size_t>(m)] = 40;
        tavg[static_cast<size_t>(m)] = 15;
        if (m < weather.size()) {
            const QVariantMap w = weather[m].toMap();
            ghi[static_cast<size_t>(m)] = w.value(QStringLiteral("GHI"), 100).toDouble();
            dhi[static_cast<size_t>(m)] = w.value(QStringLiteral("DHI"), 40).toDouble();
            tavg[static_cast<size_t>(m)] = w.value(QStringLiteral("T_avg"), 15).toDouble();
        }
    }

    std::array<std::array<double, kSlotsDay>, 12> keep{};
    for (auto& row : keep)
        row.fill(1.0);
    const QVariantList keepIn = params.value(QStringLiteral("halfHourlyKeep")).toList();
    for (int m = 0; m < 12 && m < keepIn.size(); ++m) {
        const QVariantList row = keepIn[m].toList();
        for (int s = 0; s < kSlotsDay && s < row.size(); ++s)
            keep[static_cast<size_t>(m)][static_cast<size_t>(s)] =
                std::clamp(row[s].toDouble(), 0.0, 1.0);
    }

    // Profil charge 48 × 30 min (jour type)
    std::array<double, kSlotsDay> loadSlot{};
    {
        const double weights[24] = {
            0.02, 0.015, 0.012, 0.012, 0.015, 0.025, 0.045, 0.06,
            0.05, 0.04,  0.035, 0.035, 0.04,  0.04,  0.035, 0.035,
            0.04, 0.055, 0.07,  0.075, 0.065, 0.05,  0.035, 0.025};
        double sumW = 0;
        for (double w : weights)
            sumW += w;
        for (int h = 0; h < 24; ++h) {
            const bool day = h >= 7 && h < 22;
            const double adj = day ? (dayShare / 0.55) : ((1.0 - dayShare) / 0.45);
            const double hourKwh = dailyKwh * (weights[h] / sumW) * adj;
            loadSlot[static_cast<size_t>(h * 2)] = hourKwh * 0.5;
            loadSlot[static_cast<size_t>(h * 2 + 1)] = hourKwh * 0.5;
        }
    }

    // PV jour type par mois × 48 slots (kWh / 30 min), Ppeak=1 puis × Ppeak dégradé
    std::array<std::array<double, kSlotsDay>, 12> pvUnit{};
    for (int m = 0; m < 12; ++m) {
        const int month = m + 1;
        const double GHI = ghi[static_cast<size_t>(m)];
        const double DHI = dhi[static_cast<size_t>(m)];
        const double T = tavg[static_cast<size_t>(m)];
        for (int h = 0; h < 24; ++h) {
            const double irr = SolarMath::hourlyIrradiance(lat, month, h, GHI, DHI, tilt, azimuth);
            const double Tcell = T + 25.0 * irr / 800.0;
            const double PRtemp = 1.0 - 0.0045 * std::max(0.0, Tcell - 25.0);
            const double eHour = (irr / 1000.0) * lossF * std::min(1.0, PRtemp); // kWh @ 1 kWc
            for (int half = 0; half < 2; ++half) {
                const int s = h * 2 + half;
                const double k = keepAt(keep, m, s);
                pvUnit[static_cast<size_t>(m)][static_cast<size_t>(s)] = eHour * 0.5 * k;
            }
        }
    }

    double soc = usable0 * 0.5;
    double pvTot = 0, loadTot = 0, acTot = 0, surplusTot = 0, gridTot = 0;
    double deficitDays = 0;
    qint64 steps = 0;

    QVariantList yearRows;
    yearRows.reserve(years);

    for (int y = 0; y < years; ++y) {
        const double pScale = Ppeak0 * std::pow(1.0 - degr, y);
        double yPv = 0, yLoad = 0, yAc = 0, ySurplus = 0, yGrid = 0;
        int yDefDays = 0;

        // Année type non bissextile (TMY) — 365 jours
        for (int m = 0; m < 12; ++m) {
            const int days = kDaysInMonth[static_cast<size_t>(m)];
            for (int d = 0; d < days; ++d) {
                double dayGrid = 0;
                for (int s = 0; s < kSlotsDay; ++s) {
                    const double pv = pvUnit[static_cast<size_t>(m)][static_cast<size_t>(s)] * pScale;
                    const double load = loadSlot[static_cast<size_t>(s)];
                    ++steps;

                    yPv += pv;
                    yLoad += load;

                    if (usable0 <= 1e-9) {
                        const double ac = std::min(pv, load);
                        const double surplus = std::max(0.0, pv - load);
                        const double grid = std::max(0.0, load - pv);
                        yAc += ac;
                        ySurplus += surplus;
                        yGrid += grid;
                        dayGrid += grid;
                        continue;
                    }

                    const double balance = pv - load;
                    if (balance >= 0) {
                        yAc += load;
                        const double charge = std::min(balance * eta, usable0 - soc);
                        soc += charge;
                        ySurplus += balance - charge / std::max(1e-9, eta);
                    } else {
                        yAc += pv;
                        const double needed = -balance;
                        const double fromBatt = std::min(needed, soc);
                        soc -= fromBatt;
                        yAc += fromBatt;
                        const double grid = needed - fromBatt;
                        yGrid += grid;
                        dayGrid += grid;
                    }
                }
                if (dayGrid > 0.05)
                    ++yDefDays;
            }
        }

        pvTot += yPv;
        loadTot += yLoad;
        acTot += yAc;
        surplusTot += ySurplus;
        gridTot += yGrid;
        deficitDays += yDefDays;

        yearRows.append(QVariantMap{
            {QStringLiteral("year"), y + 1},
            {QStringLiteral("pv"), std::round(yPv)},
            {QStringLiteral("load"), std::round(yLoad)},
            {QStringLiteral("autoconso"), std::round(yAc)},
            {QStringLiteral("surplus"), std::round(ySurplus)},
            {QStringLiteral("grid"), std::round(yGrid)},
            {QStringLiteral("deficitDays"), yDefDays},
            {QStringLiteral("coverage"),
             yLoad > 0 ? std::round((1.0 - yGrid / yLoad) * 1000) / 10 : 100.0},
            {QStringLiteral("Ppeak"), std::round(pScale * 100) / 100},
        });
    }

    const qint64 ms = timer.elapsed();
    const double coverage = loadTot > 0 ? (1.0 - gridTot / loadTot) * 100.0 : 100.0;

    return {{QStringLiteral("ok"), true},
            {QStringLiteral("years"), years},
            {QStringLiteral("stepMin"), stepMin},
            {QStringLiteral("steps"), QVariant::fromValue(steps)},
            {QStringLiteral("elapsedMs"), QVariant::fromValue(ms)},
            {QStringLiteral("stepsPerSec"),
             ms > 0 ? QVariant::fromValue(steps * 1000 / ms) : QVariant::fromValue(steps)},
            {QStringLiteral("pvTotal"), std::round(pvTot)},
            {QStringLiteral("loadTotal"), std::round(loadTot)},
            {QStringLiteral("autoconsoTotal"), std::round(acTot)},
            {QStringLiteral("surplusTotal"), std::round(surplusTot)},
            {QStringLiteral("gridTotal"), std::round(gridTot)},
            {QStringLiteral("coveragePct"), std::round(coverage * 10) / 10},
            {QStringLiteral("autoconsoRate"),
             pvTot > 0 ? std::round(acTot / pvTot * 1000) / 10 : 0},
            {QStringLiteral("avgDeficitDaysPerYear"),
             std::round((deficitDays / years) * 10) / 10},
            {QStringLiteral("finalSoc"), std::round(soc * 100) / 100},
            {QStringLiteral("shadeApplied"), !keepIn.isEmpty()},
            {QStringLiteral("yearSeries"), yearRows}};
}

} // namespace ose
