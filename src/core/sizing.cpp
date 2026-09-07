#include "sizing.h"

#include "finance.h"
#include "solar_math.h"

#include <algorithm>
#include <cmath>

namespace ose {

SizingEngine::SizingEngine(QObject* parent) : QObject(parent) {}

QVariantMap SizingEngine::run(const QVariantMap& input) const
{
    const double lat = input.value(QStringLiteral("lat"), 46.5).toDouble();
    const QVariantList weather = input.value(QStringLiteral("weatherData")).toList();
    const QVariantList monthlyKwh = input.value(QStringLiteral("monthlyKwh")).toList();
    const double losses = input.value(QStringLiteral("losses"), 14).toDouble();
    const double tilt = input.value(QStringLiteral("tilt"), 30).toDouble();
    const double azimuth = input.value(QStringLiteral("azimuth"), 0).toDouble();
    const double costPerKwc = input.value(QStringLiteral("costPerKwc"), 1200).toDouble();
    const double priceBase = input.value(QStringLiteral("priceBase"), 0.2516).toDouble();
    const double injectionPrice = input.value(QStringLiteral("injectionPrice"), 0.04).toDouble();
    const QString strategy = input.value(QStringLiteral("strategy"), QStringLiteral("roi")).toString();
    const double coverageTarget = input.value(QStringLiteral("coverageTarget"), 70).toDouble() / 100.0;

    double annualLoad = 0;
    for (const QVariant& v : monthlyKwh)
        annualLoad += v.toDouble();
    if (annualLoad <= 0)
        annualLoad = 3500;

    SolarMath sm;
    Finance fin;
    QVariantList candidates;
    QVariantMap best;

    for (int step = 1; step <= 150; ++step) {
        const double Ppeak = step * 0.1;
        const double systemCost = Ppeak * costPerKwc;
        const QVariantMap annual = sm.gridSystemAnnual({
            {QStringLiteral("lat"), lat},
            {QStringLiteral("weatherData"), weather},
            {QStringLiteral("Ppeak"), Ppeak},
            {QStringLiteral("losses"), losses},
            {QStringLiteral("tilt"), tilt},
            {QStringLiteral("azimuth"), azimuth},
            {QStringLiteral("systemCost"), systemCost},
            {QStringLiteral("kwhPrice"), priceBase},
        });
        const double E = annual.value(QStringLiteral("E_annual")).toDouble();
        // Approximation mensuelle : prorata charge
        double autoconso = 0;
        double injected = 0;
        const QVariantList months = annual.value(QStringLiteral("monthly")).toList();
        for (int i = 0; i < months.size(); ++i) {
            const double E_m = months[i].toMap().value(QStringLiteral("E_month")).toDouble();
            const double load_m = i < monthlyKwh.size() ? monthlyKwh[i].toDouble()
                                                        : annualLoad / 12.0;
            const double ac = std::min(E_m, load_m);
            autoconso += ac;
            injected += std::max(0.0, E_m - load_m);
        }
        const double savings = autoconso * priceBase + injected * injectionPrice;
        const QVariant payback = fin.calcPayback(systemCost, savings);
        const double coverage = annualLoad > 0 ? autoconso / annualLoad : 0;
        const double autoconsoRate = E > 0 ? autoconso / E : 0;

        QVariantMap c{
            {QStringLiteral("Ppeak"), std::round(Ppeak * 10) / 10},
            {QStringLiteral("E_annual"), E},
            {QStringLiteral("autoconso"), int(std::lround(autoconso))},
            {QStringLiteral("injected"), int(std::lround(injected))},
            {QStringLiteral("savings"), int(std::lround(savings))},
            {QStringLiteral("systemCost"), int(std::lround(systemCost))},
            {QStringLiteral("coverage"), std::round(coverage * 1000) / 10},
            {QStringLiteral("autoconsoRate"), std::round(autoconsoRate * 1000) / 10},
            {QStringLiteral("payback"), payback},
            {QStringLiteral("PR"), annual.value(QStringLiteral("PR"))},
            {QStringLiteral("LCOE"), annual.value(QStringLiteral("LCOE"))},
        };
        candidates.append(c);

        bool better = false;
        if (best.isEmpty()) {
            better = true;
        } else if (strategy == QLatin1String("autoconso")) {
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
            // ROI : payback minimal
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
            {QStringLiteral("strategy"), strategy}};
}

} // namespace ose
