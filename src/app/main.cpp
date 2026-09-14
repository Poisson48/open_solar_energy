#include <QApplication>
#include <QGuiApplication>
#include <QIcon>
#include <QQmlApplicationEngine>
#include <QQmlContext>
#include <QQuickStyle>
#include <QDebug>
#include <QTimer>

#include "appcontroller.h"
#include "net/osm_tile_provider.h"
#include "platform.h"
#include "theme.h"

int main(int argc, char* argv[])
{
    const bool selfTest = [&]() {
        for (int i = 1; i < argc; ++i) {
            if (QString::fromLocal8Bit(argv[i]) == QLatin1String("--self-test"))
                return true;
        }
        return false;
    }();
    const bool gridProof = [&]() {
        for (int i = 1; i < argc; ++i) {
            if (QString::fromLocal8Bit(argv[i]) == QLatin1String("--grid-proof"))
                return true;
        }
        return false;
    }();
    const bool btHost = [&]() {
        for (int i = 1; i < argc; ++i) {
            if (QString::fromLocal8Bit(argv[i]) == QLatin1String("--bt-host"))
                return true;
        }
        return false;
    }();
    const bool btCatalog = [&]() {
        for (int i = 1; i < argc; ++i) {
            if (QString::fromLocal8Bit(argv[i]) == QLatin1String("--bt-catalog"))
                return true;
        }
        return false;
    }();

    QApplication app(argc, argv);
    app.setOrganizationName(QStringLiteral("OpenSolarEnergy"));
    app.setApplicationName(QStringLiteral("OpenSolarEnergy"));
    app.setApplicationVersion(QStringLiteral(OSE_APP_VERSION));
    app.setWindowIcon(QIcon(QStringLiteral(":/packaging/open-solar-energy.png")));
    QQuickStyle::setStyle(QStringLiteral("Material"));

    app::initNotifications();

    app::Theme theme;
    app::AppController controller;
    if (!controller.init())
        return 1;

    if (selfTest) {
        const QVariantMap r = controller.runSelfTest();
        const bool ok = r.value(QStringLiteral("ok")).toBool();
        qInfo().noquote() << "[self-test]" << (ok ? "PASS" : "FAIL") << r;
        if (!ok) {
            const QVariantList errs = r.value(QStringLiteral("errors")).toList();
            for (const QVariant& e : errs)
                qCritical().noquote() << "  -" << e.toString();
        }
        return ok ? 0 : 2;
    }

    if (btHost || btCatalog) {
        auto* bt = controller.syncBluetooth();
        if (!bt) {
            qCritical() << "SyncBluetooth indisponible";
            return 3;
        }
        if (btHost) {
            if (!controller.syncSend({})) {
                qCritical().noquote() << "bt-host FAIL" << bt->lastError();
                return 4;
            }
            qInfo().noquote() << "bt-host OK — waiting 600s" << bt->status();
            QTimer::singleShot(600000, &app, &QCoreApplication::quit);
            return app.exec();
        }
        // --bt-catalog : scan + fetch remote tree
        const QVariantMap tree = controller.syncFetchRemoteCatalog();
        if (tree.isEmpty()) {
            qCritical().noquote() << "bt-catalog FAIL" << bt->lastError() << bt->status();
            return 5;
        }
        const QVariantList projects = tree.value(QStringLiteral("projects")).toList();
        qInfo().noquote() << "bt-catalog OK projects=" << projects.size();
        for (const QVariant& p : projects) {
            const QVariantMap m = p.toMap();
            qInfo().noquote() << " -" << m.value(QStringLiteral("id")).toString()
                              << m.value(QStringLiteral("name")).toString();
        }
        return 0;
    }

    QObject::connect(
        &app, &QGuiApplication::applicationStateChanged, &controller,
        [&controller](Qt::ApplicationState state) {
            Q_UNUSED(state);
            Q_UNUSED(controller);
            // MAJ uniquement sur demande (bouton Hub), pas à chaque focus fenêtre.
        });

    QQmlApplicationEngine engine;
    engine.addImageProvider(QStringLiteral("osm"), new ose::OsmTileProvider());

    engine.rootContext()->setContextProperty(QStringLiteral("AppController"), &controller);
    engine.rootContext()->setContextProperty(QStringLiteral("Theme"), &theme);
    engine.rootContext()->setContextProperty(QStringLiteral("Updater"), controller.updater());
    engine.rootContext()->setContextProperty(QStringLiteral("Projects"), controller.projects());
    engine.rootContext()->setContextProperty(QStringLiteral("SolarMath"), controller.solarMath());
    engine.rootContext()->setContextProperty(QStringLiteral("Finance"), controller.finance());
    engine.rootContext()->setContextProperty(QStringLiteral("CableCalc"), controller.cableCalc());
    engine.rootContext()->setContextProperty(QStringLiteral("Sizing"), controller.sizing());
    engine.rootContext()->setContextProperty(QStringLiteral("Offgrid"), controller.offgrid());
    engine.rootContext()->setContextProperty(QStringLiteral("Enedis"), controller.enedis());
    engine.rootContext()->setContextProperty(QStringLiteral("Inverter"), controller.inverter());
    engine.rootContext()->setContextProperty(QStringLiteral("Weather"), controller.weather());
    engine.rootContext()->setContextProperty(QStringLiteral("News"), controller.news());
    engine.rootContext()->setContextProperty(QStringLiteral("History"), controller.history());
    engine.rootContext()->setContextProperty(QStringLiteral("PdfExport"), controller.pdf());
    engine.rootContext()->setContextProperty(QStringLiteral("Share"), controller.share());
    engine.rootContext()->setContextProperty(QStringLiteral("SiteShade"), controller.siteShade());
    engine.rootContext()->setContextProperty(QStringLiteral("Hourly"), controller.hourly());
    engine.rootContext()->setContextProperty(QStringLiteral("Horizon"), controller.horizon());
    engine.rootContext()->setContextProperty(QStringLiteral("Catalog"), controller.catalog());
    engine.rootContext()->setContextProperty(QStringLiteral("Geocode"), controller.geocode());
    engine.rootContext()->setContextProperty(QStringLiteral("Pvgis"), controller.pvgis());
    engine.rootContext()->setContextProperty(QStringLiteral("Terrain"), controller.terrain());
    engine.rootContext()->setContextProperty(QStringLiteral("Pipeline"), controller.pipeline());
    engine.rootContext()->setContextProperty(QStringLiteral("Layout3D"), controller.layout3d());
    engine.rootContext()->setContextProperty(QStringLiteral("LayoutRoofs"), controller.layoutRoofs());
    engine.rootContext()->setContextProperty(QStringLiteral("ShadingEngine"), controller.shadingEngine());
    engine.rootContext()->setContextProperty(QStringLiteral("YearPv"), controller.yearPv());
    engine.rootContext()->setContextProperty(QStringLiteral("SyncEngine"), controller.syncEngine());
    engine.rootContext()->setContextProperty(QStringLiteral("SyncLan"), controller.syncLan());
    engine.rootContext()->setContextProperty(QStringLiteral("SyncBluetooth"), controller.syncBluetooth());
    engine.rootContext()->setContextProperty(QStringLiteral("SyncTransport"), controller.syncTransport());

    const QUrl url = gridProof
                         ? QUrl(QStringLiteral("qrc:/qt/qml/OpenSolarEnergy/qml/GridProof.qml"))
                         : QUrl(QStringLiteral("qrc:/qt/qml/OpenSolarEnergy/qml/Main.qml"));
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
