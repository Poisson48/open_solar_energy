#pragma once

#include <QObject>
#include <QVariantList>
#include <QVariantMap>

namespace ose {

/**
 * Historique versionné par dépôt Git (un repo / projet), comme OseGit web.
 * - commits avec message (autosave)
 * - branches = variantes de config
 * - restauration d’un commit
 */
class SnapshotHistory : public QObject {
    Q_OBJECT
    Q_PROPERTY(QString currentBranch READ currentBranch NOTIFY historyChanged)
public:
    explicit SnapshotHistory(QObject* parent = nullptr);

    /** Commit le JSON projet (équivalent OseGit.save). id = hash court. */
    Q_INVOKABLE bool saveSnapshot(const QString& projectId, const QString& json,
                                  const QString& message);

    /** Liste des commits (hash, date, message, id). */
    Q_INVOKABLE QVariantList list(const QString& projectId) const;

    /** Contenu project.json à un commit (hash). */
    Q_INVOKABLE QString loadSnapshot(const QString& projectId, const QString& snapshotId) const;

    /** project.json du working tree (branche courante). */
    Q_INVOKABLE QString readWorkingTree(const QString& projectId) const;

    Q_INVOKABLE QVariantList branches(const QString& projectId) const;
    Q_INVOKABLE QString currentBranch(const QString& projectId = {}) const;
    Q_INVOKABLE bool createBranch(const QString& projectId, const QString& branchName);
    Q_INVOKABLE bool switchBranch(const QString& projectId, const QString& branchName);
    Q_INVOKABLE bool gitAvailable() const;

signals:
    void historyChanged();

private:
    QString repoDir(const QString& projectId) const;
    bool ensureRepo(const QString& projectId) const;
    bool runGit(const QString& projectId, const QStringList& args, QByteArray* stdoutOut = nullptr,
                QByteArray* stderrOut = nullptr, int timeoutMs = 8000) const;
    QString safeId(const QString& projectId) const;
    QString safeBranch(const QString& name) const;

    mutable QString m_lastProjectId;
};

} // namespace ose
