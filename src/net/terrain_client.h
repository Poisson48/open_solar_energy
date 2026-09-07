#pragma once

#include <QObject>
#include <QVariantMap>

class QNetworkAccessManager;

namespace ose {

/** Estimation pente / aspect via grille d’altitude Open-Meteo. */
class TerrainClient : public QObject {
    Q_OBJECT
    Q_PROPERTY(bool busy READ busy NOTIFY busyChanged)
    Q_PROPERTY(QString status READ status NOTIFY statusChanged)
    Q_PROPERTY(QVariantMap result READ result NOTIFY resultChanged)

public:
    explicit TerrainClient(QObject* parent = nullptr);
    bool busy() const { return m_busy; }
    QString status() const { return m_status; }
    QVariantMap result() const { return m_result; }

    Q_INVOKABLE void estimate(double lat, double lon, double spanM = 60);

signals:
    void busyChanged();
    void statusChanged();
    void resultChanged();
    void finished(bool ok);

private:
    void setBusy(bool v);
    QNetworkAccessManager* m_nam = nullptr;
    bool m_busy = false;
    QString m_status;
    QVariantMap m_result;
};

} // namespace ose
