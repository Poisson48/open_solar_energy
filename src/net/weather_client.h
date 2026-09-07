#pragma once

#include <QObject>
#include <QVariantList>
#include <QVariantMap>

class QNetworkAccessManager;

namespace ose {

class WeatherClient : public QObject {
    Q_OBJECT
    Q_PROPERTY(bool busy READ busy NOTIFY busyChanged)
    Q_PROPERTY(QString status READ status NOTIFY statusChanged)
    Q_PROPERTY(QVariantList weatherData READ weatherData NOTIFY weatherChanged)
    Q_PROPERTY(QVariantMap meta READ meta NOTIFY weatherChanged)

public:
    explicit WeatherClient(QObject* parent = nullptr);

    bool busy() const { return m_busy; }
    QString status() const { return m_status; }
    QVariantList weatherData() const { return m_weather; }
    QVariantMap meta() const { return m_meta; }

    Q_INVOKABLE void fetchOpenMeteo(double lat, double lon);
    Q_INVOKABLE void loadDemo(const QString& cityKey = QStringLiteral("toulouse"));
    Q_INVOKABLE void setWeather(const QVariantList& data, const QVariantMap& meta = {});

signals:
    void busyChanged();
    void statusChanged();
    void weatherChanged();
    void finished(bool ok);

private:
    void setBusy(bool v);
    void setStatus(const QString& s);

    QNetworkAccessManager* m_nam = nullptr;
    bool m_busy = false;
    QString m_status;
    QVariantList m_weather;
    QVariantMap m_meta;
};

} // namespace ose
