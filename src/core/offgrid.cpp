#include "offgrid.h"

#include "constants.h"
#include "solar_math.h"
#include "year_pv.h"

#include <algorithm>
#include <array>
#include <cmath>
#include <vector>

namespace ose {
namespace {

constexpr int kHours = 24;

/** Nuit batterie alignée web / Enedis : 21h–6h. */
static bool isNightHour(int h)
{
    return h >= 21 || h < 6;
}

/** Répartition uniforme jour (6–21) / nuit (21–6) — prioritaire si day+night saisis. */
std::array<double, kHours> buildDayNightLoad(double dayKwh, double nightKwh)
{
    dayKwh = std::max(0.0, dayKwh);
    nightKwh = std::max(0.0, nightKwh);
    int nDay = 0, nNight = 0;
    for (int h = 0; h < kHours; ++h)
        (isNightHour(h) ? nNight : nDay)++;
    const double perDay = nDay > 0 ? dayKwh / nDay : 0;
    const double perNight = nNight > 0 ? nightKwh / nNight : 0;
    std::array<double, kHours> out{};
    for (int h = 0; h < kHours; ++h)
        out[static_cast<size_t>(h)] = isNightHour(h) ? perNight : perDay;
    return out;
}

/** Profil charge résidentiel (fallback si seulement un total journalier). */
std::array<double, kHours> buildLoadProfile(double dailyKwh, double dayShare)
{
    static constexpr double kWeights[kHours] = {
        0.02, 0.015, 0.012, 0.012, 0.015, 0.025, 0.045, 0.06,
        0.05, 0.04,  0.035, 0.035, 0.04,  0.04,  0.035, 0.035,
        0.04, 0.055, 0.07,  0.075, 0.065, 0.05,  0.035, 0.025};
    double sumW = 0;
    for (double w : kWeights)
        sumW += w;
    std::array<double, kHours> out{};
    for (int h = 0; h < kHours; ++h) {
        const bool day = !isNightHour(h);
        const double adj = day ? (dayShare / 0.55) : ((1.0 - dayShare) / 0.45);
        out[static_cast<size_t>(h)] = dailyKwh * (kWeights[h] / sumW) * adj;
    }
    return out;
}

/** Profil 24 h depuis Enedis (48 demi-heures → 24 h). */
std::array<double, kHours> buildLoadFromHalfHourly(const QVariantList& profile48)
{
    std::array<double, kHours> out{};
    if (profile48.size() < 48)
        return out;
    for (int h = 0; h < kHours; ++h)
        out[static_cast<size_t>(h)] =
            profile48[h * 2].toDouble() + profile48[h * 2 + 1].toDouble();
    return out;
}

double keepHour(const QVariantList& halfHourlyKeep, int month0, int hour,
                double monthlyFactor)
{
    if (month0 >= 0 && month0 < halfHourlyKeep.size()) {
        const QVariantList row = halfHourlyKeep[month0].toList();
        if (row.size() >= 48) {
            const double k0 = row[hour * 2].toDouble();
            const double k1 = row[hour * 2 + 1].toDouble();
            return std::clamp((k0 + k1) / 2.0, 0.0, 1.0);
        }
    }
    return monthlyFactor;
}

double monthlyShadeFactor(const QVariantList& monthlyLoss, int i, double annualLossPct)
{
    if (i < monthlyLoss.size()) {
        double loss = monthlyLoss[i].toDouble();
        if (loss > 1.0)
            loss /= 100.0;
        return 1.0 - std::clamp(loss, 0.0, 0.95);
    }
    if (annualLossPct > 0)
        return 1.0 - std::clamp(annualLossPct / 100.0, 0.0, 0.95);
    return 1.0;
}

struct MonthResult {
    double soc_end = 0;
    int deficit_days = 0;
    double deficit_kwh = 0;
    double prod_kwh = 0;
    double conso_kwh = 0;
};

MonthResult simulateMonthHourly(const std::array<double, kHours>& pvHour,
                                const std::array<double, kHours>& loadHour, int days,
                                double soc_init, double C_usable, double eta)
{
    MonthResult r;
    double soc = std::min(soc_init, C_usable);
    for (int d = 0; d < days; ++d) {
        double dayDeficit = 0;
        for (int h = 0; h < kHours; ++h) {
            const double pv = pvHour[static_cast<size_t>(h)];
            const double load = loadHour[static_cast<size_t>(h)];
            r.prod_kwh += pv;
            r.conso_kwh += load;
            const double balance = pv - load;
            if (balance >= 0) {
                const double room = std::max(0.0, C_usable - soc);
                const double stored = std::min(balance * eta, room);
                soc = std::min(C_usable, soc + stored);
            } else {
                const double needed = -balance;
                const double fromBatt = std::min(needed, soc);
                soc -= fromBatt;
                dayDeficit += needed - fromBatt;
            }
        }
        if (dayDeficit > 0.05) {
            r.deficit_days++;
            r.deficit_kwh += dayDeficit;
        }
    }
    r.soc_end = soc;
    return r;
}

} // namespace

OffgridSizing::OffgridSizing(QObject* parent) : QObject(parent) {}

QVariantMap OffgridSizing::run(const QVariantMap& input) const
{
    const double lat = input.value(QStringLiteral("lat"), 46.5).toDouble();
    const QVariantList weather = input.value(QStringLiteral("weatherData")).toList();
    const QVariantList monthlyLoss = input.value(QStringLiteral("monthlyLoss")).toList();
    const QVariantList halfHourlyKeep = input.value(QStringLiteral("halfHourlyKeep")).toList();
    const double annualLossPct = input.value(QStringLiteral("annualLossPct"), 0).toDouble();
    const double dailyWhIn = input.value(QStringLiteral("dailyConsumptionWh"), 8000).toDouble();
    const double dayKwhIn = input.value(QStringLiteral("dayKwhPerDay"), -1).toDouble();
    const double nightKwhIn = input.value(QStringLiteral("nightKwhPerDay"), -1).toDouble();
    const QVariantList halfHourlyLoad = input.value(QStringLiteral("halfHourlyLoadProfile")).toList();
    const double tilt = input.value(QStringLiteral("tilt"), 30).toDouble();
    const double azimuth = input.value(QStringLiteral("azimuth"), 0).toDouble();
    const double dod = input.value(QStringLiteral("dod"), 80).toDouble() / 100.0;
    const double eta = input.value(QStringLiteral("battEta"), 0.97).toDouble();
    const double dayShare = std::clamp(
        input.value(QStringLiteral("dayShare"), 0.55).toDouble(), 0.2, 0.9);
    const double battCostPerKwh = input.value(QStringLiteral("battCostPerKwh"), 400).toDouble();
    const double pvCostPerKwc = input.value(QStringLiteral("pvCostPerKwc"), 1000).toDouble();
    const double coverageTarget = input.value(QStringLiteral("coverageTarget"), 95).toDouble();
    const double maxDeficitDaysPct = input.value(QStringLiteral("maxDeficitDaysPct"), 10).toDouble();
    const QString mode = input.value(QStringLiteral("mode"), QStringLiteral("autonomy")).toString();
    const double systemLosses = input.value(QStringLiteral("losses"), 14).toDouble();
    double lossF = std::max(0.5, 1.0 - systemLosses / 100.0);
    if (input.contains(QStringLiteral("lossTree")))
        lossF = YearPv::effectiveLossFactor(input);

    // Charge : Enedis demi-heures > jour/nuit explicite > total journalier
    std::array<double, kHours> loadHour{};
    QString loadSource = QStringLiteral("synthetic");
    double dayKwh = 0, nightKwh = 0, dailyKwh = 0;
    if (halfHourlyLoad.size() >= 48) {
        loadHour = buildLoadFromHalfHourly(halfHourlyLoad);
        loadSource = QStringLiteral("enedis_halfhourly");
        for (int h = 0; h < kHours; ++h) {
            const double v = loadHour[static_cast<size_t>(h)];
            dailyKwh += v;
            if (isNightHour(h))
                nightKwh += v;
            else
                dayKwh += v;
        }
    } else if (dayKwhIn >= 0 || nightKwhIn >= 0) {
        dayKwh = std::max(0.0, dayKwhIn);
        nightKwh = std::max(0.0, nightKwhIn);
        dailyKwh = dayKwh + nightKwh;
        loadHour = buildDayNightLoad(dayKwh, nightKwh);
        loadSource = QStringLiteral("day_night");
    } else {
        dailyKwh = dailyWhIn / 1000.0;
        loadHour = buildLoadProfile(dailyKwh, dayShare);
        loadSource = QStringLiteral("daily_total");
        for (int h = 0; h < kHours; ++h) {
            const double v = loadHour[static_cast<size_t>(h)];
            if (isNightHour(h))
                nightKwh += v;
            else
                dayKwh += v;
        }
    }
    const double dailyWh = dailyKwh * 1000.0;

    const bool hasTemporalShade = halfHourlyKeep.size() >= 12;
    const bool hasMonthlyShade = !monthlyLoss.isEmpty() || annualLossPct > 0;
    const bool shadeApplied = hasTemporalShade || hasMonthlyShade;

    const auto wx = SolarMath::weatherFromVariant(weather);

    const QString energyMode = input.value(QStringLiteral("energyMode"), QStringLiteral("fast")).toString();
    const QVariantMap hourlyWx = input.value(QStringLiteral("hourlyWeatherData")).toMap();
    const bool studyYield = energyMode == QLatin1String("study")
                            && hourlyWx.value(QStringLiteral("ghi")).toList().size() >= 24 * 30;

    // PV horaire @ 1 kWc : météo + tilt/azimut + ombrage demi-heure (ou facteur mensuel)
    std::array<std::array<double, kHours>, 12> pvUnit{};
    if (studyYield) {
        QVariantMap yp = input;
        yp.insert(QStringLiteral("lat"), lat);
        yp.insert(QStringLiteral("tilt"), tilt);
        yp.insert(QStringLiteral("azimuth"), azimuth);
        if (!yp.contains(QStringLiteral("lossTree")))
            yp.insert(QStringLiteral("losses"), systemLosses);
        const bool useElec = energyMode == QLatin1String("study")
                             && input.value(QStringLiteral("useElectricalShade"), true).toBool();
        yp.insert(QStringLiteral("useElectricalShade"), useElec);
        if (hasTemporalShade)
            yp.insert(QStringLiteral("halfHourlyKeep"), halfHourlyKeep);
        const QVariantList pvSlots = YearPv::buildYearPvSlots(hourlyWx, yp);
        const int year = hourlyWx.value(QStringLiteral("year"), 2020).toInt();
        int idx = 0;
        static const int mdaysLeap[] = {31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31};
        static const int mdays[] = {31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31};
        const bool leap = (year % 4 == 0 && year % 100 != 0) || (year % 400 == 0);
        for (int m = 0; m < 12; ++m) {
            const int nDays = leap ? mdaysLeap[m] : mdays[m];
            std::array<double, kHours> sumH{};
            for (int d = 0; d < nDays; ++d) {
                for (int h = 0; h < kHours; ++h) {
                    double hourKwh = 0;
                    if (idx < pvSlots.size())
                        hourKwh += pvSlots[idx++].toDouble();
                    if (idx < pvSlots.size())
                        hourKwh += pvSlots[idx++].toDouble();
                    sumH[static_cast<size_t>(h)] += hourKwh;
                }
            }
            for (int h = 0; h < kHours; ++h)
                pvUnit[static_cast<size_t>(m)][static_cast<size_t>(h)] =
                    sumH[static_cast<size_t>(h)] / std::max(1, nDays);
        }
    } else {
        for (int m = 0; m < 12; ++m) {
            const int month = m + 1;
            double GHI = 100, DHI = 40, Tavg = 15;
            if (m < static_cast<int>(wx.size())) {
                GHI = wx[static_cast<size_t>(m)].GHI;
                DHI = wx[static_cast<size_t>(m)].DHI;
                Tavg = wx[static_cast<size_t>(m)].T_avg;
            }
            const double monthFactor = hasTemporalShade
                ? 1.0
                : monthlyShadeFactor(monthlyLoss, m, annualLossPct);

            for (int h = 0; h < kHours; ++h) {
                double irr = SolarMath::hourlyIrradiance(lat, month, h, GHI, DHI, tilt, azimuth);
                irr *= keepHour(halfHourlyKeep, m, h, monthFactor);
                const double Tcell = Tavg + 25.0 * irr / 800.0;
                const double PRtemp = 1.0 - 0.0045 * std::max(0.0, Tcell - 25.0);
                pvUnit[static_cast<size_t>(m)][static_cast<size_t>(h)] =
                    (irr / 1000.0) * lossF * std::min(1.0, PRtemp);
            }
        }
    }

    // Grille : listes custom (tests / extrêmes) ou balayage standard
    std::vector<double> ppeaks;
    std::vector<double> batts;
    const QVariantList ppeakIn = input.value(QStringLiteral("ppeakValues")).toList();
    const QVariantList battIn = input.value(QStringLiteral("battValues")).toList();
    if (!ppeakIn.isEmpty()) {
        for (const QVariant& v : ppeakIn)
            ppeaks.push_back(std::max(0.05, v.toDouble()));
    } else {
        const double ppeakMax = shadeApplied ? 20.0 : 15.0;
        for (int pi = 5; pi <= int(ppeakMax * 10 + 0.1); pi += 5)
            ppeaks.push_back(pi / 10.0);
    }
    if (!battIn.isEmpty()) {
        for (const QVariant& v : battIn)
            batts.push_back(std::max(0.1, v.toDouble()));
    } else {
        const double battCeil = std::min(100.0, std::max(50.0, std::ceil(std::max(1.0, dailyKwh) * 8)));
        // Grille fine bas de gamme puis pas de 5 — 1 kWh inclus (cas courant DIY)
        static constexpr double kFineBatts[] = {
            1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 14, 16, 18, 20, 25};
        for (double b : kFineBatts) {
            if (b <= battCeil + 0.05)
                batts.push_back(b);
        }
        for (int bi = 30; bi <= int(battCeil + 0.1); bi += 5)
            batts.push_back(bi);
        if (batts.empty())
            batts.push_back(1.0);
    }

    QVariantMap best;
    QVariantMap bestEconomic;
    QVariantList candidates;

    for (double Ppeak : ppeaks) {
        for (double battKwh : batts) {
            const double C_usable = battKwh * dod;
            double soc = C_usable * 0.5;
            double totalConso = 0;
            double totalDeficit = 0;
            int deficitDays = 0;
            int totalDays = 0;
            QVariantList monthly;

            for (int m = 0; m < 12; ++m) {
                std::array<double, kHours> pvHour{};
                for (int h = 0; h < kHours; ++h)
                    pvHour[static_cast<size_t>(h)] =
                        pvUnit[static_cast<size_t>(m)][static_cast<size_t>(h)] * Ppeak;

                const int days = kDaysInMonth[static_cast<size_t>(m)];
                const MonthResult sim =
                    simulateMonthHourly(pvHour, loadHour, days, soc, C_usable, eta);
                soc = sim.soc_end;
                totalConso += sim.conso_kwh;
                totalDeficit += sim.deficit_kwh;
                deficitDays += sim.deficit_days;
                totalDays += days;

                const double covMonth = sim.conso_kwh > 0
                    ? std::max(0.0, (sim.conso_kwh - sim.deficit_kwh) / sim.conso_kwh * 100.0)
                    : 100.0;
                monthly.append(QVariantMap{
                    {QStringLiteral("month"), m + 1},
                    {QStringLiteral("name"),
                     m < static_cast<int>(wx.size()) ? wx[static_cast<size_t>(m)].name
                                                     : QString::number(m + 1)},
                    {QStringLiteral("solarDaily"),
                     std::round((sim.prod_kwh / days) * 100) / 100},
                    {QStringLiteral("consoDaily"),
                     std::round((sim.conso_kwh / days) * 100) / 100},
                    {QStringLiteral("coverageRatio"), int(std::lround(covMonth))},
                    {QStringLiteral("deficit"), std::round(sim.deficit_kwh * 10) / 10},
                    {QStringLiteral("deficitDays"), sim.deficit_days},
                });
            }

            const double coverage = totalConso > 0
                ? std::max(0.0, (totalConso - totalDeficit) / totalConso * 100.0)
                : 0.0;
            const double deficitPct =
                totalDays > 0 ? (100.0 * deficitDays / totalDays) : 0.0;
            const double cost = Ppeak * pvCostPerKwc + battKwh * battCostPerKwh;

            QVariantMap c{
                {QStringLiteral("Ppeak"), Ppeak},
                {QStringLiteral("battKwh"), battKwh},
                {QStringLiteral("coverage"), std::round(coverage * 10) / 10},
                {QStringLiteral("deficitDaysPct"), std::round(deficitPct * 10) / 10},
                {QStringLiteral("deficitDays"), deficitDays},
                {QStringLiteral("cost"), int(std::lround(cost))},
                {QStringLiteral("monthly"), monthly},
                {QStringLiteral("shadeApplied"), shadeApplied},
                {QStringLiteral("temporalShade"), hasTemporalShade},
            };
            candidates.append(c);

            const bool ok = coverage >= coverageTarget && deficitPct <= maxDeficitDaysPct;
            const bool bestOk = !best.isEmpty()
                                && best.value(QStringLiteral("coverage")).toDouble() >= coverageTarget
                                && best.value(QStringLiteral("deficitDaysPct")).toDouble()
                                       <= maxDeficitDaysPct;

            bool better = false;
            if (best.isEmpty())
                better = true;
            else if (ok && !bestOk)
                better = true;
            else if (ok && bestOk)
                better = cost < best.value(QStringLiteral("cost")).toDouble();
            else if (!ok && !bestOk) {
                const double bc = best.value(QStringLiteral("coverage")).toDouble();
                better = coverage > bc + 0.05
                         || (std::abs(coverage - bc) <= 0.05
                             && cost < best.value(QStringLiteral("cost")).toDouble());
            }
            if (mode == QLatin1String("economic") && ok && bestOk)
                better = cost < best.value(QStringLiteral("cost")).toDouble();

            if (better)
                best = c;

            if (ok) {
                if (bestEconomic.isEmpty()
                    || cost < bestEconomic.value(QStringLiteral("cost")).toDouble())
                    bestEconomic = c;
            }
        }
    }

    return {{QStringLiteral("best"), best},
            {QStringLiteral("bestEconomic"), bestEconomic},
            {QStringLiteral("candidates"), candidates},
            {QStringLiteral("dailyConsumptionWh"), dailyWh},
            {QStringLiteral("dayKwhPerDay"), std::round(dayKwh * 100) / 100},
            {QStringLiteral("nightKwhPerDay"), std::round(nightKwh * 100) / 100},
            {QStringLiteral("loadSource"), loadSource},
            {QStringLiteral("coverageTarget"), coverageTarget},
            {QStringLiteral("shadeApplied"), shadeApplied},
            {QStringLiteral("temporalShade"), hasTemporalShade},
            {QStringLiteral("tilt"), tilt},
            {QStringLiteral("azimuth"), azimuth},
            {QStringLiteral("meetsTarget"),
             !best.isEmpty()
                 && best.value(QStringLiteral("coverage")).toDouble() >= coverageTarget}};
}

} // namespace ose
