#pragma once

#include <QQuickAsyncImageProvider>
#include <QCache>
#include <QImage>
#include <QMutex>
#include <QNetworkAccessManager>

namespace ose {

/** Image provider async : image://osm/z/x/y — ne bloque jamais le thread UI. */
class OsmTileProvider : public QQuickAsyncImageProvider {
public:
    explicit OsmTileProvider();

    QQuickImageResponse* requestImageResponse(const QString& id, const QSize& requestedSize) override;

    QImage cached(const QString& id) const;
    void putCache(const QString& id, const QImage& img);

private:
    mutable QMutex m_mutex;
    QCache<QString, QImage> m_cache;
};

} // namespace ose
