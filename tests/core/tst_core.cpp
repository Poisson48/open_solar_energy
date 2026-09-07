#include <QtTest/QtTest>
#include <QFile>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>

#include "core/solar_math.h"
#include "core/cable.h"
#include "core/finance.h"
#include "core/site_shade.h"
#include "core/hourly.h"
#include "core/horizon_engine.h"
#include "core/sizing.h"
#include "core/offgrid.h"
#include "core/enedis_import.h"
#include "core/inverter.h"
#include "core/project_pipeline.h"
#include "core/layout_3d.h"

class TstCore : public QObject {
    Q_OBJECT
private slots:
    void calcRb_june_toulouse();
    void calcRb_azimuth_changes();
    void hourly_ghi_conservation();
    void pvProduction_june();
    void gridSystemAnnual_range();
    void offgrid_june_production();
    void cable_section_dc();
    void finance_payback();
    void site_shade_blocks_beam();
    void sizing_roi_positive();
    void offgrid_engine_best();
    void enedis_parse_monthly();
    void inverter_stringing_options();
    void pipeline_quote_and_stale();
    void sizing_shade_reduces_energy();
    void sizing_hybrid_flag();
    void offgrid_shade_increases_ppeak();
    void offgrid_heatmap_coherence_extremes();
    void offgrid_day_night_vs_enedis_shape();
    void layout3d_positions_and_shade();
    void horizon_claire_30y_30min();
    void rexel_catalog_bundled();
};

void TstCore::calcRb_june_toulouse()
{
    const double rb = ose::SolarMath::calcRb(43.6, 30, 0, 6);
    QVERIFY(rb > 0.85 && rb < 1.05);
}

void TstCore::calcRb_azimuth_changes()
{
    const double rbEast = ose::SolarMath::calcRb(43.6, 30, -90, 6);
    const double rbSouth = ose::SolarMath::calcRb(43.6, 30, 0, 6);
    QVERIFY(std::abs(rbEast - rbSouth) > 0.01);
}

void TstCore::hourly_ghi_conservation()
{
    const double GHI = 218.6;
    const double DHI = 72.1;
    double sumH = 0;
    for (int h = 0; h < 24; ++h)
        sumH += ose::SolarMath::hourlyIrradiance(43.6, 6, h, GHI, DHI, 0, 0);
    const double expected = GHI * 1000 / 30;
    QVERIFY2(std::abs(sumH - expected) <= GHI * 20,
             qPrintable(QStringLiteral("sum=%1 expected~%2").arg(sumH).arg(expected)));
}

void TstCore::pvProduction_june()
{
    const double prod = ose::SolarMath::pvProduction(150, 3, 14, 21, QStringLiteral("crystSi"), 6, 43.6);
    QVERIFY(prod > 300 && prod < 450);
}

void TstCore::gridSystemAnnual_range()
{
    ose::SolarMath sm;
    QVariantList weather;
    const double ghi[] = {60, 80, 120, 160, 200, 220, 230, 210, 170, 120, 70, 55};
    const double dhi[] = {30, 40, 55, 70, 85, 90, 95, 88, 72, 55, 35, 28};
    const double t[] = {5, 6, 9, 12, 16, 21, 24, 23, 18, 13, 8, 4};
    const char* names[] = {"Jan", "Fév", "Mar", "Avr", "Mai", "Jun",
                           "Jul", "Aoû", "Sep", "Oct", "Nov", "Déc"};
    for (int i = 0; i < 12; ++i) {
        weather.append(QVariantMap{{QStringLiteral("name"), QString::fromUtf8(names[i])},
                                   {QStringLiteral("GHI"), ghi[i]},
                                   {QStringLiteral("DHI"), dhi[i]},
                                   {QStringLiteral("T_avg"), t[i]}});
    }
    const QVariantMap grid = sm.gridSystemAnnual({
        {QStringLiteral("lat"), 43.6},
        {QStringLiteral("weatherData"), weather},
        {QStringLiteral("Ppeak"), 3},
        {QStringLiteral("losses"), 14},
        {QStringLiteral("tilt"), 30},
        {QStringLiteral("azimuth"), 0},
        {QStringLiteral("systemCost"), 3600},
        {QStringLiteral("kwhPrice"), 0.25},
        {QStringLiteral("co2Factor"), 0.052},
    });
    const double E = grid.value(QStringLiteral("E_annual")).toDouble();
    const double PR = grid.value(QStringLiteral("PR")).toDouble();
    QVERIFY(E > 2500 && E < 5500);
    QVERIFY(PR > 0.7 && PR <= 1.0);
}

