#include "sizing.h"

#include "finance.h"
#include "solar_math.h"
#include "year_pv.h"

#include <algorithm>
#include <cmath>

namespace ose {

SizingEngine::SizingEngine(QObject* parent) : QObject(parent) {}

static double monthLoad(const QVariantList& monthlyKwh, int i, double annualLoad)
{
    if (i < monthlyKwh.size())
        return monthlyKwh[i].toDouble();
    return annualLoad / 12.0;
}

static double shadeFactor(const QVariantList& monthlyLoss, int i)
{
    if (i >= monthlyLoss.size())
        return 1.0;
    double loss = monthlyLoss[i].toDouble();
    if (loss > 1.0)
        loss /= 100.0;
    return 1.0 - std::clamp(loss, 0.0, 0.95);
}

/** Autoconso mensuelle avec batterie hybride (approx jour/nuit). */
static void hybridMonth(double E_m, double load_m, double dayShare, double battUsableKwh,
                        double* autoconso, double* injected)
{
    const double loadDay = load_m * dayShare;
    const double loadNight = load_m - loadDay;
    // PV principalement diurne
    const double pvDay = E_m * 0.92;
    const double pvNight = E_m - pvDay;

    double acDay = std::min(pvDay, loadDay);
    double surplusDay = std::max(0.0, pvDay - loadDay);
    double deficitDay = std::max(0.0, loadDay - pvDay);

    double charge = std::min(surplusDay, battUsableKwh);
    double remainingSurplus = surplusDay - charge;

    double acNight = std::min(pvNight, loadNight);
    double nightNeed = std::max(0.0, loadNight - pvNight);
    double fromBatt = std::min(nightNeed, charge);
    acNight += fromBatt;

    // déficit jour non couvert par PV (rare) — pas de discharge matin
    Q_UNUSED(deficitDay);

    *autoconso = acDay + acNight;
    *injected = remainingSurplus + std::max(0.0, pvNight - loadNight);
}

QVariantMap SizingEngine::run(const QVariantMap& input) const
{
    const double lat = input.value(QStringLiteral("lat"), 46.5).toDouble();
    const QVariantList weather = input.value(QStringLiteral("weatherData")).toList();
    const QVariantList monthlyKwh = input.value(QStringLiteral("monthlyKwh")).toList();
    const QVariantList monthlyLoss = input.value(QStringLiteral("monthlyLoss")).toList();
    const double annualLossPct = input.value(QStringLiteral("annualLossPct"), 0).toDouble();
    const double losses = input.value(QStringLiteral("losses"), 14).toDouble();
    const double tilt = input.value(QStringLiteral("tilt"), 30).toDouble();
    const double azimuth = input.value(QStringLiteral("azimuth"), 0).toDouble();
    const double costPerKwc = input.value(QStringLiteral("costPerKwc"), 1200).toDouble();
    const double priceBase = input.value(QStringLiteral("priceBase"), 0.2516).toDouble();
    const double injectionPrice = input.value(QStringLiteral("injectionPrice"), 0.04).toDouble();
    const QString strategy = input.value(QStringLiteral("strategy"), QStringLiteral("roi")).toString();
    const double coverageTarget = input.value(QStringLiteral("coverageTarget"), 70).toDouble() / 100.0;
    const double battKwh = input.value(QStringLiteral("battKwh"), 0).toDouble();
    const double dod = input.value(QStringLiteral("dod"), 80).toDouble();
    const double dayShare = input.value(QStringLiteral("dayShare"), 0.55).toDouble();
    const double battCostPerKwh = input.value(QStringLiteral("battCostPerKwh"), 400).toDouble();
    const bool hybrid = battKwh > 0.05
                        || input.value(QStringLiteral("installType")).toString() == QLatin1String("hybrid");

    double annualLoad = 0;
    for (const QVariant& v : monthlyKwh)
        annualLoad += v.toDouble();
    if (annualLoad <= 0)
        annualLoad = input.value(QStringLiteral("annualKwh"), 3500).toDouble();
    if (annualLoad <= 0)
        annualLoad = 3500;

    // Pertes système effectives : pertes techniques + ombrage annuel si pas de courbe mensuelle
    double effLosses = losses;
    if (input.contains(QStringLiteral("lossTree"))) {
        const double f = YearPv::effectiveLossFactor(input);
        effLosses = (1.0 - f) * 100.0;
    }
    if (monthlyLoss.isEmpty() && annualLossPct > 0)
        effLosses = effLosses + annualLossPct * (1.0 - effLosses / 100.0);

    const QString energyMode = input.value(QStringLiteral("energyMode"), QStringLiteral("fast")).toString();
    const QVariantMap hourlyWx = input.value(QStringLiteral("hourlyWeatherData")).toMap();
    const bool studyYield = energyMode == QLatin1String("study")
                            && hourlyWx.value(QStringLiteral("ghi")).toList().size() >= 24 * 30;
    QVariantList studyMonthlyPerKwc;
    if (studyYield) {
        QVariantMap yp = input;
        yp.insert(QStringLiteral("losses"), effLosses);
        if (input.contains(QStringLiteral("halfHourlyKeep")))
            yp.insert(QStringLiteral("halfHourlyKeep"), input.value(QStringLiteral("halfHourlyKeep")));
        else if (!monthlyLoss.isEmpty()) {
            // Pas de keep horaire : ombrage déjà dans monthlyLoss plus bas
        }
        studyMonthlyPerKwc = YearPv::monthlyYieldPerKwc(hourlyWx, yp);
    }

    const QString limitMode = input.value(QStringLiteral("limitMode"), QStringLiteral("none")).toString();
    double maxPpeak = 15.0;
    double minPpeak = 0.1;
    if (limitMode == QLatin1String("fixed")) {
        const double fp = input.value(QStringLiteral("fixedPpeak"), 3).toDouble();
        minPpeak = maxPpeak = std::max(0.1, fp);
    } else if (limitMode == QLatin1String("roof")) {
        const double area = input.value(QStringLiteral("roofAreaM2"), 40).toDouble();
        const double panelArea = input.value(QStringLiteral("panelAreaM2"), 2.0).toDouble();
        const double panelWp = input.value(QStringLiteral("panelWp"), 400).toDouble();
        const int n = static_cast<int>(std::floor(area / std::max(0.5, panelArea)));
        maxPpeak = std::max(0.1, n * panelWp / 1000.0);
    }

    SolarMath sm;
    Finance fin;
    QVariantList candidates;
    QVariantMap best;
    const double battUsable = battKwh * (dod / 100.0);

    const int stepMin = static_cast<int>(std::round(minPpeak * 10));
    const int stepMax = static_cast<int>(std::round(maxPpeak * 10));
    for (int step = stepMin; step <= stepMax; ++step) {
        const double Ppeak = step * 0.1;
        double systemCost = Ppeak * costPerKwc;
        if (hybrid && battKwh > 0)
            systemCost += battKwh * battCostPerKwh;

        const QVariantMap annual = sm.gridSystemAnnual({
            {QStringLiteral("lat"), lat},
            {QStringLiteral("weatherData"), weather},
            {QStringLiteral("Ppeak"), Ppeak},
            {QStringLiteral("losses"), effLosses},
            {QStringLiteral("tilt"), tilt},
            {QStringLiteral("azimuth"), azimuth},
            {QStringLiteral("systemCost"), systemCost},
            {QStringLiteral("kwhPrice"), priceBase},
        });
        double E = annual.value(QStringLiteral("E_annual")).toDouble();
        double autoconso = 0;
        double injected = 0;
        QVariantList months = annual.value(QStringLiteral("monthly")).toList();
        if (studyYield && studyMonthlyPerKwc.size() >= 12) {
            E = 0;
            QVariantList rebuilt;
            for (int i = 0; i < 12; ++i) {
                double E_m = studyMonthlyPerKwc[i].toDouble() * Ppeak;
                // Si keep déjà dans YearPv, ne pas re-appliquer monthlyLoss
                if (!input.contains(QStringLiteral("halfHourlyKeep"))
                    || input.value(QStringLiteral("halfHourlyKeep")).toList().isEmpty())
                    E_m *= shadeFactor(monthlyLoss, i);
                E += E_m;
                QVariantMap row;
                if (i < months.size())
                    row = months[i].toMap();
                row.insert(QStringLiteral("E_month"), E_m);
                rebuilt.append(row);
            }
            months = rebuilt;
        }
        for (int i = 0; i < months.size(); ++i) {
            double E_m = months[i].toMap().value(QStringLiteral("E_month")).toDouble();
            if (!studyYield)
                E_m *= shadeFactor(monthlyLoss, i);
            const double load_m = monthLoad(monthlyKwh, i, annualLoad);
            if (hybrid && battUsable > 0) {
                double ac = 0, inj = 0;
                hybridMonth(E_m, load_m, dayShare, battUsable, &ac, &inj);
                autoconso += ac;
                injected += inj;
            } else {
                const double ac = std::min(E_m, load_m);
                autoconso += ac;
                injected += std::max(0.0, E_m - load_m);
            }
        }
        // Recalcule E après shade mensuel (sauf study avec keep déjà dans YearPv)
        if (!studyYield && !monthlyLoss.isEmpty()) {
            E = 0;
            for (int i = 0; i < months.size(); ++i) {
                double E_m = months[i].toMap().value(QStringLiteral("E_month")).toDouble();
                E += E_m * shadeFactor(monthlyLoss, i);
            }
        } else if (studyYield) {
            // E déjà construit depuis studyMonthlyPerKwc
        }

        const double savings = autoconso * priceBase + injected * injectionPrice;
        const QVariant payback = fin.calcPayback(systemCost, savings);
        const double coverage = annualLoad > 0 ? autoconso / annualLoad : 0;
        const double autoconsoRate = E > 0 ? autoconso / E : 0;
        const double incentive = fin.calcFrenchIncentive(Ppeak);
        const double npv = fin.calcNPV(systemCost, savings,
                                       {{QStringLiteral("lifetime"), 25},
                                        {QStringLiteral("discountRate"), 0.03},
                                        {QStringLiteral("panelDegradation"), 0.005}});

        QVariantMap c{
            {QStringLiteral("Ppeak"), std::round(Ppeak * 10) / 10},
            {QStringLiteral("E_annual"), int(std::lround(E))},
            {QStringLiteral("autoconso"), int(std::lround(autoconso))},
            {QStringLiteral("injected"), int(std::lround(injected))},
            {QStringLiteral("savings"), int(std::lround(savings))},
            {QStringLiteral("systemCost"), int(std::lround(systemCost))},
            {QStringLiteral("coverage"), std::round(coverage * 1000) / 10},
            {QStringLiteral("autoconsoRate"), std::round(autoconsoRate * 1000) / 10},
            {QStringLiteral("payback"), payback},
            {QStringLiteral("PR"), annual.value(QStringLiteral("PR"))},
            {QStringLiteral("LCOE"), annual.value(QStringLiteral("LCOE"))},
            {QStringLiteral("incentive"), int(std::lround(incentive))},
            {QStringLiteral("npv"), int(std::lround(npv))},
            {QStringLiteral("hybrid"), hybrid && battKwh > 0},
            {QStringLiteral("battKwh"), battKwh},
            {QStringLiteral("shadeApplied"), !monthlyLoss.isEmpty() || annualLossPct > 0},
        };
        candidates.append(c);

        bool better = false;
        if (best.isEmpty()) {
            better = true;
        } else if (strategy == QLatin1String("autoconso")) {
            // Maximiser l'autoconsommation absolue (kWh), pas le taux (sinon Ppeak→0)
            const double ac = c.value(QStringLiteral("autoconso")).toDouble();
            const double bestAc = best.value(QStringLiteral("autoconso")).toDouble();
            if (ac > bestAc + 1)
                better = true;
            else if (std::abs(ac - bestAc) <= 1)
                better = c.value(QStringLiteral("autoconsoRate")).toDouble()
                         > best.value(QStringLiteral("autoconsoRate")).toDouble();
        } else if (strategy == QLatin1String("coverage")) {
            const double cov = c.value(QStringLiteral("coverage")).toDouble() / 100.0;
            const double bestCov = best.value(QStringLiteral("coverage")).toDouble() / 100.0;
            if (cov >= coverageTarget && bestCov < coverageTarget)
                better = true;
            else if (cov >= coverageTarget && bestCov >= coverageTarget)
                better = c.value(QStringLiteral("systemCost")).toDouble()
                         < best.value(QStringLiteral("systemCost")).toDouble();
            else if (cov < coverageTarget && bestCov < coverageTarget)
                better = cov > bestCov;
        } else {
            const QVariant pb = c.value(QStringLiteral("payback"));
            const QVariant bestPb = best.value(QStringLiteral("payback"));
            if (pb.isValid() && !bestPb.isValid())
                better = true;
            else if (pb.isValid() && bestPb.isValid())
                better = pb.toInt() < bestPb.toInt()
                         || (pb.toInt() == bestPb.toInt()
                             && c.value(QStringLiteral("savings")).toDouble()
                                    > best.value(QStringLiteral("savings")).toDouble());
        }
        if (better)
            best = c;
    }

    return {{QStringLiteral("best"), best},
            {QStringLiteral("candidates"), candidates},
            {QStringLiteral("annualLoad"), annualLoad},
            {QStringLiteral("strategy"), strategy},
            {QStringLiteral("hybrid"), hybrid && battKwh > 0},
            {QStringLiteral("shadeApplied"), !monthlyLoss.isEmpty() || annualLossPct > 0}};
}

} // namespace ose
