#pragma once

#include <QObject>
#include <QVariantList>
#include <QVariantMap>

class QNetworkAccessManager;

namespace ose {

class GeocodeClient : public QObject {
    Q_OBJECT
    Q_PROPERTY(bool busy READ busy NOTIFY busyChanged)
    Q_PROPERTY(QVariantList results READ results NOTIFY resultsChanged)

public:
    explicit GeocodeClient(QObject* parent = nullptr);
    bool busy() const { return m_busy; }
    QVariantList results() const { return m_results; }

    Q_INVOKABLE void search(const QString& query);
    Q_INVOKABLE void reverse(double lat, double lon);

signals:
    void busyChanged();
    void resultsChanged();
    void finished(bool ok);

private:
    QNetworkAccessManager* m_nam = nullptr;
    bool m_busy = false;
    QVariantList m_results;
};

} // namespace ose
