#include "osm_tile_provider.h"

#include <QEventLoop>
#include <QNetworkAccessManager>
#include <QNetworkReply>
#include <QNetworkRequest>
#include <QTimer>
#include <QUrl>

namespace ose {

OsmTileProvider::OsmTileProvider()
    : QQuickImageProvider(QQuickImageProvider::Image)
{
    m_cache.setMaxCost(256);
}

QImage OsmTileProvider::requestImage(const QString& id, QSize* size, const QSize& requestedSize)
{
    Q_UNUSED(requestedSize);
    {
        QMutexLocker lock(&m_mutex);
        if (QImage* cached = m_cache.object(id)) {
            if (size)
                *size = cached->size();
            return *cached;
        }
    }

    const QStringList parts = id.split(QLatin1Char('/'));
    if (parts.size() != 3) {
        QImage blank(256, 256, QImage::Format_RGB32);
        blank.fill(QColor(QStringLiteral("#d0dbd5")));
        return blank;
    }

    // NAM local : requestImage peut tourner hors du thread principal.
    QNetworkAccessManager nam;
    const QUrl url(QStringLiteral("https://tile.openstreetmap.org/%1/%2/%3.png")
                       .arg(parts[0], parts[1], parts[2]));
    QNetworkRequest req(url);
    req.setHeader(QNetworkRequest::UserAgentHeader,
                  QStringLiteral("OpenSolarEnergy/2.0 (Qt; educational)"));
    QNetworkReply* reply = nam.get(req);
    QEventLoop loop;
    QObject::connect(reply, &QNetworkReply::finished, &loop, &QEventLoop::quit);
    QTimer::singleShot(6000, &loop, &QEventLoop::quit);
    loop.exec();

    QImage img;
    if (reply->error() == QNetworkReply::NoError)
        img.loadFromData(reply->readAll());
    reply->deleteLater();
    if (img.isNull()) {
        img = QImage(256, 256, QImage::Format_RGB32);
        img.fill(QColor(QStringLiteral("#d0dbd5")));
    }
    {
        QMutexLocker lock(&m_mutex);
        m_cache.insert(id, new QImage(img), 1);
    }
    if (size)
        *size = img.size();
    return img;
}

} // namespace ose
