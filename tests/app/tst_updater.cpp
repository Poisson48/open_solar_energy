#include "app/updater.h"

#include <QCoreApplication>
#include <QFile>
#include <QRegularExpression>
#include <QTest>
#include <QtGlobal>

#include <cmath>

using app::Updater;

class TstUpdater : public QObject {
    Q_OBJECT
private slots:
    void isNewer_basic();
    void notesFromBody_stopsAtSeparator();
    void qml_banner_on_android_and_hub_startUpdate();
    void versions_aligned_manifest_cmake_release();
    void release_workflow_publishes_apk_and_appimage();
};

void TstUpdater::isNewer_basic()
{
    QVERIFY(Updater::isNewer(QStringLiteral("2.0.73"), QStringLiteral("2.0.69")));
    QVERIFY(!Updater::isNewer(QStringLiteral("2.0.69"), QStringLiteral("2.0.73")));
    QVERIFY(Updater::isNewer(QStringLiteral("v2.0.73"), QStringLiteral("2.0.69")));
    QVERIFY(!Updater::isNewer(QStringLiteral("2.0.73"), QStringLiteral("2.0.73")));
    QVERIFY(Updater::isNewer(QStringLiteral("2.1.0"), QStringLiteral("2.0.99")));
    QVERIFY(Updater::isNewer(QStringLiteral("3.0.0"), QStringLiteral("2.9.9")));
    QVERIFY(!Updater::isNewer(QStringLiteral(""), QStringLiteral("1.0.0")));
}

void TstUpdater::notesFromBody_stopsAtSeparator()
{
    const QString body = QStringLiteral(
        "## Correctifs\n"
        "- bandeau MAJ Android\n"
        "\n"
        "---\n"
        "\n"
        "## Installation\n"
        "ignore moi\n");
    const QString notes = Updater::notesFromBody(body);
    QVERIFY(notes.contains(QStringLiteral("bandeau MAJ Android")));
    QVERIFY(!notes.contains(QStringLiteral("Installation")));
}

static QString readSource(const QString& rel)
{
    const QString root = QStringLiteral(OSE_SOURCE_DIR);
    QFile f(root + QLatin1Char('/') + rel);
    if (!f.open(QIODevice::ReadOnly | QIODevice::Text))
        return {};
    return QString::fromUtf8(f.readAll());
}

void TstUpdater::qml_banner_on_android_and_hub_startUpdate()
{
    const QString main = readSource(QStringLiteral("src/qml/Main.qml"));
    QVERIFY2(!main.isEmpty(), "Main.qml introuvable");
    QVERIFY2(main.contains(QStringLiteral("id: updateBanner")), "bandeau updateBanner");
    // Visible PC + Android (pas de garde desktop-only sur le bandeau)
    QVERIFY2(main.contains(QStringLiteral(
                 "visible: Updater.updateAvailable || Updater.downloading || Updater.readyToInstall\n"
                 "                     || Updater.failed")),
             "bandeau visible aussi sur Android");
    QVERIFY2(!QRegularExpression(
                 QStringLiteral("id:\\s*updateBanner[\\s\\S]{0,400}Qt\\.platform\\.os\\s*!==\\s*\"android\""))
                  .match(main)
                  .hasMatch(),
             "bandeau ne doit plus être desktop-only");
    QVERIFY2(main.contains(QStringLiteral("pollNativeInstallStatus")),
             "Timer poll PackageInstaller Android");
    QVERIFY2(main.contains(QStringLiteral("Updater.check()")),
             "vérif auto au démarrage");
    QVERIFY2(main.contains(QStringLiteral("Updater.failed")),
             "utilise Updater.failed (pas state===5)");
    QVERIFY2(!main.contains(QStringLiteral("Updater.state === 5")),
             "ne plus comparer state===5");

    const QString hub = readSource(QStringLiteral("src/qml/HubView.qml"));
    QVERIFY2(!hub.isEmpty(), "HubView.qml introuvable");
    QVERIFY2(hub.contains(QStringLiteral("Updater.startUpdate()")),
             "Hub « Mises à jour » → startUpdate");
    QVERIFY2(!QRegularExpression(QStringLiteral("Mises à jour[\\s\\S]*Updater\\.check\\(\\)"))
                  .match(hub)
                  .hasMatch(),
             "Hub ne doit plus appeler seulement check()");
}