void TstCore::offgrid_june_production()
{
    ose::SolarMath sm;
    QVariantList weather;
    for (int i = 0; i < 12; ++i) {
        weather.append(QVariantMap{{QStringLiteral("name"), QStringLiteral("M")},
                                   {QStringLiteral("GHI"), i == 5 ? 220.0 : 100.0},
                                   {QStringLiteral("DHI"), 80},
                                   {QStringLiteral("T_avg"), 20}});
    }
    // Use realistic weather for june index 5
    const double ghi[] = {60, 80, 120, 160, 200, 220, 230, 210, 170, 120, 70, 55};
    const double dhi[] = {30, 40, 55, 70, 85, 90, 95, 88, 72, 55, 35, 28};
    weather.clear();
    for (int i = 0; i < 12; ++i)
        weather.append(QVariantMap{{QStringLiteral("GHI"), ghi[i]},
                                   {QStringLiteral("DHI"), dhi[i]},
                                   {QStringLiteral("T_avg"), 15}});

    const QVariantList off = sm.offgridSystem({
        {QStringLiteral("lat"), 43.6},
        {QStringLiteral("weatherData"), weather},
        {QStringLiteral("Ppeak"), 3},
        {QStringLiteral("battCap"), 10000},
        {QStringLiteral("dod"), 80},
        {QStringLiteral("dailyConsumption"), 8000},
        {QStringLiteral("tilt"), 30},
        {QStringLiteral("azimuth"), 0},
    });
    const double solarDaily = off.at(5).toMap().value(QStringLiteral("solarDaily")).toDouble();
    QVERIFY2(solarDaily > 5 && solarDaily < 25,
             qPrintable(QStringLiteral("solarDaily=%1").arg(solarDaily)));
}

void TstCore::cable_section_dc()
{
    ose::CableCalc c;
    const QVariantMap r = c.calcSection({
        {QStringLiteral("I"), 10},
        {QStringLiteral("L"), 20},
        {QStringLiteral("U_system"), 400},
        {QStringLiteral("circuit"), QStringLiteral("dc")},
        {QStringLiteral("material"), QStringLiteral("Cu")},
    });
    QVERIFY(r.value(QStringLiteral("sectionRecommended")).toDouble() >= 1.5);
    QVERIFY(r.value(QStringLiteral("recommended")).toMap().value(QStringLiteral("dropPct")).toDouble()
            <= 1.0 + 1e-6);
}

void TstCore::finance_payback()
{
    ose::Finance f;
    const QVariant pb = f.calcPayback(3600, 600);
    QVERIFY(pb.isValid());
    QVERIFY(pb.toInt() > 0 && pb.toInt() < 40);
}

void TstCore::site_shade_blocks_beam()
{
    ose::SiteShade shade;
    QVariantList weather;
    for (int i = 0; i < 12; ++i)
        weather.append(QVariantMap{{QStringLiteral("GHI"), 150}, {QStringLiteral("DHI"), 60}});
    // Mur au sud (az 180) très haut → ombre significative en juin
    QVariantList points{{QVariantMap{{QStringLiteral("az"), 180}, {QStringLiteral("elev"), 70}}}};
    const QVariantMap r = shade.computeShading(43.6, points, weather);
    QVERIFY(r.value(QStringLiteral("annualLossPct")).toDouble() > 5);
    QVERIFY(r.value(QStringLiteral("halfHourlyKeep")).toList().size() == 12);

    ose::HourlyAnalysis h;
    const QVariantList batt = h.simulateDailyBattery({1, 2, 3, 2, 1}, {2, 2, 2, 2, 2}, 5, 80);
    QCOMPARE(batt.size(), 5);
}

static QVariantList demoWeather()
{
    QVariantList weather;
    const double ghi[] = {60, 80, 120, 160, 200, 220, 230, 210, 170, 120, 70, 55};
    const double dhi[] = {30, 40, 55, 70, 85, 90, 95, 88, 72, 55, 35, 28};
    for (int i = 0; i < 12; ++i)
        weather.append(QVariantMap{{QStringLiteral("GHI"), ghi[i]},
                                   {QStringLiteral("DHI"), dhi[i]},
                                   {QStringLiteral("T_avg"), 15}});
    return weather;
}

void TstCore::sizing_roi_positive()
{
    ose::SizingEngine eng;
    QVariantList monthly;
    for (int i = 0; i < 12; ++i)
        monthly.append(375.0);
    const QVariantMap r = eng.run({{QStringLiteral("lat"), 43.6},
                                   {QStringLiteral("weatherData"), demoWeather()},
                                   {QStringLiteral("monthlyKwh"), monthly},
                                   {QStringLiteral("tilt"), 30},
                                   {QStringLiteral("azimuth"), 0},
                                   {QStringLiteral("strategy"), QStringLiteral("roi")}});
    const QVariantMap best = r.value(QStringLiteral("best")).toMap();
    QVERIFY(best.value(QStringLiteral("Ppeak")).toDouble() > 0.5);
    QVERIFY(best.value(QStringLiteral("E_annual")).toDouble() > 500);
    QVERIFY(r.value(QStringLiteral("candidates")).toList().size() > 10);
}

