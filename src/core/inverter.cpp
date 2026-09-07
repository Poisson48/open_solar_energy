#include "inverter.h"

#include <algorithm>
#include <cmath>

namespace ose {

InverterSizing::InverterSizing(QObject* parent) : QObject(parent) {}

int InverterSizing::maxSeriesFromVoc(double voc, double maxInputV, double tempMin) const
{
    if (voc <= 0 || maxInputV <= 0)
        return 0;
    // Coefficient Voc typique Si ~ -0.3 %/°C → froid augmente Voc
    const double vocCold = voc * (1 + 0.003 * (25 - tempMin));
    return static_cast<int>(std::floor(maxInputV / vocCold));
}

QVariantMap InverterSizing::calcStringing(const QVariantMap& panel,
                                          const QVariantMap& inverter) const
{
    const double voc = panel.value(QStringLiteral("voc")).toDouble();
    const double vmp = panel.value(QStringLiteral("vmp")).toDouble();
    const double isc = panel.value(QStringLiteral("isc")).toDouble();
    const double imp = panel.value(QStringLiteral("imp")).toDouble();
    const double pmax = panel.value(QStringLiteral("pmax")).toDouble();

    const double maxV = inverter.value(QStringLiteral("maxInputV")).toDouble();
    const double minMppt = inverter.value(QStringLiteral("mpptMinV"), 120).toDouble();
    const double maxMppt = inverter.value(QStringLiteral("mpptMaxV"), maxV).toDouble();
    const double maxI = inverter.value(QStringLiteral("maxInputI"), 15).toDouble();
    const int mpptCount = inverter.value(QStringLiteral("mpptCount"), 1).toInt();
    const double pac = inverter.value(QStringLiteral("pac")).toDouble();

    const int maxSeries = maxSeriesFromVoc(voc, maxV);
    int minSeries = 1;
    if (vmp > 0)
        minSeries = static_cast<int>(std::ceil(minMppt / vmp));
    minSeries = std::max(1, std::min(minSeries, maxSeries));

    const int maxParallel = imp > 0 ? static_cast<int>(std::floor(maxI / imp)) : 1;

    QVariantList options;
    for (int s = minSeries; s <= maxSeries; ++s) {
        for (int p = 1; p <= std::max(1, maxParallel); ++p) {
            const double stringVmp = s * vmp;
            const double stringVoc = s * voc;
            const double stringImp = p * imp;
            const double dcPower = s * p * pmax * mpptCount;
            if (stringVmp < minMppt || stringVmp > maxMppt)
                continue;
            if (stringVoc > maxV)
                continue;
            if (stringImp > maxI)
                continue;
            const double ratio = pac > 0 ? dcPower / (pac * 1000.0) : 0;
            options.append(QVariantMap{
                {QStringLiteral("series"), s},
                {QStringLiteral("parallel"), p},
                {QStringLiteral("mppt"), mpptCount},
                {QStringLiteral("panels"), s * p * mpptCount},
                {QStringLiteral("dcPowerW"), int(std::lround(dcPower))},
                {QStringLiteral("dcAcRatio"), std::round(ratio * 100) / 100},
                {QStringLiteral("vmp"), std::round(stringVmp * 10) / 10},
                {QStringLiteral("voc"), std::round(stringVoc * 10) / 10},
            });
        }
    }

    return {{QStringLiteral("minSeries"), minSeries},
            {QStringLiteral("maxSeries"), maxSeries},
            {QStringLiteral("maxParallel"), maxParallel},
            {QStringLiteral("options"), options}};
}

} // namespace ose
