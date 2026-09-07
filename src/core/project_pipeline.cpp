#include "project_pipeline.h"

#include <QCryptographicHash>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QMetaType>
#include <algorithm>
#include <cmath>

namespace ose {

ProjectPipeline::ProjectPipeline(QObject* parent) : QObject(parent) {}

QVariantMap ProjectPipeline::fingerprintParts(const QVariantMap& project) const
{
    const QVariantMap loc = project.value(QStringLiteral("location")).toMap();
    const QVariantMap weatherMeta = project.value(QStringLiteral("weatherMeta")).toMap();
    const QVariantList weather = project.value(QStringLiteral("weatherData")).toList();
    const QVariantMap site = project.value(QStringLiteral("siteSurvey")).toMap();
    const QVariantMap form = project.value(QStringLiteral("formState")).toMap();
    double ghi0 = 0;
    if (!weather.isEmpty())
        ghi0 = weather.first().toMap().value(QStringLiteral("GHI")).toDouble();

    const QString locName = loc.value(QStringLiteral("name")).toString();
    const QString locKey = QStringLiteral("%1|%2|%3")
                               .arg(locName)
                               .arg(loc.value(QStringLiteral("lat")).toDouble(), 0, 'f', 4)
                               .arg(loc.value(QStringLiteral("lon")).toDouble(), 0, 'f', 4);

    return {
        {QStringLiteral("installType"), project.value(QStringLiteral("installType")).toString()},
        {QStringLiteral("location"), locKey},
        {QStringLiteral("weather"),
         QStringLiteral("%1|n=%2|ghi0=%3")
             .arg(weatherMeta.value(QStringLiteral("source")).toString())
             .arg(weather.size())
             .arg(ghi0, 0, 'f', 1)},
        {QStringLiteral("shade"),
         QStringLiteral("%1|h=%2")
             .arg(site.value(QStringLiteral("annualLossPct")).toDouble(), 0, 'f', 2)
             .arg(site.value(QStringLiteral("points")).toList().size())},
        {QStringLiteral("monthlyKwh"),
         QString::fromUtf8(
             QJsonDocument(QJsonArray::fromVariantList(project.value(QStringLiteral("monthlyKwh")).toList()))
                 .toJson(QJsonDocument::Compact))},
        {QStringLiteral("tilt"), form.value(QStringLiteral("tilt")).toDouble()},
        {QStringLiteral("azimuth"), form.value(QStringLiteral("azimuth")).toDouble()},
        {QStringLiteral("battKwh"), form.value(QStringLiteral("battKwh")).toDouble()},
        {QStringLiteral("strategy"), form.value(QStringLiteral("strategy")).toString()},
        {QStringLiteral("annualKwh"), form.value(QStringLiteral("annualKwh")).toDouble()},
    };
}

QString ProjectPipeline::fingerprint(const QVariantMap& project) const
{
    const QVariantMap parts = fingerprintParts(project);
    const QByteArray json = QJsonDocument(QJsonObject::fromVariantMap(parts)).toJson(QJsonDocument::Compact);
    return QString::fromLatin1(QCryptographicHash::hash(json, QCryptographicHash::Sha1).toHex());
}

bool ProjectPipeline::isStale(const QVariantMap& project) const
{
    const QString saved = project.value(QStringLiteral("resultsFingerprint")).toString();
    if (saved.isEmpty())
        return project.contains(QStringLiteral("sizingResult"))
               || project.contains(QStringLiteral("offgridResult"))
               || project.contains(QStringLiteral("gridResult"));
    return saved != fingerprint(project);
}

QVariantMap ProjectPipeline::staleDiagnosis(const QVariantMap& project) const
{
    QVariantMap out;
    const bool stale = isStale(project);
    out.insert(QStringLiteral("stale"), stale);
    if (!stale) {
        out.insert(QStringLiteral("summary"), QStringLiteral("Résultats à jour."));
        out.insert(QStringLiteral("changes"), QVariantList{});
        out.insert(QStringLiteral("actions"), QVariantList{});
        out.insert(QStringLiteral("canRefresh"), false);
        return out;
    }

    const QVariantMap cur = fingerprintParts(project);
    const QVariantMap saved = project.value(QStringLiteral("resultsBasis")).toMap();
    QVariantList changes;

    auto addIf = [&](const QString& key, const QString& label) {
        if (saved.isEmpty())
            return;
        if (saved.value(key) != cur.value(key))
            changes.append(label);
    };
    addIf(QStringLiteral("installType"), QStringLiteral("type d’installation"));
    addIf(QStringLiteral("location"), QStringLiteral("lieu"));
    addIf(QStringLiteral("weather"), QStringLiteral("météo"));
    addIf(QStringLiteral("shade"), QStringLiteral("ombrage site"));
    addIf(QStringLiteral("monthlyKwh"), QStringLiteral("consommation mensuelle"));
    addIf(QStringLiteral("tilt"), QStringLiteral("inclinaison"));
    addIf(QStringLiteral("azimuth"), QStringLiteral("azimut"));
    addIf(QStringLiteral("battKwh"), QStringLiteral("batterie"));
    addIf(QStringLiteral("strategy"), QStringLiteral("stratégie de dimensionnement"));
    addIf(QStringLiteral("annualKwh"), QStringLiteral("conso annuelle"));

    if (changes.isEmpty()) {
        if (project.value(QStringLiteral("resultsFingerprint")).toString().isEmpty())
            changes.append(QStringLiteral("résultats non liés aux paramètres actuels"));
        else
            changes.append(QStringLiteral("paramètres d’entrée (lieu, météo, orientation…)"));
    }

    const QString install = project.value(QStringLiteral("installType")).toString();
    const bool hasSizing = project.contains(QStringLiteral("sizingResult"));
    const bool hasOff = project.contains(QStringLiteral("offgridResult"));
    const bool hasGrid = project.contains(QStringLiteral("gridResult"));
    const bool hasWeather = !project.value(QStringLiteral("weatherData")).toList().isEmpty();

    QVariantList actions;
    auto pushAction = [&](const QString& tab, const QString& label) {
        for (const QVariant& a : actions) {
            if (a.toMap().value(QStringLiteral("tab")).toString() == tab)
                return;
        }
        actions.append(QVariantMap{{QStringLiteral("tab"), tab}, {QStringLiteral("label"), label}});
    };

    if (install == QLatin1String("offgrid")) {
        pushAction(QStringLiteral("offgrid"), QStringLiteral("Hors réseau"));
        if (hasSizing)
            pushAction(QStringLiteral("sizing"), QStringLiteral("Dimensionnement"));
    } else if (install == QLatin1String("hybrid")) {
        pushAction(QStringLiteral("sizing"), QStringLiteral("Dimensionnement"));
        pushAction(QStringLiteral("offgrid"), QStringLiteral("Hors réseau"));
        if (hasGrid)
            pushAction(QStringLiteral("grid"), QStringLiteral("Système PV"));
    } else {
        pushAction(QStringLiteral("sizing"), QStringLiteral("Dimensionnement"));
        if (hasGrid || !hasSizing)
            pushAction(QStringLiteral("grid"), QStringLiteral("Système PV"));
    }
    // Toujours proposer les onglets qui ont déjà un résultat (même hors parcours)
    if (hasSizing)
        pushAction(QStringLiteral("sizing"), QStringLiteral("Dimensionnement"));
    if (hasOff)
        pushAction(QStringLiteral("offgrid"), QStringLiteral("Hors réseau"));
    if (hasGrid)
        pushAction(QStringLiteral("grid"), QStringLiteral("Système PV"));

    QStringList actionLabels;
    for (const QVariant& a : actions)
        actionLabels.append(a.toMap().value(QStringLiteral("label")).toString());

    QString summary;
    if (changes.size() == 1)
        summary = QStringLiteral("Changement : %1.").arg(changes.first().toString());
    else {
        QStringList parts;
        for (const QVariant& c : changes)
            parts.append(c.toString());
        summary = QStringLiteral("Changements : %1.").arg(parts.join(QStringLiteral(", ")));
    }
    if (!actionLabels.isEmpty())
        summary += QStringLiteral(" Recalculez : %1.").arg(actionLabels.join(QStringLiteral(" → ")));
    if (hasWeather)
        summary += QStringLiteral(" Ou utilisez « Mettre à jour » pour tout recalculer.");
    else
        summary += QStringLiteral(" Chargez d’abord une météo dans Lieu.");

    out.insert(QStringLiteral("summary"), summary);
    out.insert(QStringLiteral("changes"), changes);
    out.insert(QStringLiteral("actions"), actions);
    out.insert(QStringLiteral("canRefresh"), hasWeather && (!actions.isEmpty() || hasSizing || hasOff || hasGrid));
    return out;
}

QVariantList ProjectPipeline::applyMonthlyShade(const QVariantList& eMonth,
                                                const QVariantList& monthlyLoss) const
{
    QVariantList out;
    for (int i = 0; i < eMonth.size(); ++i) {
        double e = eMonth[i].toDouble();
        double loss = 0;
        if (i < monthlyLoss.size()) {
            loss = monthlyLoss[i].toDouble();
            if (loss > 1.0)
                loss /= 100.0; // accept % or fraction
        }
        out.append(e * (1.0 - std::clamp(loss, 0.0, 0.95)));
    }
    return out;
}

int ProjectPipeline::estimatePanelCount(double Ppeak, double panelWp) const
{
    if (panelWp <= 0)
        panelWp = 400;
    return std::max(1, int(std::lround(Ppeak * 1000.0 / panelWp)));
}

QVariantList ProjectPipeline::buildQuoteLines(const QVariantMap& project) const
{
    const QVariantMap form = project.value(QStringLiteral("formState")).toMap();
    const QVariantMap sizing = project.value(QStringLiteral("sizingResult")).toMap()
                                   .value(QStringLiteral("best")).toMap();
    const QVariantMap off = project.value(QStringLiteral("offgridResult")).toMap()
                                .value(QStringLiteral("best")).toMap();
    const QVariantMap grid = project.value(QStringLiteral("gridResult")).toMap();

    const double ppeak = form.value(QStringLiteral("Ppeak"),
                                    sizing.value(QStringLiteral("Ppeak"),
                                                 off.value(QStringLiteral("Ppeak"), 3))).toDouble();
    double cost = form.value(QStringLiteral("systemCost")).toDouble();
    if (cost <= 0)
        cost = sizing.value(QStringLiteral("systemCost")).toDouble();
    if (cost <= 0)
        cost = off.value(QStringLiteral("cost")).toDouble();
    if (cost <= 0)
        cost = ppeak * 1200.0;

    const double batt = form.value(QStringLiteral("battKwh"),
                                   off.value(QStringLiteral("battKwh"), 0)).toDouble();
    const double panelWp = form.value(QStringLiteral("panelWp"), 400).toDouble();
    const int nPanels = estimatePanelCount(ppeak, panelWp);
    const QString panelModel = form.value(QStringLiteral("panelModel"),
                                          QStringLiteral("Modules PV")).toString();
    const QString invModel = form.value(QStringLiteral("inverterModel"),
                                        QStringLiteral("Onduleur")).toString();

    const double eAnnual = grid.value(QStringLiteral("E_annual"),
                                      sizing.value(QStringLiteral("E_annual"), 0)).toDouble();

    const double modules = cost * 0.52;
    const double inverter = cost * 0.18;
    const double structure = cost * 0.12;
    const double labor = cost * 0.13;
    const double misc = cost - modules - inverter - structure - labor;

    QVariantList lines;
    lines.append(QVariantMap{
        {QStringLiteral("label"),
         QStringLiteral("%1 × %2 Wc (%3 kWc)")
             .arg(nPanels)
             .arg(int(panelWp))
             .arg(ppeak, 0, 'f', 1)},
        {QStringLiteral("amount"), std::round(modules * 100) / 100},
        {QStringLiteral("qty"), nPanels},
        {QStringLiteral("unit"), panelModel},
    });
    lines.append(QVariantMap{
        {QStringLiteral("label"), invModel},
        {QStringLiteral("amount"), std::round(inverter * 100) / 100},
        {QStringLiteral("qty"), 1},
    });
    if (batt > 0) {
        lines.append(QVariantMap{
            {QStringLiteral("label"), QStringLiteral("Stockage %1 kWh").arg(batt)},
            {QStringLiteral("amount"), std::round(batt * 400 * 100) / 100},
            {QStringLiteral("qty"), 1},
        });
    }
    lines.append(QVariantMap{
        {QStringLiteral("label"), QStringLiteral("Structure + câblage DC/AC")},
        {QStringLiteral("amount"), std::round(structure * 100) / 100},
    });
    lines.append(QVariantMap{
        {QStringLiteral("label"), QStringLiteral("Main d'œuvre pose & mise en service")},
        {QStringLiteral("amount"), std::round(labor * 100) / 100},
    });
    if (misc > 10) {
        lines.append(QVariantMap{
            {QStringLiteral("label"), QStringLiteral("Divers / frais de dossier")},
            {QStringLiteral("amount"), std::round(misc * 100) / 100},
        });
    }
    if (eAnnual > 0) {
        lines.append(QVariantMap{
            {QStringLiteral("label"),
             QStringLiteral("Annexe — production estimée %1 kWh/an").arg(int(eAnnual))},
            {QStringLiteral("amount"), 0},
            {QStringLiteral("note"), true},
        });
    }
    const QVariantMap site = project.value(QStringLiteral("siteSurvey")).toMap();
    const double shade = site.value(QStringLiteral("annualLossPct")).toDouble();
    if (shade > 0.1) {
        lines.append(QVariantMap{
            {QStringLiteral("label"),
             QStringLiteral("Annexe — ombrage site %1 % perte beam").arg(shade, 0, 'f', 1)},
            {QStringLiteral("amount"), 0},
            {QStringLiteral("note"), true},
        });
    }
    return lines;
}

QVariantMap ProjectPipeline::buildQuoteMeta(const QVariantMap& project) const
{
    const QVariantMap loc = project.value(QStringLiteral("location")).toMap();
    const QVariantMap form = project.value(QStringLiteral("formState")).toMap();
    const QVariantMap sizing = project.value(QStringLiteral("sizingResult")).toMap()
                                   .value(QStringLiteral("best")).toMap();
    QString client = project.value(QStringLiteral("client")).toString();
    if (client.isEmpty()) {
        const QVariant c = project.value(QStringLiteral("client"));
        if (c.typeId() == QMetaType::QVariantMap)
            client = c.toMap().value(QStringLiteral("name")).toString();
    }
    return {
        {QStringLiteral("projectName"), project.value(QStringLiteral("name")).toString()},
        {QStringLiteral("client"), client},
        {QStringLiteral("location"), loc.value(QStringLiteral("name")).toString()},
        {QStringLiteral("lat"), loc.value(QStringLiteral("lat")).toDouble()},
        {QStringLiteral("lon"), loc.value(QStringLiteral("lon")).toDouble()},
        {QStringLiteral("tilt"), form.value(QStringLiteral("tilt"), 30).toDouble()},
        {QStringLiteral("azimuth"), form.value(QStringLiteral("azimuth"), 0).toDouble()},
        {QStringLiteral("Ppeak"), form.value(QStringLiteral("Ppeak"),
                                              sizing.value(QStringLiteral("Ppeak"))).toDouble()},
        {QStringLiteral("installType"), project.value(QStringLiteral("installType")).toString()},
        {QStringLiteral("stale"), isStale(project)},
        {QStringLiteral("fingerprint"), fingerprint(project)},
    };
}

} // namespace ose
