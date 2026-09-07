#include "geocode_client.h"

#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QNetworkAccessManager>
#include <QNetworkReply>
#include <QNetworkRequest>
#include <QUrl>
#include <QUrlQuery>

namespace ose {

GeocodeClient::GeocodeClient(QObject* parent)
    : QObject(parent), m_nam(new QNetworkAccessManager(this))
{
}

void GeocodeClient::search(const QString& query)
{
    if (query.trimmed().isEmpty())
        return;
    m_busy = true;
    emit busyChanged();
    QUrl url(QStringLiteral("https://nominatim.openstreetmap.org/search"));
    QUrlQuery q;
    q.addQueryItem(QStringLiteral("q"), query);
    q.addQueryItem(QStringLiteral("format"), QStringLiteral("json"));
    q.addQueryItem(QStringLiteral("limit"), QStringLiteral("5"));
    url.setQuery(q);
    QNetworkRequest req(url);
    req.setHeader(QNetworkRequest::UserAgentHeader,
                  QStringLiteral("OpenSolarEnergy/2.0 (local; contact@opensolar)"));
    QNetworkReply* reply = m_nam->get(req);
    connect(reply, &QNetworkReply::finished, this, [this, reply]() {
        reply->deleteLater();
        m_busy = false;
        emit busyChanged();
        m_results.clear();
        if (reply->error() != QNetworkReply::NoError) {
            emit resultsChanged();
            emit finished(false);
            return;
        }
        const QJsonArray arr = QJsonDocument::fromJson(reply->readAll()).array();
        for (const QJsonValue& v : arr) {
            const QJsonObject o = v.toObject();
            m_results.append(QVariantMap{
                {QStringLiteral("name"), o.value(QStringLiteral("display_name")).toString()},
                {QStringLiteral("lat"), o.value(QStringLiteral("lat")).toString().toDouble()},
                {QStringLiteral("lon"), o.value(QStringLiteral("lon")).toString().toDouble()},
            });
        }
        emit resultsChanged();
        emit finished(true);
    });
}

void GeocodeClient::reverse(double lat, double lon)
{
    m_busy = true;
    emit busyChanged();
    QUrl url(QStringLiteral("https://nominatim.openstreetmap.org/reverse"));
    QUrlQuery q;
    q.addQueryItem(QStringLiteral("lat"), QString::number(lat, 'f', 6));
    q.addQueryItem(QStringLiteral("lon"), QString::number(lon, 'f', 6));
    q.addQueryItem(QStringLiteral("format"), QStringLiteral("json"));
    url.setQuery(q);
    QNetworkRequest req(url);
    req.setHeader(QNetworkRequest::UserAgentHeader,
                  QStringLiteral("OpenSolarEnergy/2.0 (local; contact@opensolar)"));
    QNetworkReply* reply = m_nam->get(req);
    connect(reply, &QNetworkReply::finished, this, [this, reply, lat, lon]() {
        reply->deleteLater();
        m_busy = false;
        emit busyChanged();
        m_results.clear();
        if (reply->error() == QNetworkReply::NoError) {
            const QJsonObject o = QJsonDocument::fromJson(reply->readAll()).object();
            m_results.append(QVariantMap{
                {QStringLiteral("name"), o.value(QStringLiteral("display_name")).toString()},
                {QStringLiteral("lat"), lat},
                {QStringLiteral("lon"), lon},
            });
        }
        emit resultsChanged();
        emit finished(reply->error() == QNetworkReply::NoError);
    });
}

} // namespace ose