void TstCore::offgrid_engine_best()
{
    ose::OffgridSizing eng;
    const QVariantMap r = eng.run({{QStringLiteral("lat"), 43.6},
                                   {QStringLiteral("weatherData"), demoWeather()},
                                   {QStringLiteral("dailyConsumptionWh"), 8000},
                                   {QStringLiteral("dod"), 80},
                                   {QStringLiteral("coverageTarget"), 95}});
    const QVariantMap best = r.value(QStringLiteral("best")).toMap();
    QVERIFY(best.value(QStringLiteral("Ppeak")).toDouble() > 0);
    QVERIFY(best.value(QStringLiteral("battKwh")).toDouble() > 0);
    QVERIFY(best.value(QStringLiteral("coverage")).toDouble() >= 95);
    QVERIFY(r.value(QStringLiteral("meetsTarget")).toBool());
    // Batterie doit influencer la couverture (pas seulement le PV)
    double covSmallBatt = -1, covBigBatt = -1;
    const double ppeak = best.value(QStringLiteral("Ppeak")).toDouble();
    for (const QVariant& v : r.value(QStringLiteral("candidates")).toList()) {
        const QVariantMap c = v.toMap();
        if (std::abs(c.value(QStringLiteral("Ppeak")).toDouble() - ppeak) > 0.01)
            continue;
        const double b = c.value(QStringLiteral("battKwh")).toDouble();
        const double cov = c.value(QStringLiteral("coverage")).toDouble();
        if (b <= 10 && (covSmallBatt < 0 || b < 10))
            covSmallBatt = cov;
        if (b >= 40)
            covBigBatt = cov;
    }
    QVERIFY(covBigBatt >= covSmallBatt);
}

void TstCore::enedis_parse_monthly()
{
    ose::EnedisImport en;
    const QString csv = QStringLiteral(
        "Date;Valeur\n"
        "2024-01-15;300\n2024-02-15;280\n2024-03-15;310\n2024-04-15;290\n"
        "2024-05-15;320\n2024-06-15;340\n2024-07-15;360\n2024-08-15;350\n"
        "2024-09-15;330\n2024-10-15;300\n2024-11-15;270\n2024-12-15;260\n");
    const QVariantMap r = en.parse(csv);
    QVERIFY(r.value(QStringLiteral("ok")).toBool());
    QCOMPARE(r.value(QStringLiteral("monthlyKwh")).toList().size(), 12);
    QVERIFY(r.value(QStringLiteral("annualKwh")).toInt() > 3000);
}

void TstCore::inverter_stringing_options()
{
    ose::InverterSizing inv;
    const QVariantMap r = inv.calcStringing(
        {{QStringLiteral("voc"), 49.5},
         {QStringLiteral("vmp"), 41.0},
         {QStringLiteral("isc"), 10.5},
         {QStringLiteral("imp"), 9.8},
         {QStringLiteral("pmax"), 400}},
        {{QStringLiteral("maxInputV"), 600},
         {QStringLiteral("mpptMinV"), 120},
         {QStringLiteral("mpptMaxV"), 550},
         {QStringLiteral("maxInputI"), 20},
         {QStringLiteral("pac"), 5},
         {QStringLiteral("mpptCount"), 2}});
    QVERIFY(r.value(QStringLiteral("maxSeries")).toInt() >= 8);
    QVERIFY(!r.value(QStringLiteral("options")).toList().isEmpty());
}

void TstCore::pipeline_quote_and_stale()
{
    ose::ProjectPipeline pipe;
    QVariantMap project{
        {QStringLiteral("name"), QStringLiteral("T")},
        {QStringLiteral("installType"), QStringLiteral("hybrid")},
        {QStringLiteral("client"), QStringLiteral("Alice")},
        {QStringLiteral("location"),
         QVariantMap{{QStringLiteral("name"), QStringLiteral("Toulouse")},
                     {QStringLiteral("lat"), 43.6},
                     {QStringLiteral("lon"), 1.4}}},
        {QStringLiteral("formState"),
         QVariantMap{{QStringLiteral("tilt"), 30},
                     {QStringLiteral("azimuth"), 0},
                     {QStringLiteral("Ppeak"), 4},
                     {QStringLiteral("systemCost"), 5000},
                     {QStringLiteral("battKwh"), 5},
                     {QStringLiteral("panelWp"), 400}}},
        {QStringLiteral("sizingResult"),
         QVariantMap{{QStringLiteral("best"),
                      QVariantMap{{QStringLiteral("Ppeak"), 4},
                                  {QStringLiteral("E_annual"), 4800},
                                  {QStringLiteral("systemCost"), 5000}}}}},
        {QStringLiteral("siteSurvey"),
         QVariantMap{{QStringLiteral("annualLossPct"), 12.5}}},
    };
    const QString fp = pipe.fingerprint(project);
    project.insert(QStringLiteral("resultsFingerprint"), fp);
    QVERIFY(!pipe.isStale(project));
    auto form = project.value(QStringLiteral("formState")).toMap();
    form.insert(QStringLiteral("tilt"), 45);
    project.insert(QStringLiteral("formState"), form);
    QVERIFY(pipe.isStale(project));

    const QVariantList lines = pipe.buildQuoteLines(project);
    QVERIFY(lines.size() >= 4);
    QCOMPARE(pipe.estimatePanelCount(4, 400), 10);
}

