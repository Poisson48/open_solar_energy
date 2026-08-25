#pragma once

#include <QObject>
#include <QJsonObject>
#include <QJsonArray>

namespace app {

/** Pont QWebChannel — API native Qt pour le web embarqué */
class WebBridge : public QObject {
    Q_OBJECT
public:
    explicit WebBridge(QObject* parent = nullptr);

public slots:
    void openExternal(const QString& url);
    QString openFileDialog();
    void checkForUpdates();
    QJsonObject gitSave(const QString& projectId, const QString& projectJson, const QString& message);
    QJsonArray gitLog(const QString& projectId);
    QString gitCheckout(const QString& projectId, const QString& hash);
    QString gitRead(const QString& projectId);
    QJsonArray gitBranches(const QString& projectId);
    QJsonObject gitCreateBranch(const QString& projectId, const QString& branchName);
    QJsonObject gitSwitchBranch(const QString& projectId, const QString& branchName);

signals:
    void checkUpdatesRequested();

private:
    QString projectDir(const QString& projectId) const;
    bool ensureGitRepo(const QString& dir) const;
    bool gitAvailable() const;
};

} // namespace app
