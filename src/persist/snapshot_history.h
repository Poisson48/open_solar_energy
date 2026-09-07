#pragma once

#include <QObject>
#include <QVariantList>

namespace ose {

/** Historique versions par snapshots JSON (remplace isomorphic-git IndexedDB). */
class SnapshotHistory : public QObject {
    Q_OBJECT
public:
    explicit SnapshotHistory(QObject* parent = nullptr);

    Q_INVOKABLE bool saveSnapshot(const QString& projectId, const QString& json,
                                  const QString& message);
    Q_INVOKABLE QVariantList list(const QString& projectId) const;
    Q_INVOKABLE QString loadSnapshot(const QString& projectId, const QString& snapshotId) const;

private:
    QString historyDir(const QString& projectId) const;
};

} // namespace ose
