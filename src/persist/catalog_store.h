#pragma once

#include <QAbstractListModel>
#include <QJsonArray>
#include <QObject>

namespace ose {

class CatalogStore : public QObject {
    Q_OBJECT
    Q_PROPERTY(QVariantList panels READ panels NOTIFY panelsChanged)
    Q_PROPERTY(QVariantList inverters READ inverters NOTIFY invertersChanged)

public:
    explicit CatalogStore(QObject* parent = nullptr);

    QVariantList panels() const;
    QVariantList inverters() const;

    Q_INVOKABLE void load();
    Q_INVOKABLE QString savePanel(const QVariantMap& data);
    Q_INVOKABLE bool removePanel(const QString& id);
    Q_INVOKABLE QString saveInverter(const QVariantMap& data);
    Q_INVOKABLE bool removeInverter(const QString& id);
    Q_INVOKABLE QVariantMap getPanel(const QString& id) const;
    Q_INVOKABLE QVariantMap getInverter(const QString& id) const;
    Q_INVOKABLE void seedDefaults();

signals:
    void panelsChanged();
    void invertersChanged();

private:
    QString panelsPath() const;
    QString invertersPath() const;
    bool writeArray(const QString& path, const QJsonArray& arr) const;
    QJsonArray readArray(const QString& path) const;

    QJsonArray m_panels;
    QJsonArray m_inverters;
};

} // namespace ose