void TstCore::sizing_shade_reduces_energy()
{
    ose::SizingEngine eng;
    QVariantList monthly;
    for (int i = 0; i < 12; ++i)
        monthly.append(375.0);
    QVariantList loss;
    for (int i = 0; i < 12; ++i)
        loss.append(0.25);
    const QVariantMap clear = eng.run({{QStringLiteral("lat"), 43.6},
                                       {QStringLiteral("weatherData"), demoWeather()},
                                       {QStringLiteral("monthlyKwh"), monthly},
                                       {QStringLiteral("strategy"), QStringLiteral("roi")}});
    const QVariantMap shaded = eng.run({{QStringLiteral("lat"), 43.6},
                                        {QStringLiteral("weatherData"), demoWeather()},
                                        {QStringLiteral("monthlyKwh"), monthly},
                                        {QStringLiteral("strategy"), QStringLiteral("roi")},
                                        {QStringLiteral("monthlyLoss"), loss}});
    const double eClear = clear.value(QStringLiteral("best")).toMap().value(QStringLiteral("E_annual")).toDouble();
    const double eShade = shaded.value(QStringLiteral("best")).toMap().value(QStringLiteral("E_annual")).toDouble();
    QVERIFY(eShade < eClear);
    QVERIFY(shaded.value(QStringLiteral("shadeApplied")).toBool());
}

void TstCore::sizing_hybrid_flag()
{
    ose::SizingEngine eng;
    QVariantList monthly;
    for (int i = 0; i < 12; ++i)
        monthly.append(375.0);
    const QVariantMap r = eng.run({{QStringLiteral("lat"), 43.6},
                                   {QStringLiteral("weatherData"), demoWeather()},
                                   {QStringLiteral("monthlyKwh"), monthly},
                                   {QStringLiteral("installType"), QStringLiteral("hybrid")},
                                   {QStringLiteral("battKwh"), 8},
                                   {QStringLiteral("dod"), 80},
                                   {QStringLiteral("strategy"), QStringLiteral("autoconso")}});
    QVERIFY(r.value(QStringLiteral("hybrid")).toBool());
    QVERIFY(r.value(QStringLiteral("best")).toMap().value(QStringLiteral("hybrid")).toBool());
    QVERIFY(r.value(QStringLiteral("best")).toMap().value(QStringLiteral("battKwh")).toDouble() >= 8);
}

