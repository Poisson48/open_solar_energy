#pragma once

#include <QNetworkAccessManager>
#include <QObject>
#include <QPointer>
#include <QString>
#include <QVariantList>

class QNetworkReply;

namespace app {

class Updater : public QObject {
    Q_OBJECT
    Q_PROPERTY(State state READ state NOTIFY stateChanged)
    Q_PROPERTY(QString currentVersion READ currentVersion CONSTANT)
    Q_PROPERTY(QString latestVersion READ latestVersion NOTIFY stateChanged)
    Q_PROPERTY(QString releaseNotes READ releaseNotes NOTIFY stateChanged)
    Q_PROPERTY(QVariantList changelog READ changelog NOTIFY changelogChanged)
    Q_PROPERTY(QString whatsNewNotes READ whatsNewNotes NOTIFY changelogChanged)
    Q_PROPERTY(bool hasWhatsNew READ hasWhatsNew NOTIFY changelogChanged)
    Q_PROPERTY(qreal progress READ progress NOTIFY progressChanged)
    Q_PROPERTY(bool updateAvailable READ updateAvailable NOTIFY stateChanged)
    Q_PROPERTY(bool downloading READ downloading NOTIFY stateChanged)
    Q_PROPERTY(bool readyToInstall READ readyToInstall NOTIFY stateChanged)
    Q_PROPERTY(bool canInstall READ canInstall CONSTANT)
    Q_PROPERTY(QString statusMessage READ statusMessage NOTIFY statusMessageChanged)

public:
    enum State { Idle, Checking, Available, Downloading, Ready, Failed };
    Q_ENUM(State)

    explicit Updater(QObject* parent = nullptr);

    State state() const { return m_state; }
    QString currentVersion() const;
    QString latestVersion() const { return m_latestVersion; }
    QString releaseNotes() const { return m_releaseNotes; }
    QVariantList changelog() const { return m_changelog; }
    QString whatsNewNotes() const { return m_whatsNewNotes; }
    bool hasWhatsNew() const { return !m_whatsNewNotes.isEmpty(); }
    qreal progress() const { return m_progress; }
    bool canInstall() const;
    bool updateAvailable() const { return m_state == Available; }
    bool downloading() const { return m_state == Downloading; }
    bool readyToInstall() const { return m_state == Ready; }
    QString statusMessage() const { return m_statusMessage; }

    static bool isNewer(const QString& candidate, const QString& current);
    static QString notesFromBody(const QString& body);

    Q_INVOKABLE void check();
    /** Alias explicite pour le bouton hub web (vérifier sans auto-install). */
    Q_INVOKABLE void checkFromUser() { m_autoStartAfterCheck = false; check(); }
    /** Hub « Mettre à jour » : install / download, ou check puis download auto. */
    Q_INVOKABLE void startUpdate();
    Q_INVOKABLE void download();
    Q_INVOKABLE void install();
    Q_INVOKABLE void dismiss();
    Q_INVOKABLE void acknowledgeNotes();
    /** À appeler périodiquement (Timer QML) pour remonter le statut PackageInstaller. */
    Q_INVOKABLE void pollNativeInstallStatus();

signals:
    void stateChanged();
    void progressChanged();
    void changelogChanged();
    void statusMessageChanged();

private:
    void setState(State s);
    void setStatusMessage(const QString& msg);
    void rebuildDerivedNotes();
    void startApkDownload(const QUrl& url, bool apiAsset);
    static QString formatEntries(const QVariantList& entries);

    QNetworkAccessManager m_net;
    QPointer<QNetworkReply> m_reply;
    State m_state = Idle;
    QString m_latestVersion;
    QString m_releaseNotes;
    QString m_whatsNewNotes;
    QVariantList m_changelog;
    QString m_apkUrl;
    QString m_apkApiUrl;   // fallback api.github.com/.../assets/ID
    QString m_releaseUrl;
    QString m_apkPath;
    QString m_statusMessage;
    qreal m_progress = 0.0;
    bool m_triedApiDownload = false;
    bool m_autoStartAfterCheck = false;
};

} // namespace app
