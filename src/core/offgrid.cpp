#include "offgrid.h"

#include "solar_math.h"

#include <algorithm>
#include <cmath>

namespace ose {

OffgridSizing::OffgridSizing(QObject* parent) : QObject(parent) {}

QVariantMap OffgridSizing::run(const QVariantMap& input) const
{
    const double lat = input.value(QStringLiteral("lat"), 46.5).toDouble();
    const QVariantList weather = input.value(QStringLiteral("weatherData")).toList();
    const double dailyWh = input.value(QStringLiteral("dailyConsumptionWh"), 8000).toDouble();
    const double tilt = input.value(QStringLiteral("tilt"), 30).toDouble();
    const double azimuth = input.value(QStringLiteral("azimuth"), 0).toDouble();
    const double dod = input.value(QStringLiteral("dod"), 80).toDouble();
    const double battCostPerKwh = input.value(QStringLiteral("battCostPerKwh"), 400).toDouble();
    const double pvCostPerKwc = input.value(QStringLiteral("pvCostPerKwc"), 1000).toDouble();
    const double coverageTarget = input.value(QStringLiteral("coverageTarget"), 95).toDouble();
    const double maxDeficitDaysPct = input.value(QStringLiteral("maxDeficitDaysPct"), 10).toDouble();

    SolarMath sm;
    QVariantMap best;
    QVariantList candidates;

    for (int p = 10; p <= 100; p += 5) {
        const double Ppeak = p / 10.0;
        for (int b = 5; b <= 50; b += 5) {
            const double battKwh = b;
            const double battCapWh = battKwh * 1000;
            const QVariantList months = sm.offgridSystem({
                {QStringLiteral("lat"), lat},
                {QStringLiteral("weatherData"), weather},
                {QStringLiteral("Ppeak"), Ppeak},
                {QStringLiteral("battCap"), battCapWh},
                {QStringLiteral("dod"), dod},
                {QStringLiteral("dailyConsumption"), dailyWh},
                {QStringLiteral("tilt"), tilt},
                {QStringLiteral("azimuth"), azimuth},
            });
            double avgCoverage = 0;
            double deficitDays = 0;
            double totalDays = 0;
            for (const QVariant& v : months) {
                const QVariantMap m = v.toMap();
                avgCoverage += m.value(QStringLiteral("coverageRatio")).toDouble();
                const int days = 30;
                totalDays += days;
                if (m.value(QStringLiteral("deficit")).toDouble() > 0.1)
                    deficitDays += days * (1.0 - m.value(QStringLiteral("coverageRatio")).toDouble() / 100.0);
            }
            avgCoverage /= std::max(1, int(months.size()));
            const double deficitPct = totalDays > 0 ? (deficitDays / totalDays) * 100 : 0;
            const double cost = Ppeak * pvCostPerKwc + battKwh * battCostPerKwh;
            QVariantMap c{
                {QStringLiteral("Ppeak"), Ppeak},
                {QStringLiteral("battKwh"), battKwh},
                {QStringLiteral("coverage"), avgCoverage},
                {QStringLiteral("deficitDaysPct"), std::round(deficitPct * 10) / 10},
                {QStringLiteral("cost"), int(std::lround(cost))},
                {QStringLiteral("monthly"), months},
            };
            candidates.append(c);

            const bool ok = avgCoverage >= coverageTarget && deficitPct <= maxDeficitDaysPct;
            const bool bestOk = !best.isEmpty()
                                && best.value(QStringLiteral("coverage")).toDouble() >= coverageTarget
                                && best.value(QStringLiteral("deficitDaysPct")).toDouble() <= maxDeficitDaysPct;
            bool better = false;
            if (best.isEmpty())
                better = true;
            else if (ok && !bestOk)
                better = true;
            else if (ok && bestOk)
                better = cost < best.value(QStringLiteral("cost")).toDouble();
            else if (!ok && !bestOk)
                better = avgCoverage > best.value(QStringLiteral("coverage")).toDouble();
            if (better)
                best = c;
        }
    }

    return {{QStringLiteral("best"), best},
            {QStringLiteral("candidates"), candidates},
            {QStringLiteral("dailyConsumptionWh"), dailyWh}};
}

} // namespace ose