void TstCore::offgrid_shade_increases_ppeak()
{
    ose::OffgridSizing eng;
    const QVariantMap clear = eng.run({{QStringLiteral("lat"), 43.6},
                                       {QStringLiteral("weatherData"), demoWeather()},
                                       {QStringLiteral("dailyConsumptionWh"), 8000},
                                       {QStringLiteral("coverageTarget"), 90}});
    const QVariantMap shaded = eng.run({{QStringLiteral("lat"), 43.6},
                                        {QStringLiteral("weatherData"), demoWeather()},
                                        {QStringLiteral("dailyConsumptionWh"), 8000},
                                        {QStringLiteral("coverageTarget"), 90},
                                        {QStringLiteral("annualLossPct"), 30}});
    const double p0 = clear.value(QStringLiteral("best")).toMap().value(QStringLiteral("Ppeak")).toDouble();
    const double p1 = shaded.value(QStringLiteral("best")).toMap().value(QStringLiteral("Ppeak")).toDouble();
    QVERIFY(p1 >= p0);
    QVERIFY(shaded.value(QStringLiteral("shadeApplied")).toBool());

    // Ombrage demi-heure (matin bloqué) → couverture ↓ à Ppeak/batt égaux
    QVariantList keep;
    for (int m = 0; m < 12; ++m) {
        QVariantList row;
        for (int s = 0; s < 48; ++s)
            row.append(s < 20 ? 0.2 : 1.0); // matin très ombragé
        keep.append(QVariant(row));
    }
    const QVariantMap temporal = eng.run({{QStringLiteral("lat"), 43.6},
                                          {QStringLiteral("weatherData"), demoWeather()},
                                          {QStringLiteral("dailyConsumptionWh"), 8000},
                                          {QStringLiteral("coverageTarget"), 90},
                                          {QStringLiteral("halfHourlyKeep"), keep}});
    QVERIFY(temporal.value(QStringLiteral("temporalShade")).toBool());
    const double covClear = clear.value(QStringLiteral("best")).toMap().value(QStringLiteral("coverage")).toDouble();
    // Meilleure config ombragée peut compenser en taille, mais à iso-grille max couverture
    // des candidats à 3 kWc / 20 kWh doit baisser
    auto covAt = [](const QVariantMap& r, double p, double b) {
        for (const QVariant& v : r.value(QStringLiteral("candidates")).toList()) {
            const QVariantMap c = v.toMap();
            if (std::abs(c.value(QStringLiteral("Ppeak")).toDouble() - p) < 0.01
                && std::abs(c.value(QStringLiteral("battKwh")).toDouble() - b) < 0.01)
                return c.value(QStringLiteral("coverage")).toDouble();
        }
        return -1.0;
    };
    const double c0 = covAt(clear, 3.0, 20.0);
    const double c1 = covAt(temporal, 3.0, 20.0);
    QVERIFY(c0 > 0 && c1 > 0);
    QVERIFY(c1 < c0);
    Q_UNUSED(covClear);
}

void TstCore::offgrid_heatmap_coherence_extremes()
{
    ose::OffgridSizing eng;
    // Grille absurde : micro → gigantesque
    QVariantList ppeaks{0.1, 0.5, 1, 2, 3, 5, 8, 12, 20, 40, 80};
    QVariantList batts{0.5, 1, 2, 5, 10, 15, 25, 40, 60, 100, 200};
    const QVariantMap r = eng.run({
        {QStringLiteral("lat"), 43.6},
        {QStringLiteral("weatherData"), demoWeather()},
        {QStringLiteral("dayKwhPerDay"), 6},
        {QStringLiteral("nightKwhPerDay"), 4},
        {QStringLiteral("dod"), 90},
        {QStringLiteral("coverageTarget"), 95},
        {QStringLiteral("ppeakValues"), ppeaks},
        {QStringLiteral("battValues"), batts},
    });
    const QVariantList cands = r.value(QStringLiteral("candidates")).toList();
    QCOMPARE(cands.size(), ppeaks.size() * batts.size());
    QCOMPARE(r.value(QStringLiteral("loadSource")).toString(), QStringLiteral("day_night"));
    QCOMPARE(r.value(QStringLiteral("dayKwhPerDay")).toDouble(), 6.0);
    QCOMPARE(r.value(QStringLiteral("nightKwhPerDay")).toDouble(), 4.0);

    auto cov = [&](double p, double b) {
        for (const QVariant& v : cands) {
            const QVariantMap c = v.toMap();
            if (std::abs(c.value(QStringLiteral("Ppeak")).toDouble() - p) < 1e-6
                && std::abs(c.value(QStringLiteral("battKwh")).toDouble() - b) < 1e-6)
                return c.value(QStringLiteral("coverage")).toDouble();
        }
        return -1.0;
    };

    // Micro système << gros système
    QVERIFY(cov(0.1, 0.5) < 40);
    QVERIFY(cov(80, 200) >= 99.0);

    // Monotonie batterie à Ppeak fixé : plus de stock ≥ couverture
    for (const QVariant& pv : ppeaks) {
        const double p = pv.toDouble();
        double prev = -1;
        for (const QVariant& bv : batts) {
            const double cur = cov(p, bv.toDouble());
            QVERIFY(cur >= 0);
            if (prev >= 0)
                QVERIFY2(cur + 0.15 >= prev,
                         qPrintable(QString("batt mono P=%1: %2 → %3").arg(p).arg(prev).arg(cur)));
            prev = cur;
        }
    }

    // Monotonie PV à batterie fixée
    for (const QVariant& bv : batts) {
        const double b = bv.toDouble();
        double prev = -1;
        for (const QVariant& pv : ppeaks) {
            const double cur = cov(pv.toDouble(), b);
            QVERIFY(cur >= 0);
            if (prev >= 0)
                QVERIFY2(cur + 0.15 >= prev,
                         qPrintable(QString("pv mono B=%1: %2 → %3").arg(b).arg(prev).arg(cur)));
            prev = cur;
        }
    }

    // Extrême : tout en nuit → batterie critique ; tout en jour → PV suffit mieux à petite batt
    const QVariantMap nightHeavy = eng.run({
        {QStringLiteral("lat"), 43.6},
        {QStringLiteral("weatherData"), demoWeather()},
        {QStringLiteral("dayKwhPerDay"), 1},
        {QStringLiteral("nightKwhPerDay"), 9},
        {QStringLiteral("dod"), 90},
        {QStringLiteral("ppeakValues"), QVariantList{5}},
        {QStringLiteral("battValues"), QVariantList{2, 20}},
    });
    const QVariantMap dayHeavy = eng.run({
        {QStringLiteral("lat"), 43.6},
        {QStringLiteral("weatherData"), demoWeather()},
        {QStringLiteral("dayKwhPerDay"), 9},
        {QStringLiteral("nightKwhPerDay"), 1},
        {QStringLiteral("dod"), 90},
        {QStringLiteral("ppeakValues"), QVariantList{5}},
        {QStringLiteral("battValues"), QVariantList{2, 20}},
    });
    auto covList = [](const QVariantMap& res, double b) {
        for (const QVariant& v : res.value(QStringLiteral("candidates")).toList()) {
            const QVariantMap c = v.toMap();
            if (std::abs(c.value(QStringLiteral("battKwh")).toDouble() - b) < 1e-6)
                return c.value(QStringLiteral("coverage")).toDouble();
        }
        return -1.0;
    };
    // À 2 kWh de batterie : profil jour lourd mieux couvert que nuit lourde
    QVERIFY(covList(dayHeavy, 2) > covList(nightHeavy, 2));
    // Gain batterie plus marqué sur profil nuit
    const double gainNight = covList(nightHeavy, 20) - covList(nightHeavy, 2);
    const double gainDay = covList(dayHeavy, 20) - covList(dayHeavy, 2);
    QVERIFY(gainNight >= gainDay - 1.0);

    // Best sur grille extrême doit privilégier un coin haut (couverture élevée)
    const QVariantMap best = r.value(QStringLiteral("best")).toMap();
    QVERIFY(best.value(QStringLiteral("coverage")).toDouble() >= 95);
    QVERIFY(best.value(QStringLiteral("Ppeak")).toDouble() >= 3);
    QVERIFY(best.value(QStringLiteral("battKwh")).toDouble() >= 5);
}

