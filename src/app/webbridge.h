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
    /** Écrit le PDF en cache et ouvre la visioneuse système (Intent / Desktop). */
    bool openPdf(const QString& filename, const QString& base64Data);
    /** Télécharge l’URL PDF (natif) puis ouvre la visioneuse. */
    bool openPdfFromUrl(const QString& url);
    QString openFileDialog();
    void checkForUpdates();
    /** Hub web « Mettre à jour » / Installer → Updater::startUpdate. */
    void startUpdate();
    QJsonObject gitSave(const QString& projectId, const QString& projectJson, const QString& message);
    QJsonArray gitLog(const QString& projectId);
    QString gitCheckout(const QString& projectId, const QString& hash);
    QString gitRead(const QString& projectId);
    QJsonArray gitBranches(const QString& projectId);
    QJsonObject gitCreateBranch(const QString& projectId, const QString& branchName);
    QJsonObject gitSwitchBranch(const QString& projectId, const QString& branchName);

    /**
     * Miroir disque de ose_projects_v1 (survit au redémarrage / MAJ AppImage même
     * si le profil WebEngine était éphémère). AppDataLocation/projects_backup.json
     */
    bool saveProjectsBackup(const QString& json);
    QString loadProjectsBackup() const;

signals:
    void checkUpdatesRequested();
    void startUpdateRequested();

private:
    QString projectDir(const QString& projectId) const;
    bool ensureGitRepo(const QString& dir) const;
    bool gitAvailable() const;
};

} // namespace app
