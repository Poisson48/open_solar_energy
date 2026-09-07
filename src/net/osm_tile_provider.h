#pragma once

#include <QQuickImageProvider>
#include <QCache>
#include <QImage>
#include <QMutex>

namespace ose {

/** Image provider : image://osm/z/x/y */
class OsmTileProvider : public QQuickImageProvider {
public:
    explicit OsmTileProvider();
    QImage requestImage(const QString& id, QSize* size, const QSize& requestedSize) override;

private:
    QCache<QString, QImage> m_cache;
    QMutex m_mutex;
};

} // namespace ose
