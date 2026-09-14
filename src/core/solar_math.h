#pragma once

#include <QObject>
#include <QVariantList>
#include <QVariantMap>
#include <vector>

namespace ose {

struct MonthWeather {
    QString name;
    double GHI = 0;
    double DHI = 0;
    double T_avg = 15;
};

class SolarMath : public QObject {
    Q_OBJECT
public:
    explicit SolarMath(QObject* parent = nullptr);

    static int midMonthDay(int month);
    static double declination(int dayOfYear);
    static double sunriseHourAngle(double lat, double decl);
    Q_INVOKABLE static double daylightHours(double lat, int month);
    /** Lever / coucher en heure solaire (midi = 12) pour un jour de l’année 1–365/366. */
    Q_INVOKABLE static QVariantMap sunriseSunset(double lat, int dayOfYear);
    /** true si solarHour (0–24, éventuellement fractionnaire) est entre lever et coucher. */
    Q_INVOKABLE static bool isDaylightSolar(double lat, int dayOfYear, double solarHour);
    /**
     * Profil charge 24 h : part jour sur les heures de soleil, part nuit sinon.
     * lonCorr = longitude/15 pour aligner heure locale ≈ solaire (comme le PV étude).
     */
    Q_INVOKABLE static QVariantList dayNightLoadProfile24(double dailyKwh, double dayShare,
                                                         double lat, int dayOfYear,
                                                         double lonCorr = 0);
    /** Idem en 48 créneaux de 30 min (écrit out[48]). */
    static void fillDayNightLoadSlots48(double* out48, double dailyKwh, double dayShare,
                                        double lat, int dayOfYear, double lonCorr = 0);
    Q_INVOKABLE static double extraterrestrialIrradiation(double lat, int month);
    Q_INVOKABLE static double calcRb(double lat, double tilt, double azimuth, int month);
    Q_INVOKABLE static double tiltedIrradiation(double GHI, double DHI, double lat,
                                                double tilt, double azimuth, int month,
                                                double albedo = 0.2);
    Q_INVOKABLE static double pvProduction(double Htilt, double Ppeak, double losses,
                                           double Tavg, const QString& tech = QStringLiteral("crystSi"),
                                           int month = 6, double lat = 44);
    Q_INVOKABLE static double hourlyIrradiance(double lat, int month, int hour,
                                               double GHI, double DHI,
                                               double tilt = 0, double azimuth = 0);
    Q_INVOKABLE static double transposeHourlyReal(double ghiWm2, double dhiWm2, double lat,
                                                  double tilt, double azimuth, int dayOfYear,
                                                  double solarHour);

    Q_INVOKABLE QVariantMap optimalTilt(double lat, const QVariantList& weatherData,
                                        bool optimizeAzimuth = false) const;
    Q_INVOKABLE QVariantMap gridSystemAnnual(const QVariantMap& params) const;
    Q_INVOKABLE QVariantList offgridSystem(const QVariantMap& params) const;
    Q_INVOKABLE QVariantList tiltAzimuthHeatmap(double lat, const QVariantList& weatherData) const;

    static std::vector<MonthWeather> weatherFromVariant(const QVariantList& list);
};

} // namespace ose