void TstCore::offgrid_day_night_vs_enedis_shape()
{
    ose::OffgridSizing eng;
    // Profil Enedis synthétique : pic soir, nuit non nulle
    QVariantList profile48;
    double daySum = 0, nightSum = 0;
    for (int s = 0; s < 48; ++s) {
        const int h = s / 2;
        double v = 0.05; // base
        if (h >= 7 && h < 9)
            v = 0.25;
        if (h >= 18 && h < 22)
            v = 0.35;
        if (h >= 21 || h < 6)
            v = 0.12;
        profile48.append(v);
        if (h >= 21 || h < 6)
            nightSum += v;
        else
            daySum += v;
    }
    const QVariantMap fromEnedis = eng.run({
        {QStringLiteral("lat"), 43.6},
        {QStringLiteral("weatherData"), demoWeather()},
        {QStringLiteral("halfHourlyLoadProfile"), profile48},
        {QStringLiteral("dod"), 90},
        {QStringLiteral("ppeakValues"), QVariantList{4}},
        {QStringLiteral("battValues"), QVariantList{10}},
    });
    QCOMPARE(fromEnedis.value(QStringLiteral("loadSource")).toString(),
             QStringLiteral("enedis_halfhourly"));
    QVERIFY(fromEnedis.value(QStringLiteral("nightKwhPerDay")).toDouble() > 0.5);
    QVERIFY(fromEnedis.value(QStringLiteral("dayKwhPerDay")).toDouble() > 0.5);

    const QVariantMap fromSplit = eng.run({
        {QStringLiteral("lat"), 43.6},
        {QStringLiteral("weatherData"), demoWeather()},
        {QStringLiteral("dayKwhPerDay"), daySum},
        {QStringLiteral("nightKwhPerDay"), nightSum},
        {QStringLiteral("dod"), 90},
        {QStringLiteral("ppeakValues"), QVariantList{4}},
        {QStringLiteral("battValues"), QVariantList{10}},
    });
    QCOMPARE(fromSplit.value(QStringLiteral("loadSource")).toString(), QStringLiteral("day_night"));
    // Même énergie jour/nuit → couvertures du même ordre (forme un peu différente)
    const double cE = fromEnedis.value(QStringLiteral("best")).toMap().value(QStringLiteral("coverage")).toDouble();
    const double cS = fromSplit.value(QStringLiteral("best")).toMap().value(QStringLiteral("coverage")).toDouble();
    QVERIFY(std::abs(cE - cS) < 15.0);
}

