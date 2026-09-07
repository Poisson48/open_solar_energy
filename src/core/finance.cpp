#include "finance.h"

#include "constants.h"

#include <cmath>

namespace ose {

Finance::Finance(QObject* parent) : QObject(parent) {}

namespace {

struct FinOpts {
    double esc = kElecEscalation;
    double disc = kDiscountRate;
    double deg = kPanelDegradation;
    int life = kSystemLifetime;
};

FinOpts finOpts(const QVariantMap& opts)
{
    FinOpts o;
    if (opts.contains(QStringLiteral("elecEscalation")))
        o.esc = opts.value(QStringLiteral("elecEscalation")).toDouble();
    if (opts.contains(QStringLiteral("discountRate")))
        o.disc = opts.value(QStringLiteral("discountRate")).toDouble();
    if (opts.contains(QStringLiteral("panelDegradation")))
        o.deg = opts.value(QStringLiteral("panelDegradation")).toDouble();
    if (opts.contains(QStringLiteral("lifetime")))
        o.life = opts.value(QStringLiteral("lifetime")).toInt();
    return o;
}

} // namespace

double Finance::calcCurrentAnnualBill(const QVariantMap& bill) const
{
    double total = bill.value(QStringLiteral("subscriptionPerYear")).toDouble();
    const QVariantList monthly = bill.value(QStringLiteral("monthlyKwh")).toList();
    const QString tariff = bill.value(QStringLiteral("tariff"), QStringLiteral("base")).toString();
    if (tariff == QLatin1String("base")) {
        const double price = bill.value(QStringLiteral("priceBase"), 0.2516).toDouble();
        for (const QVariant& k : monthly)
            total += k.toDouble() * price;
    } else {
        const QVariantList hpList = bill.value(QStringLiteral("monthlyKwh_hp")).toList();
        const QVariantMap priceHpHc = bill.value(QStringLiteral("priceHpHc")).toMap();
        const double hp = priceHpHc.value(QStringLiteral("hp"), 0.2460).toDouble();
        const double hc = priceHpHc.value(QStringLiteral("hc"), 0.1860).toDouble();
        for (int i = 0; i < monthly.size(); ++i) {
            const double kwh = monthly[i].toDouble();
            if (kwh <= 0)
                continue;
            double hpRatio = 0.65;
            if (!hpList.isEmpty() && i < hpList.size())
                hpRatio = std::min(1.0, std::max(0.0, hpList[i].toDouble() / kwh));
            total += kwh * hpRatio * hp + kwh * (1 - hpRatio) * hc;
        }
    }
    return total;
}

double Finance::calcSavingsOnBill(const QVariantList& monthlyMetrics, const QVariantMap& bill) const
{
    if (bill.value(QStringLiteral("tariff")).toString() == QLatin1String("base")) {
        const double price = bill.value(QStringLiteral("priceBase"), 0.2516).toDouble();
        double sum = 0;
        for (const QVariant& v : monthlyMetrics)
            sum += v.toMap().value(QStringLiteral("autoconsoKwh")).toDouble() * price;
        return sum;
    }
    const QVariantMap priceHpHc = bill.value(QStringLiteral("priceHpHc")).toMap();
    const double hp = priceHpHc.value(QStringLiteral("hp"), 0.2460).toDouble();
    double sum = 0;
    for (const QVariant& v : monthlyMetrics)
        sum += v.toMap().value(QStringLiteral("autoconsoKwh")).toDouble() * hp;
    return sum;
}

QVariant Finance::calcPayback(double systemCost, double firstYearGain, const QVariantMap& opts) const
{
    if (firstYearGain <= 0 || systemCost <= 0)
        return QVariant();
    const FinOpts o = finOpts(opts);
    const double omCost = systemCost * 0.005;
    const double inverterRpl = systemCost * 0.12;
    double cum = 0;
    for (int y = 1; y <= 40; ++y) {
        const double gain = firstYearGain * std::pow(1 + o.esc, y - 1) * std::pow(1 - o.deg, y - 1);
        const double netGain = gain - omCost - (y == 15 ? inverterRpl : 0);
        cum += netGain / std::pow(1 + o.disc, y);
        if (cum >= systemCost)
            return y;
    }
    return QVariant();
}

double Finance::calcNPV(double systemCost, double firstYearGain, const QVariantMap& opts) const
{
    if (systemCost <= 0)
        return 0;
    if (firstYearGain <= 0)
        return -systemCost;
    const FinOpts o = finOpts(opts);
    const double omCost = systemCost * 0.005;
    const double inverterRpl = systemCost * 0.12;
    double npv = -systemCost;
    for (int y = 1; y <= o.life; ++y) {
        const double gain = firstYearGain * std::pow(1 + o.esc, y - 1) * std::pow(1 - o.deg, y - 1);
        const double netGain = gain - omCost - (y == 15 ? inverterRpl : 0);
        npv += netGain / std::pow(1 + o.disc, y);
    }
    return npv;
}

double Finance::calcLCOE(double systemCost, double annualProd, const QVariantMap& opts) const
{
    if (annualProd <= 0 || systemCost <= 0)
        return 0;
    const FinOpts o = finOpts(opts);
    constexpr double omRate = 0.005;
    const double inverterRepl = systemCost * 0.12;
    double cumProd = 0;
    double cumCost = systemCost;
    for (int y = 1; y <= o.life; ++y) {
        cumProd += annualProd * std::pow(1 - o.deg, y - 1);
        cumCost += systemCost * omRate;
        if (y == 15)
            cumCost += inverterRepl;
    }
    return cumCost / cumProd;
}

double Finance::calcFrenchIncentive(double Ppeak) const
{
    if (Ppeak <= 0)
        return 0;
    if (Ppeak <= 3)
        return std::round(Ppeak * 300);
    if (Ppeak <= 9)
        return std::round(Ppeak * 230);
    if (Ppeak <= 36)
        return std::round(Ppeak * 100);
    if (Ppeak <= 100)
        return std::round(Ppeak * 60);
    return 0;
}

} // namespace ose
