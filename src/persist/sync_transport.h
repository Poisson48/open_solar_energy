#pragma once

#include <QByteArray>
#include <QObject>
#include <QString>

namespace ose {

/**
 * Transport fichier optionnel (secours « Fichier… »).
 * Le chemin principal PC↔téléphone est SyncLan (HTTP + UDP, câble partage de connexion / Wi‑Fi).
 * Phase 2 : BluetoothTransport — même idée réseau local, sans ADB.
 */
class SyncTransport : public QObject {
    Q_OBJECT
    Q_PROPERTY(QString name READ name CONSTANT)
    Q_PROPERTY(QString lastError READ lastError NOTIFY lastErrorChanged)
    Q_PROPERTY(bool available READ available NOTIFY availableChanged)

public:
    explicit SyncTransport(QObject* parent = nullptr) : QObject(parent) {}

    virtual QString name() const = 0;
    QString lastError() const { return m_lastError; }
    virtual bool available() const = 0;

    /** Écrit le bundle destiné à l’autre appareil (PC→tel ou tel→PC selon rôle). */
    Q_INVOKABLE virtual bool sendBundle(const QByteArray& zipBytes, bool toPhone) = 0;
    /** Lit le bundle en provenance de l’autre appareil. */
    Q_INVOKABLE virtual QByteArray receiveBundle(bool fromPhone) = 0;

    /** Chemin du dossier sync détecté (vide si indisponible). */
    Q_INVOKABLE virtual QString syncDir() const = 0;

signals:
    void lastErrorChanged();
    void availableChanged();

protected:
    void setLastError(const QString& e)
    {
        if (m_lastError == e)
            return;
        m_lastError = e;
        emit lastErrorChanged();
    }

    QString m_lastError;
};

/**
 * USB / MTP : fichiers
 *   Documents/OpenSolarEnergy/sync/from-pc.osebundle
 *   Documents/OpenSolarEnergy/sync/from-phone.osebundle
 *
 * Sur PC : détecte un montage MTP gvfs, sinon dossier Documents local (secours fichier).
 * Sur Android : Documents public via Platform JNI, sinon AppData sync mirror.
 */
class UsbFileTransport : public SyncTransport {
    Q_OBJECT
public:
    explicit UsbFileTransport(QObject* parent = nullptr);

    QString name() const override { return QStringLiteral("usb"); }
    bool available() const override;

    bool sendBundle(const QByteArray& zipBytes, bool toPhone) override;
    QByteArray receiveBundle(bool fromPhone) override;
    QString syncDir() const override;

    /** Force un chemin (tests / dialogue utilisateur). */
    Q_INVOKABLE void setSyncDirOverride(const QString& path);
    Q_INVOKABLE void clearSyncDirOverride();
    /** Rescan MTP / Documents. */
    Q_INVOKABLE void refresh();

    static QString fileNameToPhone() { return QStringLiteral("from-pc.osebundle"); }
    static QString fileNameToPc() { return QStringLiteral("from-phone.osebundle"); }

private:
    QString discoverSyncDir() const;
    QString ensureLocalDocumentsSync() const;
    QString m_override;
    mutable QString m_cachedDir;
};

} // namespace ose
