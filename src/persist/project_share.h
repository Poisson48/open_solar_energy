#pragma once

#include <QObject>
#include <QVariantMap>
#include <QByteArray>
#include <QStringList>

class QSslSocket;

namespace ose {

class ProjectShare : public QObject {
    Q_OBJECT
    Q_PROPERTY(bool busy READ busy NOTIFY busyChanged)
    Q_PROPERTY(QString status READ status NOTIFY statusChanged)
    Q_PROPERTY(QString lastInvite READ lastInvite NOTIFY lastInviteChanged)

public:
    explicit ProjectShare(QObject* parent = nullptr);
    ~ProjectShare() override;

    bool busy() const { return m_busy; }
    QString status() const { return m_status; }
    QString lastInvite() const { return m_lastInvite; }

    Q_INVOKABLE QString makeInvitePayload(const QString& projectJson) const;
    Q_INVOKABLE QVariantMap parseInvitePayload(const QString& payload) const;

    /** Active le partage Nostr : génère clé courte + publie le projet chiffré. */
    Q_INVOKABLE void publish(const QString& projectId, const QString& projectJson,
                             const QString& title);
    /** Rejoint via URI opensolar:// ou clé OSE-…. */
    Q_INVOKABLE void join(const QString& invite);
    Q_INVOKABLE QString encodeShortKey(const QByteArray& keyBytes) const;
    Q_INVOKABLE QByteArray decodeShortKey(const QString& shortKey) const;

signals:
    void busyChanged();
    void statusChanged();
    void lastInviteChanged();
    void projectReceived(const QVariantMap& project);
    void published(const QString& shortKey, const QString& uri);

private:
    struct Material {
        QString channelTag;
        QByteArray privKey; // 32 bytes
        QByteArray pubKey;  // 32 bytes x-only
        QByteArray aesRaw;  // 32 bytes
    };

    Material deriveMaterial(const QByteArray& keyBytes) const;
    QByteArray sha256(const QByteArray& data) const;
    QString encryptPayload(const QByteArray& aesRaw, const QString& channelTag,
                           const QString& plaintext) const;
    QString decryptPayload(const QByteArray& aesRaw, const QString& channelTag,
                           const QString& b64) const;
    QString signEvent(const QJsonObject& evt, const QByteArray& privKey) const;
    QByteArray getXOnlyPubkey(const QByteArray& privKey) const;
    void setBusy(bool v);
    void setStatus(const QString& s);
    void connectAndPublish(const Material& mat, const QString& content, const QString& projectId);
    void connectAndSubscribe(const Material& mat);

    bool m_busy = false;
    QString m_status;
    QString m_lastInvite;
    QList<QSslSocket*> m_sockets;
    QStringList m_relays = {
        QStringLiteral("wss://nos.lol"),
        QStringLiteral("wss://relay.damus.io"),
        QStringLiteral("wss://relay.nostr.band"),
    };
};

} // namespace ose
