#include "inverter.h"
#include "year_pv.h"

#include <algorithm>
#include <cmath>

namespace ose {

InverterSizing::InverterSizing(QObject* parent) : QObject(parent) {}

QVariantMap InverterSizing::acPower(double dcKw, double pacNomKw, double etaEuro) const
{
    return YearPv::acFromDc(dcKw, pacNomKw, etaEuro);
}

int InverterSizing::maxSeriesFromVoc(double voc, double maxInputV, double tempMin) const
{
    if (voc <= 0 || maxInputV <= 0)
        return 0;
    // Coefficient Voc typique Si ~ -0.3 %/°C → froid augmente Voc
    const double vocCold = voc * (1 + 0.003 * (25 - tempMin));
    return static_cast<int>(std::floor(maxInputV / vocCold));
}

QVariantMap InverterSizing::checkCompatibility(const QVariantMap& panel,
                                                const QVariantMap& inverter,
                                                const QVariantMap& battery,
                                                int panelCount,
                                                double batteryKwh) const
{
    QStringList errors;
    QStringList warnings;
    QStringList infos;
    auto add = [](QStringList& list, const QString& msg) {
        if (!msg.isEmpty() && !list.contains(msg))
            list.append(msg);
    };

    const double voc = panel.value(QStringLiteral("voc")).toDouble();
    const double vmp = panel.value(QStringLiteral("vmp")).toDouble();
    const double isc = panel.value(QStringLiteral("isc")).toDouble();
    double pmax = panel.value(QStringLiteral("pmax")).toDouble();
    if (pmax <= 0.0)
        pmax = panel.value(QStringLiteral("wp")).toDouble();

    double maxV = inverter.value(QStringLiteral("maxInputV")).toDouble();
    if (maxV <= 0.0)
        maxV = inverter.value(QStringLiteral("maxVocInput")).toDouble();
    const double minMppt = inverter.value(QStringLiteral("mpptMinV"), 120).toDouble();
    const double maxI = inverter.value(QStringLiteral("maxInputI"), 0).toDouble();
    const int mpptCount = std::max(1, inverter.value(QStringLiteral("mpptCount"),
                                                     inverter.value(QStringLiteral("nMppt"), 1)).toInt());
    double pac = inverter.value(QStringLiteral("pac")).toDouble();
    if (pac <= 0.0)
        pac = inverter.value(QStringLiteral("pnom")).toDouble();
    const QString invType = inverter.value(QStringLiteral("type")).toString();
    const double bKwh = batteryKwh > 0.01
                            ? batteryKwh
                            : battery.value(QStringLiteral("energy_kwh")).toDouble();
    const bool hasBattery = bKwh > 0.01 || !battery.value(QStringLiteral("id")).toString().isEmpty();

    if (panel.isEmpty() || pmax <= 0)
        add(warnings, QStringLiteral("Panneau non renseigné : la compatibilité stringing ne peut pas être calculée."));
    if (inverter.isEmpty())
        add(warnings, QStringLiteral("Aucun onduleur sélectionné."));

    QVariantMap stringing;
    if (!panel.isEmpty() && !inverter.isEmpty() && voc > 0 && maxV > 0) {
        stringing = calcStringing(panel, inverter);
        const int maxSeries = maxSeriesFromVoc(voc, maxV);
        const int minSeries = vmp > 0 ? static_cast<int>(std::ceil(minMppt / vmp)) : 1;
        const int maxParallel = stringing.value(QStringLiteral("maxParallel")).toInt();
        const QVariantList options = stringing.value(QStringLiteral("options")).toList();

        if (maxSeries <= 0) {
            add(errors, QStringLiteral("Voc du panneau (%1 V) supérieure à la tension DC max de l'onduleur (%2 V).")
                            .arg(voc, 0, 'f', 1).arg(maxV, 0, 'f', 0));
        } else if (minSeries > maxSeries) {
            add(errors, QStringLiteral("Plage MPPT incompatible : %1 V minimum MPPT pour un maximum de %2 panneaux en série.")
                            .arg(minMppt, 0, 'f', 0).arg(maxSeries));
        }
        if (isc > 0 && maxI > 0 && maxParallel < 1) {
            add(errors, QStringLiteral("Isc du panneau (%1 A) supérieur au courant d'entrée max de l'onduleur (%2 A).")
                            .arg(isc, 0, 'f', 1).arg(maxI, 0, 'f', 1));
        }
        if (options.isEmpty() && errors.isEmpty()) {
            add(errors, QStringLiteral("Aucun stringing possible avec ce panneau et cet onduleur (tension MPPT ou courant)."));
        }
        if (maxI <= 0)
            add(warnings, QStringLiteral("Courant d'entrée max de l'onduleur non renseigné : vérifier la fiche."));
        if (maxV <= 0)
            add(warnings, QStringLiteral("Tension DC max de l'onduleur non renseignée : vérifier la fiche."));
        if (minMppt <= 0)
            add(warnings, QStringLiteral("Tension MPPT min de l'onduleur non renseignée."));

        if (panelCount > 0 && !options.isEmpty()) {
            bool exact = false;
            bool sameMppt = (panelCount % mpptCount) == 0;
            QString example;
            for (const QVariant& v : options) {
                const QVariantMap o = v.toMap();
                if (o.value(QStringLiteral("panels")).toInt() == panelCount)
                    exact = true;
                if (example.isEmpty())
                    example = QStringLiteral("%1s × %2p × %3 MPPT")
                                  .arg(o.value(QStringLiteral("series")).toInt())
                                  .arg(o.value(QStringLiteral("parallel")).toInt())
                                  .arg(o.value(QStringLiteral("mppt")).toInt());
            }
            if (!sameMppt)
                add(warnings, QStringLiteral("%1 panneaux ne se répartissent pas également sur %2 MPPT.")
                                .arg(panelCount).arg(mpptCount));
            if (!exact)
                add(warnings, QStringLiteral("%1 panneaux ne correspondent pas à un stringing entier. Exemple compatible : %2.")
                                .arg(panelCount).arg(example));
        }
    } else if (!panel.isEmpty() && !inverter.isEmpty()) {
        add(warnings, QStringLiteral("Données électriques panneau/onduleur incomplètes : stringing non vérifié."));
    }

    const int nPanels = panelCount > 0 ? panelCount : 0;
    double dcAcRatio = 0.0;
    if (nPanels > 0 && pmax > 0 && pac > 0) {
        const double dcKw = nPanels * pmax / 1000.0;
        dcAcRatio = dcKw / pac;
        if (dcAcRatio < 0.70)
            add(warnings, QStringLiteral("Ratio DC/AC faible (%1) : onduleur surdimensionné, rendement à charge partielle dégradé.")
                            .arg(dcAcRatio, 0, 'f', 2));
        else if (dcAcRatio > 1.40)
            add(warnings, QStringLiteral("Ratio DC/AC élevé (%1) : écrêtage probable aux heures ensoleillées.")
                            .arg(dcAcRatio, 0, 'f', 2));
    }
    if (nPanels > 0 && pac <= 0)
        add(warnings, QStringLiteral("Puissance AC de l'onduleur non renseignée : ratio DC/AC non vérifié."));

    if (hasBattery) {
        if (invType != QLatin1String("hybrid") && invType != QLatin1String("offgrid"))
            add(warnings, QStringLiteral("Onduleur de type « %1 » : pas d'entrée batterie documentée. Vérifier la fiche avant de raccorder une batterie.")
                            .arg(invType.isEmpty() ? QStringLiteral("string") : invType));
        const double bMin = battery.value(QStringLiteral("voltage_min_v")).toDouble();
        const double bMax = battery.value(QStringLiteral("voltage_max_v")).toDouble();
        double invBMin = inverter.value(QStringLiteral("batteryMinV")).toDouble();
        if (invBMin <= 0.0)
            invBMin = inverter.value(QStringLiteral("batteryVoltageMin")).toDouble();
        double invBMax = inverter.value(QStringLiteral("batteryMaxV")).toDouble();
        if (invBMax <= 0.0)
            invBMax = inverter.value(QStringLiteral("batteryVoltageMax")).toDouble();
        if (bMax > 0 && invBMax > 0 && bMax > invBMax * 1.02)
            add(errors, QStringLiteral("Tension batterie max (%1 V) supérieure à la plage batterie de l'onduleur (%2 V).")
                            .arg(bMax, 0, 'f', 1).arg(invBMax, 0, 'f', 1));
        if (bMin > 0 && invBMin > 0 && bMin < invBMin * 0.98)
            add(errors, QStringLiteral("Tension batterie min (%1 V) inférieure à la plage batterie de l'onduleur (%2 V).")
                            .arg(bMin, 0, 'f', 1).arg(invBMin, 0, 'f', 1));
        if ((bMax > 0 || bMin > 0) && (invBMax <= 0 || invBMin <= 0))
            add(warnings, QStringLiteral("Plage batterie de l'onduleur non renseignée : compatibilité de tension à vérifier sur la fiche."));

        const QString chem = battery.value(QStringLiteral("chemistry")).toString();
        if (chem.contains(QStringLiteral("NMC"), Qt::CaseInsensitive))
            add(infos, QStringLiteral("Batterie NMC : profil 4,10 V/cellule, float 4,00 V ; vérifier que l'onduleur accepte ce profil."));
        else if (chem.contains(QStringLiteral("LFP"), Qt::CaseInsensitive))
            add(infos, QStringLiteral("Batterie LFP : profil 3,45 V/cellule, float 3,35 V ; vérifier que l'onduleur accepte ce profil."));
        else
            add(warnings, QStringLiteral("Chimie de batterie inconnue : profil de charge à vérifier."));

        if (pac > 0 && bKwh > 0) {
            const double cRate = pac / bKwh;
            if (cRate > 1.0)
                add(warnings, QStringLiteral("Batterie petite pour l'onduleur : Pnom / capacité ≈ %1 C. Vérifier le courant max de la batterie.").arg(cRate, 0, 'f', 2));
            else if (cRate < 0.10)
                add(infos, QStringLiteral("Batterie très grande : charge/décharge lente (≈ %1 C).").arg(cRate, 0, 'f', 2));
        }

        const double bNom = battery.value(QStringLiteral("voltage_nominal_v")).toDouble();
        if (bNom >= 100.0)
            add(infos, QStringLiteral("Batterie haute tension (%1 V) : vérifier l'interface CAN/BMS et la précharge.").arg(bNom, 0, 'f', 0));
    }

    auto toList = [](const QStringList& list) {
        QVariantList out;
        for (const QString& s : list)
            out.append(s);
        return out;
    };
    const QString status = !errors.isEmpty() ? QStringLiteral("danger")
                           : !warnings.isEmpty() ? QStringLiteral("warning")
                                                 : QStringLiteral("ok");
    return {
        {QStringLiteral("ok"), errors.isEmpty()},
        {QStringLiteral("status"), status},
        {QStringLiteral("errors"), toList(errors)},
        {QStringLiteral("warnings"), toList(warnings)},
        {QStringLiteral("infos"), toList(infos)},
        {QStringLiteral("stringing"), stringing},
        {QStringLiteral("dcAcRatio"), std::round(dcAcRatio * 100) / 100},
        {QStringLiteral("hasBattery"), hasBattery},
        {QStringLiteral("hasPanel"), !panel.isEmpty()},
        {QStringLiteral("hasInverter"), !inverter.isEmpty()},
    };
}

QVariantMap InverterSizing::calcStringing(const QVariantMap& panel,
                                          const QVariantMap& inverter) const
{
    const double voc = panel.value(QStringLiteral("voc")).toDouble();
    const double vmp = panel.value(QStringLiteral("vmp")).toDouble();
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
