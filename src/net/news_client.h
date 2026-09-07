#pragma once

#include <QObject>
#include <QVariantList>

class QNetworkAccessManager;

namespace ose {

class NewsClient : public QObject {
    Q_OBJECT
    Q_PROPERTY(QVariantList items READ items NOTIFY itemsChanged)
    Q_PROPERTY(bool busy READ busy NOTIFY busyChanged)

public:
    explicit NewsClient(QObject* parent = nullptr);
    QVariantList items() const { return m_items; }
    bool busy() const { return m_busy; }
    Q_INVOKABLE void refresh();

signals:
    void itemsChanged();
    void busyChanged();

private:
    QNetworkAccessManager* m_nam = nullptr;
    QVariantList m_items;
    bool m_busy = false;
};

} // namespace ose