void TstCore::layout3d_positions_and_shade()
{
    ose::Layout3D lay;
    const QVariantMap layout = lay.computeLayout({
        {QStringLiteral("roofW"), 10},
        {QStringLiteral("roofD"), 6},
        {QStringLiteral("nPanels"), 8},
        {QStringLiteral("rows"), 2},
        {QStringLiteral("tilt"), 30},
        {QStringLiteral("azimuth"), 0},
    });
    QCOMPARE(layout.value(QStringLiteral("panelsPlaced")).toInt(), 8);
    QVERIFY(layout.value(QStringLiteral("positions")).toList().size() == 8);
    QVERIFY(layout.value(QStringLiteral("fits")).toBool());

    const QVariantList obstacles{
        QVariantMap{{QStringLiteral("az"), 180}, {QStringLiteral("elev"), 40}, {QStringLiteral("dist"), 8}}};
    const QVariantMap noon = lay.sampleShading(layout, obstacles, 180, 60);
    QVERIFY(noon.value(QStringLiteral("totalPanels")).toInt() == 8);

    const QVariantMap scene = lay.computeSceneShading(43.6, {
        {QStringLiteral("roofW"), 10},
        {QStringLiteral("roofD"), 6},
        {QStringLiteral("nPanels"), 8},
        {QStringLiteral("rows"), 2},
        {QStringLiteral("tilt"), 30},
        {QStringLiteral("azimuth"), 0},
    }, obstacles, demoWeather());
    QCOMPARE(scene.value(QStringLiteral("monthlyLoss")).toList().size(), 12);
    QVERIFY(scene.value(QStringLiteral("annualLossPct")).toDouble() >= 0);
}

