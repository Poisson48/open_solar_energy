#include "year_pv.h"

#include "constants.h"
#include "solar_math.h"

#include <QElapsedTimer>

#include <algorithm>
#include <array>
#include <cmath>
#include <vector>

namespace ose {
namespace {

constexpr int kSlotsDay = 48;

int daysInMonth(int month1to12, int year)
{
    static const int kDays[12] = {31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31};
    if (month1to12 < 1 || month1to12 > 12)
        return 30;
    int d = kDays[month1to12 - 1];
    if (month1to12 == 2) {
        const bool leap = (year % 4 == 0 && year % 100 != 0) || (year % 400 == 0);
        if (leap)
            d = 29;
    }
    return d;
}

double gammaForTech(const QString& tech)
{
    if (tech == QLatin1String("CIS"))
        return -0.0036;
    if (tech == QLatin1String("CdTe"))
        return -0.0025;
    return -0.0045;
}

} // namespace

YearPv::YearPv(QObject* parent) : QObject(parent) {}

QVariantMap YearPv::defaultLossTree(double totalLossPct)
{
    // Répartition type étude → produit ≈ (1 - total/100)
    totalLossPct = std::clamp(totalLossPct, 0.0, 40.0);
    const double scale = totalLossPct / 14.0;
    auto pct = [scale](double base) {
        return std::round(base * scale * 10) / 10;
    };
    return {{QStringLiteral("soiling"), pct(2.0)},
            {QStringLiteral("lid"), pct(1.5)},
            {QStringLiteral("mismatch"), pct(2.0)},
            {QStringLiteral("iam"), pct(2.0)},
            {QStringLiteral("ohmicDc"), pct(1.5)},
            {QStringLiteral("ohmicAc"), pct(1.0)},
            {QStringLiteral("availability"), pct(2.0)},
            {QStringLiteral("other"), pct(2.5)}};
}

double YearPv::effectiveLossFactor(const QVariantMap& params)
{
    if (params.contains(QStringLiteral("lossTree"))) {
        const QVariantMap t = params.value(QStringLiteral("lossTree")).toMap();
        // Pourcentages de perte (0–100) ; absents → 0
        const double soiling = t.value(QStringLiteral("soiling"), 0).toDouble();
        const double lid = t.value(QStringLiteral("lid"), 0).toDouble();
        const double mismatch = t.value(QStringLiteral("mismatch"), 0).toDouble();
        const double iam = t.value(QStringLiteral("iam"), 0).toDouble();
        const double ohmDc = t.value(QStringLiteral("ohmicDc"), 0).toDouble();
        const double ohmAc = t.value(QStringLiteral("ohmicAc"), 0).toDouble();
        const double avail = t.value(QStringLiteral("availability"), 0).toDouble();
        const double other = t.value(QStringLiteral("other"), 0).toDouble();
        double f = 1.0;
        for (double p : {soiling, lid, mismatch, iam, ohmDc, ohmAc, avail, other})
            f *= std::max(0.0, 1.0 - p / 100.0);
        return std::clamp(f, 0.5, 1.0);
    }
    const double losses = params.value(QStringLiteral("losses"), 14).toDouble();
    return std::max(0.5, 1.0 - losses / 100.0);
}

QVariantList YearPv::monthlyYieldPerKwc(const QVariantMap& hourly, const QVariantMap& params)
{
    const QVariantList pvSlots = buildYearPvSlots(hourly, params);
    QVariantList out;
    if (pvSlots.isEmpty())
        return out;
    const int year = hourly.value(QStringLiteral("year"), 2020).toInt();
    int idx = 0;
    for (int m = 0; m < 12; ++m) {
        const int nDays = daysInMonth(m + 1, year);
        const int nSlots = nDays * kSlotsDay;
        double sum = 0;
        for (int i = 0; i < nSlots && idx < pvSlots.size(); ++i, ++idx)
            sum += pvSlots[idx].toDouble();
        out.append(sum);
    }
    return out;
}

double YearPv::keepAt(const QVariantList& halfHourlyKeep, int month0, int slot)
{
    if (month0 < 0 || month0 >= halfHourlyKeep.size() || slot < 0 || slot >= kSlotsDay)
        return 1.0;
    const QVariantList row = halfHourlyKeep[month0].toList();
    if (slot >= row.size())
        return 1.0;
    return std::clamp(row[slot].toDouble(), 0.0, 1.0);
}

double YearPv::irradianceKeepToElectrical(double irrKeep, int nBypass, double aggressiveness)
{
    irrKeep = std::clamp(irrKeep, 0.0, 1.0);
    nBypass = std::max(1, nBypass);
    aggressiveness = std::clamp(aggressiveness, 0.0, 2.0);
    // Fraction ombrée
    const double shaded = 1.0 - irrKeep;
    if (shaded <= 1e-6)
        return 1.0;
    // Chaque bypass substring peut être court-circuitée ; puissance ≈ (1 - ceil(shaded*n)/n)
    // lissée : (1 - shaded)^aggressiveness pour n substrings
    const double blocked = std::ceil(shaded * nBypass * aggressiveness) / double(nBypass);
    return std::clamp(1.0 - blocked, 0.0, 1.0);
}

QVariantList YearPv::electricalKeepTable(const QVariantList& halfHourlyKeep, int nBypass,
                                         double aggressiveness)
{
    QVariantList out;
    for (int m = 0; m < halfHourlyKeep.size(); ++m) {
        const QVariantList row = halfHourlyKeep[m].toList();
        QVariantList erow;
        for (int s = 0; s < row.size(); ++s)
            erow.append(irradianceKeepToElectrical(row[s].toDouble(), nBypass, aggressiveness));
        while (erow.size() < kSlotsDay)
            erow.append(1.0);
        out.append(QVariant(erow));
    }
    return out;
}

double YearPv::cellTemperature(double tAir, double poaWm2, const QVariantMap& thermal)
{
    if (thermal.value(QStringLiteral("model")).toString() == QLatin1String("uValue")) {
        // Tcell ≈ Ta + G / U ; U typique 20–29 W/m²K selon montage
        const double U = std::max(5.0, thermal.value(QStringLiteral("U"), 29).toDouble());
        const double wind = thermal.value(QStringLiteral("wind"), 1).toDouble();
        const double Ueff = U + 1.5 * wind;
        return tAir + poaWm2 / Ueff;
    }
    // NOCT classique (équivalent G/800 * 25)
    const double noct = thermal.value(QStringLiteral("noct"), 45).toDouble();
    return tAir + (noct - 20.0) / 800.0 * poaWm2;
}

QVariantMap YearPv::acFromDc(double dcKw, double pacNomKw, double etaEuro)
{
    etaEuro = std::clamp(etaEuro, 0.5, 1.0);
    pacNomKw = std::max(0.1, pacNomKw);
    if (dcKw <= 0)
        return {{QStringLiteral("acKw"), 0.0},
                {QStringLiteral("clippedKw"), 0.0},
                {QStringLiteral("eta"), etaEuro}};

    // Courbe η simplifiée : bas régime un peu moins bon
    const double load = std::clamp(dcKw / pacNomKw, 0.0, 1.5);
    double eta = etaEuro;
    if (load < 0.1)
        eta = etaEuro * (0.7 + 3.0 * load);
    else if (load < 0.2)
        eta = etaEuro * (0.85 + 0.75 * (load - 0.1));

    double ac = dcKw * eta;
    double clipped = 0;
    if (ac > pacNomKw) {
        clipped = ac - pacNomKw;
        ac = pacNomKw;
    }
    return {{QStringLiteral("acKw"), ac},
            {QStringLiteral("clippedKw"), clipped},
            {QStringLiteral("eta"), eta}};
}

QVariantList YearPv::buildYearPvSlots(const QVariantMap& hourly, const QVariantMap& params)
{
    const QVariantList ghiL = hourly.value(QStringLiteral("ghi")).toList();
    const QVariantList dhiL = hourly.value(QStringLiteral("dhi")).toList();
    const QVariantList tempL = hourly.value(QStringLiteral("temp")).toList();
    const int nHours = ghiL.size();
    if (nHours < 24)
        return {};

    const double lat = params.value(QStringLiteral("lat"), 43.6).toDouble();
    const double lon = params.value(QStringLiteral("lon"),
                                    hourly.value(QStringLiteral("lon"), 0).toDouble())
                           .toDouble();
    const double tilt = params.value(QStringLiteral("tilt"), 30).toDouble();
    const double azimuth = params.value(QStringLiteral("azimuth"), 0).toDouble();
    const QString tech = params.value(QStringLiteral("tech"), QStringLiteral("crystSi")).toString();
    const double gamma = gammaForTech(tech);
    const double lossF = effectiveLossFactor(params);
    const double lonCorr = lon / 15.0;
    const int year = hourly.value(QStringLiteral("year"), 2020).toInt();

    QVariantList keepIn = params.value(QStringLiteral("halfHourlyKeep")).toList();
    if (params.value(QStringLiteral("useElectricalShade"), false).toBool() && !keepIn.isEmpty()) {
        keepIn = electricalKeepTable(keepIn,
                                     params.value(QStringLiteral("nBypass"), 3).toInt(),
                                     params.value(QStringLiteral("shadeAggressiveness"), 1.0).toDouble());
    }

    const QVariantMap thermal = params.value(QStringLiteral("thermal")).toMap();

    QVariantList pvSlots;
    pvSlots.reserve(nHours * 2);

    int h = 0;
    int doy = 1;
    for (int m = 0; m < 12 && h < nHours; ++m) {
        const int nDays = daysInMonth(m + 1, year);
        for (int d = 0; d < nDays && h < nHours; ++d, ++doy) {
            for (int hh = 0; hh < 24 && h < nHours; ++hh, ++h) {
                const double ghiVal = std::max(0.0, ghiL[h].toDouble());
                const double dhiVal = std::clamp(dhiL.value(h, 0).toDouble(), 0.0, ghiVal);
                const double tempVal = tempL.value(h, 15).toDouble();

                for (int half = 0; half < 2; ++half) {
                    const double solarHour = hh + (half == 0 ? 0.25 : 0.75) + lonCorr;
                    const double Htilt = SolarMath::transposeHourlyReal(
                        ghiVal, dhiVal, lat, tilt, azimuth, doy, solarHour);
                    const double Tcell = cellTemperature(tempVal, Htilt, thermal);
                    const double PRtemp = 1.0 + gamma * std::max(0.0, Tcell - 25.0);
                    const double PR = std::max(0.5, lossF * std::min(1.0, PRtemp));
                    const int slot = hh * 2 + half;
                    const double k = keepAt(keepIn, m, slot);
                    // kWh / kWc / 30 min
                    pvSlots.append(Htilt * PR / 1000.0 * 0.5 * k);
                }
            }
        }
    }
    return pvSlots;
}

QVariantMap YearPv::analyzeStudyYear(const QVariantMap& params)
{
    QElapsedTimer timer;
    timer.start();

    const QVariantMap hourly = params.value(QStringLiteral("hourlyWeatherData")).toMap();
    QVariantList pvSlots = params.value(QStringLiteral("pvSlots")).toList();
    if (pvSlots.isEmpty())
        pvSlots = buildYearPvSlots(hourly, params);
    if (pvSlots.isEmpty())
        return {{QStringLiteral("ok"), false},
                {QStringLiteral("error"), QStringLiteral("Pas de météo horaire / slots")}};

    const double Ppeak = params.value(QStringLiteral("Ppeak"), 3).toDouble();
    const double dailyKwh = params.value(QStringLiteral("dailyKwh"), 12).toDouble();
    const double dayShare = params.value(QStringLiteral("dayShare"), 0.55).toDouble();
    const double battKwh = params.value(QStringLiteral("battKwh"), 0).toDouble();
    const double dod = params.value(QStringLiteral("dod"), 80).toDouble();
    const double etaBatt = params.value(QStringLiteral("etaBatt"), 0.97).toDouble();
    const double usable = battKwh * (dod / 100.0);
    const bool useInv = params.value(QStringLiteral("useInverterModel"), false).toBool();
    const double pacNom = params.value(QStringLiteral("pacNom"), Ppeak * 0.9).toDouble();
    const double etaEuro = params.value(QStringLiteral("etaEuro"), 0.97).toDouble();

    // Profil charge 48 demi-heures
    std::array<double, kSlotsDay> loadSlot{};
    {
        const double weights[24] = {
            0.02, 0.015, 0.012, 0.012, 0.015, 0.025, 0.045, 0.06,
            0.05, 0.04,  0.035, 0.035, 0.04,  0.04,  0.035, 0.035,
            0.04, 0.055, 0.07,  0.075, 0.065, 0.05,  0.035, 0.025};
        double sumW = 0;
        for (double w : weights)
            sumW += w;
        for (int h = 0; h < 24; ++h) {
            const bool day = h >= 7 && h < 22;
            const double adj = day ? (dayShare / 0.55) : ((1.0 - dayShare) / 0.45);
            const double hourKwh = dailyKwh * (weights[h] / sumW) * adj;
            loadSlot[static_cast<size_t>(h * 2)] = hourKwh * 0.5;
            loadSlot[static_cast<size_t>(h * 2 + 1)] = hourKwh * 0.5;
        }
    }

    double soc = usable * 0.5;
    double pvTot = 0, loadTot = 0, acTot = 0, surplusTot = 0, gridTot = 0, clippedTot = 0;
    QVariantList months;
    const int nSlots = pvSlots.size();
    const int year = hourly.value(QStringLiteral("year"), 2020).toInt();

    int idx = 0;
    for (int m = 0; m < 12; ++m) {
        const int nDays = daysInMonth(m + 1, year);
        double mPv = 0, mLoad = 0, mAc = 0, mGrid = 0;
        for (int d = 0; d < nDays; ++d) {
            for (int s = 0; s < kSlotsDay; ++s) {
                if (idx >= nSlots)
                    break;
                double pv = pvSlots[idx].toDouble() * Ppeak;
                ++idx;
                if (useInv) {
                    const auto acMap = acFromDc(pv, pacNom, etaEuro);
                    clippedTot += acMap.value(QStringLiteral("clippedKw")).toDouble() * 0.5; // kWh
                    pv = acMap.value(QStringLiteral("acKw")).toDouble();
                }
                const double load = loadSlot[static_cast<size_t>(s)];
                mPv += pv;
                mLoad += load;

                if (usable <= 1e-9) {
                    const double ac = std::min(pv, load);
                    mAc += ac;
                    mGrid += std::max(0.0, load - pv);
                    surplusTot += std::max(0.0, pv - load);
                } else {
                    const double balance = pv - load;
                    if (balance >= 0) {
                        mAc += load;
                        const double charge = std::min(balance * etaBatt, usable - soc);
                        soc += charge;
                        surplusTot += balance - charge / std::max(1e-9, etaBatt);
                    } else {
                        mAc += pv;
                        const double needed = -balance;
                        const double fromBatt = std::min(needed, soc);
                        soc -= fromBatt;
                        mAc += fromBatt;
                        mGrid += needed - fromBatt;
                    }
                }
            }
        }
        pvTot += mPv;
        loadTot += mLoad;
        acTot += mAc;
        gridTot += mGrid;
        months.append(QVariantMap{
            {QStringLiteral("month"), m + 1},
            {QStringLiteral("pv"), std::round(mPv)},
            {QStringLiteral("load"), std::round(mLoad)},
            {QStringLiteral("autoconso"), std::round(mAc)},
            {QStringLiteral("grid"), std::round(mGrid)},
        });
    }

    const double coverage = loadTot > 0 ? (1.0 - gridTot / loadTot) * 100.0 : 100.0;
    return {{QStringLiteral("ok"), true},
            {QStringLiteral("mode"), QStringLiteral("study")},
            {QStringLiteral("pvYear"), std::round(pvTot)},
            {QStringLiteral("E_annual"), std::round(pvTot)},
            {QStringLiteral("loadYear"), std::round(loadTot)},
            {QStringLiteral("autoconso"), std::round(acTot)},
            {QStringLiteral("autoconsoRate"),
             pvTot > 0 ? std::round(acTot / pvTot * 1000) / 10 : 0},
            {QStringLiteral("coverage"), std::round(coverage * 10) / 10},
            {QStringLiteral("gridYear"), std::round(gridTot)},
            {QStringLiteral("surplusYear"), std::round(surplusTot)},
            {QStringLiteral("clippedKwh"), std::round(clippedTot)},
            {QStringLiteral("months"), months},
            {QStringLiteral("slots"), nSlots},
            {QStringLiteral("elapsedMs"), QVariant::fromValue(timer.elapsed())},
            {QStringLiteral("lossFactor"), effectiveLossFactor(params)}};
}

QVariantMap YearPv::simulateHorizonStudy(const QVariantMap& params)
{
    QElapsedTimer timer;
    timer.start();

    const QVariantMap hourly = params.value(QStringLiteral("hourlyWeatherData")).toMap();
    QVariantList pvSlots = buildYearPvSlots(hourly, params);
    if (pvSlots.isEmpty())
        return {{QStringLiteral("ok"), false},
                {QStringLiteral("error"), QStringLiteral("Pas de météo horaire")}};

    const double Ppeak0 = params.value(QStringLiteral("Ppeak"), 3).toDouble();
    const int years = std::max(1, params.value(QStringLiteral("years"), 30).toInt());
    const double degr = params.value(QStringLiteral("panelDegradation"), kPanelDegradation).toDouble();
    const double dailyKwh = params.value(QStringLiteral("dailyKwh"), 12).toDouble();
    const double dayShare = params.value(QStringLiteral("dayShare"), 0.55).toDouble();
    const double battKwh = params.value(QStringLiteral("battKwh"), 0).toDouble();
    const double dod = params.value(QStringLiteral("dod"), 80).toDouble();
    const double etaBatt = params.value(QStringLiteral("etaBatt"), 0.97).toDouble();
    const double usable0 = battKwh * (dod / 100.0);
    const bool useInv = params.value(QStringLiteral("useInverterModel"), false).toBool();
    const double pacNom = params.value(QStringLiteral("pacNom"), Ppeak0 * 0.9).toDouble();
    const double etaEuro = params.value(QStringLiteral("etaEuro"), 0.97).toDouble();

    std::array<double, kSlotsDay> loadSlot{};
    {
        const double weights[24] = {
            0.02, 0.015, 0.012, 0.012, 0.015, 0.025, 0.045, 0.06,
            0.05, 0.04,  0.035, 0.035, 0.04,  0.04,  0.035, 0.035,
            0.04, 0.055, 0.07,  0.075, 0.065, 0.05,  0.035, 0.025};
        double sumW = 0;
        for (double w : weights)
            sumW += w;
        for (int h = 0; h < 24; ++h) {
            const bool day = h >= 7 && h < 22;
            const double adj = day ? (dayShare / 0.55) : ((1.0 - dayShare) / 0.45);
            const double hourKwh = dailyKwh * (weights[h] / sumW) * adj;
            loadSlot[static_cast<size_t>(h * 2)] = hourKwh * 0.5;
            loadSlot[static_cast<size_t>(h * 2 + 1)] = hourKwh * 0.5;
        }
    }

    double soc = usable0 * 0.5;
    double pvTot = 0, loadTot = 0, acTot = 0, surplusTot = 0, gridTot = 0;
    double deficitDays = 0;
    qint64 steps = 0;
    QVariantList yearRows;
    const int nSlots = pvSlots.size();
    const int slotsPerDay = kSlotsDay;

    for (int y = 0; y < years; ++y) {
        const double pScale = Ppeak0 * std::pow(1.0 - degr, y);
        double yPv = 0, yLoad = 0, yAc = 0, ySurplus = 0, yGrid = 0;
        int yDefDays = 0;
        int idx = 0;
        while (idx + slotsPerDay <= nSlots) {
            double dayGrid = 0;
            for (int s = 0; s < slotsPerDay; ++s) {
                double pv = pvSlots[idx + s].toDouble() * pScale;
                if (useInv) {
                    const auto acMap = acFromDc(pv, pacNom * (pScale / std::max(0.1, Ppeak0)), etaEuro);
                    pv = acMap.value(QStringLiteral("acKw")).toDouble();
                }
                const double load = loadSlot[static_cast<size_t>(s)];
                ++steps;
                yPv += pv;
                yLoad += load;
                if (usable0 <= 1e-9) {
                    yAc += std::min(pv, load);
                    ySurplus += std::max(0.0, pv - load);
                    const double g = std::max(0.0, load - pv);
                    yGrid += g;
                    dayGrid += g;
                } else {
                    const double balance = pv - load;
                    if (balance >= 0) {
                        yAc += load;
                        const double charge = std::min(balance * etaBatt, usable0 - soc);
                        soc += charge;
                        ySurplus += balance - charge / std::max(1e-9, etaBatt);
                    } else {
                        yAc += pv;
                        const double needed = -balance;
                        const double fromBatt = std::min(needed, soc);
                        soc -= fromBatt;
                        yAc += fromBatt;
                        const double g = needed - fromBatt;
                        yGrid += g;
                        dayGrid += g;
                    }
                }
            }
            idx += slotsPerDay;
            if (dayGrid > 0.05)
                ++yDefDays;
        }
        pvTot += yPv;
        loadTot += yLoad;
        acTot += yAc;
        surplusTot += ySurplus;
        gridTot += yGrid;
        deficitDays += yDefDays;
        yearRows.append(QVariantMap{
            {QStringLiteral("year"), y + 1},
            {QStringLiteral("pv"), std::round(yPv)},
            {QStringLiteral("load"), std::round(yLoad)},
            {QStringLiteral("autoconso"), std::round(yAc)},
            {QStringLiteral("surplus"), std::round(ySurplus)},
            {QStringLiteral("grid"), std::round(yGrid)},
            {QStringLiteral("deficitDays"), yDefDays},
            {QStringLiteral("coverage"),
             yLoad > 0 ? std::round((1.0 - yGrid / yLoad) * 1000) / 10 : 100.0},
            {QStringLiteral("Ppeak"), std::round(pScale * 100) / 100},
        });
    }

    const double coverage = loadTot > 0 ? (1.0 - gridTot / loadTot) * 100.0 : 100.0;
    return {{QStringLiteral("ok"), true},
            {QStringLiteral("mode"), QStringLiteral("study")},
            {QStringLiteral("years"), years},
            {QStringLiteral("stepMin"), 30},
            {QStringLiteral("steps"), QVariant::fromValue(steps)},
            {QStringLiteral("elapsedMs"), QVariant::fromValue(timer.elapsed())},
            {QStringLiteral("pvTotal"), std::round(pvTot)},
            {QStringLiteral("loadTotal"), std::round(loadTot)},
            {QStringLiteral("autoconsoTotal"), std::round(acTot)},
            {QStringLiteral("surplusTotal"), std::round(surplusTot)},
            {QStringLiteral("gridTotal"), std::round(gridTot)},
            {QStringLiteral("coveragePct"), std::round(coverage * 10) / 10},
            {QStringLiteral("avgDeficitDaysPerYear"),
             std::round((deficitDays / years) * 10) / 10},
            {QStringLiteral("shadeApplied"),
             !params.value(QStringLiteral("halfHourlyKeep")).toList().isEmpty()},
            {QStringLiteral("yearSeries"), yearRows}};
}

QVariantMap YearPv::buildBalancesReport(const QVariantMap& params)
{
    const double lat = params.value(QStringLiteral("lat"), 43.6).toDouble();
    const double tilt = params.value(QStringLiteral("tilt"), 30).toDouble();
    const double azimuth = params.value(QStringLiteral("azimuth"), 0).toDouble();
    const double Ppeak = std::max(0.1, params.value(QStringLiteral("Ppeak"), 3).toDouble());
    const QString tech = params.value(QStringLiteral("tech"), QStringLiteral("crystSi")).toString();
    const double gamma = gammaForTech(tech);
    const QVariantMap thermal = params.value(QStringLiteral("thermal")).toMap();
    const QVariantList weather = params.value(QStringLiteral("weatherData")).toList();
    const QVariantList monthlyLoss = params.value(QStringLiteral("monthlyLoss")).toList();
    const QVariantList halfKeep = params.value(QStringLiteral("halfHourlyKeep")).toList();
    const double annualLossPct = params.value(QStringLiteral("annualLossPct"), 0).toDouble();
    const bool useElec = params.value(QStringLiteral("useElectricalShade"), false).toBool();
    const bool useInv = params.value(QStringLiteral("useInverterModel"), true).toBool();
    const double pacNom = params.value(QStringLiteral("pacNom"), Ppeak * 0.9).toDouble();
    const double etaEuro = params.value(QStringLiteral("etaEuro"), 0.97).toDouble();

    QVariantMap tree = params.value(QStringLiteral("lossTree")).toMap();
    if (tree.isEmpty())
        tree = defaultLossTree(params.value(QStringLiteral("losses"), 14).toDouble());

    auto pct = [&](const char* key) {
        return std::clamp(tree.value(QString::fromLatin1(key), 0).toDouble(), 0.0, 50.0);
    };
    const double soiling = pct("soiling");
    const double lid = pct("lid");
    const double mismatch = pct("mismatch");
    const double iam = pct("iam");
    const double ohmDc = pct("ohmicDc");
    const double ohmAc = pct("ohmicAc");
    const double avail = pct("availability");
    const double quality = tree.value(QStringLiteral("quality"), -0.8).toDouble(); // often a gain (-)
    const double other = pct("other");

    QVariantList keepIn = halfKeep;
    if (useElec && !keepIn.isEmpty())
        keepIn = electricalKeepTable(keepIn,
                                     params.value(QStringLiteral("nBypass"), 3).toInt(),
                                     params.value(QStringLiteral("shadeAggressiveness"), 1.0).toDouble());

    auto shadeFactorMonth = [&](int m0) -> double {
        if (keepIn.size() >= 12) {
            const QVariantList row = keepIn[m0].toList();
            if (row.isEmpty())
                return 1.0;
            double s = 0;
            int n = 0;
            for (const QVariant& v : row) {
                s += v.toDouble();
                ++n;
            }
            return n > 0 ? std::clamp(s / n, 0.0, 1.0) : 1.0;
        }
        if (m0 < monthlyLoss.size()) {
            double loss = monthlyLoss[m0].toDouble();
            if (loss > 1.0)
                loss /= 100.0;
            return 1.0 - std::clamp(loss, 0.0, 0.95);
        }
        if (annualLossPct > 0)
            return 1.0 - std::clamp(annualLossPct / 100.0, 0.0, 0.95);
        return 1.0;
    };

    // Accumulators for loss diagram (annual energies)
    double sumGlobHor = 0, sumDiffHor = 0, sumGlobInc = 0, sumGlobEff = 0;
    double sumEArrNom = 0, sumAfterIrr = 0, sumAfterTemp = 0, sumAfterQual = 0;
    double sumAfterLid = 0, sumAfterMis = 0, sumAfterOhmDc = 0, sumEArrMpp = 0;
    double sumAfterInv = 0, sumEGrid = 0, sumTAmb = 0;
    int nMonths = 0;

    QVariantList months;
    static const char* monthNames[] = {"Jan", "Fév", "Mar", "Avr", "Mai", "Jun",
                                       "Jul", "Aoû", "Sep", "Oct", "Nov", "Déc"};

    for (int m = 0; m < 12; ++m) {
        double GHI = 100, DHI = 40, Tavg = 15;
        QString name = QString::fromUtf8(monthNames[m]);
        if (m < weather.size()) {
            const QVariantMap w = weather[m].toMap();
            GHI = w.value(QStringLiteral("GHI"), GHI).toDouble();
            DHI = w.value(QStringLiteral("DHI"), DHI).toDouble();
            Tavg = w.value(QStringLiteral("T_avg"), w.value(QStringLiteral("temp"), Tavg)).toDouble();
            if (w.contains(QStringLiteral("name")))
                name = w.value(QStringLiteral("name")).toString();
        }

        const double GlobInc = SolarMath::tiltedIrradiation(GHI, DHI, lat, tilt, azimuth, m + 1);
        const double shadeK = shadeFactorMonth(m);
        // GlobEff : après ombrage, soiling, IAM (ordre type PVsyst)
        double GlobEff = GlobInc * shadeK;
        GlobEff *= (1.0 - soiling / 100.0);
        GlobEff *= (1.0 - iam / 100.0);

        // EArrNom ≈ GlobEff [kWh/m²] × Ppeak [kWc]  (identité STC)
        const double EArrNom = GlobEff * Ppeak;

        // Bas flux ~ −0.7 %
        const double irrLossPct = 0.7;
        const double afterIrr = EArrNom * (1.0 - irrLossPct / 100.0);

        // Température : moyenne opération ~ G_eff / jours
        const int dim[] = {31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31};
        const double gAvg = GlobEff / std::max(1, dim[m]) * 1000.0 / 5.0; // W/m² approx diurne
        const double Tcell = cellTemperature(Tavg, std::clamp(gAvg, 0.0, 1000.0), thermal);
        const double PRtemp = 1.0 + gamma * std::max(0.0, Tcell - 25.0);
        const double afterTemp = afterIrr * std::clamp(PRtemp, 0.7, 1.05);

        const double afterQual = afterTemp * (1.0 - quality / 100.0); // quality négatif = gain
        const double afterLid = afterQual * (1.0 - lid / 100.0);
        const double afterMis = afterLid * (1.0 - mismatch / 100.0);
        const double afterOhmDc = afterMis * (1.0 - ohmDc / 100.0);
        const double afterOther = afterOhmDc * (1.0 - other / 100.0);
        const double EArrMPP = afterOther;

        double E_Grid = EArrMPP;
        double invLossPct = 0;
        if (useInv) {
            // η moyenne + clipping approx sur le mois
            const double dcKwPeak = Ppeak * 0.75;
            const auto ac = acFromDc(dcKwPeak, pacNom, etaEuro);
            const double eta = ac.value(QStringLiteral("eta")).toDouble();
            E_Grid = EArrMPP * eta;
            invLossPct = (1.0 - eta) * 100.0;
            if (ac.value(QStringLiteral("clippedKw")).toDouble() > 0)
                invLossPct += 0.3; // indicative
        } else {
            E_Grid = EArrMPP * etaEuro;
            invLossPct = (1.0 - etaEuro) * 100.0;
        }
        E_Grid *= (1.0 - ohmAc / 100.0);
        E_Grid *= (1.0 - avail / 100.0);

        const double PR = (Ppeak * GlobInc > 1e-9) ? E_Grid / (Ppeak * GlobInc) : 0;

        months.append(QVariantMap{
            {QStringLiteral("month"), m + 1},
            {QStringLiteral("name"), name},
            {QStringLiteral("GlobHor"), std::round(GHI * 10) / 10},
            {QStringLiteral("DiffHor"), std::round(DHI * 10) / 10},
            {QStringLiteral("T_Amb"), std::round(Tavg * 10) / 10},
            {QStringLiteral("GlobInc"), std::round(GlobInc * 10) / 10},
            {QStringLiteral("GlobEff"), std::round(GlobEff * 10) / 10},
            {QStringLiteral("EArray"), std::round(EArrMPP * 10) / 10},
            {QStringLiteral("E_Grid"), std::round(E_Grid * 10) / 10},
            {QStringLiteral("PR"), std::round(PR * 1000) / 1000},
            {QStringLiteral("shadeKeep"), std::round(shadeK * 1000) / 1000},
        });

        sumGlobHor += GHI;
        sumDiffHor += DHI;
        sumGlobInc += GlobInc;
        sumGlobEff += GlobEff;
        sumEArrNom += EArrNom;
        sumAfterIrr += afterIrr;
        sumAfterTemp += afterTemp;
        sumAfterQual += afterQual;
        sumAfterLid += afterLid;
        sumAfterMis += afterMis;
        sumAfterOhmDc += afterOhmDc;
        sumEArrMpp += EArrMPP;
        sumAfterInv += EArrMPP * (1.0 - invLossPct / 100.0);
        sumEGrid += E_Grid;
        sumTAmb += Tavg;
        ++nMonths;
    }

    auto relPct = [](double prev, double next) -> double {
        if (std::abs(prev) < 1e-9)
            return 0;
        return std::round((next / prev - 1.0) * 1000) / 10;
    };

    QVariantList diagram;
    auto pushNode = [&](const QString& id, const QString& label, double energy, const QString& unit,
                        double deltaPct, bool isLoss) {
        diagram.append(QVariantMap{
            {QStringLiteral("id"), id},
            {QStringLiteral("label"), label},
            {QStringLiteral("energy"), std::round(energy * 10) / 10},
            {QStringLiteral("unit"), unit},
            {QStringLiteral("deltaPct"), deltaPct},
            {QStringLiteral("isLoss"), isLoss},
        });
    };

    pushNode(QStringLiteral("GlobHor"), QStringLiteral("Global horizontal irradiation"), sumGlobHor,
             QStringLiteral("kWh/m²"), 0, false);
    pushNode(QStringLiteral("GlobInc"), QStringLiteral("Global incident in coll. plane"), sumGlobInc,
             QStringLiteral("kWh/m²"), relPct(sumGlobHor, sumGlobInc), false);
    double meanShade = 0;
    for (int m = 0; m < 12; ++m)
        meanShade += shadeFactorMonth(m);
    meanShade /= 12.0;
    const double globShaded = sumGlobInc * meanShade;
    pushNode(QStringLiteral("Shade"), QStringLiteral("Near/far shadings (irradiance)"), globShaded,
             QStringLiteral("kWh/m²"), relPct(sumGlobInc, globShaded), true);
    const double globSoiled = globShaded * (1.0 - soiling / 100.0);
    pushNode(QStringLiteral("Soiling"), QStringLiteral("Soiling loss factor"), globSoiled,
             QStringLiteral("kWh/m²"), -soiling, true);
    pushNode(QStringLiteral("IAM"), QStringLiteral("IAM factor on global"), sumGlobEff,
             QStringLiteral("kWh/m²"), -iam, true);
    pushNode(QStringLiteral("EArrNom"), QStringLiteral("Array nominal energy (at STC effic.)"),
             sumEArrNom, QStringLiteral("kWh"), 0, false);
    pushNode(QStringLiteral("IrrLoss"), QStringLiteral("PV loss due to irradiance level"), sumAfterIrr,
             QStringLiteral("kWh"), relPct(sumEArrNom, sumAfterIrr), true);
    pushNode(QStringLiteral("TempLoss"), QStringLiteral("PV loss due to temperature"), sumAfterTemp,
             QStringLiteral("kWh"), relPct(sumAfterIrr, sumAfterTemp), true);
    pushNode(QStringLiteral("ModQual"), QStringLiteral("Module quality loss"), sumAfterQual,
             QStringLiteral("kWh"), -quality, true);
    pushNode(QStringLiteral("LID"), QStringLiteral("LID loss"), sumAfterLid, QStringLiteral("kWh"),
             -lid, true);
    pushNode(QStringLiteral("Mismatch"), QStringLiteral("Mismatch loss, modules and strings"),
             sumAfterMis, QStringLiteral("kWh"), -mismatch, true);
    pushNode(QStringLiteral("OhmDC"), QStringLiteral("Ohmic wiring loss"), sumAfterOhmDc,
             QStringLiteral("kWh"), -ohmDc, true);
    if (other > 0)
        pushNode(QStringLiteral("Other"), QStringLiteral("Other array losses"), sumEArrMpp,
                 QStringLiteral("kWh"), -other, true);
    pushNode(QStringLiteral("EArrMPP"), QStringLiteral("Array virtual energy at MPP"), sumEArrMpp,
             QStringLiteral("kWh"), 0, false);
    pushNode(QStringLiteral("Inv"), QStringLiteral("Inverter Loss during operation (efficiency)"),
             sumAfterInv, QStringLiteral("kWh"), relPct(sumEArrMpp, sumAfterInv), true);
    pushNode(QStringLiteral("E_Grid"), QStringLiteral("Energy injected into grid"), sumEGrid,
             QStringLiteral("kWh"), relPct(sumAfterInv, sumEGrid), false);

    const double E_y = sumEGrid;
    const double specific = E_y / Ppeak;
    const double PR_y = (Ppeak * sumGlobInc > 1e-9) ? E_y / (Ppeak * sumGlobInc) : 0;
    // Normalized daily (IEC)
    const double Yr_d = sumGlobInc / 365.0;           // kWh/m²/day ≡ kWh/kWp/day
    const double Ya_d = sumEArrMpp / Ppeak / 365.0;
    const double Yf_d = E_y / Ppeak / 365.0;
    const double Lc_d = Yr_d - Ya_d;
    const double Ls_d = Ya_d - Yf_d;

    return {{QStringLiteral("ok"), true},
            {QStringLiteral("mode"), QStringLiteral("pvsyst-like")},
            {QStringLiteral("balancesMonthly"), months},
            {QStringLiteral("lossDiagram"), diagram},
            {QStringLiteral("kpi"),
             QVariantMap{{QStringLiteral("E_Grid_y"), std::round(E_y)},
                         {QStringLiteral("EArray_y"), std::round(sumEArrMpp)},
                         {QStringLiteral("GlobHor_y"), std::round(sumGlobHor * 10) / 10},
                         {QStringLiteral("GlobInc_y"), std::round(sumGlobInc * 10) / 10},
                         {QStringLiteral("GlobEff_y"), std::round(sumGlobEff * 10) / 10},
                         {QStringLiteral("DiffHor_y"), std::round(sumDiffHor * 10) / 10},
                         {QStringLiteral("T_Amb_avg"),
                          std::round((sumTAmb / std::max(1, nMonths)) * 10) / 10},
                         {QStringLiteral("specificYield"), std::round(specific)},
                         {QStringLiteral("PR"), std::round(PR_y * 1000) / 1000},
                         {QStringLiteral("PR_pct"), std::round(PR_y * 1000) / 10},
                         {QStringLiteral("Yr_d"), std::round(Yr_d * 100) / 100},
                         {QStringLiteral("Ya_d"), std::round(Ya_d * 100) / 100},
                         {QStringLiteral("Yf_d"), std::round(Yf_d * 100) / 100},
                         {QStringLiteral("Lc_d"), std::round(Lc_d * 100) / 100},
                         {QStringLiteral("Ls_d"), std::round(Ls_d * 100) / 100},
                         {QStringLiteral("Ppeak"), Ppeak}}},
            {QStringLiteral("lossTree"), tree}};
}

} // namespace ose
