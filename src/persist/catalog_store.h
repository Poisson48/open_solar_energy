#pragma once

#include <QJsonArray>
#include <QObject>
#include <QVariantList>
#include <QVariantMap>

namespace ose {

class CatalogStore : public QObject {
    Q_OBJECT
    Q_PROPERTY(QVariantList panels READ panels NOTIFY panelsChanged)
    Q_PROPERTY(QVariantList inverters READ inverters NOTIFY invertersChanged)
    Q_PROPERTY(int catalogPanelCount READ catalogPanelCount NOTIFY panelsChanged)
    Q_PROPERTY(int catalogInverterCount READ catalogInverterCount NOTIFY invertersChanged)
    Q_PROPERTY(int userPanelCount READ userPanelCount NOTIFY panelsChanged)
    Q_PROPERTY(int userInverterCount READ userInverterCount NOTIFY invertersChanged)

public:
    explicit CatalogStore(QObject* parent = nullptr);

    QVariantList panels() const;
    QVariantList inverters() const;
    int catalogPanelCount() const { return m_catalogPanels.size(); }
    int catalogInverterCount() const { return m_catalogInverters.size(); }
    int userPanelCount() const { return m_userPanels.size(); }
    int userInverterCount() const { return m_userInverters.size(); }

    Q_INVOKABLE void load();
    Q_INVOKABLE QString savePanel(const QVariantMap& data);
    Q_INVOKABLE bool removePanel(const QString& id);
    Q_INVOKABLE QString saveInverter(const QVariantMap& data);
    Q_INVOKABLE bool removeInverter(const QString& id);
    Q_INVOKABLE QVariantMap getPanel(const QString& id) const;
    Q_INVOKABLE QVariantMap getInverter(const QString& id) const;
    Q_INVOKABLE QVariantList searchPanels(const QString& query) const;
    Q_INVOKABLE QVariantList searchInverters(const QString& query) const;
    Q_INVOKABLE void seedDefaults();
    Q_INVOKABLE bool isCatalogId(const QString& id) const;

signals:
    void panelsChanged();
    void invertersChanged();

private:
    QString panelsPath() const;
    QString invertersPath() const;
    bool writeArray(const QString& path, const QJsonArray& arr) const;
    QJsonArray readArray(const QString& path) const;
    void loadBundledRexel();
    void ensureDemoSeeds();
    static QJsonObject normalizePanel(const QJsonObject& raw);
    static QJsonObject normalizeInverter(const QJsonObject& raw);
    static bool isRealInverter(const QJsonObject& inv);
    static bool matchTokens(const QString& hay, const QString& query);
    QVariantList mergePanels() const;
    QVariantList mergeInverters() const;

    QJsonArray m_userPanels;
    QJsonArray m_userInverters;
    QJsonArray m_catalogPanels;
    QJsonArray m_catalogInverters;
};

} // namespace ose
