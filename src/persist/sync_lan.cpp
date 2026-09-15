#include "sync_lan.h"

#include "sync_engine.h"

#include <QAbstractSocket>
#include <QCoreApplication>
#include <QElapsedTimer>
#include <QEventLoop>
#include <QHash>
#include <QHostAddress>
#include <QJsonDocument>
#include <QJsonObject>
#include <QNetworkDatagram>
#include <QNetworkInterface>
#include <QPointer>
#include <QRandomGenerator>
#include <QSysInfo>
#include <QTcpServer>
#include <QTcpSocket>
#include <QTimer>
#include <QUdpSocket>
#include <QUrl>
#include <QUrlQuery>
#include <QtConcurrent>

namespace ose {
namespace {

constexpr quint16 kUdpPort = 38475;
constexpr quint16 kHttpPortPrefer = 38476;
const char* kMagic1 = "OSE1";
const char* kMagic2 = "OSE2";

QString normalizeIp(QString host)
{
    if (host.startsWith(QLatin1String("::ffff:")))
        host = host.mid(7);
    // Scope id (fe80::1%wlan0) — on ignore IPv6 ici
    const int pct = host.indexOf(QLatin1Char('%'));
    if (pct > 0)
        host = host.left(pct);
    return host;
}

bool isLinkLocalV4(const QHostAddress& ip)
{
    const quint32 v = ip.toIPv4Address();
    return (v & 0xffff0000u) == 0xa9fe0000u; // 169.254.0.0/16
}

/** HTTP bloquant sans processEvents — safe hors thread UI (évite ANR Android). */
QByteArray httpExchangeThreaded(const QString& host, quint16 port, const QByteArray& method,
                                const QString& pathAndQuery, const QByteArray& body,
                                const QByteArray& contentType, int timeoutMs, QString* errOut)
{
    QTcpSocket sock;
    sock.connectToHost(host, port);
    if (!sock.waitForConnected(qMin(4000, timeoutMs))) {
        if (errOut)
            *errOut = QStringLiteral("LAN : %1 injoignable").arg(host);
        return {};
    }

    QByteArray req;
    req += method + ' ' + pathAndQuery.toUtf8() + " HTTP/1.1\r\n";
    req += "Host: " + host.toUtf8() + "\r\n";
    req += "Connection: close\r\n";
    if (!body.isEmpty()) {
        req += "Content-Type: " + contentType + "\r\n";
        req += "Content-Length: " + QByteArray::number(body.size()) + "\r\n";
    }
    req += "\r\n";
    sock.write(req);
    if (!body.isEmpty())
        sock.write(body);
    sock.waitForBytesWritten(qMin(10000, timeoutMs));

    QByteArray raw;
    QElapsedTimer t;
    t.start();
    while (t.elapsed() < timeoutMs) {
        if (sock.waitForReadyRead(200))
            raw += sock.readAll();
        else if (sock.state() == QAbstractSocket::UnconnectedState) {
            raw += sock.readAll();
            break;
        }
    }
    raw += sock.readAll();

    const int hdrEnd = raw.indexOf("\r\n\r\n");
    if (hdrEnd < 0) {
        if (errOut)
            *errOut = QStringLiteral("LAN : réponse HTTP invalide");
        return {};
    }
    const QByteArray hdr = raw.left(hdrEnd);
    QByteArray respBody = raw.mid(hdrEnd + 4);
    if (!hdr.startsWith("HTTP/1.1 200") && !hdr.startsWith("HTTP/1.0 200")) {
        if (errOut) {
            *errOut = QStringLiteral("LAN : refusé (%1)")
                          .arg(QString::fromUtf8(hdr.left(48)).trimmed());
        }
        return {};
    }
    const int cl = hdr.toLower().indexOf("content-length:");
    if (cl >= 0) {
        const int lineEnd = hdr.indexOf("\r\n", cl);
        const QByteArray line = hdr.mid(cl, lineEnd > cl ? lineEnd - cl : -1);
        const int n = line.mid(QByteArray("content-length:").size()).trimmed().toInt();
        while (respBody.size() < n && t.elapsed() < timeoutMs) {
            if (sock.waitForReadyRead(500))
                respBody += sock.readAll();
            else if (sock.state() == QAbstractSocket::UnconnectedState)
                break;
        }
        if (n > 0 && respBody.size() > n)
            respBody = respBody.left(n);
    }
    return respBody;
}

QByteArray tryHostsHttp(const QStringList& hosts, quint16 port, const QByteArray& method,
                        const QString& pathAndQuery, const QByteArray& body,
                        const QByteArray& contentType, int timeoutMs, QString* errOut)
{
    QString lastErr;
    for (const QString& host : hosts) {
        QString err;
        const QByteArray r =
            httpExchangeThreaded(host, port, method, pathAndQuery, body, contentType, timeoutMs, &err);
        if (!r.isEmpty()) {
            if (errOut)
                errOut->clear();
            return r;
        }
        if (!err.isEmpty())
            lastErr = err;
    }
    if (errOut)
        *errOut = lastErr.isEmpty() ? QStringLiteral("LAN : échec HTTP") : lastErr;
    return {};
}

} // namespace

SyncLan::SyncLan(QObject* parent) : QObject(parent)
{
    m_tcp = new QTcpServer(this);
    connect(m_tcp, &QTcpServer::newConnection, this, &SyncLan::onNewConnection);

    m_udp = new QUdpSocket(this);
    connect(m_udp, &QUdpSocket::readyRead, this, &SyncLan::onUdpReady);

    m_beaconTimer = new QTimer(this);
    m_beaconTimer->setInterval(1000);
    connect(m_beaconTimer, &QTimer::timeout, this, &SyncLan::sendUdpBeacon);

    m_scanTimer = new QTimer(this);
    m_scanTimer->setSingleShot(true);
    connect(m_scanTimer, &QTimer::timeout, this, [this]() {
        setScanning(false);
        setStatus(m_peers.isEmpty() ? QStringLiteral("Aucun appareil LAN trouvé")
                                    : QStringLiteral("%1 appareil(s) LAN").arg(m_peers.size()));
        emit scanFinished();
    });
}

SyncLan::~SyncLan()
{
    stopHosting();
    stopScan();
}

void SyncLan::setSyncEngine(SyncEngine* engine)
{
    m_engine = engine;
}

void SyncLan::setSelectedPeerIndex(int idx)
{
    if (m_selectedPeerIndex == idx)
        return;
    m_selectedPeerIndex = idx;
    emit selectedPeerIndexChanged();
}

QString SyncLan::newToken()
{
    QString t;
    t.reserve(16);
    for (int i = 0; i < 16; ++i)
        t.append(QString::number(QRandomGenerator::global()->bounded(16), 16));
    return t;
}

bool SyncLan::isIgnoredIface(const QString& name)
{
    const QString n = name.toLower();
    // Ponts / conteneurs / VPN : souvent non joignables entre PC et téléphone
    static const char* kSkip[] = {"docker", "br-", "veth", "virbr", "vmnet", "vbox",
                                  "tun",    "tap", "wg",   "tailscale", "zt",   "cni",
                                  "flannel", "lxc", "nerdctl"};
    for (const char* p : kSkip) {
        if (n.contains(QLatin1String(p)))
            return true;
    }
    return false;
}

QStringList SyncLan::localLanAddresses() const
{
    QStringList preferred;
    QStringList others;
    QStringList linkLocal;

    const auto ifaces = QNetworkInterface::allInterfaces();
    for (const QNetworkInterface& iface : ifaces) {
        if (!(iface.flags() & QNetworkInterface::IsUp)
            || !(iface.flags() & QNetworkInterface::IsRunning)
            || (iface.flags() & QNetworkInterface::IsLoopBack))
            continue;
        const QString name = iface.name();
        if (isIgnoredIface(name))
            continue;

        const QString low = name.toLower();
        const bool prefer = low.contains(QLatin1String("wlan")) || low.contains(QLatin1String("wifi"))
                            || low.contains(QLatin1String("wlp")) || low.contains(QLatin1String("wl"))
                            || low.contains(QLatin1String("rndis")) || low.contains(QLatin1String("usb"))
                            || low.contains(QLatin1String("eth")) || low.contains(QLatin1String("enp"))
                            || low.contains(QLatin1String("eno")) || low.contains(QLatin1String("ens"))
                            || low.contains(QLatin1String("ap")) || low.contains(QLatin1String("rmnet"))
                            || low.contains(QLatin1String("ccmni")) || low.contains(QLatin1String("wlan"));

        for (const QNetworkAddressEntry& e : iface.addressEntries()) {
            const QHostAddress ip = e.ip();
            if (ip.protocol() != QAbstractSocket::IPv4Protocol || ip.isLoopback())
                continue;
            const QString s = ip.toString();
            if (isLinkLocalV4(ip)) {
                if (!linkLocal.contains(s))
                    linkLocal.append(s);
                continue;
            }
            if (prefer) {
                if (!preferred.contains(s))
                    preferred.append(s);
            } else if (!others.contains(s)) {
                others.append(s);
            }
        }
    }

    QStringList out = preferred + others;
    // Link-local en dernier secours (certains tethering)
    for (const QString& s : linkLocal) {
        if (!out.contains(s))
            out.append(s);
    }
    if (out.isEmpty())
        out.append(QStringLiteral("127.0.0.1"));
    return out;
}

void SyncLan::setStatus(const QString& s)
{
    if (m_status == s)
        return;
    m_status = s;
    emit statusChanged();
}

void SyncLan::setError(const QString& e)
{
    if (m_lastError == e)
        return;
    m_lastError = e;
    emit lastErrorChanged();
}

void SyncLan::setHosting(bool v)
{
    if (m_hosting == v)
        return;
    m_hosting = v;
    emit hostingChanged();
}

void SyncLan::setScanning(bool v)
{
    if (m_scanning == v)
        return;
    m_scanning = v;
    emit scanningChanged();
}

void SyncLan::setBusy(bool v)
{
    if (m_busy == v)
        return;
    m_busy = v;
    emit busyChanged();
}

bool SyncLan::listenHttp(quint16 preferredPort)
{
    if (m_tcp->isListening())
        m_tcp->close();
    for (int i = 0; i < 20; ++i) {
        const quint16 p = static_cast<quint16>(preferredPort + i);
        if (m_tcp->listen(QHostAddress::AnyIPv4, p)) {
            m_httpPort = p;
            return true;
        }
    }
    return false;
}

bool SyncLan::startHosting(const QByteArray& zipBytes)
{
    setError({});
    if (zipBytes.isEmpty()) {
        setError(QStringLiteral("Bundle vide"));
        return false;
    }
    stopHosting();
    m_bundle = zipBytes;
    m_interactive = false;
    m_token = newToken();
    if (!listenHttp(kHttpPortPrefer)) {
        setError(QStringLiteral("Impossible d’ouvrir le port HTTP LAN"));
        return false;
    }

    m_udp->close();
    m_udp->bind(QHostAddress::AnyIPv4, kUdpPort,
                QUdpSocket::ShareAddress | QUdpSocket::ReuseAddressHint);

    const QStringList ips = localLanAddresses();
    m_hostUrl = QStringLiteral("http://%1:%2/ose/v1/bundle?token=%3")
                    .arg(ips.first())
                    .arg(m_httpPort)
                    .arg(m_token);
    setHosting(true);
    setStatus(QStringLiteral("LAN : en attente (%1 interface(s))").arg(ips.size()));
    sendUdpBeacon();
    m_beaconTimer->start();
    return true;
}

bool SyncLan::startInteractiveHosting()
{
    setError({});
    if (!m_engine) {
        setError(QStringLiteral("Moteur sync indisponible"));
        return false;
    }
    stopHosting();
    m_bundle.clear();
    m_interactive = true;
    m_token = newToken();
    if (!listenHttp(kHttpPortPrefer)) {
        setError(QStringLiteral("Impossible d’ouvrir le port HTTP LAN"));
        return false;
    }

    m_udp->close();
    m_udp->bind(QHostAddress::AnyIPv4, kUdpPort,
                QUdpSocket::ShareAddress | QUdpSocket::ReuseAddressHint);

    const QStringList ips = localLanAddresses();
    m_hostUrl = QStringLiteral("http://%1:%2/ose/v1/catalog?token=%3")
                    .arg(ips.first())
                    .arg(m_httpPort)
                    .arg(m_token);
    setHosting(true);
    setStatus(QStringLiteral("LAN prêt — Wi‑Fi / USB partage (%1 IP)").arg(ips.size()));
    sendUdpBeacon();
    m_beaconTimer->start();
    return true;
}

void SyncLan::stopHosting()
{
    m_beaconTimer->stop();
    if (m_tcp->isListening())
        m_tcp->close();
    m_bundle.clear();
    m_token.clear();
    m_hostUrl.clear();
    m_httpPort = 0;
    m_interactive = false;
    setHosting(false);
    if (m_status.contains(QLatin1String("attente")) || m_status.contains(QLatin1String("LAN")))
        setStatus({});
}

QString SyncLan::makeInvite() const
{
    if (!m_hosting || m_httpPort == 0 || m_token.isEmpty())
        return {};
    const QStringList ips = localLanAddresses();
    return QStringLiteral("osesync://%1:%2/%3").arg(ips.first()).arg(m_httpPort).arg(m_token);
}

void SyncLan::sendUdpBeacon()
{
    if (!m_hosting || m_httpPort == 0)
        return;

    const QStringList ips = localLanAddresses();
    const qint64 bytes = m_interactive ? 0 : m_bundle.size();
    const QByteArray payload =
        QByteArray(kMagic2) + '|'
        + QByteArray::number(m_httpPort) + '|'
        + m_token.toUtf8() + '|'
        + QByteArray::number(bytes) + '|'
        + ips.join(QLatin1Char(',')).toUtf8() + '|'
        + QSysInfo::machineHostName().toUtf8().left(32) + '|'
        + (m_interactive ? "1" : "0");

    // Une datagramme par broadcast d’interface → le peer voit la bonne IP source
    for (const QNetworkInterface& iface : QNetworkInterface::allInterfaces()) {
        if (!(iface.flags() & QNetworkInterface::IsUp)
            || !(iface.flags() & QNetworkInterface::IsRunning)
            || (iface.flags() & QNetworkInterface::IsLoopBack))
            continue;
        if (isIgnoredIface(iface.name()))
            continue;
        for (const QNetworkAddressEntry& e : iface.addressEntries()) {
            if (e.ip().protocol() != QAbstractSocket::IPv4Protocol)
                continue;
            const QHostAddress bcast = e.broadcast();
            if (bcast.isNull())
                continue;
            // Force l’interface : le peer voit la bonne IP source (multi-NIC).
            QNetworkDatagram dg(payload, bcast, kUdpPort);
            if (iface.index() > 0)
                dg.setInterfaceIndex(iface.index());
            m_udp->writeDatagram(dg);
        }
    }
    m_udp->writeDatagram(payload, QHostAddress::Broadcast, kUdpPort);
}

void SyncLan::onNewConnection()
{
    while (m_tcp->hasPendingConnections()) {
        QTcpSocket* sock = m_tcp->nextPendingConnection();
        connect(sock, &QTcpSocket::readyRead, this, [this, sock]() { handleClient(sock); });
        connect(sock, &QTcpSocket::disconnected, sock, &QObject::deleteLater);
    }
}

void SyncLan::reply(QTcpSocket* sock, int code, const QByteArray& contentType, const QByteArray& body)
{
    QByteArray status = "OK";
    if (code == 404)
        status = "Not Found";
    else if (code == 401)
        status = "Unauthorized";
    else if (code == 405)
        status = "Method Not Allowed";
    else if (code == 400)
        status = "Bad Request";
    else if (code != 200)
        status = "Error";

    QByteArray hdr;
    hdr += "HTTP/1.1 " + QByteArray::number(code) + ' ' + status + "\r\n";
    hdr += "Content-Type: " + contentType + "\r\n";
    hdr += "Content-Length: " + QByteArray::number(body.size()) + "\r\n";
    hdr += "Connection: close\r\n";
    hdr += "Access-Control-Allow-Origin: *\r\n";
    hdr += "\r\n";
    sock->write(hdr);
    if (!body.isEmpty())
        sock->write(body);
    sock->flush();
    sock->disconnectFromHost();
}

void SyncLan::handleClient(QTcpSocket* sock)
{
    // Accumuler jusqu’à headers complets (+ body si Content-Length)
    QByteArray req = sock->property("oseAccum").toByteArray();
    req += sock->readAll();
    sock->setProperty("oseAccum", req);

    const int hdrEnd = req.indexOf("\r\n\r\n");
    if (hdrEnd < 0) {
        if (req.size() > 2 * 1024 * 1024) {
            reply(sock, 400, "text/plain", "headers too large");
            sock->setProperty("oseAccum", QByteArray());
        }
        return;
    }

    const QByteArray hdr = req.left(hdrEnd);
    QByteArray body = req.mid(hdrEnd + 4);
    int contentLength = 0;
    const int cl = hdr.toLower().indexOf("content-length:");
    if (cl >= 0) {
        const int lineEnd = hdr.indexOf("\r\n", cl);
        const QByteArray line = hdr.mid(cl, lineEnd > cl ? lineEnd - cl : -1);
        contentLength = line.mid(QByteArray("content-length:").size()).trimmed().toInt();
    }
    if (contentLength > 0 && body.size() < contentLength) {
        // Attendre la suite
        return;
    }
    if (contentLength > 0 && body.size() > contentLength)
        body = body.left(contentLength);

    sock->setProperty("oseAccum", QByteArray());

    const int lineEnd = hdr.indexOf("\r\n");
    if (lineEnd < 0) {
        reply(sock, 400, "text/plain", "bad request");
        return;
    }
    const QByteArray reqLine = hdr.left(lineEnd);
    const QList<QByteArray> parts = reqLine.split(' ');
    if (parts.size() < 2) {
        reply(sock, 400, "text/plain", "bad request");
        return;
    }
    const QByteArray method = parts[0];
    const QUrl url(QString::fromUtf8(parts[1]));
    const QString path = url.path();
    const QString token = QUrlQuery(url).queryItemValue(QStringLiteral("token"));

    if (token != m_token) {
        reply(sock, 401, "text/plain", "token");
        return;
    }

    if (method == "GET" && path == QLatin1String("/ose/v1/info")) {
        const QByteArray json =
            QByteArray("{\"ose\":1,\"interactive\":")
            + (m_interactive ? "true" : "false")
            + ",\"bytes\":" + QByteArray::number(m_bundle.size())
            + ",\"device\":\"" + QSysInfo::machineHostName().toUtf8() + "\"}";
        reply(sock, 200, "application/json", json);
        return;
    }

    if (method == "GET" && path == QLatin1String("/ose/v1/catalog")) {
        if (!m_interactive || !m_engine) {
            reply(sock, 404, "text/plain", "not interactive");
            return;
        }
        const QVariantMap tree = m_engine->localSelectionTree();
        const QByteArray json = QJsonDocument::fromVariant(tree).toJson(QJsonDocument::Compact);
        reply(sock, 200, "application/json", json);
        return;
    }

    if (method == "POST" && path == QLatin1String("/ose/v1/bundle")) {
        if (!m_interactive || !m_engine) {
            reply(sock, 404, "text/plain", "not interactive");
            return;
        }
        const QJsonDocument doc = QJsonDocument::fromJson(body);
        const QVariantMap sel = doc.isObject() ? doc.object().toVariantMap() : QVariantMap{};
        const QByteArray zip = m_engine->buildBundle(sel);
        if (zip.isEmpty()) {
            reply(sock, 400, "text/plain", m_engine->lastError().toUtf8());
            return;
        }
        reply(sock, 200, "application/octet-stream", zip);
        setStatus(QStringLiteral("LAN : bundle servi"));
        emit bundleServed();
        return;
    }

    if (method == "POST" && path == QLatin1String("/ose/v1/push")) {
        if (!m_interactive || !m_engine) {
            reply(sock, 404, "text/plain", "not interactive");
            return;
        }
        const bool ok = m_engine->applyBundle(body, {});
        QJsonObject o;
        o.insert(QStringLiteral("ok"), ok);
        if (!ok)
            o.insert(QStringLiteral("error"), m_engine->lastError());
        reply(sock, ok ? 200 : 400, "application/json",
              QJsonDocument(o).toJson(QJsonDocument::Compact));
        if (ok) {
            setStatus(QStringLiteral("LAN : import reçu"));
            emit bundleServed();
        }
        return;
    }

    if (method == "GET" && path == QLatin1String("/ose/v1/bundle")) {
        if (m_bundle.isEmpty()) {
            reply(sock, 404, "text/plain", "no bundle");
            return;
        }
        reply(sock, 200, "application/octet-stream", m_bundle);
        setStatus(QStringLiteral("LAN : bundle envoyé"));
        emit bundleServed();
        return;
    }

    reply(sock, 404, "text/plain", "not found");
}

void SyncLan::startScan(int timeoutMs)
{
    setError({});
    stopScan();
    m_peers.clear();
    m_peerByToken.clear();
    m_selectedPeerIndex = 0;
    emit peersChanged();
    emit selectedPeerIndexChanged();

    if (!m_hosting) {
        m_udp->close();
        if (!m_udp->bind(QHostAddress::AnyIPv4, kUdpPort,
                         QUdpSocket::ShareAddress | QUdpSocket::ReuseAddressHint)) {
            if (!m_udp->isValid()) {
                setError(QStringLiteral("UDP LAN indisponible"));
                emit scanFinished();
                return;
            }
        }
    }
    setScanning(true);
    setStatus(QStringLiteral("Recherche LAN…"));
    m_scanTimer->start(qMax(1500, timeoutMs));
}

void SyncLan::stopScan()
{
    m_scanTimer->stop();
    setScanning(false);
}

void SyncLan::onUdpReady()
{
    while (m_udp->hasPendingDatagrams()) {
        QByteArray data;
        data.resize(int(m_udp->pendingDatagramSize()));
        QHostAddress from;
        quint16 fromPort = 0;
        m_udp->readDatagram(data.data(), data.size(), &from, &fromPort);
        Q_UNUSED(fromPort);

        const QList<QByteArray> parts = data.split('|');
        if (parts.size() < 5)
            continue;
        const QByteArray magic = parts[0];
        if (magic != kMagic1 && magic != kMagic2)
            continue;

        const quint16 httpPort = parts[1].toUShort();
        const QString token = QString::fromUtf8(parts[2]);
        const qint64 bytes = parts[3].toLongLong();
        const QString announcedField = QString::fromUtf8(parts[4]);
        const QString device = parts.size() > 5 ? QString::fromUtf8(parts[5]) : announcedField;
        const bool interactive = parts.size() > 6 && parts[6] == "1";

        if (m_hosting && token == m_token)
            continue;
        if (token.isEmpty() || httpPort == 0)
            continue;

        // Chemin réellement utilisé pour ce datagramme = IP source (critique multi-NIC)
        QStringList hosts;
        const QString fromIp = normalizeIp(from.toString());
        if (!fromIp.isEmpty() && fromIp != QLatin1String("127.0.0.1"))
            hosts.append(fromIp);

        for (const QString& piece : announcedField.split(QLatin1Char(','))) {
            const QString ip = normalizeIp(piece.trimmed());
            if (ip.isEmpty() || ip == QLatin1String("127.0.0.1"))
                continue;
            if (!hosts.contains(ip))
                hosts.append(ip);
        }
        if (hosts.isEmpty())
            continue;

        const QString primary = hosts.first();
        QVariantMap peer;
        peer.insert(QStringLiteral("host"), primary);
        peer.insert(QStringLiteral("hosts"), hosts);
        peer.insert(QStringLiteral("port"), httpPort);
        peer.insert(QStringLiteral("token"), token);
        peer.insert(QStringLiteral("bytes"), bytes);
        peer.insert(QStringLiteral("device"), device);
        peer.insert(QStringLiteral("interactive"), interactive || magic == kMagic2);
        peer.insert(QStringLiteral("transport"), QStringLiteral("lan"));
        peer.insert(QStringLiteral("url"),
                    QStringLiteral("http://%1:%2/ose/v1/bundle?token=%3")
                        .arg(primary)
                        .arg(httpPort)
                        .arg(token));

        // Un peer = un token (même hôte vu via plusieurs NIC / broadcasts)
        QVariantMap prev = m_peerByToken.value(token);
        if (!prev.isEmpty()) {
            QStringList merged = prev.value(QStringLiteral("hosts")).toStringList();
            for (const QString& h : hosts) {
                if (!merged.contains(h))
                    merged.append(h);
            }
            // Remettre fromIp en tête si nouveau
            if (!fromIp.isEmpty() && fromIp != QLatin1String("127.0.0.1")) {
                merged.removeAll(fromIp);
                merged.prepend(fromIp);
            }
            peer.insert(QStringLiteral("hosts"), merged);
            peer.insert(QStringLiteral("host"), merged.first());
            peer.insert(QStringLiteral("url"),
                        QStringLiteral("http://%1:%2/ose/v1/bundle?token=%3")
                            .arg(merged.first())
                            .arg(httpPort)
                            .arg(token));
        }
        m_peerByToken.insert(token, peer);

        m_peers.clear();
        for (auto it = m_peerByToken.constBegin(); it != m_peerByToken.constEnd(); ++it)
            m_peers.append(it.value());
        emit peersChanged();
        if (m_scanning)
            setStatus(QStringLiteral("%1 appareil(s) LAN…").arg(m_peers.size()));
    }
}

int SyncLan::resolvePeerIndex(int peerIndex) const
{
    if (peerIndex >= 0 && peerIndex < m_peers.size())
        return peerIndex;
    if (m_selectedPeerIndex >= 0 && m_selectedPeerIndex < m_peers.size())
        return m_selectedPeerIndex;
    if (!m_peers.isEmpty())
        return 0;
    return -1;
}

QByteArray SyncLan::httpExchange(const QString& host, quint16 port, const QByteArray& method,
                                 const QString& pathAndQuery, const QByteArray& body,
                                 const QByteArray& contentType, int timeoutMs)
{
    QString err;
    const QByteArray r =
        httpExchangeThreaded(host, port, method, pathAndQuery, body, contentType, timeoutMs, &err);
    if (r.isEmpty() && !err.isEmpty())
        setError(err);
    return r;
}

bool SyncLan::peerHttpTargets(int peerIndex, quint16* portOut, QStringList* hostsOut, QString* tokenOut,
                              bool* interactiveOut) const
{
    const int idx = resolvePeerIndex(peerIndex);
    if (idx < 0)
        return false;
    const QVariantMap peer = m_peers.at(idx).toMap();
    if (portOut)
        *portOut = quint16(peer.value(QStringLiteral("port")).toUInt());
    if (tokenOut)
        *tokenOut = peer.value(QStringLiteral("token")).toString();
    if (interactiveOut)
        *interactiveOut = peer.value(QStringLiteral("interactive")).toBool();
    if (hostsOut) {
        *hostsOut = peer.value(QStringLiteral("hosts")).toStringList();
        if (hostsOut->isEmpty())
            hostsOut->append(peer.value(QStringLiteral("host")).toString());
    }
    return true;
}

QByteArray SyncLan::tryPeersHttp(int peerIndex, const QByteArray& method, const QString& pathAndQuery,
                                 const QByteArray& body, const QByteArray& contentType, int timeoutMs)
{
    quint16 port = 0;
    QStringList hosts;
    if (!peerHttpTargets(peerIndex, &port, &hosts, nullptr, nullptr)) {
        setError(QStringLiteral("Aucun appareil LAN"));
        return {};
    }
    QString err;
    QString lastErr;
    for (const QString& host : hosts) {
        setStatus(QStringLiteral("LAN → %1…").arg(host));
        setError({});
        const QByteArray r =
            httpExchangeThreaded(host, port, method, pathAndQuery, body, contentType, timeoutMs, &err);
        if (!r.isEmpty()) {
            m_lastPeerIndex = resolvePeerIndex(peerIndex);
            setError({});
            return r;
        }
        if (!err.isEmpty())
            lastErr = err;
    }
    setError(lastErr.isEmpty() ? QStringLiteral("LAN : toutes les IP ont échoué") : lastErr);
    return {};
}

void SyncLan::fetchCatalogFromPeerAsync(int peerIndex)
{
    if (m_httpAsyncRunning)
        return;
    setError({});
    m_remoteCatalog.clear();
    emit remoteCatalogChanged();

    quint16 port = 0;
    QStringList hosts;
    QString token;
    if (!peerHttpTargets(peerIndex, &port, &hosts, &token, nullptr)) {
        setError(QStringLiteral("Aucun appareil LAN"));
        emit catalogFetched({});
        return;
    }
    m_lastPeerIndex = resolvePeerIndex(peerIndex);
    m_httpAsyncRunning = true;
    setBusy(true);
    setStatus(QStringLiteral("LAN : catalogue…"));

    const QString path = QStringLiteral("/ose/v1/catalog?token=%1").arg(token);
    QPointer<SyncLan> self(this);
    (void)QtConcurrent::run([self, hosts, port, path]() {
        QString err;
        const QByteArray body =
            tryHostsHttp(hosts, port, "GET", path, {}, "application/json", 20000, &err);
        QTimer::singleShot(0, self, [self, body, err]() {
            if (!self)
                return;
            self->m_httpAsyncRunning = false;
            self->setBusy(false);
            if (body.isEmpty()) {
                self->setError(err.isEmpty() ? QStringLiteral("Catalogue LAN vide") : err);
                emit self->catalogFetched({});
                return;
            }
            const QJsonDocument doc = QJsonDocument::fromJson(body);
            if (!doc.isObject()) {
                self->setError(QStringLiteral("Catalogue LAN invalide"));
                emit self->catalogFetched({});
                return;
            }
            self->m_remoteCatalog = doc.object().toVariantMap();
            emit self->remoteCatalogChanged();
            const int n = self->m_remoteCatalog.value(QStringLiteral("projects")).toList().size();
            self->setStatus(QStringLiteral("LAN : %1 projet(s)").arg(n));
            emit self->catalogFetched(self->m_remoteCatalog);
        });
    });
}

void SyncLan::fetchBundleFromPeerAsync(int peerIndex, const QVariantMap& selection)
{
    if (m_httpAsyncRunning)
        return;
    setError({});

    quint16 port = 0;
    QStringList hosts;
    QString token;
    bool interactive = false;
    if (!peerHttpTargets(peerIndex, &port, &hosts, &token, &interactive)) {
        setError(QStringLiteral("Aucun appareil LAN"));
        emit bundleFetched({});
        return;
    }
    m_lastPeerIndex = resolvePeerIndex(peerIndex);
    m_httpAsyncRunning = true;
    setBusy(true);
    setStatus(QStringLiteral("LAN : téléchargement…"));

    const QByteArray selJson = QJsonDocument::fromVariant(selection).toJson(QJsonDocument::Compact);
    const QString path = QStringLiteral("/ose/v1/bundle?token=%1").arg(token);
    QPointer<SyncLan> self(this);
    (void)QtConcurrent::run([self, hosts, port, path, selJson, interactive]() {
        QString err;
        QByteArray zip;
        if (interactive) {
            zip = tryHostsHttp(hosts, port, "POST", path, selJson, "application/json", 180000, &err);
        } else {
            zip = tryHostsHttp(hosts, port, "GET", path, {}, "application/octet-stream", 180000, &err);
        }
        QTimer::singleShot(0, self, [self, zip, err]() {
            if (!self)
                return;
            self->m_httpAsyncRunning = false;
            self->setBusy(false);
            if (zip.isEmpty()) {
                self->setError(err.isEmpty() ? QStringLiteral("LAN : bundle vide") : err);
                emit self->bundleFetched({});
                return;
            }
            self->setStatus(QStringLiteral("LAN : reçu (%1 Ko)").arg(zip.size() / 1024));
            emit self->bundleFetched(zip);
        });
    });
}

void SyncLan::pushBundleToPeerAsync(int peerIndex, const QByteArray& zipBytes)
{
    if (m_httpAsyncRunning)
        return;
    setError({});
    if (zipBytes.isEmpty()) {
        setError(QStringLiteral("Bundle vide"));
        emit pushFinished(false);
        return;
    }

    quint16 port = 0;
    QStringList hosts;
    QString token;
    if (!peerHttpTargets(peerIndex, &port, &hosts, &token, nullptr)) {
        setError(QStringLiteral("Aucun appareil LAN"));
        emit pushFinished(false);
        return;
    }
    m_lastPeerIndex = resolvePeerIndex(peerIndex);
    m_httpAsyncRunning = true;
    setBusy(true);
    setStatus(QStringLiteral("LAN : envoi…"));

    const QString path = QStringLiteral("/ose/v1/push?token=%1").arg(token);
    QPointer<SyncLan> self(this);
    (void)QtConcurrent::run([self, hosts, port, path, zipBytes]() {
        QString err;
        const QByteArray resp =
            tryHostsHttp(hosts, port, "POST", path, zipBytes, "application/octet-stream", 180000, &err);
        QTimer::singleShot(0, self, [self, resp, err]() {
            if (!self)
                return;
            self->m_httpAsyncRunning = false;
            self->setBusy(false);
            if (resp.isEmpty()) {
                self->setError(err.isEmpty() ? QStringLiteral("LAN : envoi échoué") : err);
                emit self->pushFinished(false);
                return;
            }
            const QJsonDocument doc = QJsonDocument::fromJson(resp);
            const bool ok = doc.isObject() && doc.object().value(QStringLiteral("ok")).toBool();
            if (!ok) {
                self->setError(doc.isObject() ? doc.object().value(QStringLiteral("error")).toString()
                                              : QStringLiteral("Import LAN refusé"));
                emit self->pushFinished(false);
                return;
            }
            self->setStatus(QStringLiteral("LAN : données poussées"));
            emit self->bundleServed();
            emit self->pushFinished(true);
        });
    });
}

QVariantMap SyncLan::fetchCatalogFromPeer(int peerIndex)
{
    setError({});
    m_remoteCatalog.clear();
    emit remoteCatalogChanged();
    setBusy(true);

    const int idx = resolvePeerIndex(peerIndex);
    if (idx < 0) {
        setBusy(false);
        setError(QStringLiteral("Aucun appareil LAN"));
        return {};
    }
    const QVariantMap peer = m_peers.at(idx).toMap();
    const QString token = peer.value(QStringLiteral("token")).toString();
    const QString path = QStringLiteral("/ose/v1/catalog?token=%1").arg(token);
    const QByteArray body = tryPeersHttp(idx, "GET", path, {}, "application/json", 20000);
    setBusy(false);
    if (body.isEmpty())
        return {};

    const QJsonDocument doc = QJsonDocument::fromJson(body);
    if (!doc.isObject()) {
        setError(QStringLiteral("Catalogue LAN invalide"));
        return {};
    }
    m_remoteCatalog = doc.object().toVariantMap();
    emit remoteCatalogChanged();
    const int n = m_remoteCatalog.value(QStringLiteral("projects")).toList().size();
    setStatus(QStringLiteral("LAN : %1 projet(s)").arg(n));
    return m_remoteCatalog;
}

QByteArray SyncLan::fetchBundleFromPeer(int peerIndex, const QVariantMap& selection)
{
    setError({});
    setBusy(true);
    const int idx = resolvePeerIndex(peerIndex);
    if (idx < 0) {
        setBusy(false);
        setError(QStringLiteral("Aucun appareil LAN"));
        return {};
    }
    const QVariantMap peer = m_peers.at(idx).toMap();
    const QString token = peer.value(QStringLiteral("token")).toString();
    const bool interactive = peer.value(QStringLiteral("interactive")).toBool();

    QByteArray zip;
    if (interactive) {
        const QByteArray selJson =
            QJsonDocument::fromVariant(selection).toJson(QJsonDocument::Compact);
        const QString path = QStringLiteral("/ose/v1/bundle?token=%1").arg(token);
        zip = tryPeersHttp(idx, "POST", path, selJson, "application/json", 180000);
    } else {
        const QString path = QStringLiteral("/ose/v1/bundle?token=%1").arg(token);
        zip = tryPeersHttp(idx, "GET", path, {}, "application/octet-stream", 180000);
    }
    setBusy(false);
    if (zip.isEmpty())
        return {};
    setStatus(QStringLiteral("LAN : reçu (%1 Ko)").arg(zip.size() / 1024));
    return zip;
}

bool SyncLan::pushBundleToPeer(int peerIndex, const QByteArray& zipBytes)
{
    setError({});
    if (zipBytes.isEmpty()) {
        setError(QStringLiteral("Bundle vide"));
        return false;
    }
    setBusy(true);
    const int idx = resolvePeerIndex(peerIndex);
    if (idx < 0) {
        setBusy(false);
        setError(QStringLiteral("Aucun appareil LAN"));
        return false;
    }
    const QVariantMap peer = m_peers.at(idx).toMap();
    const QString token = peer.value(QStringLiteral("token")).toString();
    const QString path = QStringLiteral("/ose/v1/push?token=%1").arg(token);
    const QByteArray resp =
        tryPeersHttp(idx, "POST", path, zipBytes, "application/octet-stream", 180000);
    setBusy(false);
    if (resp.isEmpty())
        return false;
    const QJsonDocument doc = QJsonDocument::fromJson(resp);
    const bool ok = doc.isObject() && doc.object().value(QStringLiteral("ok")).toBool();
    if (!ok) {
        setError(doc.isObject() ? doc.object().value(QStringLiteral("error")).toString()
                                : QStringLiteral("Import LAN refusé"));
        return false;
    }
    setStatus(QStringLiteral("LAN : données poussées"));
    emit bundleServed();
    return true;
}

QByteArray SyncLan::fetchFromPeer(int peerIndex)
{
    return fetchBundleFromPeer(peerIndex, {});
}

QByteArray SyncLan::fetchFromUrl(const QString& urlOrInvite)
{
    setError({});
    QString url = urlOrInvite.trimmed();
    if (url.startsWith(QLatin1String("osesync://"))) {
        url = url.mid(QStringLiteral("osesync://").size());
        const int slash = url.indexOf(QLatin1Char('/'));
        QString hostPort = slash >= 0 ? url.left(slash) : url;
        QString token = slash >= 0 ? url.mid(slash + 1) : QString();
        QString host = hostPort;
        quint16 port = kHttpPortPrefer;
        const int colon = hostPort.lastIndexOf(QLatin1Char(':'));
        if (colon > 0) {
            host = hostPort.left(colon);
            port = hostPort.mid(colon + 1).toUShort();
        }
        url = QStringLiteral("http://%1:%2/ose/v1/bundle?token=%3").arg(host).arg(port).arg(token);
    }

    QUrl u(url);
    if (!u.isValid() || u.host().isEmpty()) {
        setError(QStringLiteral("URL invalide"));
        return {};
    }
    const QByteArray path = u.path(QUrl::FullyEncoded).toUtf8()
                            + (u.hasQuery() ? ('?' + u.query(QUrl::FullyEncoded).toUtf8()) : QByteArray());
    return httpExchange(u.host(), quint16(u.port(kHttpPortPrefer)), "GET",
                        QString::fromUtf8(path), {}, "application/octet-stream", 120000);
}

} // namespace ose
