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

#include <cmath>

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
    emit busyChanged();
}

void WeatherClient::setStatus(const QString& s)
{
    if (m_status == s)
        return;
    m_status = s;
    emit statusChanged();
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

void WeatherClient::fetchOpenMeteo(double lat, double lon)
{
    setBusy(true);
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
