#include "webhost.h"

#include <QDebug>
#include <QFile>
#include <QFileInfo>
#include <QTcpSocket>
#include <QUrl>

namespace app {

WebHost::WebHost(QObject* parent) : QObject(parent)
{
    connect(&m_server, &QTcpServer::newConnection, this, &WebHost::onNewConnection);
}

WebHost::~WebHost()
{
    m_server.close();
}

bool WebHost::start(const QString& webRoot)
{
    if (!webRoot.isEmpty()) {
        m_webRoot = QFileInfo(webRoot).canonicalFilePath();
        m_useQrc = false;
        if (m_webRoot.isEmpty() || !QFile::exists(m_webRoot + QStringLiteral("/index.html"))) {
            m_useQrc = true;
            m_webRoot.clear();
        }
    } else {
        m_useQrc = true;
        m_webRoot.clear();
    }
    if (m_useQrc && !QFile::exists(QStringLiteral(":/web/index.html"))) {
        qCritical("WebHost: index.html introuvable (ni disque ni :/web/)");
        return false;
    }
    if (m_server.isListening())
        return true;
    // Port fixe obligatoire : localStorage WebView est lié à l’origine (hôte+port).
    // Un port éphémère à chaque lancement effaçait tous les projets Android.
    static constexpr quint16 kFixedPort = 18765;
    if (!m_server.listen(QHostAddress::LocalHost, kFixedPort)) {
        qCritical("WebHost: impossible d'écouter sur 127.0.0.1:%u", kFixedPort);
        return false;
    }
    m_port = m_server.serverPort();
    return m_port > 0;
}

QUrl WebHost::baseUrl() const
{
    return QUrl(QStringLiteral("http://127.0.0.1:%1/index.html").arg(m_port));
}

QByteArray WebHost::readAsset(const QString& path) const
{
    if (!m_useQrc && !m_webRoot.isEmpty()) {
        QFile f(m_webRoot + path);
        if (f.open(QIODevice::ReadOnly))
            return f.readAll();
    }
    QFile f(QStringLiteral(":/web") + path);
    if (f.open(QIODevice::ReadOnly))
        return f.readAll();
    return {};
}

void WebHost::onNewConnection()
{
    while (QTcpSocket* socket = m_server.nextPendingConnection()) {
        connect(socket, &QTcpSocket::readyRead, this, [this, socket]() {
            handleRequest(socket, socket->readAll());
            socket->disconnectFromHost();
        });
    }
}

QByteArray WebHost::mimeType(const QString& path)
{
    if (path.endsWith(QStringLiteral(".html"))) return "text/html; charset=utf-8";
    if (path.endsWith(QStringLiteral(".css")))  return "text/css; charset=utf-8";
    if (path.endsWith(QStringLiteral(".js")))   return "application/javascript; charset=utf-8";
    if (path.endsWith(QStringLiteral(".json"))) return "application/json; charset=utf-8";
    if (path.endsWith(QStringLiteral(".svg")))  return "image/svg+xml";
    if (path.endsWith(QStringLiteral(".png")))  return "image/png";
    return "application/octet-stream";
}

void WebHost::handleRequest(QTcpSocket* socket, const QByteArray& request)
{
    const int lineEnd = request.indexOf("\r\n");
    if (lineEnd < 0) {
        socket->write("HTTP/1.1 400 Bad Request\r\n\r\n");
        return;
    }
    const QString line = QString::fromUtf8(request.left(lineEnd));
    const QStringList parts = line.split(' ');
    if (parts.size() < 2 || parts[0] != QStringLiteral("GET")) {
        socket->write("HTTP/1.1 405 Method Not Allowed\r\n\r\n");
        return;
    }
    QString path = QUrl::fromPercentEncoding(parts[1].toUtf8());
    // Ignorer ?v=… / #… (cache-busting HTML) — sinon 404 sur project_ui.js?v=3 etc.
    const int q = path.indexOf(QLatin1Char('?'));
    if (q >= 0)
        path = path.left(q);
    const int hash = path.indexOf(QLatin1Char('#'));
    if (hash >= 0)
        path = path.left(hash);
    if (path == QStringLiteral("/"))
        path = QStringLiteral("/index.html");
    if (path.contains(QStringLiteral(".."))) {
        socket->write("HTTP/1.1 403 Forbidden\r\n\r\n");
        return;
    }
    const QByteArray body = readAsset(path);
    if (body.isEmpty()) {
        socket->write("HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n");
        return;
    }
    const QByteArray header = QByteArray("HTTP/1.1 200 OK\r\nContent-Type: ")
        + mimeType(path) + "\r\nContent-Length: " + QByteArray::number(body.size())
        + "\r\nConnection: close\r\n\r\n";
    socket->write(header + body);
}

} // namespace app