void TstCore::horizon_claire_30y_30min()
{
    QFile f(QStringLiteral(OSE_FIXTURES_DIR "/claire_project.json"));
    QVERIFY2(f.open(QIODevice::ReadOnly), qPrintable(f.fileName()));
    const QJsonObject claire = QJsonDocument::fromJson(f.readAll()).object();
    QVERIFY(claire.value(QStringLiteral("name")).toString().contains(QStringLiteral("Claire")));

    const QJsonObject loc = claire.value(QStringLiteral("location")).toObject();
    const QJsonObject form = claire.value(QStringLiteral("formState")).toObject();
    const QJsonObject site = claire.value(QStringLiteral("siteSurvey")).toObject();
    const QVariantList weather = claire.value(QStringLiteral("weatherData")).toArray().toVariantList();
    const QVariantList keep = site.value(QStringLiteral("halfHourlyKeep")).toArray().toVariantList();
    QVERIFY(weather.size() == 12);
    QVERIFY(keep.size() == 12);

    const double dailyWh = form.value(QStringLiteral("dailyWh")).toDouble(8000);
    const double dailyKwh = dailyWh > 50 ? dailyWh / 1000.0 : dailyWh;
    const double dayKwh = form.value(QStringLiteral("og2-load-day")).toVariant().toDouble();
    const double nightKwh = form.value(QStringLiteral("og2-load-night")).toVariant().toDouble();
    const double dayShare = ((dayKwh > 0 ? dayKwh : 6) + (nightKwh > 0 ? nightKwh : 2)) > 0
                                ? (dayKwh > 0 ? dayKwh : 6)
                                      / ((dayKwh > 0 ? dayKwh : 6) + (nightKwh > 0 ? nightKwh : 2))
                                : 0.55;
    const double lossesRaw = form.value(QStringLiteral("og2-losses")).toVariant().toDouble();
    const double losses = lossesRaw > 0 ? lossesRaw : 16.4;
    const double battRaw = form.value(QStringLiteral("og2-batt-kwh")).toVariant().toDouble();
    const double battAlt = form.value(QStringLiteral("battKwh")).toDouble(5);
    const double batt = battRaw > 0 ? battRaw : battAlt;

    ose::HorizonEngine eng;
    const QVariantMap withShade = eng.simulate({
        {QStringLiteral("lat"), loc.value(QStringLiteral("lat")).toDouble()},
        {QStringLiteral("weatherData"), weather},
        {QStringLiteral("halfHourlyKeep"), keep},
        {QStringLiteral("Ppeak"), form.value(QStringLiteral("Ppeak")).toDouble(6)},
        {QStringLiteral("tilt"), form.value(QStringLiteral("tilt")).toDouble(20.1)},
        {QStringLiteral("azimuth"), form.value(QStringLiteral("azimuth")).toDouble(78.2)},
        {QStringLiteral("losses"), losses},
        {QStringLiteral("dailyKwh"), dailyKwh},
        {QStringLiteral("dayShare"), dayShare},
        {QStringLiteral("battKwh"), batt},
        {QStringLiteral("dod"), form.value(QStringLiteral("dod")).toDouble(90)},
        {QStringLiteral("years"), 30},
        {QStringLiteral("stepMin"), 30},
    });
    QVERIFY(withShade.value(QStringLiteral("ok")).toBool());
    QCOMPARE(withShade.value(QStringLiteral("years")).toInt(), 30);
    QCOMPARE(withShade.value(QStringLiteral("steps")).toLongLong(), 30LL * 365 * 48);
    QVERIFY(withShade.value(QStringLiteral("elapsedMs")).toLongLong() < 5000);
    QVERIFY(withShade.value(QStringLiteral("pvTotal")).toDouble() > 10000);
    QVERIFY(withShade.value(QStringLiteral("shadeApplied")).toBool());
    QCOMPARE(withShade.value(QStringLiteral("yearSeries")).toList().size(), 30);

    const QVariantMap noShade = eng.simulate({
        {QStringLiteral("lat"), loc.value(QStringLiteral("lat")).toDouble()},
        {QStringLiteral("weatherData"), weather},
        {QStringLiteral("Ppeak"), form.value(QStringLiteral("Ppeak")).toDouble(6)},
        {QStringLiteral("tilt"), form.value(QStringLiteral("tilt")).toDouble(20.1)},
        {QStringLiteral("azimuth"), form.value(QStringLiteral("azimuth")).toDouble(78.2)},
        {QStringLiteral("losses"), losses},
        {QStringLiteral("dailyKwh"), dailyKwh},
        {QStringLiteral("dayShare"), dayShare},
        {QStringLiteral("battKwh"), batt},
        {QStringLiteral("dod"), form.value(QStringLiteral("dod")).toDouble(90)},
        {QStringLiteral("years"), 30},
        {QStringLiteral("stepMin"), 30},
    });
    QVERIFY(noShade.value(QStringLiteral("ok")).toBool());
    // Ombrage Claire (~45 % beam) doit réduire la prod sur 30 ans
    QVERIFY2(withShade.value(QStringLiteral("pvTotal")).toDouble()
                 < noShade.value(QStringLiteral("pvTotal")).toDouble() * 0.98,
             qPrintable(QStringLiteral("shade pv=%1 noShade pv=%2")
                            .arg(withShade.value(QStringLiteral("pvTotal")).toDouble())
                            .arg(noShade.value(QStringLiteral("pvTotal")).toDouble())));

    qInfo("Claire 30y: steps=%lld ms=%lld shadePv=%g noShadePv=%g coverage=%g deficitDays/y=%g",
          withShade.value(QStringLiteral("steps")).toLongLong(),
          withShade.value(QStringLiteral("elapsedMs")).toLongLong(),
          withShade.value(QStringLiteral("pvTotal")).toDouble(),
          noShade.value(QStringLiteral("pvTotal")).toDouble(),
          withShade.value(QStringLiteral("coveragePct")).toDouble(),
          withShade.value(QStringLiteral("avgDeficitDaysPerYear")).toDouble());
}

void TstCore::rexel_catalog_bundled()
{
#ifndef OSE_DATA_DIR
    QSKIP("OSE_DATA_DIR not defined");
#endif
    QFile f(QStringLiteral(OSE_DATA_DIR "/rexel_catalog/catalog.json"));
    QVERIFY2(f.open(QIODevice::ReadOnly), "catalogue Rexel introuvable");
    const QJsonDocument doc = QJsonDocument::fromJson(f.readAll());
    QVERIFY(doc.isObject());
    const QJsonArray panels = doc.object().value(QStringLiteral("panels")).toArray();
    const QJsonArray invs = doc.object().value(QStringLiteral("inverters")).toArray();
    QVERIFY2(panels.size() >= 80, qPrintable(QStringLiteral("panels=%1").arg(panels.size())));
    QVERIFY2(invs.size() >= 200, qPrintable(QStringLiteral("inverters=%1").arg(invs.size())));
    int okP = 0;
    for (const QJsonValue& v : panels) {
        if (v.toObject().value(QStringLiteral("wp")).toDouble() > 0)
            ++okP;
    }
    QVERIFY(okP >= 80);
    int okI = 0;
    for (const QJsonValue& v : invs) {
        const QJsonObject o = v.toObject();
        if (o.value(QStringLiteral("pnom")).toDouble() > 0 || o.value(QStringLiteral("pac")).toDouble() > 0
            || o.value(QStringLiteral("type")).toString() == QLatin1String("micro"))
            ++okI;
    }
    QVERIFY2(okI >= 150, qPrintable(QStringLiteral("real inverters=%1").arg(okI)));
}

QTEST_MAIN(TstCore)
#include "tst_core.moc"
