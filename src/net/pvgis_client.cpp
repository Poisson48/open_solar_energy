#include "pvgis_client.h"

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

static const char* kMonths[] = {"Jan", "Fév", "Mar", "Avr", "Mai", "Jun",
                                "Jul", "Aoû", "Sep", "Oct", "Nov", "Déc"};

PvgisClient::PvgisClient(QObject* parent) : QObject(parent), m_nam(new QNetworkAccessManager(this))
{
}

QString PvgisClient::pvcalcUrl(double lat, double lon, double peakpower, double tilt,
                               double azimuth, double loss) const
{
    QUrl url(QStringLiteral("https://re.jrc.ec.europa.eu/api/v5_2/PVcalc"));
    QUrlQuery q;
    q.addQueryItem(QStringLiteral("lat"), QString::number(lat, 'f', 5));
    q.addQueryItem(QStringLiteral("lon"), QString::number(lon, 'f', 5));
    q.addQueryItem(QStringLiteral("peakpower"), QString::number(peakpower, 'f', 3));
    q.addQueryItem(QStringLiteral("loss"), QString::number(loss, 'f', 1));
    q.addQueryItem(QStringLiteral("angle"), QString::number(tilt, 'f', 1));
    q.addQueryItem(QStringLiteral("aspect"), QString::number(azimuth, 'f', 1));
    q.addQueryItem(QStringLiteral("pvtechchoice"), QStringLiteral("crystSi"));
    q.addQueryItem(QStringLiteral("mountingplace"), QStringLiteral("free"));
    q.addQueryItem(QStringLiteral("outputformat"), QStringLiteral("json"));
    q.addQueryItem(QStringLiteral("browser"), QStringLiteral("1"));
    url.setQuery(q);
    return url.toString();
}

void PvgisClient::fetch(double lat, double lon, double tilt, double azimuth)
{
    m_busy = true;
    emit busyChanged();
    m_status = QStringLiteral("Import PVGIS…");
    emit statusChanged();

    QUrl url(QStringLiteral("https://re.jrc.ec.europa.eu/api/v5_2/MRcalc"));
    QUrlQuery q;
    q.addQueryItem(QStringLiteral("lat"), QString::number(lat, 'f', 5));
    q.addQueryItem(QStringLiteral("lon"), QString::number(lon, 'f', 5));
    q.addQueryItem(QStringLiteral("raddatabase"), QStringLiteral("PVGIS-SARAH2"));
    q.addQueryItem(QStringLiteral("startyear"), QStringLiteral("2015"));
    q.addQueryItem(QStringLiteral("endyear"), QStringLiteral("2020"));
    q.addQueryItem(QStringLiteral("horirrad"), QStringLiteral("1"));
    q.addQueryItem(QStringLiteral("outputformat"), QStringLiteral("json"));
    if (tilt > 0) {
        q.addQueryItem(QStringLiteral("angle"), QString::number(tilt));
        q.addQueryItem(QStringLiteral("aspect"), QString::number(azimuth));
    }
    url.setQuery(q);

    QNetworkReply* reply = m_nam->get(QNetworkRequest(url));
    connect(reply, &QNetworkReply::finished, this, [this, reply]() {
        reply->deleteLater();
        m_busy = false;
        emit busyChanged();
        if (reply->error() != QNetworkReply::NoError) {
            m_status = QStringLiteral("Erreur PVGIS : ") + reply->errorString();
            emit statusChanged();
            emit finished(false);
            return;
        }
        const QJsonObject root = QJsonDocument::fromJson(reply->readAll()).object();
        const QJsonArray outputs = root.value(QStringLiteral("outputs")).toObject()
                                       .value(QStringLiteral("monthly")).toArray();
        m_weather.clear();
        for (int i = 0; i < 12; ++i) {
            double ghi = 100;
            double dhi = 40;
            double t = 15;
            if (i < outputs.size()) {
                const QJsonObject m = outputs.at(i).toObject();
                ghi = m.value(QStringLiteral("H(h)_m")).toDouble(ghi);
                if (ghi <= 0)
                    ghi = m.value(QStringLiteral("H(h)_m")).toDouble();
                dhi = ghi * 0.4;
                t = m.value(QStringLiteral("T2m")).toDouble(15);
            }
            m_weather.append(QVariantMap{{QStringLiteral("name"), QString::fromUtf8(kMonths[i])},
                                         {QStringLiteral("GHI"), std::round(ghi * 10) / 10},
                                         {QStringLiteral("DHI"), std::round(dhi * 10) / 10},
                                         {QStringLiteral("T_avg"), std::round(t * 10) / 10}});
        }
        m_status = QStringLiteral("Météo PVGIS importée");
        emit statusChanged();
        emit weatherChanged();
        emit finished(true);
    });
}

