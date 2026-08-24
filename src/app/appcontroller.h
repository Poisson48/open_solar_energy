#pragma once

#include <QObject>
#include <QUrl>

#include "updater.h"
#include "webbridge.h"
#include "webhost.h"

namespace app {

class AppController : public QObject {
    Q_OBJECT
    Q_PROPERTY(QUrl webUrl READ webUrl NOTIFY webUrlChanged)
    Q_PROPERTY(bool useWebEngine READ useWebEngine CONSTANT)
    Q_PROPERTY(WebBridge* bridge READ bridge CONSTANT)
    Q_PROPERTY(Updater* updater READ updater CONSTANT)

public:
    explicit AppController(QObject* parent = nullptr);
    bool init();

    QUrl webUrl() const { return m_webUrl; }
    bool useWebEngine() const { return m_useWebEngine; }
    WebBridge* bridge() { return &m_bridge; }
    Updater* updater() { return &m_updater; }

signals:
    void webUrlChanged();

private:
    QString resolveWebRoot() const;

    WebHost m_host;
    WebBridge m_bridge;
    Updater m_updater;
    QUrl m_webUrl;
    bool m_useWebEngine =
#ifdef OSE_HAS_WEBENGINE
        true;
#else
        false;
#endif
};

} // namespace app
