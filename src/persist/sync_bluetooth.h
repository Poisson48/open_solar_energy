#pragma once

#include <QByteArray>
#include <QElapsedTimer>
#include <QHash>
#include <QObject>
#include <QVariantList>
#include <QVariantMap>

#if defined(OSE_HAS_BLUETOOTH) && OSE_HAS_BLUETOOTH
#  include <QBluetoothAddress>
#  include <QBluetoothDeviceInfo>
#  include <QBluetoothServiceInfo>
#  include <QBluetoothUuid>
class QBluetoothLocalDevice;
class QBluetoothServer;
class QBluetoothSocket;
class QBluetoothServiceDiscoveryAgent;
class QBluetoothDeviceDiscoveryAgent;
#endif

class QTimer;

namespace ose {

class SyncEngine;

/**
 * Sync Bluetooth Classic (RFCOMM) + appairage in-app.
 * Si Qt Bluetooth absent (ex. CI Android sans qtconnectivity) : stub no-op.
 */
class SyncBluetooth : public QObject {
    Q_OBJECT
    Q_PROPERTY(bool hosting READ hosting NOTIFY hostingChanged)
    Q_PROPERTY(bool scanning READ scanning NOTIFY scanningChanged)
    Q_PROPERTY(bool busy READ busy NOTIFY busyChanged)
    Q_PROPERTY(bool pairing READ pairing NOTIFY pairingChanged)
    Q_PROPERTY(QString status READ status NOTIFY statusChanged)
    Q_PROPERTY(QString lastError READ lastError NOTIFY lastErrorChanged)
    Q_PROPERTY(QVariantList peers READ peers NOTIFY peersChanged)
    Q_PROPERTY(bool available READ available NOTIFY availableChanged)
    Q_PROPERTY(QVariantMap remoteCatalog READ remoteCatalog NOTIFY remoteCatalogChanged)
    Q_PROPERTY(int selectedPeerIndex READ selectedPeerIndex WRITE setSelectedPeerIndex NOTIFY
                   selectedPeerIndexChanged)

public:
#if defined(OSE_HAS_BLUETOOTH) && OSE_HAS_BLUETOOTH
    static QBluetoothUuid serviceUuid();
#endif
    static QString serviceUuidString();

    explicit SyncBluetooth(QObject* parent = nullptr);
    ~SyncBluetooth() override;

    void setSyncEngine(SyncEngine* engine);

    bool hosting() const { return m_hosting; }
    bool scanning() const { return m_scanning; }
    bool busy() const { return m_busy; }
    bool pairing() const { return m_pairing; }
    QString status() const { return m_status; }
    QString lastError() const { return m_lastError; }
    QVariantList peers() const { return m_peers; }
    QVariantMap remoteCatalog() const { return m_remoteCatalog; }
    bool available() const;
    int lastPeerIndex() const { return m_lastPeerIndex; }
    int selectedPeerIndex() const { return m_selectedPeerIndex; }
    void setSelectedPeerIndex(int idx);

    Q_INVOKABLE bool ensureBluetoothReady();
    Q_INVOKABLE bool makeDiscoverable();
    Q_INVOKABLE bool prepareVisibility();
    Q_INVOKABLE bool pairPeer(int peerIndex);
    Q_INVOKABLE bool startHosting(const QByteArray& zipBytes);
    Q_INVOKABLE bool startInteractiveHosting();
    Q_INVOKABLE void stopHosting();
    Q_INVOKABLE void startScan(int timeoutMs = 14000);
    Q_INVOKABLE void stopScan();
    Q_INVOKABLE QVariantMap fetchCatalogFromPeer(int peerIndex = -1);
    Q_INVOKABLE QByteArray fetchBundleFromPeer(int peerIndex, const QVariantMap& selection);
    Q_INVOKABLE bool pushBundleToPeer(int peerIndex, const QByteArray& zipBytes);
    Q_INVOKABLE QByteArray fetchFromPeer(int peerIndex = 0);

signals:
    void hostingChanged();
    void scanningChanged();
    void busyChanged();
    void pairingChanged();
    void statusChanged();
    void lastErrorChanged();
    void peersChanged();
    void availableChanged();
    void remoteCatalogChanged();
    void selectedPeerIndexChanged();
    void bundleServed();
    void scanFinished();
    void fetchFinished(const QByteArray& data);
    void pairingFinished(bool ok, const QString& address);

private:
#if defined(OSE_HAS_BLUETOOTH) && OSE_HAS_BLUETOOTH
    enum MsgType : quint8 {
        CatalogReq = 1,
        CatalogRes = 2,
        BundleReq = 3,
        BundleRes = 4,
        BundlePush = 5,
        PushAck = 6,
    };

    void setStatus(const QString& s);
    void setError(const QString& e);
    void setHosting(bool v);
    void setScanning(bool v);
    void setBusy(bool v);
    void setPairing(bool v);
    void onNewConnection();
    void handleClientSession(QBluetoothSocket* sock);
    void sendFramed(QBluetoothSocket* sock, const QByteArray& payload);
    bool readFramed(QBluetoothSocket* sock, QByteArray* out, int timeoutMs);
    void sendTyped(QBluetoothSocket* sock, MsgType type, const QByteArray& body);
    bool readTyped(QBluetoothSocket* sock, MsgType* type, QByteArray* body, int timeoutMs);
    int resolvePeerIndex(int peerIndex) const;
    bool ensurePaired(const QBluetoothAddress& addr, const QString& name);
    QBluetoothSocket* connectToPeer(int peerIndex, int timeoutMs = 45000);
    void addPeer(const QBluetoothDeviceInfo& info, const QBluetoothAddress& addr);
    void addPeerIfOse(const QBluetoothDeviceInfo& info);
    bool listenRfcomm();
    void finishScan();
    void refreshPeerPairingFlags();
    void setupLocalDevice();

    SyncEngine* m_engine = nullptr;
    QBluetoothLocalDevice* m_localDevice = nullptr;
    QBluetoothServer* m_server = nullptr;
    QBluetoothServiceInfo m_serviceInfo;
    QBluetoothServiceDiscoveryAgent* m_serviceAgent = nullptr;
    QBluetoothDeviceDiscoveryAgent* m_deviceAgent = nullptr;
    QTimer* m_scanTimer = nullptr;

    bool m_hosting = false;
    bool m_interactive = false;
    bool m_scanning = false;
    bool m_busy = false;
    bool m_pairing = false;
    QString m_status;
    QString m_lastError;
    QByteArray m_bundle;
    QVariantList m_peers;
    QHash<QString, QVariantMap> m_peerByAddr;
    QVariantMap m_remoteCatalog;
    int m_lastPeerIndex = -1;
    int m_selectedPeerIndex = 0;
    bool m_pairResult = false;
    QElapsedTimer m_discoverableAsked;
    bool m_discoverableAskedOnce = false;
#else
    SyncEngine* m_engine = nullptr;
    bool m_hosting = false;
    bool m_scanning = false;
    bool m_busy = false;
    bool m_pairing = false;
    QString m_status;
    QString m_lastError;
    QVariantList m_peers;
    QVariantMap m_remoteCatalog;
    int m_lastPeerIndex = -1;
    int m_selectedPeerIndex = 0;
#endif
};

} // namespace ose
