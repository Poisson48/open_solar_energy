#pragma once

#include <QObject>
#include <QVariantList>
#include <QVariantMap>

class QNetworkAccessManager;

namespace ose {

class PvgisClient : public QObject {
    Q_OBJECT
    Q_PROPERTY(bool busy READ busy NOTIFY busyChanged)
    Q_PROPERTY(QString status READ status NOTIFY statusChanged)
    Q_PROPERTY(QVariantList weatherData READ weatherData NOTIFY weatherChanged)

public:
    explicit PvgisClient(QObject* parent = nullptr);
    bool busy() const { return m_busy; }
    QString status() const { return m_status; }
    QVariantList weatherData() const { return m_weather; }

    Q_INVOKABLE void fetch(double lat, double lon, double tilt = 0, double azimuth = 0);

signals:
    void busyChanged();
    void statusChanged();
    void weatherChanged();
    void finished(bool ok);

private:
    QNetworkAccessManager* m_nam = nullptr;
    bool m_busy = false;
    QString m_status;
    QVariantList m_weather;
};

} // namespace ose
