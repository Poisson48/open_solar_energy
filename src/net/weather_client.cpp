#include "weather_client.h"

#include <QFile>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QNetworkAccessManager>
#include <QNetworkReply>
#include <QNetworkRequest>
#include <QUrl>
#include <QUrlQuery>
#include <QVector>

#include <cmath>
#include <algorithm>

namespace ose {

static const char* kMonthNames[] = {"Jan", "Fév", "Mar", "Avr", "Mai", "Jun",
                                    "Jul", "Aoû", "Sep", "Oct", "Nov", "Déc"};

WeatherClient::WeatherClient(QObject* parent) : QObject(parent), m_nam(new QNetworkAccessManager(this))
{
}

void WeatherClient::setBusy(bool v)
{
    if (m_busy == v)
        return;
    m_busy = v;
    if (!v)
        setProgress(0);
    emit busyChanged();
}

void WeatherClient::setStatus(const QString& s)
{
    if (m_status == s)
        return;
    m_status = s;
    emit statusChanged();
}

void WeatherClient::setProgress(int pct)
{
    pct = std::clamp(pct, 0, 100);
    if (m_progressPct == pct)
        return;
    m_progressPct = pct;
    emit progressChanged();
}

void WeatherClient::setWeather(const QVariantList& data, const QVariantMap& meta)
{
    m_weather = data;
    m_meta = meta;
    emit weatherChanged();
}

void WeatherClient::loadDemo(const QString& cityKey)
{
    // Données Toulouse-like embarquées (indépendant du fichier web)
    Q_UNUSED(cityKey);
    QVariantList w;
    const double ghi[] = {60, 80, 120, 160, 200, 220, 230, 210, 170, 120, 70, 55};
    const double dhi[] = {30, 40, 55, 70, 85, 90, 95, 88, 72, 55, 35, 28};
    const double t[] = {5, 6, 9, 12, 16, 21, 24, 23, 18, 13, 8, 4};
    for (int i = 0; i < 12; ++i) {
        w.append(QVariantMap{{QStringLiteral("name"), QString::fromUtf8(kMonthNames[i])},
                             {QStringLiteral("GHI"), ghi[i]},
                             {QStringLiteral("DHI"), dhi[i]},
                             {QStringLiteral("T_avg"), t[i]}});
    }
    setWeather(w, {{QStringLiteral("source"), QStringLiteral("demo")},
                   {QStringLiteral("city"), QStringLiteral("Toulouse")}});
    setStatus(QStringLiteral("Météo démo chargée"));
    emit finished(true);
}

void WeatherClient::setHourlyWeather(const QVariantMap& hourly)
{
    m_hourly = hourly;
    emit hourlyChanged();
}

void WeatherClient::fetchOpenMeteoHourly(double lat, double lon, int year)
{
    if (year < 1940 || year > 2100)
        year = 2020;
    setBusy(true);
    setProgress(0);
    setStatus(QStringLiteral("Téléchargement TMY %1…").arg(year));

    QUrl url(QStringLiteral("https://archive-api.open-meteo.com/v1/archive"));
    QUrlQuery q;
    q.addQueryItem(QStringLiteral("latitude"), QString::number(lat, 'f', 5));
    q.addQueryItem(QStringLiteral("longitude"), QString::number(lon, 'f', 5));
    q.addQueryItem(QStringLiteral("start_date"), QStringLiteral("%1-01-01").arg(year));
    q.addQueryItem(QStringLiteral("end_date"), QStringLiteral("%1-12-31").arg(year));
    q.addQueryItem(QStringLiteral("hourly"),
                   QStringLiteral("shortwave_radiation,diffuse_radiation,temperature_2m"));
    q.addQueryItem(QStringLiteral("timezone"), QStringLiteral("UTC"));
    url.setQuery(q);

    QNetworkReply* reply = m_nam->get(QNetworkRequest(url));
    connect(reply, &QNetworkReply::downloadProgress, this,
            [this](qint64 received, qint64 total) {
                if (total > 0)
                    setProgress(int(std::round(received * 70.0 / total))); // 0–70 % download
                else if (received > 0)
                    setProgress(std::min(60, m_progressPct + 1));
                setStatus(QStringLiteral("Téléchargement TMY… %1 %").arg(m_progressPct));
            });
    connect(reply, &QNetworkReply::finished, this, [this, reply, lat, lon, year]() {
        reply->deleteLater();
        if (reply->error() != QNetworkReply::NoError) {
            setBusy(false);
            setStatus(QStringLiteral("Erreur météo horaire : ") + reply->errorString());
            emit hourlyFinished(false);
            emit finished(false);
            return;
        }
        setProgress(75);
        setStatus(QStringLiteral("Traitement des heures TMY…"));
        const QByteArray body = reply->readAll();
        setProgress(80);
        const QJsonObject root = QJsonDocument::fromJson(body).object();
        const QJsonObject hourly = root.value(QStringLiteral("hourly")).toObject();
        const QJsonArray ghiA = hourly.value(QStringLiteral("shortwave_radiation")).toArray();
        const QJsonArray dhiA = hourly.value(QStringLiteral("diffuse_radiation")).toArray();
        const QJsonArray tA = hourly.value(QStringLiteral("temperature_2m")).toArray();
        if (ghiA.size() < 24 * 30) {
            setBusy(false);
            setStatus(QStringLiteral("Données horaires insuffisantes"));
            emit hourlyFinished(false);
            emit finished(false);
            return;
        }

        setProgress(85);
        QVariantList ghi, dhi, temp;
        ghi.reserve(ghiA.size());
        dhi.reserve(ghiA.size());
        temp.reserve(ghiA.size());
        QVector<double> ghiM(12, 0), dhiM(12, 0), tM(12, 0);
        QVector<int> cnt(12, 0);
        double annualGhi = 0;

        for (int i = 0; i < ghiA.size(); ++i) {
            const double g = std::max(0.0, ghiA.at(i).toDouble());
            const double d = std::clamp(dhiA.size() > i ? dhiA.at(i).toDouble() : g * 0.4, 0.0, g);
            const double t = tA.size() > i ? tA.at(i).toDouble() : 15.0;
            ghi.append(g);
            dhi.append(d);
            temp.append(t);
            annualGhi += g;
        }

        setProgress(92);
        // Agrégation mensuelle précise via index jour
        for (int i = 0; i < ghiA.size(); ++i) {
            const int doy = i / 24; // 0-based day of year approx for non-leap
            int rem = doy;
            int m = 0;
            int dim[] = {31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31};
            if ((year % 4 == 0 && year % 100 != 0) || (year % 400 == 0))
                dim[1] = 29;
            for (; m < 12; ++m) {
                if (rem < dim[m])
                    break;
                rem -= dim[m];
            }
            if (m > 11)
                m = 11;
            ghiM[m] += ghi[i].toDouble();
            dhiM[m] += dhi[i].toDouble();
            tM[m] += temp[i].toDouble();
            cnt[m]++;
        }

        QVariantList monthly;
        for (int i = 0; i < 12; ++i) {
            const double hours = std::max(1, cnt[i]);
            const double ghiKwh = ghiM[i] / 1000.0;
            const double dhiKwh = dhiM[i] / 1000.0;
            monthly.append(QVariantMap{
                {QStringLiteral("name"), QString::fromUtf8(kMonthNames[i])},
                {QStringLiteral("GHI"), std::round(ghiKwh * 10) / 10},
                {QStringLiteral("DHI"), std::round(dhiKwh * 10) / 10},
                {QStringLiteral("T_avg"), std::round((tM[i] / hours) * 10) / 10}});
        }

        const QVariantMap hourlyMap{
            {QStringLiteral("ghi"), ghi},
            {QStringLiteral("dhi"), dhi},
            {QStringLiteral("temp"), temp},
            {QStringLiteral("year"), year},
            {QStringLiteral("nHours"), ghi.size()},
            {QStringLiteral("lat"), lat},
            {QStringLiteral("lon"), lon},
            {QStringLiteral("source"), QStringLiteral("open-meteo-hourly")},
            {QStringLiteral("annualGhiKwh"), std::round(annualGhi / 1000.0)},
        };
        setProgress(98);
        setHourlyWeather(hourlyMap);
        setWeather(monthly, {{QStringLiteral("source"), QStringLiteral("open-meteo-hourly")},
                             {QStringLiteral("lat"), lat},
                             {QStringLiteral("lon"), lon},
                             {QStringLiteral("hourlyYear"), year},
                             {QStringLiteral("annualGhiKwh"),
                              hourlyMap.value(QStringLiteral("annualGhiKwh"))}});
        setProgress(100);
        setStatus(QStringLiteral("Météo horaire %1 — %2 h — GHI ≈ %3 kWh/m²")
                      .arg(year)
                      .arg(ghi.size())
                      .arg(hourlyMap.value(QStringLiteral("annualGhiKwh")).toInt()));
        setBusy(false);
        emit hourlyFinished(true);
        emit finished(true);
    });
}

void WeatherClient::fetchOpenMeteo(double lat, double lon)
{
    setBusy(true);
    setProgress(0);
    setStatus(QStringLiteral("Import Open-Meteo…"));

    QUrl url(QStringLiteral("https://archive-api.open-meteo.com/v1/archive"));
    QUrlQuery q;
    q.addQueryItem(QStringLiteral("latitude"), QString::number(lat, 'f', 5));
    q.addQueryItem(QStringLiteral("longitude"), QString::number(lon, 'f', 5));
    q.addQueryItem(QStringLiteral("start_date"), QStringLiteral("2020-01-01"));
    q.addQueryItem(QStringLiteral("end_date"), QStringLiteral("2020-12-31"));
    q.addQueryItem(QStringLiteral("daily"),
                   QStringLiteral("shortwave_radiation_sum,temperature_2m_mean"));
    q.addQueryItem(QStringLiteral("timezone"), QStringLiteral("auto"));
    url.setQuery(q);

    QNetworkReply* reply = m_nam->get(QNetworkRequest(url));
    connect(reply, &QNetworkReply::downloadProgress, this,
            [this](qint64 received, qint64 total) {
                if (total > 0)
                    setProgress(int(std::round(received * 100.0 / total)));
                setStatus(QStringLiteral("Import Open-Meteo… %1 %").arg(m_progressPct));
            });
    connect(reply, &QNetworkReply::finished, this, [this, reply, lat, lon]() {
        reply->deleteLater();
        setBusy(false);
        if (reply->error() != QNetworkReply::NoError) {
            setStatus(QStringLiteral("Erreur Open-Meteo : ") + reply->errorString());
            emit finished(false);
            return;
        }
        const QJsonObject root = QJsonDocument::fromJson(reply->readAll()).object();
        const QJsonObject daily = root.value(QStringLiteral("daily")).toObject();
        const QJsonArray dates = daily.value(QStringLiteral("time")).toArray();
        const QJsonArray ghiSum = daily.value(QStringLiteral("shortwave_radiation_sum")).toArray();
        const QJsonArray tMean = daily.value(QStringLiteral("temperature_2m_mean")).toArray();

        QVector<double> ghiM(12, 0), dhiM(12, 0), tM(12, 0);
        QVector<int> cnt(12, 0);
        for (int i = 0; i < dates.size(); ++i) {
            const QString d = dates.at(i).toString();
            if (d.size() < 7)
                continue;
            const int month = d.mid(5, 2).toInt();
            if (month < 1 || month > 12)
                continue;
            const double g = ghiSum.at(i).toDouble(); // MJ/m²/day typically from open-meteo? 
            // Open-Meteo shortwave_radiation_sum is MJ/m² — convert to kWh/m² (÷3.6)
            ghiM[month - 1] += g / 3.6;
            tM[month - 1] += tMean.at(i).toDouble();
            cnt[month - 1]++;
        }

        QVariantList w;
        for (int i = 0; i < 12; ++i) {
            const double ghi = ghiM[i];
            // Erbs-like rough DHI ≈ 0.4 GHI if unknown
            const double dhi = ghi * 0.4;
            const double tavg = cnt[i] > 0 ? tM[i] / cnt[i] : 15;
            w.append(QVariantMap{{QStringLiteral("name"), QString::fromUtf8(kMonthNames[i])},
                                 {QStringLiteral("GHI"), std::round(ghi * 10) / 10},
                                 {QStringLiteral("DHI"), std::round(dhi * 10) / 10},
                                 {QStringLiteral("T_avg"), std::round(tavg * 10) / 10}});
        }
        setWeather(w, {{QStringLiteral("source"), QStringLiteral("open-meteo")},
                       {QStringLiteral("lat"), lat},
                       {QStringLiteral("lon"), lon}});
        setStatus(QStringLiteral("Météo Open-Meteo importée"));
        emit finished(true);
    });
}

} // namespace ose
