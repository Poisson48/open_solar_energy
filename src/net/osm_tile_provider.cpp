#include "osm_tile_provider.h"

#include <QColor>
#include <QMetaObject>
#include <QNetworkReply>
#include <QNetworkRequest>
#include <QQuickImageResponse>
#include <QUrl>
#include <QtMath>

namespace ose {

namespace {

QImage blankTile()
{
    QImage img(256, 256, QImage::Format_RGB32);
    img.fill(QColor(QStringLiteral("#d0dbd5")));
    return img;
}

struct TileId {
    QString layer; // "map" | "sat"
    int z = 0;
    int x = 0;
    int y = 0;
    QString cacheKey;
};

/** id : "z/x/y" (map) ou "map/z/x/y" ou "sat/z/x/y" */
bool parseTileId(const QString& id, TileId* out)
{
    const QStringList parts = id.split(QLatin1Char('/'));
    QString layer = QStringLiteral("map");
    int zi = 0;
    if (parts.size() == 3) {
        zi = 0;
    } else if (parts.size() == 4) {
        layer = parts[0].toLower();
        if (layer != QLatin1String("map") && layer != QLatin1String("sat"))
            return false;
        zi = 1;
    } else {
        return false;
    }
    bool okZ = false, okX = false, okY = false;
    int z = parts[zi].toInt(&okZ);
    int x = parts[zi + 1].toInt(&okX);
    int y = parts[zi + 2].toInt(&okY);
    if (!okZ || !okX || !okY)
        return false;
    z = qBound(0, z, 19);
    const int n = 1 << z;
    x = ((x % n) + n) % n;
    y = qBound(0, y, n - 1);
    out->layer = layer;
    out->z = z;
    out->x = x;
    out->y = y;
    out->cacheKey = QStringLiteral("%1/%2/%3/%4").arg(layer).arg(z).arg(x).arg(y);
    return true;
}

QUrl tileUrl(const TileId& t)
{
    if (t.layer == QLatin1String("sat")) {
        // Esri World Imagery — z/y/x
        return QUrl(QStringLiteral(
                        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/"
                        "MapServer/tile/%1/%2/%3")
                        .arg(t.z)
                        .arg(t.y)
                        .arg(t.x));
    }
    return QUrl(QStringLiteral("https://tile.openstreetmap.org/%1/%2/%3.png")
                    .arg(t.z)
                    .arg(t.x)
                    .arg(t.y));
}

class OsmTileResponse : public QQuickImageResponse {
public:
    OsmTileResponse(OsmTileProvider* provider, const QString& id, QNetworkAccessManager* nam)
        : m_provider(provider)
    {
        TileId tid;
        if (!parseTileId(id, &tid)) {
            m_image = blankTile();
            QMetaObject::invokeMethod(this, &OsmTileResponse::finishNow, Qt::QueuedConnection);
            return;
        }
        m_id = tid.cacheKey;

        if (QImage cached = provider->cached(m_id); !cached.isNull()) {
            m_image = cached;
            QMetaObject::invokeMethod(this, &OsmTileResponse::finishNow, Qt::QueuedConnection);
            return;
        }

        QNetworkRequest req(tileUrl(tid));
        req.setHeader(QNetworkRequest::UserAgentHeader,
                      QStringLiteral("OpenSolarEnergy/2.0 (Qt; https://github.com/Poisson48/open_solar_energy)"));
        req.setAttribute(QNetworkRequest::RedirectPolicyAttribute,
                         QNetworkRequest::NoLessSafeRedirectPolicy);
        m_reply = nam->get(req);
        QObject::connect(m_reply, &QNetworkReply::finished, this, &OsmTileResponse::onFinished);
    }

    ~OsmTileResponse() override
    {
        if (m_reply) {
            m_reply->disconnect(this);
            m_reply->abort();
            m_reply->deleteLater();
            m_reply = nullptr;
        }
    }

    QQuickTextureFactory* textureFactory() const override
    {
        return QQuickTextureFactory::textureFactoryForImage(m_image);
    }

private:
    Q_INVOKABLE void finishNow() { emit finished(); }

    void onFinished()
    {
        if (!m_reply)
            return;
        QImage img;
        if (m_reply->error() == QNetworkReply::NoError)
            img.loadFromData(m_reply->readAll());
        m_reply->deleteLater();
        m_reply = nullptr;
        if (img.isNull())
            img = blankTile();
        m_image = img;
        if (m_provider && !m_id.isEmpty())
            m_provider->putCache(m_id, img);
        emit finished();
    }

    OsmTileProvider* m_provider = nullptr;
    QString m_id;
    QImage m_image;
    QNetworkReply* m_reply = nullptr;
};

} // namespace

OsmTileProvider::OsmTileProvider()
{
    m_cache.setMaxCost(768);
}

QImage OsmTileProvider::cached(const QString& id) const
{
    QMutexLocker lock(&m_mutex);
    if (QImage* img = m_cache.object(id))
        return *img;
    return {};
}

void OsmTileProvider::putCache(const QString& id, const QImage& img)
{
    QMutexLocker lock(&m_mutex);
    m_cache.insert(id, new QImage(img), 1);
}

QQuickImageResponse* OsmTileProvider::requestImageResponse(const QString& id,
                                                           const QSize& requestedSize)
{
    Q_UNUSED(requestedSize);
    static thread_local QNetworkAccessManager* nam = nullptr;
    if (!nam)
        nam = new QNetworkAccessManager();
    return new OsmTileResponse(this, id, nam);
}

} // namespace ose
