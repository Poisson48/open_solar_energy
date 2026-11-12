#include <QtTest/QtTest>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QTemporaryDir>

#include "persist/catalog_store.h"
#include "persist/project_store.h"
#include "persist/snapshot_history.h"
#include "persist/sync_bundle.h"
#include "persist/sync_engine.h"
#include "persist/sync_paths.h"
#include "persist/sync_selection.h"
#include "persist/sync_transport.h"

using namespace ose;

class TstSync : public QObject {
    Q_OBJECT
private slots:
    void jsonPaths_roundtrip();
    void zipBundle_roundtrip();
    void merge_siteSurvey_only();
    void build_apply_selective();
    void usb_transport_file_roundtrip();
};

void TstSync::jsonPaths_roundtrip()
{
    QJsonObject root;
    jsonSetPath(root, QStringLiteral("siteSurvey"), QJsonObject{{QStringLiteral("annualLossPct"), 12.5}});
    jsonSetPath(root, QStringLiteral("formState.tilt"), 30);
    QCOMPARE(jsonGetPath(root, QStringLiteral("formState.tilt")).toDouble(), 30.0);
    QCOMPARE(jsonGetPath(root, QStringLiteral("siteSurvey")).toObject()
                 .value(QStringLiteral("annualLossPct"))
                 .toDouble(),
             12.5);
}

void TstSync::zipBundle_roundtrip()
{
    SyncBundle b;
    b.put(QStringLiteral("manifest.json"), QByteArrayLiteral("{\"version\":1}"));
    b.put(QStringLiteral("projects/p1.json"), QByteArrayLiteral("{\"id\":\"p1\"}"));
    const QByteArray zip = b.toZipBytes();
    QVERIFY(zip.size() > 40);

    SyncBundle b2;
    QVERIFY(b2.fromZipBytes(zip));
    QVERIFY(b2.contains(QStringLiteral("manifest.json")));
    QCOMPARE(b2.get(QStringLiteral("projects/p1.json")), QByteArrayLiteral("{\"id\":\"p1\"}"));
}

void TstSync::merge_siteSurvey_only()
{
    QJsonObject dest{
        {QStringLiteral("id"), QStringLiteral("proj_a")},
        {QStringLiteral("name"), QStringLiteral("Local")},
        {QStringLiteral("formState"), QJsonObject{{QStringLiteral("tilt"), 20}}},
        {QStringLiteral("siteSurvey"), QJsonObject{{QStringLiteral("annualLossPct"), 1}}},
    };
    QJsonObject src{
        {QStringLiteral("id"), QStringLiteral("proj_a")},
        {QStringLiteral("name"), QStringLiteral("Remote")},
        {QStringLiteral("formState"), QJsonObject{{QStringLiteral("tilt"), 35}}},
        {QStringLiteral("siteSurvey"),
         QJsonObject{{QStringLiteral("annualLossPct"), 42},
                     {QStringLiteral("points"), QJsonArray{QJsonObject{{QStringLiteral("az"), 180}}}}}},
    };
    const QJsonObject m =
        SyncEngine::mergeProjectGroups(dest, src, {QString::fromUtf8(SyncGroup::SiteSurvey)});
    QCOMPARE(m.value(QStringLiteral("name")).toString(), QStringLiteral("Local"));
    QCOMPARE(m.value(QStringLiteral("formState")).toObject().value(QStringLiteral("tilt")).toDouble(),
             20.0);
    QCOMPARE(m.value(QStringLiteral("siteSurvey")).toObject().value(QStringLiteral("annualLossPct")).toDouble(),
             42.0);
    QCOMPARE(m.value(QStringLiteral("siteSurvey")).toObject().value(QStringLiteral("points")).toArray().size(),
             1);
}

void TstSync::build_apply_selective()
{
    QTemporaryDir tmp;
    QVERIFY(tmp.isValid());
    qputenv("XDG_DATA_HOME", tmp.path().toUtf8());

    ProjectStore projects;
    CatalogStore catalog;
    SnapshotHistory history;
    // Force AppData under tmp via QStandardPaths — organization already set by test app
    QCoreApplication::setOrganizationName(QStringLiteral("OpenSolarEnergy"));
    QCoreApplication::setApplicationName(QStringLiteral("OpenSolarEnergyTestSync"));

    projects.load();
    catalog.load();

    const QString id = projects.createProject(QStringLiteral("Claire"), QStringLiteral("grid"),
                                              QStringLiteral("Test"));
    QVERIFY(!id.isEmpty());
    QJsonObject remoteSite{{QStringLiteral("annualLossPct"), 55},
                           {QStringLiteral("source"), QStringLiteral("horizon")}};
    QVERIFY(projects.updateCurrent(
        {{QStringLiteral("siteSurvey"), remoteSite.toVariantMap()},
         {QStringLiteral("name"), QStringLiteral("Claire-Phone")}}));

    SyncEngine engine;
    engine.setStores(&projects, &catalog, &history);

    QVariantMap sel;
    sel.insert(QStringLiteral("catalogsPanels"), false);
    sel.insert(QStringLiteral("catalogsInverters"), false);
    QVariantMap entry;
    entry.insert(QStringLiteral("groups"), QStringList{QString::fromUtf8(SyncGroup::SiteSurvey)});
    entry.insert(QStringLiteral("history"), false);
    sel.insert(QStringLiteral("projects"), QVariantMap{{id, entry}});

    const QByteArray zip = engine.buildBundle(sel);
    QVERIFY(!zip.isEmpty());

    // Simule PC local différent
    QVERIFY(projects.updateCurrent(
        {{QStringLiteral("siteSurvey"), QVariantMap{{QStringLiteral("annualLossPct"), 2}}},
         {QStringLiteral("name"), QStringLiteral("Claire-PC")}}));

    QVERIFY(engine.applyBundle(zip, sel));
    const QJsonObject after = projects.projectObject(id);
    QCOMPARE(after.value(QStringLiteral("name")).toString(), QStringLiteral("Claire-PC"));
    QCOMPARE(after.value(QStringLiteral("siteSurvey")).toObject().value(QStringLiteral("annualLossPct")).toDouble(),
             55.0);
}

void TstSync::usb_transport_file_roundtrip()
{
    QTemporaryDir tmp;
    QVERIFY(tmp.isValid());
    UsbFileTransport tr;
    tr.setSyncDirOverride(tmp.path() + QStringLiteral("/sync"));
    QVERIFY(tr.available());

    const QByteArray payload = QByteArrayLiteral("PK\x03\x04fake-zip-payload-for-test");
    QVERIFY(tr.sendBundle(payload, true)); // to phone
    QCOMPARE(tr.receiveBundle(false), payload); // from pc perspective on shared folder

    const QByteArray payload2 = QByteArrayLiteral("PK\x03\x04from-phone-side");
    QVERIFY(tr.sendBundle(payload2, false)); // to pc
    QCOMPARE(tr.receiveBundle(true), payload2);
}

QTEST_MAIN(TstSync)
#include "tst_sync.moc"