void TstUpdater::versions_aligned_manifest_cmake_release()
{
    const QString cmakeSrc = readSource(QStringLiteral("src/CMakeLists.txt"));
    const QString man = readSource(QStringLiteral("android/AndroidManifest.xml"));
    const QString rootCmake = readSource(QStringLiteral("CMakeLists.txt"));
    QVERIFY(!cmakeSrc.isEmpty() && !man.isEmpty() && !rootCmake.isEmpty());

    const auto capt = [](const QString& text, const QString& re) -> QString {
        const QRegularExpression rx(re);
        const auto m = rx.match(text);
        return m.hasMatch() ? m.captured(1) : QString();
    };

    const QString nameCmake =
        capt(cmakeSrc, QStringLiteral("OSE_VERSION_NAME\\s+\"([0-9.]+)\""));
    const QString codeCmake =
        capt(cmakeSrc, QStringLiteral("OSE_VERSION_CODE\\s+\"([0-9]+)\""));
    const QString nameMan =
        capt(man, QStringLiteral("android:versionName=\"([0-9.]+)\""));
    const QString codeMan =
        capt(man, QStringLiteral("android:versionCode=\"([0-9]+)\""));
    const QString nameRoot =
        capt(rootCmake, QStringLiteral("project\\(opensolarenergy\\s+VERSION\\s+([0-9.]+)"));

    QVERIFY2(!nameCmake.isEmpty(), "OSE_VERSION_NAME");
    QCOMPARE(nameMan, nameCmake);
    QCOMPARE(codeMan, codeCmake);
    QCOMPARE(nameRoot, nameCmake);

    const auto parts = nameCmake.split(QLatin1Char('.'));
    QVERIFY(parts.size() >= 3);
    const int expectedCode = parts[0].toInt() * 10000 + parts[1].toInt() * 100 + parts[2].toInt();
    QCOMPARE(codeCmake.toInt(), expectedCode);

    QVERIFY(man.contains(QStringLiteral("InstallCallbackActivity")));
    QVERIFY(man.contains(QStringLiteral("ApkFileProvider")));
    QVERIFY(man.contains(QStringLiteral("REQUEST_INSTALL_PACKAGES")));

    QCOMPARE(QStringLiteral(OSE_APP_VERSION), nameCmake);
}

void TstUpdater::release_workflow_publishes_apk_and_appimage()
{
    const QString release = readSource(QStringLiteral(".github/workflows/release.yml"));
    const QString android = readSource(QStringLiteral(".github/workflows/android.yml"));
    const QString desktop = readSource(QStringLiteral(".github/workflows/desktop.yml"));
    const QString ci = readSource(QStringLiteral(".github/workflows/ci.yml"));
    QVERIFY(!release.isEmpty() && !android.isEmpty() && !desktop.isEmpty() && !ci.isEmpty());

    QVERIFY2(!release.contains(QStringLiteral("git rev-list --count HEAD")),
             "versionCode marketing, pas git rev-list");
    QVERIFY(release.contains(QStringLiteral("10000")));
    QVERIFY(release.contains(QStringLiteral("opensolarenergy-${TAG}-arm64.apk")));
    QVERIFY(release.contains(QStringLiteral("OpenSolarEnergy-*-x86_64.AppImage")));
    QVERIFY(release.contains(QStringLiteral("gh release")));

    QVERIFY(android.contains(QStringLiteral("opensolarenergy-arm64.apk"))
            || android.contains(QStringLiteral("build-android")));
    QVERIFY(desktop.contains(QStringLiteral("build-appimage.sh")));
    QVERIFY(desktop.contains(QStringLiteral("ctest")));

    // CI validate doit exécuter ctest (inclut tst_updater)
    QVERIFY2(ci.contains(QStringLiteral("ctest")), "ci.yml lance ctest");

    const QString plat =
        readSource(QStringLiteral("android/src/org/opensolarenergy/app/Platform.java"));
    QVERIFY(plat.contains(QStringLiteral("PendingIntent.getActivity")));
    QVERIFY(plat.contains(QStringLiteral("installApkWithViewIntent")));
    QVERIFY(plat.contains(QStringLiteral("retryPendingInstallIfReady")));
}

QTEST_MAIN(TstUpdater)
#include "tst_updater.moc"
