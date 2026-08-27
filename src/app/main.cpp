#include <QApplication>
#include <QGuiApplication>
#include <QIcon>
#include <QQmlApplicationEngine>
#include <QQmlContext>
#include <QQuickStyle>

#include "appcontroller.h"
#include "platform.h"
#include "theme.h"

#ifdef OSE_HAS_WEBENGINE
#  include <QtWebEngineQuick/qtwebenginequickglobal.h>
#  include <QWebEngineProfile>
#  include <QWebEngineSettings>
#endif

int main(int argc, char* argv[])
{
#ifdef OSE_HAS_WEBENGINE
    // Obligatoire avant QApplication ; ancre aussi le lien WebEngine (--as-needed).
    QCoreApplication::setAttribute(Qt::AA_ShareOpenGLContexts);
    QtWebEngineQuick::initialize();
#endif

    QApplication app(argc, argv);
    app.setOrganizationName(QStringLiteral("OpenSolarEnergy"));
    app.setApplicationName(QStringLiteral("OpenSolarEnergy"));
    app.setApplicationVersion(QStringLiteral(OSE_APP_VERSION));
    app.setWindowIcon(QIcon(QStringLiteral(":/web/packaging/open-solar-energy.png")));
    QQuickStyle::setStyle(QStringLiteral("Material"));

#ifdef OSE_HAS_WEBENGINE
    // Renforcer la persistance du profil par défaut (localStorage / IndexedDB).
    // Le WebEngineView utilise aussi un WebEngineProfile nommé dans QML.
    {
        QWebEngineProfile* profile = QWebEngineProfile::defaultProfile();
        profile->setPersistentCookiesPolicy(QWebEngineProfile::ForcePersistentCookies);
        profile->settings()->setAttribute(QWebEngineSettings::LocalStorageEnabled, true);
        profile->settings()->setAttribute(QWebEngineSettings::LocalContentCanAccessRemoteUrls, true);
    }
#endif

    app::initNotifications();

    app::Theme theme;
    app::AppController controller;
    if (!controller.init())
        return 1;

    QObject::connect(
        &app, &QGuiApplication::applicationStateChanged, &controller,
        [&controller](Qt::ApplicationState state) {
            if (state == Qt::ApplicationActive)
                controller.updater()->check();
        });

    QQmlApplicationEngine engine;
    engine.rootContext()->setContextProperty(QStringLiteral("AppController"), &controller);
    engine.rootContext()->setContextProperty(QStringLiteral("Theme"), &theme);
    engine.rootContext()->setContextProperty(QStringLiteral("Updater"), controller.updater());

    const QUrl url(QStringLiteral("qrc:/OpenSolarEnergy/qml/Main.qml"));
    QObject::connect(
        &engine, &QQmlApplicationEngine::objectCreated, &app,
        [url](QObject* obj, const QUrl& objUrl) {
            if (!obj && url == objUrl)
                QCoreApplication::exit(-1);
        },
        Qt::QueuedConnection);

    engine.load(url);
    return app.exec();
}
