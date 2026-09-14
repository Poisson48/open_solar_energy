#include "sync_bluetooth.h"

#if defined(OSE_HAS_BLUETOOTH) && OSE_HAS_BLUETOOTH

#include "sync_engine.h"

#include "app/platform.h"

#include <QBluetoothDeviceDiscoveryAgent>
#include <QBluetoothLocalDevice>
#include <QBluetoothServer>
#include <QBluetoothServiceInfo>
#include <QBluetoothSocket>
#include <QBluetoothServiceDiscoveryAgent>
#include <QCoreApplication>
#include <QElapsedTimer>
#include <QEventLoop>
#include <QJsonDocument>
#include <QJsonObject>
#include <QHash>
#include <QTimer>
#include <QtEndian>

#include <algorithm>

namespace ose {
namespace {

constexpr char kMagic[4] = {'O', 'S', 'E', 'B'};

} // namespace

QBluetoothUuid SyncBluetooth::serviceUuid()
{
    return QBluetoothUuid(serviceUuidString());
}

QString SyncBluetooth::serviceUuidString()
{
    return QStringLiteral("6ba7b810-9dad-11d1-80b4-00c04fd430c8");
}

SyncBluetooth::SyncBluetooth(QObject* parent) : QObject(parent)
{
    m_scanTimer = new QTimer(this);
    m_scanTimer->setSingleShot(true);
    connect(m_scanTimer, &QTimer::timeout, this, [this]() { finishScan(); });
    setupLocalDevice();
}

SyncBluetooth::~SyncBluetooth()
{
    stopHosting();
    stopScan();
}

void SyncBluetooth::setSyncEngine(SyncEngine* engine)
{
    m_engine = engine;
}

bool SyncBluetooth::available() const
{
    QBluetoothLocalDevice local;
    return local.isValid() && local.hostMode() != QBluetoothLocalDevice::HostPoweredOff;
}

void SyncBluetooth::setStatus(const QString& s)
{
    if (m_status == s)
        return;
    m_status = s;
    emit statusChanged();
}

void SyncBluetooth::setError(const QString& e)
{
    if (m_lastError == e)
        return;
    m_lastError = e;
    emit lastErrorChanged();
}

void SyncBluetooth::setHosting(bool v)
{
    if (m_hosting == v)
        return;
    m_hosting = v;
    emit hostingChanged();
}

void SyncBluetooth::setScanning(bool v)
{
    if (m_scanning == v)
        return;
    m_scanning = v;
    emit scanningChanged();
}

void SyncBluetooth::setBusy(bool v)
{
    if (m_busy == v)
        return;
    m_busy = v;
    emit busyChanged();
}

void SyncBluetooth::setPairing(bool v)
{
    if (m_pairing == v)
        return;
    m_pairing = v;
    emit pairingChanged();
}

void SyncBluetooth::setSelectedPeerIndex(int idx)
{
    if (m_selectedPeerIndex == idx)
        return;
    m_selectedPeerIndex = idx;
    emit selectedPeerIndexChanged();
}

void SyncBluetooth::setupLocalDevice()
{
    if (m_localDevice)
        return;
    m_localDevice = new QBluetoothLocalDevice(this);
    // Qt 6 : le dialogue d’appairage est géré par l’OS ; on suit pairingFinished.
    connect(m_localDevice, &QBluetoothLocalDevice::pairingFinished, this,
            [this](const QBluetoothAddress& addr, QBluetoothLocalDevice::Pairing pairing) {
                const bool ok = pairing != QBluetoothLocalDevice::Unpaired;
                m_pairResult = ok;
                setPairing(false);
                refreshPeerPairingFlags();
                setStatus(ok ? QStringLiteral("Appairé avec %1").arg(addr.toString())
                             : QStringLiteral("Appairage refusé"));
                emit pairingFinished(ok, addr.toString());
            });
    connect(m_localDevice, &QBluetoothLocalDevice::errorOccurred, this,
            [this](QBluetoothLocalDevice::Error) {
                if (m_pairing) {
                    m_pairResult = false;
                    setPairing(false);
                    setError(QStringLiteral("Erreur d’appairage Bluetooth"));
                    emit pairingFinished(false, {});
                }
            });
}

bool SyncBluetooth::ensureBluetoothReady()
{
    setError({});
    setupLocalDevice();
    if (!m_localDevice || !m_localDevice->isValid()) {
        setError(QStringLiteral("Bluetooth indisponible sur cet appareil"));
        return false;
    }
    if (m_localDevice->hostMode() == QBluetoothLocalDevice::HostPoweredOff)
        m_localDevice->powerOn();
    return true;
}

bool SyncBluetooth::makeDiscoverable()
{
    if (!ensureBluetoothReady())
        return false;

#ifdef Q_OS_ANDROID
    // Ne pas appeler setHostMode(HostDiscoverable) en boucle : ça rouvre le dialogue Android.
    const bool already = app::platformIsBluetoothDiscoverable();
    const bool recently = m_discoverableAskedOnce && m_discoverableAsked.isValid()
                          && m_discoverableAsked.elapsed() < 150000; // ~2,5 min
    if (!already && !recently) {
        app::platformRequestBluetoothDiscoverable(120);
        m_discoverableAsked.restart();
        m_discoverableAskedOnce = true;
        setStatus(QStringLiteral("Autorisez une fois « être visible » si demandé"));
    } else {
        setStatus(QStringLiteral("Bluetooth prêt"));
    }
#else
    m_localDevice->setHostMode(QBluetoothLocalDevice::HostDiscoverable);
    setStatus(QStringLiteral("Visible et prêt — l’autre appareil peut se connecter"));
#endif
    return true;
}

bool SyncBluetooth::prepareVisibility()
{
    // Compat : n’impose plus la visibilité (évite le spam de dialogues côté client).
    return ensureBluetoothReady();
}

bool SyncBluetooth::ensurePaired(const QBluetoothAddress& addr, const QString& name)
{
    setupLocalDevice();
    if (!m_localDevice || !m_localDevice->isValid() || addr.isNull())
        return true; // laisser connect tenter
    const auto st = m_localDevice->pairingStatus(addr);
    if (st == QBluetoothLocalDevice::Paired || st == QBluetoothLocalDevice::AuthorizedPaired)
        return true;

    setPairing(true);
    m_pairResult = false;
    setStatus(QStringLiteral("Appairage avec %1… Validez sur les deux écrans si demandé")
                  .arg(name.isEmpty() ? addr.toString() : name));

    QEventLoop loop;
    QTimer timeout;
    timeout.setSingleShot(true);
    timeout.setInterval(90000);
    connect(&timeout, &QTimer::timeout, &loop, &QEventLoop::quit);
    const QMetaObject::Connection c = connect(this, &SyncBluetooth::pairingFinished, &loop,
                                              [&](bool, const QString&) { loop.quit(); });
    m_localDevice->requestPairing(addr, QBluetoothLocalDevice::AuthorizedPaired);
    timeout.start();
    loop.exec();
    disconnect(c);
    setPairing(false);

    const auto st2 = m_localDevice->pairingStatus(addr);
    if (st2 == QBluetoothLocalDevice::Paired || st2 == QBluetoothLocalDevice::AuthorizedPaired
        || m_pairResult) {
        refreshPeerPairingFlags();
        return true;
    }
    setError(QStringLiteral("Appairage nécessaire — réessayez et acceptez la demande"));
    return false;
}

bool SyncBluetooth::pairPeer(int peerIndex)
{
    const int idx = resolvePeerIndex(peerIndex);
    if (idx < 0) {
        setError(QStringLiteral("Aucun appareil sélectionné"));
        return false;
    }
    const QVariantMap peer = m_peers.at(idx).toMap();
    return ensurePaired(QBluetoothAddress(peer.value(QStringLiteral("address")).toString()),
                        peer.value(QStringLiteral("name")).toString());
}

int SyncBluetooth::resolvePeerIndex(int peerIndex) const
{
    if (peerIndex >= 0 && peerIndex < m_peers.size())
        return peerIndex;
    if (m_selectedPeerIndex >= 0 && m_selectedPeerIndex < m_peers.size())
        return m_selectedPeerIndex;
    if (m_lastPeerIndex >= 0 && m_lastPeerIndex < m_peers.size())
        return m_lastPeerIndex;
    return m_peers.isEmpty() ? -1 : 0;
}

void SyncBluetooth::refreshPeerPairingFlags()
{
    if (!m_localDevice)
        return;
    bool changed = false;
    for (int i = 0; i < m_peers.size(); ++i) {
        QVariantMap peer = m_peers[i].toMap();
        const QBluetoothAddress addr(peer.value(QStringLiteral("address")).toString());
        const auto st = m_localDevice->pairingStatus(addr);
        const bool paired = st == QBluetoothLocalDevice::Paired
                            || st == QBluetoothLocalDevice::AuthorizedPaired;
        if (peer.value(QStringLiteral("paired")).toBool() != paired) {
            peer.insert(QStringLiteral("paired"), paired);
            m_peers[i] = peer;
            m_peerByAddr.insert(addr.toString(), peer);
            changed = true;
        }
    }
    if (changed)
        emit peersChanged();
}


void SyncBluetooth::sendFramed(QBluetoothSocket* sock, const QByteArray& payload)
{
    QByteArray frame;
    frame.append(kMagic, 4);
    char lenBuf[4];
    qToBigEndian<quint32>(static_cast<quint32>(payload.size()), lenBuf);
    frame.append(lenBuf, 4);
    frame.append(payload);
    sock->write(frame);
    sock->waitForBytesWritten(60000);
    QCoreApplication::processEvents(QEventLoop::AllEvents, 50);
}

bool SyncBluetooth::readFramed(QBluetoothSocket* sock, QByteArray* out, int timeoutMs)
{
    QByteArray buf;
    QElapsedTimer t;
    t.start();
    while (t.elapsed() < timeoutMs) {
        // Sur Android, waitForReadyRead seul peut starvationner le backend BT :
        // il faut laisser tourner la boucle d’événements.
        QCoreApplication::processEvents(QEventLoop::AllEvents, 50);

        if (sock->bytesAvailable() > 0)
            buf += sock->readAll();
        else if (!sock->waitForReadyRead(qMin(200, timeoutMs - int(t.elapsed())))) {
            if (sock->state() != QBluetoothSocket::SocketState::ConnectedState)
                break;
            continue;
        } else {
            buf += sock->readAll();
        }
        if (buf.size() >= 8) {
            if (!buf.startsWith(QByteArray(kMagic, 4))) {
                setError(QStringLiteral("Protocole Bluetooth invalide"));
                return false;
            }
            const quint32 n = qFromBigEndian<quint32>(buf.constData() + 4);
            if (n > 80u * 1024u * 1024u) {
                setError(QStringLiteral("Bundle trop gros"));
                return false;
            }
            if (buf.size() >= int(8 + n)) {
                *out = buf.mid(8, int(n));
                return true;
            }
        }
    }
    setError(QStringLiteral("Timeout réception Bluetooth"));
    return false;
}

void SyncBluetooth::sendTyped(QBluetoothSocket* sock, MsgType type, const QByteArray& body)
{
    QByteArray payload;
    payload.append(char(type));
    payload.append(body);
    sendFramed(sock, payload);
}

bool SyncBluetooth::readTyped(QBluetoothSocket* sock, MsgType* type, QByteArray* body, int timeoutMs)
{
    QByteArray payload;
    if (!readFramed(sock, &payload, timeoutMs))
        return false;
    if (payload.isEmpty()) {
        setError(QStringLiteral("Trame Bluetooth vide"));
        return false;
    }
    *type = static_cast<MsgType>(quint8(payload.at(0)));
    *body = payload.mid(1);
    return true;
}

bool SyncBluetooth::listenRfcomm()
{
    makeDiscoverable();

    m_server = new QBluetoothServer(QBluetoothServiceInfo::RfcommProtocol, this);
    connect(m_server, &QBluetoothServer::newConnection, this, &SyncBluetooth::onNewConnection);

    m_serviceInfo = m_server->listen(serviceUuid(), QStringLiteral("Open Solar Sync"));
    if (!m_serviceInfo.isValid() || !m_server->isListening()) {
        setError(QStringLiteral("Écoute RFCOMM impossible"));
        delete m_server;
        m_server = nullptr;
        m_serviceInfo = QBluetoothServiceInfo();
        return false;
    }
    return true;
}

bool SyncBluetooth::startHosting(const QByteArray& zipBytes)
{
    setError({});
    if (zipBytes.isEmpty()) {
        setError(QStringLiteral("Bundle vide"));
        return false;
    }
    if (!available()) {
        setError(QStringLiteral("Bluetooth éteint ou indisponible — activez-le"));
        return false;
    }

    stopHosting();
    m_bundle = zipBytes;
    m_interactive = false;
    if (!listenRfcomm())
        return false;

    setHosting(true);
    setStatus(QStringLiteral("Bluetooth : en attente de connexion…"));
    return true;
}

bool SyncBluetooth::startInteractiveHosting()
{
    setError({});
    if (!m_engine) {
        setError(QStringLiteral("Moteur sync indisponible"));
        return false;
    }
    if (!available()) {
        setError(QStringLiteral("Bluetooth éteint ou indisponible — activez-le"));
        return false;
    }

    stopHosting();
    m_bundle.clear();
    m_interactive = true;
    if (!listenRfcomm())
        return false;

    setHosting(true);
    setStatus(QStringLiteral("Visible et prêt — sur l’autre appareil : Récupérer (appairage proposé dans l’app)"));
    return true;
}

void SyncBluetooth::stopHosting()
{
    if (m_serviceInfo.isRegistered())
        m_serviceInfo.unregisterService();
    m_serviceInfo = QBluetoothServiceInfo();
    if (m_server) {
        m_server->close();
        m_server->deleteLater();
        m_server = nullptr;
    }
    m_bundle.clear();
    m_interactive = false;
    setHosting(false);
    if (m_status.contains(QLatin1String("attente")) || m_status.contains(QLatin1String("prêt")))
        setStatus({});
}

void SyncBluetooth::onNewConnection()
{
    qInfo().noquote() << "[bt-host] newConnection pending="
                      << (m_server ? m_server->hasPendingConnections() : false)
                      << "interactive=" << m_interactive;
    if (!m_server)
        return;
    QBluetoothSocket* sock = m_server->nextPendingConnection();
    if (!sock) {
        qWarning().noquote() << "[bt-host] nextPendingConnection null";
        return;
    }
    qInfo().noquote() << "[bt-host] peer" << sock->peerAddress().toString()
                      << "state" << int(sock->state());
    setBusy(true);
    // Différer pour laisser le socket Android/BlueZ se stabiliser + event loop.
    QTimer::singleShot(150, this, [this, sock]() {
        if (!sock) {
            setBusy(false);
            return;
        }
        if (m_interactive) {
            handleClientSession(sock);
        } else {
            setStatus(QStringLiteral("Connexion Bluetooth — envoi…"));
            sendFramed(sock, m_bundle);
            sock->waitForBytesWritten(60000);
            QCoreApplication::processEvents(QEventLoop::AllEvents, 100);
            sock->disconnectFromService();
            sock->deleteLater();
            setStatus(QStringLiteral("Bundle envoyé via Bluetooth"));
            emit bundleServed();
        }
        setBusy(false);
    });
}

void SyncBluetooth::handleClientSession(QBluetoothSocket* sock)
{
    setStatus(QStringLiteral("Connexion Bluetooth — session…"));
    qInfo().noquote() << "[bt-host] session start";
    // Plusieurs requêtes sur la même socket (catalogue puis bundle).
    for (int i = 0; i < 8; ++i) {
        if (sock->state() != QBluetoothSocket::SocketState::ConnectedState)
            break;
        MsgType type = CatalogReq;
        QByteArray body;
        if (!readTyped(sock, &type, &body, 90000)) {
            qWarning().noquote() << "[bt-host] readTyped fail" << m_lastError;
            break;
        }
        qInfo().noquote() << "[bt-host] msg type" << int(type) << "body" << body.size();

        if (type == CatalogReq) {
            setStatus(QStringLiteral("Envoi de la liste des projets…"));
            const QVariantMap tree = m_engine ? m_engine->localSelectionTree() : QVariantMap{};
            const QByteArray json = QJsonDocument::fromVariant(tree).toJson(QJsonDocument::Compact);
            sendTyped(sock, CatalogRes, json);
            continue;
        }
        if (type == BundleReq) {
            setStatus(QStringLiteral("Construction / envoi du bundle…"));
            const QJsonDocument doc = QJsonDocument::fromJson(body);
            const QVariantMap sel = doc.isObject() ? doc.object().toVariantMap() : QVariantMap{};
            const QByteArray zip = m_engine ? m_engine->buildBundle(sel) : QByteArray{};
            if (zip.isEmpty()) {
                sendTyped(sock, BundleRes, QByteArray{});
                setError(m_engine && !m_engine->lastError().isEmpty()
                             ? m_engine->lastError()
                             : QStringLiteral("Export bundle vide"));
                break;
            }
            sendTyped(sock, BundleRes, zip);
            setStatus(QStringLiteral("Bundle envoyé via Bluetooth"));
            emit bundleServed();
            break;
        }
        if (type == BundlePush) {
            setStatus(QStringLiteral("Réception d’un bundle distant…"));
            if (body.isEmpty() || !m_engine) {
                sendTyped(sock, PushAck, QByteArray(1, '\0'));
                setError(QStringLiteral("Bundle poussé vide"));
                break;
            }
            const bool ok = m_engine->applyBundle(body, {});
            sendTyped(sock, PushAck, QByteArray(1, ok ? '\x01' : '\x00'));
            if (ok) {
                setStatus(QStringLiteral("Import Bluetooth reçu"));
                emit bundleServed();
            } else {
                setError(m_engine->lastError().isEmpty() ? QStringLiteral("Import poussé échoué")
                                                        : m_engine->lastError());
            }
            break;
        }
        setError(QStringLiteral("Requête Bluetooth inconnue"));
        break;
    }
    sock->disconnectFromService();
    sock->deleteLater();
}

void SyncBluetooth::addPeer(const QBluetoothDeviceInfo& info, const QBluetoothAddress& addr)
{
    const QString key = addr.toString();
    if (key.isEmpty())
        return;
    setupLocalDevice();
    bool paired = false;
    if (m_localDevice && m_localDevice->isValid()) {
        const auto st = m_localDevice->pairingStatus(addr);
        paired = st == QBluetoothLocalDevice::Paired
                 || st == QBluetoothLocalDevice::AuthorizedPaired;
    }
    QVariantMap peer;
    peer.insert(QStringLiteral("address"), key);
    peer.insert(QStringLiteral("name"), info.name().isEmpty() ? key : info.name());
    peer.insert(QStringLiteral("paired"), paired);
    peer.insert(QStringLiteral("major"), int(info.majorDeviceClass()));
    m_peerByAddr.insert(key, peer);
    m_peers.clear();
    for (auto it = m_peerByAddr.constBegin(); it != m_peerByAddr.constEnd(); ++it)
        m_peers.append(it.value());
    emit peersChanged();
    setStatus(QStringLiteral("%1 appareil(s)…").arg(m_peers.size()));
}

void SyncBluetooth::addPeerIfOse(const QBluetoothDeviceInfo& info)
{
    if (!info.isValid() || info.address().isNull())
        return;
    const QList<QBluetoothUuid> uuids = info.serviceUuids();
    QBluetoothLocalDevice local;
    const bool paired = local.isValid()
                        && local.pairingStatus(info.address()) != QBluetoothLocalDevice::Unpaired;
    const bool hasUuid = uuids.contains(serviceUuid());
    if (!hasUuid && !paired)
        return;
    // Uniquement UUID OSE, ou téléphone/ordinateur appairé (pas OBD/écouteurs).
    if (!hasUuid) {
        const auto major = info.majorDeviceClass();
        if (major != QBluetoothDeviceInfo::PhoneDevice
            && major != QBluetoothDeviceInfo::ComputerDevice) {
            return;
        }
    }
    addPeer(info, info.address());
}

void SyncBluetooth::finishScan()
{
    if (!m_scanning)
        return;
    // Préfère les peers qui annoncent l’UUID OSE (déjà dans m_peerByAddr insertion order —
    // on réordonne : noms Pixel/phone en tête si plusieurs).
    if (m_peers.size() > 1) {
        std::sort(m_peers.begin(), m_peers.end(), [](const QVariant& a, const QVariant& b) {
            const QString na = a.toMap().value(QStringLiteral("name")).toString().toLower();
            const QString nb = b.toMap().value(QStringLiteral("name")).toString().toLower();
            const bool pa = na.contains(QLatin1String("pixel")) || na.contains(QLatin1String("phone"))
                            || na.contains(QLatin1String("android"));
            const bool pb = nb.contains(QLatin1String("pixel")) || nb.contains(QLatin1String("phone"))
                            || nb.contains(QLatin1String("android"));
            if (pa != pb)
                return pa;
            return na < nb;
        });
        emit peersChanged();
    }
    stopScan();
    setStatus(m_peers.isEmpty() ? QStringLiteral("Aucun appareil OSE trouvé")
                                : QStringLiteral("%1 appareil(s)").arg(m_peers.size()));
    emit scanFinished();
}

void SyncBluetooth::startScan(int timeoutMs)
{
    setError({});
    stopScan();
    m_peers.clear();
    m_peerByAddr.clear();
    emit peersChanged();

    if (!available()) {
        setError(QStringLiteral("Bluetooth éteint — activez-le sur les deux appareils"));
        emit scanFinished();
        return;
    }

    prepareVisibility();
    m_selectedPeerIndex = 0;
    emit selectedPeerIndexChanged();

    m_deviceAgent = new QBluetoothDeviceDiscoveryAgent(this);
    m_deviceAgent->setLowEnergyDiscoveryTimeout(qMax(4000, timeoutMs - 2000));
    connect(m_deviceAgent, &QBluetoothDeviceDiscoveryAgent::deviceDiscovered, this,
            [this](const QBluetoothDeviceInfo& info) { addPeerIfOse(info); });
    connect(m_deviceAgent, &QBluetoothDeviceDiscoveryAgent::finished, this, [this]() {
        if (!m_scanning)
            return;
        if (!m_peers.isEmpty())
            finishScan();
    });
    connect(m_deviceAgent, &QBluetoothDeviceDiscoveryAgent::errorOccurred, this,
            [this](QBluetoothDeviceDiscoveryAgent::Error) {});

    m_serviceAgent = new QBluetoothServiceDiscoveryAgent(this);
    m_serviceAgent->setUuidFilter(serviceUuid());
    connect(m_serviceAgent, &QBluetoothServiceDiscoveryAgent::serviceDiscovered, this,
            [this](const QBluetoothServiceInfo& info) {
                addPeer(info.device(), info.device().address());
            });
    connect(m_serviceAgent, &QBluetoothServiceDiscoveryAgent::finished, this, [this]() {
        if (!m_scanning)
            return;
        if (!m_peers.isEmpty())
            finishScan();
    });
    connect(m_serviceAgent, &QBluetoothServiceDiscoveryAgent::errorOccurred, this,
            [this](QBluetoothServiceDiscoveryAgent::Error) {});

    setScanning(true);
    setStatus(QStringLiteral("Recherche Bluetooth…"));
    m_deviceAgent->start(QBluetoothDeviceDiscoveryAgent::ClassicMethod);
    m_serviceAgent->start(QBluetoothServiceDiscoveryAgent::FullDiscovery);
    m_scanTimer->start(qMax(8000, timeoutMs));
}

void SyncBluetooth::stopScan()
{
    m_scanTimer->stop();
    if (m_serviceAgent) {
        m_serviceAgent->stop();
        m_serviceAgent->deleteLater();
        m_serviceAgent = nullptr;
    }
    if (m_deviceAgent) {
        m_deviceAgent->stop();
        m_deviceAgent->deleteLater();
        m_deviceAgent = nullptr;
    }
    setScanning(false);
}

QBluetoothSocket* SyncBluetooth::connectToPeer(int peerIndex, int timeoutMs)
{
    const int idx = resolvePeerIndex(peerIndex);
    if (idx < 0) {
        setError(QStringLiteral("Aucun appareil Bluetooth sélectionné"));
        return nullptr;
    }
    peerIndex = idx;
    const QVariantMap peer = m_peers.at(peerIndex).toMap();
    const QBluetoothAddress addr(peer.value(QStringLiteral("address")).toString());
    if (addr.isNull()) {
        setError(QStringLiteral("Adresse Bluetooth invalide"));
        return nullptr;
    }

    const QString pname = peer.value(QStringLiteral("name")).toString();
    if (!ensurePaired(addr, pname))
        return nullptr;

    setStatus(QStringLiteral("Connexion à %1…").arg(pname));

    auto* sock = new QBluetoothSocket(QBluetoothServiceInfo::RfcommProtocol, this);
    QEventLoop loop;
    QTimer timeout;
    timeout.setSingleShot(true);
    timeout.setInterval(timeoutMs);
    connect(&timeout, &QTimer::timeout, &loop, &QEventLoop::quit);
    connect(sock, &QBluetoothSocket::connected, &loop, &QEventLoop::quit);
    connect(sock, &QBluetoothSocket::errorOccurred, &loop, &QEventLoop::quit);

    sock->connectToService(addr, serviceUuid());
    timeout.start();
    loop.exec();

    if (sock->state() != QBluetoothSocket::SocketState::ConnectedState) {
        setError(sock->errorString().isEmpty() ? QStringLiteral("Connexion Bluetooth échouée")
                                               : sock->errorString());
        sock->deleteLater();
        return nullptr;
    }
    m_lastPeerIndex = peerIndex;
    return sock;
}

QVariantMap SyncBluetooth::fetchCatalogFromPeer(int peerIndex)
{
    setError({});
    m_remoteCatalog.clear();
    emit remoteCatalogChanged();
    setBusy(true);

    QBluetoothSocket* sock = connectToPeer(peerIndex);
    if (!sock) {
        setBusy(false);
        return {};
    }

    setStatus(QStringLiteral("Lecture de la liste distante…"));
    sendTyped(sock, CatalogReq, {});
    MsgType type = CatalogReq;
    QByteArray body;
    if (!readTyped(sock, &type, &body, 60000) || type != CatalogRes) {
        if (m_lastError.isEmpty())
            setError(QStringLiteral("Catalogue distant invalide"));
        sock->disconnectFromService();
        sock->deleteLater();
        setBusy(false);
        return {};
    }

    const QJsonDocument doc = QJsonDocument::fromJson(body);
    m_remoteCatalog = doc.isObject() ? doc.object().toVariantMap() : QVariantMap{};
    emit remoteCatalogChanged();

    sock->disconnectFromService();
    sock->deleteLater();
    setBusy(false);
    const int n = m_remoteCatalog.value(QStringLiteral("projects")).toList().size();
    setStatus(QStringLiteral("%1 projet(s) sur l’autre appareil").arg(n));
    return m_remoteCatalog;
}

QByteArray SyncBluetooth::fetchBundleFromPeer(int peerIndex, const QVariantMap& selection)
{
    setError({});
    setBusy(true);

    QBluetoothSocket* sock = connectToPeer(peerIndex);
    if (!sock) {
        setBusy(false);
        return {};
    }

    setStatus(QStringLiteral("Demande du bundle…"));
    const QByteArray req = QJsonDocument::fromVariant(selection).toJson(QJsonDocument::Compact);
    sendTyped(sock, BundleReq, req);

    MsgType type = BundleReq;
    QByteArray body;
    if (!readTyped(sock, &type, &body, 180000) || type != BundleRes) {
        if (m_lastError.isEmpty())
            setError(QStringLiteral("Réponse bundle invalide"));
        sock->disconnectFromService();
        sock->deleteLater();
        setBusy(false);
        return {};
    }
    if (body.isEmpty()) {
        setError(QStringLiteral("Bundle distant vide"));
        sock->disconnectFromService();
        sock->deleteLater();
        setBusy(false);
        return {};
    }

    sock->disconnectFromService();
    sock->deleteLater();
    setBusy(false);
    setStatus(QStringLiteral("Reçu (%1 Ko)").arg(body.size() / 1024));
    emit fetchFinished(body);
    return body;
}

bool SyncBluetooth::pushBundleToPeer(int peerIndex, const QByteArray& zipBytes)
{
    setError({});
    if (zipBytes.isEmpty()) {
        setError(QStringLiteral("Bundle vide"));
        return false;
    }
    setBusy(true);
    QBluetoothSocket* sock = connectToPeer(peerIndex);
    if (!sock) {
        setBusy(false);
        return false;
    }
    setStatus(QStringLiteral("Envoi du bundle…"));
    sendTyped(sock, BundlePush, zipBytes);
    MsgType type = PushAck;
    QByteArray body;
    if (!readTyped(sock, &type, &body, 120000) || type != PushAck) {
        if (m_lastError.isEmpty())
            setError(QStringLiteral("Pas d’accusé de réception"));
        sock->disconnectFromService();
        sock->deleteLater();
        setBusy(false);
        return false;
    }
    sock->disconnectFromService();
    sock->deleteLater();
    setBusy(false);
    const bool ok = !body.isEmpty() && body.at(0) == '\x01';
    if (!ok) {
        setError(QStringLiteral("L’autre appareil a refusé l’import"));
        return false;
    }
    setStatus(QStringLiteral("Bundle poussé via Bluetooth"));
    emit bundleServed();
    return true;
}

QByteArray SyncBluetooth::fetchFromPeer(int peerIndex)
{
    // Rétrocompat : hôte ancien qui pousse un ZIP brut dès la connexion.
    setError({});
    setBusy(true);
    QBluetoothSocket* sock = connectToPeer(peerIndex);
    if (!sock) {
        setBusy(false);
        return {};
    }
    setStatus(QStringLiteral("Réception du bundle…"));
    QByteArray payload;
    if (!readFramed(sock, &payload, 120000)) {
        sock->disconnectFromService();
        sock->deleteLater();
        setBusy(false);
        return {};
    }
    // Si c’est une trame typée (1er octet = type), ce n’est pas le legacy.
    if (!payload.isEmpty() && quint8(payload.at(0)) >= 1 && quint8(payload.at(0)) <= 4
        && payload.size() < 64) {
        setError(QStringLiteral("Hôte en mode interactif — utilisez Récupérer (liste)"));
        sock->disconnectFromService();
        sock->deleteLater();
        setBusy(false);
        return {};
    }
    sock->disconnectFromService();
    sock->deleteLater();
    setBusy(false);
    setStatus(QStringLiteral("Reçu (%1 Ko)").arg(payload.size() / 1024));
    emit fetchFinished(payload);
    return payload;
}

} // namespace ose

