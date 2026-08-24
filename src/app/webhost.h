#pragma once

#include <QObject>
#include <QTcpServer>
#include <QString>
#include <QUrl>

namespace app {

class WebHost : public QObject {
    Q_OBJECT
public:
    explicit WebHost(QObject* parent = nullptr);
    ~WebHost() override;

    /** webRoot vide → sert depuis les ressources Qt :/web/ */
    bool start(const QString& webRoot = QString());
    QUrl baseUrl() const;

private slots:
    void onNewConnection();

private:
    QString m_webRoot;
    bool m_useQrc = false;
    QTcpServer m_server;
    quint16 m_port = 0;

    QByteArray readAsset(const QString& path) const;
    void handleRequest(class QTcpSocket* socket, const QByteArray& request);
    static QByteArray mimeType(const QString& path);
};

} // namespace app
