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
    Q_PROPERTY(QVariantMap lastPvcalc READ lastPvcalc NOTIFY pvcalcChanged)

public:
    explicit PvgisClient(QObject* parent = nullptr);
    bool busy() const { return m_busy; }
    QString status() const { return m_status; }
    QVariantList weatherData() const { return m_weather; }
    QVariantMap lastPvcalc() const { return m_pvcalc; }

    /** Import météo mensuelle (MRcalc). */
    Q_INVOKABLE void fetch(double lat, double lon, double tilt = 0, double azimuth = 0);

    /**
     * Comparaison production annuelle PVGIS PVcalc.
     * peakpower kWc, tilt °, azimuth convention PVGIS (0=Sud, +Ouest), loss %.
     */
    Q_INVOKABLE void fetchPvcalc(double lat, double lon, double peakpower, double tilt,
                                 double azimuth, double loss = 14);

    /** URL navigateur PVGIS PVcalc (fallback manuel). */
    Q_INVOKABLE QString pvcalcUrl(double lat, double lon, double peakpower, double tilt,
                                  double azimuth, double loss = 14) const;

signals:
    void busyChanged();
    void statusChanged();
    void weatherChanged();
    void pvcalcChanged();
    void finished(bool ok);
    void pvcalcFinished(bool ok);

private:
    QNetworkAccessManager* m_nam = nullptr;
    bool m_busy = false;
    QString m_status;
    QVariantList m_weather;
    QVariantMap m_pvcalc;
};

} // namespace ose