#else

namespace ose {

// Inclus depuis sync_bluetooth.cpp quand Qt Bluetooth n'est pas dispo (CI Android sans qtconnectivity).

QString SyncBluetooth::serviceUuidString()
{
    return QStringLiteral("6ba7b810-9dad-11d1-80b4-00c04fd430c8");
}

SyncBluetooth::SyncBluetooth(QObject* parent) : QObject(parent)
{
    m_status = QStringLiteral("Bluetooth non disponible sur cette build");
}

SyncBluetooth::~SyncBluetooth() = default;

void SyncBluetooth::setSyncEngine(SyncEngine* engine) { m_engine = engine; }

bool SyncBluetooth::available() const { return false; }

void SyncBluetooth::setSelectedPeerIndex(int idx)
{
    if (m_selectedPeerIndex == idx)
        return;
    m_selectedPeerIndex = idx;
    emit selectedPeerIndexChanged();
}

bool SyncBluetooth::ensureBluetoothReady()
{
    m_lastError = QStringLiteral("Bluetooth indisponible");
    emit lastErrorChanged();
    return false;
}

bool SyncBluetooth::makeDiscoverable() { return ensureBluetoothReady(); }

bool SyncBluetooth::prepareVisibility() { return ensureBluetoothReady(); }

bool SyncBluetooth::pairPeer(int) { return ensureBluetoothReady(); }

bool SyncBluetooth::startHosting(const QByteArray&) { return ensureBluetoothReady(); }

bool SyncBluetooth::startInteractiveHosting() { return ensureBluetoothReady(); }

void SyncBluetooth::stopHosting()
{
    if (!m_hosting)
        return;
    m_hosting = false;
    emit hostingChanged();
}

void SyncBluetooth::startScan(int)
{
    m_scanning = true;
    emit scanningChanged();
    m_peers.clear();
    emit peersChanged();
    m_scanning = false;
    emit scanningChanged();
    emit scanFinished();
}

void SyncBluetooth::stopScan()
{
    if (!m_scanning)
        return;
    m_scanning = false;
    emit scanningChanged();
}

QVariantMap SyncBluetooth::fetchCatalogFromPeer(int)
{
    return {};
}

QByteArray SyncBluetooth::fetchBundleFromPeer(int, const QVariantMap&)
{
    return {};
}

bool SyncBluetooth::pushBundleToPeer(int, const QByteArray&)
{
    return false;
}

QByteArray SyncBluetooth::fetchFromPeer(int)
{
    return {};
}

} // namespace ose

#endif
