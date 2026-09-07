#include "terrain_client.h"

#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QNetworkAccessManager>
#include <QNetworkReply>
#include <QNetworkRequest>
#include <QUrl>
#include <QUrlQuery>
#include <QtMath>
#include <cmath>

namespace ose {

TerrainClient::TerrainClient(QObject* parent) : QObject(parent)
{
    m_nam = new QNetworkAccessManager(this);
}

void TerrainClient::setBusy(bool v)
{
    if (m_busy == v)
        return;
    m_busy = v;
    emit busyChanged();
}

void TerrainClient::estimate(double lat, double lon, double spanM)
{
    if (m_busy)
        return;
    setBusy(true);
    m_status = QStringLiteral("Relief Open-Meteo…");
    emit statusChanged();

    // Grille 3×3 autour du point (spanM mètres)
    const double dLat = (spanM / 111320.0);
    const double dLon = (spanM / (111320.0 * std::max(0.2, std::cos(lat * M_PI / 180.0))));
    QStringList lats, lons;
    for (int iy = -1; iy <= 1; ++iy) {
        for (int ix = -1; ix <= 1; ++ix) {
            lats.append(QString::number(lat + iy * dLat, 'f', 6));
            lons.append(QString::number(lon + ix * dLon, 'f', 6));
        }
    }

    QUrl url(QStringLiteral("https://api.open-meteo.com/v1/elevation"));
    QUrlQuery q;
    q.addQueryItem(QStringLiteral("latitude"), lats.join(QLatin1Char(',')));
    q.addQueryItem(QStringLiteral("longitude"), lons.join(QLatin1Char(',')));
    url.setQuery(q);

    QNetworkRequest req(url);
    req.setHeader(QNetworkRequest::UserAgentHeader, QStringLiteral("OpenSolarEnergy/2.0"));
    QNetworkReply* reply = m_nam->get(req);
    connect(reply, &QNetworkReply::finished, this, [this, reply, dLat, dLon, spanM]() {
        reply->deleteLater();
        setBusy(false);
        if (reply->error() != QNetworkReply::NoError) {
            m_status = QStringLiteral("Relief indisponible");
            emit statusChanged();
            emit finished(false);
            return;
        }
        const QJsonObject root = QJsonDocument::fromJson(reply->readAll()).object();
        const QJsonArray elev = root.value(QStringLiteral("elevation")).toArray();
        if (elev.size() < 9) {
            m_status = QStringLiteral("Réponse relief incomplète");
            emit statusChanged();
            emit finished(false);
            return;
        }
        // Indices: 0 NW, 1 N, 2 NE, 3 W, 4 C, 5 E, 6 SW, 7 S, 8 SE
        const double eW = elev[3].toDouble();
        const double eE = elev[5].toDouble();
        const double eN = elev[1].toDouble();
        const double eS = elev[7].toDouble();
        const double eC = elev[4].toDouble();
        const double dx = spanM; // m between W-E
        const double dy = spanM;
        const double dzx = eE - eW;
        const double dzy = eN - eS;
        const double slopeRad = std::atan(std::hypot(dzx / (2 * dx), dzy / (2 * dy)));
        const double tilt = slopeRad * 180.0 / M_PI;
        // Aspect : 0 = Sud dans notre convention
        double aspectMath = std::atan2(dzx, -dzy) * 180.0 / M_PI; // 0 = south-ish
        // Convert geographic downslope direction to app azimuth (0=Sud)
        double az = aspectMath;
        while (az > 180)
            az -= 360;
        while (az < -180)
            az += 360;

        m_result = {
            {QStringLiteral("tilt"), std::round(tilt * 10) / 10},
            {QStringLiteral("azimuth"), std::round(az * 10) / 10},
            {QStringLiteral("elevation"), eC},
            {QStringLiteral("spanM"), spanM},
            {QStringLiteral("ok"), true},
        };
        m_status = QStringLiteral("Pente ~%1° · azimut ~%2°").arg(m_result.value(QStringLiteral("tilt")).toDouble())
                       .arg(m_result.value(QStringLiteral("azimuth")).toDouble());
        emit resultChanged();
        emit statusChanged();
        emit finished(true);
        Q_UNUSED(dLat);
        Q_UNUSED(dLon);
    });
}

} // namespace ose
