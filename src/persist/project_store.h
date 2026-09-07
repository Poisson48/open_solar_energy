#pragma once

#include <QAbstractListModel>
#include <QJsonArray>
#include <QJsonObject>
#include <QObject>
#include <QVariantMap>

namespace ose {

class ProjectStore : public QAbstractListModel {
    Q_OBJECT
    Q_PROPERTY(int count READ rowCount NOTIFY countChanged)
    Q_PROPERTY(QString currentId READ currentId NOTIFY currentChanged)
    Q_PROPERTY(QVariantMap currentProject READ currentProject NOTIFY currentChanged)

public:
    enum Roles {
        IdRole = Qt::UserRole + 1,
        NameRole,
        InstallTypeRole,
        LocationRole,
        UpdatedAtRole,
        ClientRole,
        IsDemoRole,
        SummaryRole,
    };

    explicit ProjectStore(QObject* parent = nullptr);

    int rowCount(const QModelIndex& parent = {}) const override;
    QVariant data(const QModelIndex& index, int role) const override;
    QHash<int, QByteArray> roleNames() const override;

    QString currentId() const { return m_currentId; }
    QVariantMap currentProject() const;

    Q_INVOKABLE bool load();
    Q_INVOKABLE bool saveAll();
    Q_INVOKABLE QString createProject(const QString& name, const QString& installType,
                                      const QString& client = {});
    Q_INVOKABLE bool openProject(const QString& id);
    Q_INVOKABLE bool removeProject(const QString& id);
    Q_INVOKABLE QString cloneProject(const QString& id, const QString& newName = {});
    Q_INVOKABLE bool updateCurrent(const QVariantMap& patch);
    Q_INVOKABLE bool setCurrentField(const QString& key, const QVariant& value);
    Q_INVOKABLE bool closeCurrent();
    Q_INVOKABLE QString exportCurrentJson() const;
    Q_INVOKABLE QString exportAllJson() const;
    Q_INVOKABLE bool importProjectJson(const QString& json);
    Q_INVOKABLE void seedDemosIfEmpty();
    Q_INVOKABLE QVariantMap clientObject() const;
    Q_INVOKABLE bool setClientObject(const QVariantMap& client);

signals:
    void countChanged();
    void currentChanged();
    void errorOccurred(const QString& message);

private:
    int indexOfId(const QString& id) const;
    QString backupPath() const;
    QString newId() const;
    void sortByUpdated();

    QJsonArray m_projects;
    QString m_currentId;
};

} // namespace ose
