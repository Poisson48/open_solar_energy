#include "solar_math.h"

#include "constants.h"
#include "year_pv.h"

#include <algorithm>
#include <cmath>

namespace ose {
namespace {

double tempCoeff(const QString& tech)
{
    if (tech == QLatin1String("CIS"))
        return -0.0036;
    if (tech == QLatin1String("CdTe"))
        return -0.0025;
    if (tech == QLatin1String("crystSi"))
        return -0.0045;
    return -0.004;
}

double monthShadeFactor(const QVariantList& monthlyLoss, int month0, double annualLossPct)
{
    if (month0 >= 0 && month0 < monthlyLoss.size()) {
        double loss = monthlyLoss[month0].toDouble();
        if (loss > 1.0)
            loss /= 100.0;
        return 1.0 - std::clamp(loss, 0.0, 0.95);
    }
    if (annualLossPct > 0)
        return 1.0 - std::clamp(annualLossPct > 1.0 ? annualLossPct / 100.0 : annualLossPct, 0.0, 0.95);
    return 1.0;
}

/** Facteur keep mensuel depuis halfHourlyKeep (moyenne créneaux diurnes keep&lt;1 ou tous). */
double monthKeepFromHalfHourly(const QVariantList& halfHourlyKeep, int month0)
{
    if (month0 < 0 || month0 >= halfHourlyKeep.size())
        return 1.0;
    const QVariantList row = halfHourlyKeep[month0].toList();
    if (row.isEmpty())
        return 1.0;
    double sum = 0;
    int n = 0;
    for (const QVariant& v : row) {
        const double k = v.toDouble();
        // Ignorer nuit typique (keep≈1 partout) dilue peu ; on moyenne tous les slots
        sum += std::clamp(k, 0.0, 1.0);
        ++n;
    }
    return n > 0 ? sum / n : 1.0;
}

double shadeFactorForMonth(const QVariantMap& shade, int month0)
{
    if (shade.isEmpty())
        return 1.0;
    // monthlyLoss = fraction beam perdue (issue du diagramme) — priorité
    const QVariantList monthlyLoss = shade.value(QStringLiteral("monthlyLoss")).toList();
    if (month0 >= 0 && month0 < monthlyLoss.size())
        return monthShadeFactor(monthlyLoss, month0, 0);
    const QVariantList halfKeep = shade.value(QStringLiteral("halfHourlyKeep")).toList();
    if (halfKeep.size() >= 12)
        return monthKeepFromHalfHourly(halfKeep, month0);
    return monthShadeFactor({}, month0, shade.value(QStringLiteral("annualLossPct")).toDouble());
}

/**
 * Productible relatif tilt×azimut.
 * Avec halfHourlyKeep : irradiation horaire × keep (masque dépend de l’heure → oriente
 * correctement face à un masque Ouest/Est). Sinon : Htilt mensuel × facteur mensuel.
 */
double scoredIrradiation(double lat, double tilt, double az,
                         const std::vector<MonthWeather>& weather, const QVariantMap& shade)
{
    const QVariantList halfKeep = shade.value(QStringLiteral("halfHourlyKeep")).toList();
    if (halfKeep.size() >= 12) {
        double total = 0;
        for (size_t i = 0; i < weather.size(); ++i) {
            const int month = static_cast<int>(i) + 1;
            const QVariantList row = halfKeep[static_cast<int>(i)].toList();
            for (int h = 0; h < 24; ++h) {
                const double irr = SolarMath::hourlyIrradiance(
                    lat, month, h, weather[i].GHI, weather[i].DHI, tilt, az);
                if (irr <= 0)
                    continue;
                double k = 1.0;
                if (row.size() >= 48) {
                    const int s0 = std::min(47, h * 2);
                    const int s1 = std::min(47, h * 2 + 1);
                    k = 0.5 * (std::clamp(row[s0].toDouble(), 0.0, 1.0)
                               + std::clamp(row[s1].toDouble(), 0.0, 1.0));
                }
                total += irr * k;
            }
        }
        return total;
    }
    double total = 0;
    for (size_t i = 0; i < weather.size(); ++i) {
        const double H = SolarMath::tiltedIrradiation(weather[i].GHI, weather[i].DHI, lat, tilt, az,
                                                      static_cast<int>(i) + 1);
        total += H * shadeFactorForMonth(shade, static_cast<int>(i));
    }
    return total;
}

} // namespace

SolarMath::SolarMath(QObject* parent) : QObject(parent) {}

int SolarMath::midMonthDay(int month)
{
    int d = 0;
    for (int i = 0; i < month - 1; ++i)
        d += kDaysInMonth[static_cast<size_t>(i)];
    const double half = kDaysInMonth[static_cast<size_t>(month - 1)] / 2.0;
    return d + static_cast<int>(std::round(half));
}

double SolarMath::declination(int dayOfYear)
{
    const double B = 2 * M_PI * (dayOfYear - 1) / 365.0;
    return radToDeg(
        0.006918 - 0.399912 * std::cos(B) + 0.070257 * std::sin(B)
        - 0.006758 * std::cos(2 * B) + 0.000907 * std::sin(2 * B)
        - 0.002697 * std::cos(3 * B) + 0.00148 * std::sin(3 * B));
}

double SolarMath::sunriseHourAngle(double lat, double decl)
{
    const double cosW = -std::tan(degToRad(lat)) * std::tan(degToRad(decl));
    if (cosW < -1)
        return 180;
    if (cosW > 1)
        return 0;
    return radToDeg(std::acos(cosW));
}

double SolarMath::daylightHours(double lat, int month)
{
    const int day = midMonthDay(month);
    return (2.0 / 15.0) * sunriseHourAngle(lat, declination(day));
}

QVariantMap SolarMath::sunriseSunset(double lat, int dayOfYear)
{
    dayOfYear = std::clamp(dayOfYear, 1, 366);
    const double decl = declination(dayOfYear);
    double dayH = (2.0 / 15.0) * sunriseHourAngle(lat, decl);
    dayH = std::clamp(dayH, 0.0, 24.0);
    const double rise = 12.0 - dayH / 2.0;
    const double set = 12.0 + dayH / 2.0;
    return {{QStringLiteral("sunrise"), rise},
            {QStringLiteral("sunset"), set},
            {QStringLiteral("daylightHours"), dayH},
            {QStringLiteral("dayOfYear"), dayOfYear}};
}

bool SolarMath::isDaylightSolar(double lat, int dayOfYear, double solarHour)
{
    const QVariantMap ss = sunriseSunset(lat, dayOfYear);
    const double rise = ss.value(QStringLiteral("sunrise")).toDouble();
    const double set = ss.value(QStringLiteral("sunset")).toDouble();
    const double dayH = ss.value(QStringLiteral("daylightHours")).toDouble();
    if (dayH <= 1e-6)
        return false; // nuit polaire
    if (dayH >= 24.0 - 1e-6)
        return true; // jour polaire
    // Normalise dans [0, 24)
    double h = solarHour;
    while (h < 0)
        h += 24.0;
    while (h >= 24.0)
        h -= 24.0;
    return h >= rise && h < set;
}

void SolarMath::fillDayNightLoadSlots48(double* out48, double dailyKwh, double dayShare,
                                        double lat, int dayOfYear, double lonCorr)
{
    if (!out48)
        return;
    dayShare = std::clamp(dayShare, 0.0, 1.0);
    dailyKwh = std::max(0.0, dailyKwh);
    const double dayKwh = dailyKwh * dayShare;
    const double nightKwh = dailyKwh - dayKwh;
    bool daySlot[48];
    int nDay = 0, nNight = 0;
    for (int s = 0; s < 48; ++s) {
        const double solarHour = s * 0.5 + 0.25 + lonCorr;
        daySlot[s] = isDaylightSolar(lat, dayOfYear, solarHour);
        (daySlot[s] ? nDay : nNight)++;
    }
    double perDay = 0, perNight = 0;
    if (nDay > 0 && nNight > 0) {
        perDay = dayKwh / nDay;
        perNight = nightKwh / nNight;
    } else if (nDay > 0) {
        perDay = dailyKwh / nDay; // jour polaire
    } else if (nNight > 0) {
        perNight = dailyKwh / nNight; // nuit polaire
    } else {
        perDay = dailyKwh / 48.0;
    }
    for (int s = 0; s < 48; ++s)
        out48[s] = daySlot[s] ? perDay : perNight;
}

QVariantList SolarMath::dayNightLoadProfile24(double dailyKwh, double dayShare, double lat,
                                              int dayOfYear, double lonCorr)
{
    double halfHour[48];
    fillDayNightLoadSlots48(halfHour, dailyKwh, dayShare, lat, dayOfYear, lonCorr);
    QVariantList out;
    out.reserve(24);
    for (int h = 0; h < 24; ++h)
        out.append(halfHour[h * 2] + halfHour[h * 2 + 1]);
    return out;
}

double SolarMath::extraterrestrialIrradiation(double lat, int month)
{
    const int day = midMonthDay(month);
    const double decl = declination(day);
    const double ws = sunriseHourAngle(lat, decl);
    const double latR = degToRad(lat);
    const double declR = degToRad(decl);
    const double wsR = degToRad(ws);
    const double B = 2 * M_PI * day / 365.0;
    const double E0 = 1.000110 + 0.034221 * std::cos(B) + 0.001280 * std::sin(B)
                      + 0.000719 * std::cos(2 * B) + 0.000077 * std::sin(2 * B);
    const double H0 = (24.0 / M_PI) * 1367.0 * E0
                      * (wsR * std::sin(latR) * std::sin(declR)
                         + std::cos(latR) * std::cos(declR) * std::sin(wsR));
    return (H0 / 1000.0) * kDaysInMonth[static_cast<size_t>(month - 1)];
}

double SolarMath::calcRb(double lat, double tilt, double azimuth, int month)
{
    const int day = midMonthDay(month);
    const double decl = declination(day);
    const double ws = sunriseHourAngle(lat, decl);
    const double latR = degToRad(lat);
    const double declR = degToRad(decl);
    const double tiltR = degToRad(tilt);
    const double azR = degToRad(azimuth);
    constexpr double b0 = 0.05;
    constexpr int N = 96;
    const double step = 2 * ws / N;
    double num = 0;
    double den = 0;
    for (int i = 0; i < N; ++i) {
        const double omR = degToRad(-ws + (i + 0.5) * step);
        const double cosZ = std::sin(declR) * std::sin(latR)
                            + std::cos(declR) * std::cos(omR) * std::cos(latR);
        if (cosZ < 0.01)
            continue;
        const double cosI = std::sin(declR) * std::sin(latR) * std::cos(tiltR)
                            - std::sin(declR) * std::cos(latR) * std::sin(tiltR) * std::cos(azR)
                            + std::cos(declR) * std::cos(omR) * std::cos(latR) * std::cos(tiltR)
                            + std::cos(declR) * std::cos(omR) * std::sin(latR) * std::sin(tiltR) * std::cos(azR)
                            + std::cos(declR) * std::sin(omR) * std::sin(tiltR) * std::sin(azR);
        const double cI = std::max(0.0, cosI);
        const double iam = cI > 0.01 ? std::max(0.0, 1.0 - b0 * (1.0 / cI - 1.0)) : 0.0;
        num += cI * iam;
        den += cosZ;
    }
    return den > 0 ? std::max(0.0, num / den) : 0.0;
}

double SolarMath::tiltedIrradiation(double GHI, double DHI, double lat, double tilt,
                                    double azimuth, int month, double albedo)
{
    if (GHI <= 0)
        return 0;
    const double tiltR = degToRad(tilt);
    const double Ib = std::max(0.0, GHI - DHI);
    const double Rb = calcRb(lat, tilt, azimuth, month);
    const double H0 = extraterrestrialIrradiation(lat, month);
    const double Ai = H0 > 0 ? std::min(1.0, Ib / H0) : 0.0;
    const double f = GHI > 0 ? std::sqrt(std::max(0.0, Ib / GHI)) : 0.0;
    const double It_beam = (Ib + DHI * Ai) * Rb;
    const double It_diff = DHI * (1 - Ai) * (1 + std::cos(tiltR)) / 2
                           * (1 + f * std::pow(std::sin(tiltR / 2), 3));
    const double It_refl = GHI * albedo * (1 - std::cos(tiltR)) / 2;
    return std::max(0.0, It_beam + It_diff + It_refl);
}

double SolarMath::pvProduction(double Htilt, double Ppeak, double losses, double Tavg,
                               const QString& tech, int month, double lat)
{
    const double gamma = tempCoeff(tech);
    const int days = kDaysInMonth[static_cast<size_t>(month - 1)];
    const double Htilt_daily = Htilt / days;
    const double sunH = std::max(3.0, daylightHours(lat, month));
    const double G_eff = Htilt_daily > 0 ? (Htilt_daily * 1000) / sunH : 0;
    const double Tcell = (Tavg > 0 || Tavg == 0 ? Tavg : 15) + (45 - 20) * G_eff / 800;
    const double PR_temp = 1 + gamma * std::max(0.0, Tcell - 25);
    const double PR_total = std::max(0.5, (1 - losses / 100) * std::min(1.0, PR_temp));
    return Htilt * Ppeak * PR_total;
}

double SolarMath::hourlyIrradiance(double lat, int month, int hour, double GHI, double DHI,
                                   double tilt, double azimuth)
{
    const int days = kDaysInMonth[static_cast<size_t>(month - 1)];
    const double daylightH = daylightHours(lat, month);
    const double sunriseH = 12 - daylightH / 2;
    const double sunsetH = 12 + daylightH / 2;
    if (hour < sunriseH || hour >= sunsetH)
        return 0;

    const double angle = M_PI * (hour - sunriseH) / daylightH;
    const double sinWeight = std::sin(angle);
    double totalWeight = 0;
    for (int h = static_cast<int>(std::ceil(sunriseH)); h < sunsetH; ++h)
        totalWeight += std::sin(M_PI * (h - sunriseH) / daylightH);
    if (totalWeight == 0)
        return 0;

    const double dailyGHI = (GHI / days) * 1000;
    const double dailyDHI = (DHI / days) * 1000;
    const double ghiHour = dailyGHI * sinWeight / totalWeight;
    const double dhiHour = dailyDHI * sinWeight / totalWeight;
    if (tilt == 0)
        return ghiHour;

    const double tiltR = degToRad(tilt);
    const double azR = degToRad(azimuth);
    const double latR = degToRad(lat);
    const int day = midMonthDay(month);
    const double declR = degToRad(declination(day));
    const double omR = (hour + 0.5 - 12) * 15 * degToRad(1);

    const double cosZ = std::sin(declR) * std::sin(latR)
                        + std::cos(declR) * std::cos(omR) * std::cos(latR);
    if (cosZ < 0.01)
        return 0;

    const double cosI = std::sin(declR) * std::sin(latR) * std::cos(tiltR)
                        - std::sin(declR) * std::cos(latR) * std::sin(tiltR) * std::cos(azR)
                        + std::cos(declR) * std::cos(omR) * std::cos(latR) * std::cos(tiltR)
                        + std::cos(declR) * std::cos(omR) * std::sin(latR) * std::sin(tiltR) * std::cos(azR)
                        + std::cos(declR) * std::sin(omR) * std::sin(tiltR) * std::sin(azR);
    const double Rb_h = std::max(0.0, cosI) / cosZ;
    const double ibHour = std::max(0.0, ghiHour - dhiHour);
    const double B = 2 * M_PI * day / 365.0;
    const double E0 = 1.000110 + 0.034221 * std::cos(B) + 0.001280 * std::sin(B);
    const double G0h = 1367 * E0 * cosZ;
    const double Ai_h = G0h > 1 ? std::min(1.0, ibHour / G0h) : 0.0;
    const double f_h = ghiHour > 0 ? std::sqrt(std::max(0.0, ibHour / ghiHour)) : 0.0;

    return std::max(0.0,
                    (ibHour + dhiHour * Ai_h) * Rb_h
                        + dhiHour * (1 - Ai_h) * (1 + std::cos(tiltR)) / 2
                              * (1 + f_h * std::pow(std::sin(tiltR / 2), 3))
                        + ghiHour * 0.2 * (1 - std::cos(tiltR)) / 2);
}

double SolarMath::transposeHourlyReal(double ghiWm2, double dhiWm2, double lat, double tilt,
                                      double azimuth, int dayOfYear, double solarHour)
{
    if (ghiWm2 <= 0)
        return 0;
    if (tilt == 0)
        return ghiWm2;

    const double tiltR = degToRad(tilt);
    const double azR = degToRad(azimuth);
    const double latR = degToRad(lat);
    const double declR = degToRad(declination(dayOfYear));
    const double omR = (solarHour - 12) * 15 * degToRad(1);

    const double cosZ = std::sin(declR) * std::sin(latR)
                        + std::cos(declR) * std::cos(omR) * std::cos(latR);
    if (cosZ < 0.01)
        return 0;

    const double cosI = std::sin(declR) * std::sin(latR) * std::cos(tiltR)
                        - std::sin(declR) * std::cos(latR) * std::sin(tiltR) * std::cos(azR)
                        + std::cos(declR) * std::cos(omR) * std::cos(latR) * std::cos(tiltR)
                        + std::cos(declR) * std::cos(omR) * std::sin(latR) * std::sin(tiltR) * std::cos(azR)
                        + std::cos(declR) * std::sin(omR) * std::sin(tiltR) * std::sin(azR);
    const double Rb_h = std::max(0.0, cosI) / cosZ;
    const double ibHour = std::max(0.0, ghiWm2 - dhiWm2);
    const double B = 2 * M_PI * dayOfYear / 365.0;
    const double E0 = 1.000110 + 0.034221 * std::cos(B) + 0.001280 * std::sin(B);
    const double G0h = 1367 * E0 * cosZ;
    const double Ai_h = G0h > 1 ? std::min(1.0, ibHour / G0h) : 0.0;
    const double f_h = ghiWm2 > 0 ? std::sqrt(std::max(0.0, ibHour / ghiWm2)) : 0.0;

    return std::max(0.0,
                    (ibHour + dhiWm2 * Ai_h) * Rb_h
                        + dhiWm2 * (1 - Ai_h) * (1 + std::cos(tiltR)) / 2
                              * (1 + f_h * std::pow(std::sin(tiltR / 2), 3))
                        + ghiWm2 * 0.2 * (1 - std::cos(tiltR)) / 2);
}

std::vector<MonthWeather> SolarMath::weatherFromVariant(const QVariantList& list)
{
    std::vector<MonthWeather> out;
    out.reserve(static_cast<size_t>(list.size()));
    for (const QVariant& v : list) {
        const QVariantMap m = v.toMap();
        MonthWeather w;
        w.name = m.value(QStringLiteral("name")).toString();
        w.GHI = m.value(QStringLiteral("GHI")).toDouble();
        w.DHI = m.value(QStringLiteral("DHI")).toDouble();
        w.T_avg = m.value(QStringLiteral("T_avg"), 15).toDouble();
        out.push_back(w);
    }
    return out;
}

QVariantMap SolarMath::optimalTilt(double lat, const QVariantList& weatherData,
                                   bool optimizeAzimuth, const QVariantMap& shade) const
{
    const auto weather = weatherFromVariant(weatherData);
    QVector<double> azimuths = {0};
    if (optimizeAzimuth)
        azimuths = {-90, -75, -60, -45, -30, -15, 0, 15, 30, 45, 60, 75, 90};

    double bestTilt = 30;
    double bestAz = 0;
    double bestTotal = 0;
    for (int tilt = 0; tilt <= 90; ++tilt) {
        for (double az : azimuths) {
            const double total = scoredIrradiation(lat, tilt, az, weather, shade);
            if (total > bestTotal) {
                bestTotal = total;
                bestTilt = tilt;
                bestAz = az;
            }
        }
    }
    return {{QStringLiteral("tilt"), bestTilt},
            {QStringLiteral("azimuth"), bestAz},
            {QStringLiteral("total"), bestTotal},
            {QStringLiteral("shadeApplied"), !shade.isEmpty()}};
}

QVariantMap SolarMath::gridSystemAnnual(const QVariantMap& params) const
{
    const double lat = params.value(QStringLiteral("lat")).toDouble();
    const auto weather = weatherFromVariant(params.value(QStringLiteral("weatherData")).toList());
    const double Ppeak = params.value(QStringLiteral("Ppeak")).toDouble();
    const double losses = params.value(QStringLiteral("losses"), 14).toDouble();
    const double tilt = params.value(QStringLiteral("tilt"), 30).toDouble();
    const double azimuth = params.value(QStringLiteral("azimuth"), 0).toDouble();
    const QString tech = params.value(QStringLiteral("tech"), QStringLiteral("crystSi")).toString();
    const double systemCost = params.value(QStringLiteral("systemCost")).toDouble();
    const double kwhPrice = params.value(QStringLiteral("kwhPrice")).toDouble();
    const double co2Factor = params.value(QStringLiteral("co2Factor"), 0.052).toDouble();
    const QVariantList monthlyLoss = params.value(QStringLiteral("monthlyLoss")).toList();
    const double annualLossPct = params.value(QStringLiteral("annualLossPct"), 0).toDouble();
    const QString energyMode = params.value(QStringLiteral("energyMode")).toString();
    const QVariantMap hourly = params.value(QStringLiteral("hourlyWeatherData")).toMap();
    const QVariantList halfKeep = params.value(QStringLiteral("halfHourlyKeep")).toList();

    QVariantList monthly;
    double E_annual = 0;
    double H_annual = 0;
    bool usedStudy = false;

    // Mode étude : même moteur que dimensionnement / balances (ombrage 30 min inclus)
    if (energyMode == QLatin1String("study")
        && hourly.value(QStringLiteral("ghi")).toList().size() >= 24 * 30 && Ppeak > 0) {
        QVariantMap yp = params;
        QVariantMap tree = params.value(QStringLiteral("lossTree")).toMap();
        if (tree.isEmpty())
            tree = YearPv::defaultLossTree(losses);
        yp.insert(QStringLiteral("lossTree"), tree);
        yp.insert(QStringLiteral("losses"), losses);
        if (!halfKeep.isEmpty())
            yp.insert(QStringLiteral("halfHourlyKeep"), halfKeep);
        const QVariantList perKwc = YearPv::monthlyYieldPerKwc(hourly, yp);
        if (perKwc.size() >= 12) {
            usedStudy = true;
            for (size_t i = 0; i < weather.size() && static_cast<int>(i) < 12; ++i) {
                const int month = static_cast<int>(i) + 1;
                const double Htilt = tiltedIrradiation(weather[i].GHI, weather[i].DHI, lat, tilt,
                                                       azimuth, month);
                double E = perKwc[static_cast<int>(i)].toDouble() * Ppeak;
                // Keep déjà dans YearPv ; sinon appliquer courbe mensuelle
                if (halfKeep.isEmpty())
                    E *= monthShadeFactor(monthlyLoss, static_cast<int>(i), annualLossPct);
                E_annual += E;
                H_annual += Htilt;
                monthly.append(QVariantMap{
                    {QStringLiteral("month"), month},
                    {QStringLiteral("name"), weather[i].name},
                    {QStringLiteral("GHI"), weather[i].GHI},
                    {QStringLiteral("Htilt"), std::round(Htilt * 10) / 10},
                    {QStringLiteral("E_month"), std::round(E * 10) / 10},
                    {QStringLiteral("T_avg"), weather[i].T_avg},
                });
            }
        }
    }

    if (!usedStudy) {
        for (size_t i = 0; i < weather.size(); ++i) {
            const int month = static_cast<int>(i) + 1;
            const double Htilt = tiltedIrradiation(weather[i].GHI, weather[i].DHI, lat, tilt,
                                                   azimuth, month);
            double E = pvProduction(Htilt, Ppeak, losses, weather[i].T_avg, tech, month, lat);
            E *= monthShadeFactor(monthlyLoss, static_cast<int>(i), annualLossPct);
            E_annual += E;
            H_annual += Htilt;
            monthly.append(QVariantMap{
                {QStringLiteral("month"), month},
                {QStringLiteral("name"), weather[i].name},
                {QStringLiteral("GHI"), weather[i].GHI},
                {QStringLiteral("Htilt"), std::round(Htilt * 10) / 10},
                {QStringLiteral("E_month"), std::round(E * 10) / 10},
                {QStringLiteral("T_avg"), weather[i].T_avg},
            });
        }
    }

    const double PR = H_annual > 0 && Ppeak > 0 ? E_annual / (Ppeak * H_annual) : 0;
    const double CF = E_annual / (Ppeak * 8760);
    const double omAnnual = systemCost * 0.005;
    const double inverterRpl = systemCost * 0.12;
    double cumCost = systemCost;
    double cumProd25 = 0;
    for (int y = 1; y <= 25; ++y) {
        cumProd25 += E_annual * std::pow(1 - 0.005, y - 1);
        cumCost += omAnnual + (y == 15 ? inverterRpl : 0);
    }
    const double LCOE = (systemCost > 0 && cumProd25 > 0) ? cumCost / cumProd25 : 0;
    const double ROI = (E_annual * kwhPrice) > 0 ? systemCost / (E_annual * kwhPrice) : 0;
    const double CO2 = E_annual * co2Factor;

    return {
        {QStringLiteral("monthly"), monthly},
        {QStringLiteral("E_annual"), int(std::lround(E_annual))},
        {QStringLiteral("H_annual"), int(std::lround(H_annual))},
        {QStringLiteral("PR"), std::round(PR * 1000) / 1000},
        {QStringLiteral("CF"), std::round(CF * 10000) / 100},
        {QStringLiteral("ROI"), std::round(ROI * 10) / 10},
        {QStringLiteral("LCOE"), std::round(LCOE * 10000) / 10000},
        {QStringLiteral("CO2"), int(std::lround(CO2))},
        {QStringLiteral("specificYield"), Ppeak > 0 ? int(std::lround(E_annual / Ppeak)) : 0},
        {QStringLiteral("shadeApplied"),
         !monthlyLoss.isEmpty() || annualLossPct > 0 || !halfKeep.isEmpty() || usedStudy},
        {QStringLiteral("energyMode"), usedStudy ? QStringLiteral("study") : QStringLiteral("fast")},
    };
}

QVariantList SolarMath::offgridSystem(const QVariantMap& params) const
{
    const double lat = params.value(QStringLiteral("lat")).toDouble();
    const auto weather = weatherFromVariant(params.value(QStringLiteral("weatherData")).toList());
    const double Ppeak = params.value(QStringLiteral("Ppeak")).toDouble();
    const double battCap = params.value(QStringLiteral("battCap")).toDouble();
    const double dod = params.value(QStringLiteral("dod")).toDouble();
    const double dailyConsumption = params.value(QStringLiteral("dailyConsumption")).toDouble();
    const double tilt = params.value(QStringLiteral("tilt"), 30).toDouble();
    const double azimuth = params.value(QStringLiteral("azimuth"), 0).toDouble();
    const double usable = battCap * (dod / 100.0);

    QVariantList out;
    for (size_t i = 0; i < weather.size(); ++i) {
        const int month = static_cast<int>(i) + 1;
        const double Htilt = tiltedIrradiation(weather[i].GHI, weather[i].DHI, lat, tilt, azimuth, month);
        const int days = kDaysInMonth[i];
        const double prodMonthly = pvProduction(Htilt, Ppeak, 20, weather[i].T_avg,
                                                QStringLiteral("crystSi"), month, lat);
        const double solarDaily = prodMonthly / days;
        const double dailyKwh = dailyConsumption / 1000.0;
        const double coverageRatio = std::min(1.0, solarDaily / dailyKwh);
        const double autonomyDays = (usable / 1000.0) / std::max(0.01, dailyKwh - solarDaily);
        out.append(QVariantMap{
            {QStringLiteral("month"), month},
            {QStringLiteral("name"), weather[i].name},
            {QStringLiteral("solarDaily"), std::round(solarDaily * 100) / 100},
            {QStringLiteral("coverageRatio"), int(std::lround(coverageRatio * 100))},
            {QStringLiteral("autonomyDays"), std::max(0.0, std::round(autonomyDays * 10) / 10)},
            {QStringLiteral("deficit"),
             std::max(0.0, std::round((dailyKwh - solarDaily) * days * 100) / 100)},
        });
    }
    return out;
}

QVariantList SolarMath::tiltAzimuthHeatmap(double lat, const QVariantList& weatherData,
                                           const QVariantMap& shade) const
{
    const auto weather = weatherFromVariant(weatherData);
    const QVector<int> tilts = {0, 10, 20, 30, 40, 50, 60, 70, 80, 90};
    const QVector<int> azimuths = {-90, -75, -60, -45, -30, -15, 0, 15, 30, 45, 60, 75, 90};
    QVariantList results;
    double maxVal = 0;
    for (int tilt : tilts) {
        for (int az : azimuths) {
            const double total = scoredIrradiation(lat, tilt, az, weather, shade);
            if (total > maxVal)
                maxVal = total;
            results.append(QVariantMap{{QStringLiteral("tilt"), tilt},
                                       {QStringLiteral("az"), az},
                                       {QStringLiteral("value"), int(std::lround(total))}});
        }
    }
    QVariantList withPct;
    for (const QVariant& v : results) {
        QVariantMap m = v.toMap();
        const double value = m.value(QStringLiteral("value")).toDouble();
        m.insert(QStringLiteral("pct"), maxVal > 0 ? int(std::lround((value / maxVal) * 100)) : 0);
        withPct.append(m);
    }
    return withPct;
}

} // namespace ose
