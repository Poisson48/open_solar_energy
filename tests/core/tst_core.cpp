#include <QtTest/QtTest>

#include "core/solar_math.h"
#include "core/cable.h"
#include "core/finance.h"
#include "core/site_shade.h"
#include "core/hourly.h"

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

QTEST_MAIN(TstCore)
#include "tst_core.moc"
