#pragma once

#include <QByteArray>
#include <QHash>
#include <QHostAddress>
#include <QObject>
#include <QString>
#include <QStringList>
#include <QVariantList>
#include <QVariantMap>

class QTcpServer;
class QTcpSocket;
class QUdpSocket;
class QTimer;

namespace ose {

class SyncEngine;

/**
 * Sync LAN multi-homed (USB partage de connexion / Wi‑Fi / plusieurs NIC).
 *
 * Découverte UDP (OSE2) : annonce toutes les IPv4 utilisables ; le client
 * privilégie l’IP source du datagramme (chemin réellement joignable), puis
 * essaie les autres adresses annoncées.
 *
 * HTTP sur 0.0.0.0 :
 *   GET  /ose/v1/info?token=
 *   GET  /ose/v1/catalog?token=
 *   POST /ose/v1/bundle?token=   (JSON sélection → ZIP)
 *   POST /ose/v1/push?token=     (ZIP → import)
 *   GET  /ose/v1/bundle?token=   (ZIP préchargé, mode simple)
 */
class SyncLan : public QObject {
    Q_OBJECT
    Q_PROPERTY(bool hosting READ hosting NOTIFY hostingChanged)
    Q_PROPERTY(bool scanning READ scanning NOTIFY scanningChanged)
    Q_PROPERTY(bool busy READ busy NOTIFY busyChanged)
    Q_PROPERTY(QString status READ status NOTIFY statusChanged)
    Q_PROPERTY(QString lastError READ lastError NOTIFY lastErrorChanged)
    Q_PROPERTY(QString hostUrl READ hostUrl NOTIFY hostingChanged)
    Q_PROPERTY(QString hostToken READ hostToken NOTIFY hostingChanged)
    Q_PROPERTY(QVariantList peers READ peers NOTIFY peersChanged)
    Q_PROPERTY(QVariantMap remoteCatalog READ remoteCatalog NOTIFY remoteCatalogChanged)
    Q_PROPERTY(int selectedPeerIndex READ selectedPeerIndex WRITE setSelectedPeerIndex NOTIFY
                   selectedPeerIndexChanged)

public:
    explicit SyncLan(QObject* parent = nullptr);
    ~SyncLan() override;

    void setSyncEngine(SyncEngine* engine);

    bool hosting() const { return m_hosting; }
    bool scanning() const { return m_scanning; }
    bool busy() const { return m_busy; }
    QString status() const { return m_status; }
    QString lastError() const { return m_lastError; }
    QString hostUrl() const { return m_hostUrl; }
    QString hostToken() const { return m_token; }
    QVariantList peers() const { return m_peers; }
    QVariantMap remoteCatalog() const { return m_remoteCatalog; }
    int selectedPeerIndex() const { return m_selectedPeerIndex; }
    void setSelectedPeerIndex(int idx);
    int lastPeerIndex() const { return m_lastPeerIndex; }

    /** Héberge un ZIP fixe (mode simple). */
    Q_INVOKABLE bool startHosting(const QByteArray& zipBytes);
    /** Héberge catalogue + bundle à la demande (+ push). */
    Q_INVOKABLE bool startInteractiveHosting();
    Q_INVOKABLE void stopHosting();

    Q_INVOKABLE void startScan(int timeoutMs = 3500);
    Q_INVOKABLE void stopScan();

    Q_INVOKABLE QVariantMap fetchCatalogFromPeer(int peerIndex = -1);
    Q_INVOKABLE QByteArray fetchBundleFromPeer(int peerIndex, const QVariantMap& selection);
    Q_INVOKABLE bool pushBundleToPeer(int peerIndex, const QByteArray& zipBytes);
    Q_INVOKABLE QByteArray fetchFromPeer(int peerIndex = 0);
    Q_INVOKABLE QByteArray fetchFromUrl(const QString& urlOrInvite);
    Q_INVOKABLE QString makeInvite() const;

signals:
    void hostingChanged();
    void scanningChanged();
    void busyChanged();
    void statusChanged();
    void lastErrorChanged();
    void peersChanged();
    void remoteCatalogChanged();
    void selectedPeerIndexChanged();
    void bundleServed();
    void scanFinished();

private:
    void setStatus(const QString& s);
    void setError(const QString& e);
    void setHosting(bool v);
    void setScanning(bool v);
    void setBusy(bool v);
    bool listenHttp(quint16 preferredPort);
    void onNewConnection();
    void handleClient(QTcpSocket* sock);
    void reply(QTcpSocket* sock, int code, const QByteArray& contentType, const QByteArray& body);
    void sendUdpBeacon();
    void onUdpReady();
    int resolvePeerIndex(int peerIndex) const;
    QStringList localLanAddresses() const;
    static bool isIgnoredIface(const QString& name);
    static QString newToken();
    QByteArray httpExchange(const QString& host, quint16 port, const QByteArray& method,
                            const QString& pathAndQuery, const QByteArray& body,
                            const QByteArray& contentType, int timeoutMs);
    QByteArray tryPeersHttp(int peerIndex, const QByteArray& method, const QString& pathAndQuery,
                            const QByteArray& body, const QByteArray& contentType, int timeoutMs);

    SyncEngine* m_engine = nullptr;
    QTcpServer* m_tcp = nullptr;
    QUdpSocket* m_udp = nullptr;
    QTimer* m_beaconTimer = nullptr;
    QTimer* m_scanTimer = nullptr;

    bool m_hosting = false;
    bool m_interactive = false;
    bool m_scanning = false;
    bool m_busy = false;
    QString m_status;
    QString m_lastError;
    QString m_hostUrl;
    QString m_token;
    QByteArray m_bundle;
    quint16 m_httpPort = 0;
    QVariantList m_peers;
    QHash<QString, QVariantMap> m_peerByToken;
    QVariantMap m_remoteCatalog;
    int m_selectedPeerIndex = 0;
    int m_lastPeerIndex = -1;
};

} // namespace ose
