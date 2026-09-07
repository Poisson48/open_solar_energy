#include "project_share.h"

#include <QCryptographicHash>
#include <QDateTime>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QRandomGenerator>
#include <QRegularExpression>
#include <QSslSocket>
#include <QTimer>
#include <QUrl>

#include <openssl/evp.h>
#include <openssl/rand.h>

#include <secp256k1.h>
#include <secp256k1_extrakeys.h>
#include <secp256k1_schnorrsig.h>

namespace ose {
namespace {

QByteArray b64url(const QByteArray& in)
{
    return in.toBase64(QByteArray::Base64UrlEncoding | QByteArray::OmitTrailingEquals);
}

QByteArray b64urlDecode(const QString& s)
{
    QByteArray t = s.toUtf8();
    while (t.size() % 4)
        t.append('=');
    return QByteArray::fromBase64(t, QByteArray::Base64UrlEncoding);
}

const char* kAlphabet = "0123456789ABCDEFGHJKLMNPQRSTUVWXYZ";

} // namespace

ProjectShare::ProjectShare(QObject* parent) : QObject(parent) {}

ProjectShare::~ProjectShare()
{
    for (QSslSocket* s : m_sockets) {
        s->abort();
        s->deleteLater();
    }
}

void ProjectShare::setBusy(bool v)
{
    if (m_busy == v)
        return;
    m_busy = v;
    emit busyChanged();
}

void ProjectShare::setStatus(const QString& s)
{
    if (m_status == s)
        return;
    m_status = s;
    emit statusChanged();
}

QByteArray ProjectShare::sha256(const QByteArray& data) const
{
    return QCryptographicHash::hash(data, QCryptographicHash::Sha256);
}

QString ProjectShare::encodeShortKey(const QByteArray& keyBytes) const
{
    // 10 bytes → base32-ish custom alphabet groups
    quint64 n = 0;
    for (int i = 0; i < keyBytes.size() && i < 8; ++i)
        n = (n << 8) | quint8(keyBytes[i]);
    QString out;
    for (int g = 0; g < 4; ++g) {
        if (g)
            out += QLatin1Char('-');
        out += QLatin1String("OSE");
        // simpler: OSE-XXXX-XXXX style from hex of first 8 bytes
    }
    Q_UNUSED(n);
    const QString hex = QString::fromLatin1(keyBytes.toHex()).toUpper();
    return QStringLiteral("OSE-%1-%2-%3")
        .arg(hex.mid(0, 4), hex.mid(4, 4), hex.mid(8, 4));
}

QByteArray ProjectShare::decodeShortKey(const QString& shortKey) const
{
    QString s = shortKey.toUpper();
    s.remove(QLatin1Char('-'));
    s.remove(QStringLiteral("OSE"));
    s.remove(QLatin1Char(' '));
    // Accept raw hex of 20 chars (10 bytes) or longer
    QByteArray hex = s.toLatin1();
    if (hex.size() < 16)
        return {};
    return QByteArray::fromHex(hex.left(20));
}

QByteArray ProjectShare::getXOnlyPubkey(const QByteArray& privKey) const
{
    secp256k1_context* ctx = secp256k1_context_create(SECP256K1_CONTEXT_NONE);
    secp256k1_keypair keypair;
    if (!secp256k1_keypair_create(ctx, &keypair, reinterpret_cast<const unsigned char*>(privKey.constData()))) {
        secp256k1_context_destroy(ctx);
        return {};
    }
    secp256k1_xonly_pubkey xonly;
    if (!secp256k1_keypair_xonly_pub(ctx, &xonly, nullptr, &keypair)) {
        secp256k1_context_destroy(ctx);
        return {};
    }
    unsigned char out[32];
    secp256k1_xonly_pubkey_serialize(ctx, out, &xonly);
    secp256k1_context_destroy(ctx);
    return QByteArray(reinterpret_cast<char*>(out), 32);
}

ProjectShare::Material ProjectShare::deriveMaterial(const QByteArray& keyBytes) const
{
    Material m;
    const QByteArray ch = sha256(QByteArray("opensolar/v1/channel") + keyBytes);
    m.channelTag = QString::fromLatin1(ch.toHex().left(32));
    m.aesRaw = sha256(QByteArray("opensolar/v1/aes") + keyBytes);
    QByteArray seed = sha256(QByteArray("opensolar/v1/nostrkey") + keyBytes);
    for (int i = 0; i < 8; ++i) {
        m.privKey = seed;
        m.pubKey = getXOnlyPubkey(m.privKey);
        if (!m.pubKey.isEmpty())
            return m;
        seed = sha256(seed);
    }
    return m;
}

QString ProjectShare::encryptPayload(const QByteArray& aesRaw, const QString& channelTag,
                                     const QString& plaintext) const
{
    unsigned char iv[12];
    RAND_bytes(iv, 12);
    QByteArray pt = plaintext.toUtf8();
    QByteArray ad = channelTag.toUtf8();
    QByteArray ct(pt.size() + 16, 0);

    EVP_CIPHER_CTX* ctx = EVP_CIPHER_CTX_new();
    int len = 0;
    int ctLen = 0;
    EVP_EncryptInit_ex(ctx, EVP_aes_256_gcm(), nullptr,
                       reinterpret_cast<const unsigned char*>(aesRaw.constData()), iv);
    EVP_EncryptUpdate(ctx, nullptr, &len, reinterpret_cast<const unsigned char*>(ad.constData()),
                      ad.size());
    EVP_EncryptUpdate(ctx, reinterpret_cast<unsigned char*>(ct.data()), &len,
                      reinterpret_cast<const unsigned char*>(pt.constData()), pt.size());
    ctLen = len;
    EVP_EncryptFinal_ex(ctx, reinterpret_cast<unsigned char*>(ct.data()) + len, &len);
    ctLen += len;
    unsigned char tag[16];
    EVP_CIPHER_CTX_ctrl(ctx, EVP_CTRL_GCM_GET_TAG, 16, tag);
    EVP_CIPHER_CTX_free(ctx);

    QByteArray out;
    out.append(reinterpret_cast<char*>(iv), 12);
    out.append(ct.constData(), ctLen);
    out.append(reinterpret_cast<char*>(tag), 16);
    return QString::fromLatin1(out.toBase64());
}

QString ProjectShare::decryptPayload(const QByteArray& aesRaw, const QString& channelTag,
                                     const QString& b64) const
{
    const QByteArray all = QByteArray::fromBase64(b64.toLatin1());
    if (all.size() < 12 + 16)
        return {};
    const unsigned char* iv = reinterpret_cast<const unsigned char*>(all.constData());
    const QByteArray ad = channelTag.toUtf8();
    const int ctLen = all.size() - 12 - 16;
    const unsigned char* ct = iv + 12;
    const unsigned char* tag = iv + 12 + ctLen;
    QByteArray pt(ctLen, 0);

    EVP_CIPHER_CTX* ctx = EVP_CIPHER_CTX_new();
    int len = 0;
    EVP_DecryptInit_ex(ctx, EVP_aes_256_gcm(), nullptr,
                       reinterpret_cast<const unsigned char*>(aesRaw.constData()), iv);
    EVP_DecryptUpdate(ctx, nullptr, &len, reinterpret_cast<const unsigned char*>(ad.constData()),
                      ad.size());
    EVP_DecryptUpdate(ctx, reinterpret_cast<unsigned char*>(pt.data()), &len, ct, ctLen);
    int ptLen = len;
    EVP_CIPHER_CTX_ctrl(ctx, EVP_CTRL_GCM_SET_TAG, 16, const_cast<unsigned char*>(tag));
    const int ok = EVP_DecryptFinal_ex(ctx, reinterpret_cast<unsigned char*>(pt.data()) + len, &len);
    EVP_CIPHER_CTX_free(ctx);
    if (!ok)
        return {};
    ptLen += len;
    pt.resize(ptLen);
    return QString::fromUtf8(pt);
}

QString ProjectShare::signEvent(const QJsonObject& evt, const QByteArray& privKey) const
{
    // Serialize [0, pubkey, created_at, kind, tags, content]
    const QJsonArray ser{0, evt.value(QStringLiteral("pubkey")),
                         evt.value(QStringLiteral("created_at")), evt.value(QStringLiteral("kind")),
                         evt.value(QStringLiteral("tags")), evt.value(QStringLiteral("content"))};
    const QByteArray msg = sha256(QJsonDocument(ser).toJson(QJsonDocument::Compact));

    secp256k1_context* ctx = secp256k1_context_create(SECP256K1_CONTEXT_NONE);
    secp256k1_keypair keypair;
    secp256k1_keypair_create(ctx, &keypair, reinterpret_cast<const unsigned char*>(privKey.constData()));
    unsigned char sig[64];
    secp256k1_schnorrsig_sign32(ctx, sig, reinterpret_cast<const unsigned char*>(msg.constData()),
                                &keypair, nullptr);
    secp256k1_context_destroy(ctx);
    return QString::fromLatin1(QByteArray(reinterpret_cast<char*>(sig), 64).toHex());
}

QString ProjectShare::makeInvitePayload(const QString& projectJson) const
{
    QByteArray key(10, '\0');
    RAND_bytes(reinterpret_cast<unsigned char*>(key.data()), key.size());
    const Material mat = deriveMaterial(key);
    const QString enc = encryptPayload(mat.aesRaw, mat.channelTag, projectJson);
    QJsonObject wrap{{QStringLiteral("ose"), 1},
                     {QStringLiteral("key"), QString::fromLatin1(key.toHex())},
                     {QStringLiteral("enc"), enc}};
    return QStringLiteral("opensolar:")
           + QString::fromLatin1(QJsonDocument(wrap).toJson(QJsonDocument::Compact).toBase64(
               QByteArray::Base64UrlEncoding | QByteArray::OmitTrailingEquals));
}

QVariantMap ProjectShare::parseInvitePayload(const QString& payload) const
{
    QString p = payload.trimmed();
    // URI opensolar://join/1/<b64key>/title
    const QRegularExpression uriRe(
        QStringLiteral(R"(^(?:opensolar://|https?://opensolar\.app/)join/1/([^/\s]+)(?:/([^\s]*))?)"),
        QRegularExpression::CaseInsensitiveOption);
    const QRegularExpressionMatch um = uriRe.match(p);
    if (um.hasMatch()) {
        QByteArray key = b64urlDecode(um.captured(1));
        if (key.size() > 10)
            key = key.left(10);
        return {{QStringLiteral("ok"), true},
                {QStringLiteral("keyHex"), QString::fromLatin1(key.toHex())},
                {QStringLiteral("title"), QUrl::fromPercentEncoding(um.captured(2).toUtf8())}};
    }
    if (p.startsWith(QStringLiteral("opensolar:"))) {
        QByteArray raw = b64urlDecode(p.mid(10));
        const QJsonObject o = QJsonDocument::fromJson(raw).object();
        if (o.contains(QStringLiteral("enc"))) {
            const QByteArray key = QByteArray::fromHex(o.value(QStringLiteral("key")).toString().toLatin1());
            const Material mat = deriveMaterial(key);
            const QString json = decryptPayload(mat.aesRaw, mat.channelTag,
                                                o.value(QStringLiteral("enc")).toString());
            const QJsonObject proj = QJsonDocument::fromJson(json.toUtf8()).object();
            return {{QStringLiteral("ok"), !proj.isEmpty()},
                    {QStringLiteral("project"), proj.toVariantMap()}};
        }
        if (o.contains(QStringLiteral("project")))
            return {{QStringLiteral("ok"), true},
                    {QStringLiteral("project"), o.value(QStringLiteral("project")).toObject().toVariantMap()}};
    }
    if (p.contains(QStringLiteral("OSE"), Qt::CaseInsensitive)) {
        const QByteArray key = decodeShortKey(p);
        if (!key.isEmpty())
            return {{QStringLiteral("ok"), true},
                    {QStringLiteral("keyHex"), QString::fromLatin1(key.toHex())}};
    }
    return {{QStringLiteral("ok"), false}};
}

void ProjectShare::publish(const QString& projectId, const QString& projectJson, const QString& title)
{
    setBusy(true);
    setStatus(QStringLiteral("Publication Nostr…"));
    QByteArray key(10, '\0');
    RAND_bytes(reinterpret_cast<unsigned char*>(key.data()), key.size());

    const Material mat = deriveMaterial(key);
    if (mat.pubKey.isEmpty()) {
        setBusy(false);
        setStatus(QStringLiteral("Échec dérivation clé Nostr"));
        return;
    }

    QJsonObject payload{{QStringLiteral("projectId"), projectId},
                        {QStringLiteral("savedAt"), QDateTime::currentDateTimeUtc().toString(Qt::ISODate)},
                        {QStringLiteral("project"), QJsonDocument::fromJson(projectJson.toUtf8()).object()}};
    const QString content = encryptPayload(mat.aesRaw, mat.channelTag,
                                           QString::fromUtf8(QJsonDocument(payload).toJson(QJsonDocument::Compact)));

    const QString shortKey = encodeShortKey(key);
    const QString uri = QStringLiteral("opensolar://join/1/%1/%2")
                            .arg(QString::fromLatin1(b64url(key)),
                                 QString::fromUtf8(QUrl::toPercentEncoding(title)));
    m_lastInvite = shortKey + QLatin1Char('\n') + uri;
    emit lastInviteChanged();
    emit published(shortKey, uri);

    connectAndPublish(mat, content, projectId);
}

void ProjectShare::connectAndPublish(const Material& mat, const QString& content,
                                     const QString& projectId)
{
    Q_UNUSED(projectId);
    const qint64 created = QDateTime::currentSecsSinceEpoch();
    QJsonObject evt{{QStringLiteral("pubkey"), QString::fromLatin1(mat.pubKey.toHex())},
                    {QStringLiteral("created_at"), created},
                    {QStringLiteral("kind"), 30078},
                    {QStringLiteral("tags"),
                     QJsonArray{QJsonArray{QStringLiteral("d"), mat.channelTag},
                                QJsonArray{QStringLiteral("t"), mat.channelTag}}},
                    {QStringLiteral("content"), content}};
    const QString idHex = QString::fromLatin1(
        sha256(QJsonDocument(QJsonArray{0, evt.value(QStringLiteral("pubkey")), created, 30078,
                                        evt.value(QStringLiteral("tags")), content})
                   .toJson(QJsonDocument::Compact))
            .toHex());
    evt.insert(QStringLiteral("id"), idHex);
    evt.insert(QStringLiteral("sig"), signEvent(evt, mat.privKey));

    const QByteArray msg = QJsonDocument(QJsonArray{QStringLiteral("EVENT"), evt}).toJson(QJsonDocument::Compact);

    int pending = 0;
    for (const QString& relay : m_relays) {
        const QUrl url(relay);
        auto* sock = new QSslSocket(this);
        m_sockets.append(sock);
        ++pending;
        connect(sock, &QSslSocket::encrypted, this, [this, sock, url, msg, &pending]() {
            // WebSocket handshake
            const QByteArray key = QByteArray(16, 'x').toBase64();
            QByteArray req = "GET " + url.path(QUrl::FullyEncoded).toUtf8() + " HTTP/1.1\r\n"
                             "Host: " + url.host().toUtf8() + "\r\n"
                             "Upgrade: websocket\r\nConnection: Upgrade\r\n"
                             "Sec-WebSocket-Key: " + key + "\r\n"
                             "Sec-WebSocket-Version: 13\r\n\r\n";
            if (url.path().isEmpty())
                req = "GET / HTTP/1.1\r\n"
                      "Host: " + url.host().toUtf8() + "\r\n"
                      "Upgrade: websocket\r\nConnection: Upgrade\r\n"
                      "Sec-WebSocket-Key: " + key + "\r\n"
                      "Sec-WebSocket-Version: 13\r\n\r\n";
            sock->write(req);
            sock->flush();
        });
        connect(sock, &QSslSocket::readyRead, this, [this, sock, msg]() {
            const QByteArray data = sock->readAll();
            if (data.contains("101") && data.contains("Upgrade")) {
                // mask frame text
                QByteArray payload = msg;
                QByteArray frame;
                frame.append(char(0x81));
                const int len = payload.size();
                if (len < 126) {
                    frame.append(char(0x80 | len));
                } else {
                    frame.append(char(0x80 | 126));
                    frame.append(char((len >> 8) & 0xff));
                    frame.append(char(len & 0xff));
                }
                const quint8 mask[4] = {1, 2, 3, 4};
                frame.append(reinterpret_cast<const char*>(mask), 4);
                for (int i = 0; i < payload.size(); ++i)
                    payload[i] = char(quint8(payload[i]) ^ mask[i % 4]);
                frame.append(payload);
                sock->write(frame);
                sock->flush();
                setStatus(QStringLiteral("Publié sur un relais"));
                setBusy(false);
            }
        });
        sock->connectToHostEncrypted(url.host(), quint16(url.port(443)));
        QTimer::singleShot(12000, sock, [this, sock]() {
            if (m_busy) {
                setBusy(false);
                setStatus(QStringLiteral("Timeout relais — invite locale prête"));
            }
            sock->disconnectFromHost();
        });
    }
    if (m_relays.isEmpty()) {
        setBusy(false);
        setStatus(QStringLiteral("Invite locale prête (hors ligne)"));
    }
}

void ProjectShare::join(const QString& invite)
{
    const QVariantMap parsed = parseInvitePayload(invite);
    if (!parsed.value(QStringLiteral("ok")).toBool()) {
        setStatus(QStringLiteral("Invite invalide"));
        return;
    }
    if (parsed.contains(QStringLiteral("project"))) {
        emit projectReceived(parsed.value(QStringLiteral("project")).toMap());
        setStatus(QStringLiteral("Projet importé depuis l’invite"));
        return;
    }
    const QByteArray key = QByteArray::fromHex(parsed.value(QStringLiteral("keyHex")).toString().toLatin1());
    if (key.isEmpty()) {
        setStatus(QStringLiteral("Clé manquante"));
        return;
    }
    setBusy(true);
    setStatus(QStringLiteral("Écoute des relais Nostr…"));
    connectAndSubscribe(deriveMaterial(key));
}

void ProjectShare::connectAndSubscribe(const Material& mat)
{
    const QString subId = QStringLiteral("ose_") + mat.channelTag.left(12);
    QJsonObject filter{{QStringLiteral("kinds"), QJsonArray{30078}},
                      {QStringLiteral("#d"), QJsonArray{mat.channelTag}},
                      {QStringLiteral("limit"), 5}};
    const QByteArray req = QJsonDocument(QJsonArray{QStringLiteral("REQ"), subId, filter})
                               .toJson(QJsonDocument::Compact);

    for (const QString& relay : m_relays) {
        const QUrl url(relay);
        auto* sock = new QSslSocket(this);
        m_sockets.append(sock);
        QByteArray* buffer = new QByteArray;
        connect(sock, &QSslSocket::encrypted, this, [sock, url]() {
            QByteArray hs = "GET / HTTP/1.1\r\nHost: " + url.host().toUtf8()
                            + "\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n"
                              "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n"
                              "Sec-WebSocket-Version: 13\r\n\r\n";
            sock->write(hs);
        });
        connect(sock, &QSslSocket::readyRead, this, [this, sock, req, mat, buffer]() {
            buffer->append(sock->readAll());
            if (buffer->contains("101") && buffer->contains("Upgrade") && !buffer->contains("SUBSENT")) {
                buffer->append("SUBSENT");
                QByteArray payload = req;
                QByteArray frame;
                frame.append(char(0x81));
                frame.append(char(0x80 | payload.size()));
                const quint8 mask[4] = {5, 6, 7, 8};
                frame.append(reinterpret_cast<const char*>(mask), 4);
                for (int i = 0; i < payload.size(); ++i)
                    payload[i] = char(quint8(payload[i]) ^ mask[i % 4]);
                frame.append(payload);
                sock->write(frame);
            }
            // crude: look for EVENT JSON in buffer
            const int idx = buffer->indexOf("[\"EVENT\"");
            if (idx >= 0) {
                const int end = buffer->indexOf(']', idx);
                // find matching - use last full line-ish
                int depth = 0;
                int endArr = -1;
                for (int i = idx; i < buffer->size(); ++i) {
                    if (buffer->at(i) == '[')
                        ++depth;
                    else if (buffer->at(i) == ']') {
                        --depth;
                        if (depth == 0) {
                            endArr = i;
                            break;
                        }
                    }
                }
                if (endArr > idx) {
                    const QJsonArray arr = QJsonDocument::fromJson(buffer->mid(idx, endArr - idx + 1)).array();
                    if (arr.size() >= 3) {
                        const QJsonObject evt = arr.at(2).toObject();
                        const QString content = evt.value(QStringLiteral("content")).toString();
                        const QString json = decryptPayload(mat.aesRaw, mat.channelTag, content);
                        const QJsonObject wrap = QJsonDocument::fromJson(json.toUtf8()).object();
                        const QVariantMap project = wrap.value(QStringLiteral("project")).toObject().toVariantMap();
                        if (!project.isEmpty()) {
                            emit projectReceived(project);
                            setStatus(QStringLiteral("Projet reçu via Nostr"));
                            setBusy(false);
                        }
                    }
                }
                Q_UNUSED(end);
            }
        });
        sock->connectToHostEncrypted(url.host(), 443);
        QTimer::singleShot(15000, this, [this]() {
            if (m_busy) {
                setBusy(false);
                setStatus(QStringLiteral("Aucun événement reçu (timeout)"));
            }
        });
    }
}

} // namespace ose
