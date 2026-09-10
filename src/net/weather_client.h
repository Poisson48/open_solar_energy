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
    Q_PROPERTY(int progressPct READ progressPct NOTIFY progressChanged)
    Q_PROPERTY(QVariantList weatherData READ weatherData NOTIFY weatherChanged)
    Q_PROPERTY(QVariantMap meta READ meta NOTIFY weatherChanged)
    Q_PROPERTY(QVariantMap hourlyWeatherData READ hourlyWeatherData NOTIFY hourlyChanged)
    Q_PROPERTY(bool hasHourly READ hasHourly NOTIFY hourlyChanged)

public:
    explicit WeatherClient(QObject* parent = nullptr);

    bool busy() const { return m_busy; }
    QString status() const { return m_status; }
    int progressPct() const { return m_progressPct; }
    QVariantList weatherData() const { return m_weather; }
    QVariantMap meta() const { return m_meta; }
    QVariantMap hourlyWeatherData() const { return m_hourly; }
    bool hasHourly() const { return m_hourly.value(QStringLiteral("ghi")).toList().size() >= 24 * 30; }

    Q_INVOKABLE void fetchOpenMeteo(double lat, double lon);
    /** Année horaire GHI/DHI/T (Open-Meteo archive) — mode étude. */
    Q_INVOKABLE void fetchOpenMeteoHourly(double lat, double lon, int year = 2020);
    Q_INVOKABLE void loadDemo(const QString& cityKey = QStringLiteral("toulouse"));
    Q_INVOKABLE void setWeather(const QVariantList& data, const QVariantMap& meta = {});
    Q_INVOKABLE void setHourlyWeather(const QVariantMap& hourly);

signals:
    void busyChanged();
    void statusChanged();
    void progressChanged();
    void weatherChanged();
    void hourlyChanged();
    void finished(bool ok);
    void hourlyFinished(bool ok);

private:
    void setBusy(bool v);
    void setStatus(const QString& s);
    void setProgress(int pct);

    QNetworkAccessManager* m_nam = nullptr;
    bool m_busy = false;
    QString m_status;
    int m_progressPct = 0;
    QVariantList m_weather;
    QVariantMap m_meta;
    QVariantMap m_hourly;
};

} // namespace ose
