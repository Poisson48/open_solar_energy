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

void PvgisClient::fetch(double lat, double lon, double tilt, double azimuth)
{
    m_busy = true;
    emit busyChanged();
    m_status = QStringLiteral("Import PVGIS…");
    emit statusChanged();

    // MRcalc monthly radiation
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
                // H(h)_m is kWh/m²/month horizontal
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

} // namespace ose
