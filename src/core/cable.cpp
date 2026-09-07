#include "cable.h"

#include <cmath>
#include <vector>

namespace ose {
namespace {

constexpr double kRhoCu = 1.0 / 58.0;
constexpr double kRhoAl = 1.0 / 34.0;
const std::vector<double> kSections = {1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120, 150, 185, 240, 300};

double roundN(double n, int decimals = 2)
{
    const double f = std::pow(10, decimals);
    return std::round((n + 1e-12) * f) / f;
}

struct CircuitCfg {
    double dropFactor;
    double lossFactor;
    bool usesCosPhi;
};

CircuitCfg circuitCfg(const QString& circuit)
{
    if (circuit == QLatin1String("ac_tri"))
        return {std::sqrt(3.0), 3.0, true};
    if (circuit == QLatin1String("ac_mono"))
        return {2.0, 2.0, true};
    return {2.0, 2.0, false};
}

double resistivity(const QString& material)
{
    return material == QLatin1String("Al") ? kRhoAl : kRhoCu;
}

double roundUpSection(double sectionMm2)
{
    for (double s : kSections) {
        if (s >= sectionMm2 - 1e-9)
            return s;
    }
    return kSections.back();
}

} // namespace

CableCalc::CableCalc(QObject* parent) : QObject(parent) {}

QVariantMap CableCalc::evalSection(const QVariantMap& p) const
{
    const QString material = p.value(QStringLiteral("material"), QStringLiteral("Cu")).toString()
                                     == QLatin1String("Al")
                                 ? QStringLiteral("Al")
                                 : QStringLiteral("Cu");
    QString circuit = p.value(QStringLiteral("circuit"), QStringLiteral("dc")).toString();
    if (circuit != QLatin1String("ac_mono") && circuit != QLatin1String("ac_tri"))
        circuit = QStringLiteral("dc");
    const CircuitCfg cfg = circuitCfg(circuit);
    const double rho = resistivity(material);
    const double cosPhi = cfg.usesCosPhi ? p.value(QStringLiteral("cosPhi"), 1).toDouble() : 1;
    const double I = std::max(0.0, p.value(QStringLiteral("I")).toDouble());
    const double L = std::max(0.0, p.value(QStringLiteral("L")).toDouble());
    const double S = std::max(0.01, p.value(QStringLiteral("section")).toDouble());
    const double U = std::max(1e-9, p.value(QStringLiteral("U_system")).toDouble());

    const double dropV = cfg.dropFactor * rho * L * I * cosPhi / S;
    const double dropPct = (dropV / U) * 100;
    const double lossW = cfg.lossFactor * rho * L * I * I / S;
    return {{QStringLiteral("section"), S},
            {QStringLiteral("dropV"), roundN(dropV, 3)},
            {QStringLiteral("dropPct"), roundN(dropPct, 3)},
            {QStringLiteral("lossW"), roundN(lossW, 2)}};
}

QVariantMap CableCalc::calcSection(const QVariantMap& p) const
{
    const QString material = p.value(QStringLiteral("material"), QStringLiteral("Cu")).toString()
                                     == QLatin1String("Al")
                                 ? QStringLiteral("Al")
                                 : QStringLiteral("Cu");
    QString circuit = p.value(QStringLiteral("circuit"), QStringLiteral("dc")).toString();
    if (circuit != QLatin1String("ac_mono") && circuit != QLatin1String("ac_tri"))
        circuit = QStringLiteral("dc");
    const CircuitCfg cfg = circuitCfg(circuit);
    const double rho = resistivity(material);
    const double cosPhi = cfg.usesCosPhi ? p.value(QStringLiteral("cosPhi"), 1).toDouble() : 1;
    const double I = std::max(0.0, p.value(QStringLiteral("I")).toDouble());
    const double L = std::max(0.0, p.value(QStringLiteral("L")).toDouble());
    const double U_system = std::max(1e-9, p.value(QStringLiteral("U_system")).toDouble());
    const double maxDropPct = p.contains(QStringLiteral("maxDropPct"))
                                  ? p.value(QStringLiteral("maxDropPct")).toDouble()
                                  : (circuit == QLatin1String("dc") ? 1.0 : 1.5);

    double S_theory = 0;
    if (I > 0 && L > 0)
        S_theory = cfg.dropFactor * rho * L * I * cosPhi / (U_system * maxDropPct / 100.0);
    const double S_rec = roundUpSection(S_theory);

    QVariantList table;
    QVariantMap recommended;
    for (double s : kSections) {
        QVariantMap args = p;
        args.insert(QStringLiteral("section"), s);
        args.insert(QStringLiteral("material"), material);
        args.insert(QStringLiteral("circuit"), circuit);
        const QVariantMap ev = evalSection(args);
        const bool ok = ev.value(QStringLiteral("dropPct")).toDouble() <= maxDropPct + 1e-9;
        QVariantMap row = ev;
        row.insert(QStringLiteral("ok"), ok);
        table.append(row);
        if (recommended.isEmpty() && ok)
            recommended = row;
    }
    if (recommended.isEmpty() && !table.isEmpty())
        recommended = table.last().toMap();

    return {{QStringLiteral("sectionTheory"), roundN(S_theory, 3)},
            {QStringLiteral("sectionRecommended"), S_rec},
            {QStringLiteral("maxDropPct"), maxDropPct},
            {QStringLiteral("material"), material},
            {QStringLiteral("circuit"), circuit},
            {QStringLiteral("recommended"), recommended},
            {QStringLiteral("table"), table}};
}

} // namespace ose