void PvgisClient::fetchPvcalc(double lat, double lon, double peakpower, double tilt,
                              double azimuth, double loss)
{
    m_busy = true;
    emit busyChanged();
    m_status = QStringLiteral("Comparaison PVcalc…");
    emit statusChanged();

    QUrl url(QStringLiteral("https://re.jrc.ec.europa.eu/api/v5_2/PVcalc"));
    QUrlQuery q;
    q.addQueryItem(QStringLiteral("lat"), QString::number(lat, 'f', 5));
    q.addQueryItem(QStringLiteral("lon"), QString::number(lon, 'f', 5));
    q.addQueryItem(QStringLiteral("peakpower"), QString::number(std::max(0.1, peakpower), 'f', 3));
    q.addQueryItem(QStringLiteral("loss"), QString::number(loss, 'f', 1));
    q.addQueryItem(QStringLiteral("angle"), QString::number(tilt, 'f', 1));
    q.addQueryItem(QStringLiteral("aspect"), QString::number(azimuth, 'f', 1));
    q.addQueryItem(QStringLiteral("pvtechchoice"), QStringLiteral("crystSi"));
    q.addQueryItem(QStringLiteral("mountingplace"), QStringLiteral("free"));
    q.addQueryItem(QStringLiteral("outputformat"), QStringLiteral("json"));
    url.setQuery(q);

    QNetworkReply* reply = m_nam->get(QNetworkRequest(url));
    connect(reply, &QNetworkReply::finished, this, [this, reply, peakpower, tilt, azimuth, loss]() {
        reply->deleteLater();
        m_busy = false;
        emit busyChanged();
        if (reply->error() != QNetworkReply::NoError) {
            m_status = QStringLiteral("Erreur PVcalc : ") + reply->errorString();
            emit statusChanged();
            emit pvcalcFinished(false);
            return;
        }
        const QJsonObject root = QJsonDocument::fromJson(reply->readAll()).object();
        const QJsonObject outputs = root.value(QStringLiteral("outputs")).toObject();
        QJsonObject totalsObj = outputs.value(QStringLiteral("totals")).toObject();
        if (totalsObj.contains(QStringLiteral("fixed")))
            totalsObj = totalsObj.value(QStringLiteral("fixed")).toObject();

        QJsonArray monthlyArr;
        const QJsonValue monthlyVal = outputs.value(QStringLiteral("monthly"));
        if (monthlyVal.isObject() && monthlyVal.toObject().contains(QStringLiteral("fixed")))
            monthlyArr = monthlyVal.toObject().value(QStringLiteral("fixed")).toArray();
        else if (monthlyVal.isArray())
            monthlyArr = monthlyVal.toArray();

        QVariantList monthlyFull;
        for (int i = 0; i < monthlyArr.size(); ++i) {
            const QJsonObject row = monthlyArr.at(i).toObject();
            const int month = row.value(QStringLiteral("month")).toInt(i + 1);
            monthlyFull.append(QVariantMap{
                {QStringLiteral("month"), month},
                {QStringLiteral("name"),
                 QString::fromUtf8(kMonths[std::clamp(month - 1, 0, 11)])},
                {QStringLiteral("E_d"), row.value(QStringLiteral("E_d")).toDouble()},
                {QStringLiteral("E_m"), row.value(QStringLiteral("E_m")).toDouble()},
                {QStringLiteral("H_i_d"), row.value(QStringLiteral("H(i)_d")).toDouble()},
                {QStringLiteral("H_i_m"), row.value(QStringLiteral("H(i)_m")).toDouble()},
                {QStringLiteral("SD_m"), row.value(QStringLiteral("SD_m")).toDouble()},
            });
        }

        const double eY = totalsObj.value(QStringLiteral("E_y")).toDouble();
        const QJsonObject inputs = root.value(QStringLiteral("inputs")).toObject();
        const QJsonObject locIn = inputs.value(QStringLiteral("location")).toObject();
        const QJsonObject meteoIn = inputs.value(QStringLiteral("meteo_data")).toObject();
        const QJsonObject mountIn = inputs.value(QStringLiteral("mounting_system")).toObject()
                                        .value(QStringLiteral("fixed")).toObject();

        m_pvcalc = {
            {QStringLiteral("ok"), eY > 0},
            {QStringLiteral("E_y"), eY},
            {QStringLiteral("E_d"), totalsObj.value(QStringLiteral("E_d")).toDouble()},
            {QStringLiteral("E_m"), totalsObj.value(QStringLiteral("E_m")).toDouble()},
            {QStringLiteral("H_i_y"), totalsObj.value(QStringLiteral("H(i)_y")).toDouble()},
            {QStringLiteral("H_i_d"), totalsObj.value(QStringLiteral("H(i)_d")).toDouble()},
            {QStringLiteral("H_i_m"), totalsObj.value(QStringLiteral("H(i)_m")).toDouble()},
            {QStringLiteral("SD_y"), totalsObj.value(QStringLiteral("SD_y")).toDouble()},
            {QStringLiteral("SD_m"), totalsObj.value(QStringLiteral("SD_m")).toDouble()},
            {QStringLiteral("l_aoi"), totalsObj.value(QStringLiteral("l_aoi")).toDouble()},
            {QStringLiteral("l_spec"), totalsObj.value(QStringLiteral("l_spec")).toVariant()},
            {QStringLiteral("l_tg"), totalsObj.value(QStringLiteral("l_tg")).toDouble()},
            {QStringLiteral("l_total"), totalsObj.value(QStringLiteral("l_total")).toDouble()},
            {QStringLiteral("peakpower"), peakpower},
            {QStringLiteral("tilt"), tilt},
            {QStringLiteral("azimuth"), azimuth},
            {QStringLiteral("loss"), loss},
            {QStringLiteral("monthly"), monthlyFull},
            {QStringLiteral("elevation"), locIn.value(QStringLiteral("elevation")).toDouble()},
            {QStringLiteral("radiation_db"), meteoIn.value(QStringLiteral("radiation_db")).toString()},
            {QStringLiteral("meteo_db"), meteoIn.value(QStringLiteral("meteo_db")).toString()},
            {QStringLiteral("year_min"), meteoIn.value(QStringLiteral("year_min")).toInt()},
            {QStringLiteral("year_max"), meteoIn.value(QStringLiteral("year_max")).toInt()},
            {QStringLiteral("use_horizon"), meteoIn.value(QStringLiteral("use_horizon")).toBool()},
            {QStringLiteral("horizon_db"), meteoIn.value(QStringLiteral("horizon_db")).toString()},
            {QStringLiteral("mounting"),
             mountIn.value(QStringLiteral("type")).toString().isEmpty()
                 ? QStringLiteral("free-standing")
                 : mountIn.value(QStringLiteral("type")).toString()},
            {QStringLiteral("source"), QStringLiteral("pvgis-pvcalc")},
        };
        m_status = eY > 0
                       ? QStringLiteral("PVcalc : %1 kWh/an").arg(int(std::lround(eY)))
                       : QStringLiteral("PVcalc : réponse vide");
        emit statusChanged();
        emit pvcalcChanged();
        emit pvcalcFinished(eY > 0);
    });
}

} // namespace ose
