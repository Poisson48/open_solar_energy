#include "platform.h"

#ifdef Q_OS_ANDROID
#  include <QCoreApplication>
#  include <QEventLoop>
#  include <QGuiApplication>
#  include <QJniEnvironment>
#  include <QJniObject>
#  include <QTimer>
#else
#  include <QDesktopServices>
#  include <QDir>
#  include <QEventLoop>
#  include <QFile>
#  include <QNetworkAccessManager>
#  include <QNetworkReply>
#  include <QNetworkRequest>
#  include <QRegularExpression>
#  include <QStandardPaths>
#  include <QUrl>
#endif

namespace app {

#ifdef Q_OS_ANDROID

namespace {

constexpr const char* kPlatformClass = "org/opensolarenergy/app/Platform";

QJniObject androidContext()
{
    return QJniObject{ QNativeInterface::QAndroidApplication::context() };
}

jbyteArray toJByteArray(JNIEnv* env, const QByteArray& data)
{
    jbyteArray arr = env->NewByteArray(static_cast<jsize>(data.size()));
    if (!arr)
        return nullptr;
    env->SetByteArrayRegion(arr, 0, static_cast<jsize>(data.size()),
                            reinterpret_cast<const jbyte*>(data.constData()));
    return arr;
}

} // namespace

void initNotifications()
{
    const QJniObject ctx = androidContext();
    if (!ctx.isValid())
        return;
}

bool platformNotify(const QString&, const QString&, qint64) { return false; }

bool platformShare(const QString& text)
{
    const QJniObject ctx = androidContext();
    if (!ctx.isValid())
        return false;
    const QJniObject jText = QJniObject::fromString(text);
    return QJniObject::callStaticMethod<jboolean>(
        kPlatformClass, "shareText",
        "(Landroid/content/Context;Ljava/lang/String;)Z",
        ctx.object(), jText.object<jstring>());
}

bool platformShareFile(const QString& filename, const QString& mime, const QByteArray& data)
{
    const QJniObject ctx = androidContext();
    if (!ctx.isValid())
        return false;
    QJniEnvironment jni;
    JNIEnv* env = jni.jniEnv();
    if (!env)
        return false;
    jbyteArray jData = toJByteArray(env, data);
    if (!jData)
        return false;
    const QJniObject jName = QJniObject::fromString(filename);
    const QJniObject jMime = QJniObject::fromString(mime);
    const jboolean ok = QJniObject::callStaticMethod<jboolean>(
        kPlatformClass, "shareFile",
        "(Landroid/content/Context;Ljava/lang/String;Ljava/lang/String;[B)Z",
        ctx.object(), jName.object<jstring>(), jMime.object<jstring>(), jData);
    env->DeleteLocalRef(jData);
    return ok;
}

bool platformOpenPdf(const QString& filename, const QByteArray& data)
{
    const QJniObject ctx = androidContext();
    if (!ctx.isValid())
        return false;
    QJniEnvironment jni;
    JNIEnv* env = jni.jniEnv();
    if (!env)
        return false;
    jbyteArray jData = toJByteArray(env, data);
    if (!jData)
        return false;
    const QJniObject jName = QJniObject::fromString(filename);
    const jboolean ok = QJniObject::callStaticMethod<jboolean>(
        kPlatformClass, "openPdf",
        "(Landroid/content/Context;Ljava/lang/String;[B)Z",
        ctx.object(), jName.object<jstring>(), jData);
    env->DeleteLocalRef(jData);
    return ok;
}

bool platformOpenPdfFromUrl(const QString& url)
{
    const QJniObject ctx = androidContext();
    if (!ctx.isValid())
        return false;
    const QJniObject jUrl = QJniObject::fromString(url);
    return QJniObject::callStaticMethod<jboolean>(
        kPlatformClass, "openPdfFromUrl",
        "(Landroid/content/Context;Ljava/lang/String;)Z",
        ctx.object(), jUrl.object<jstring>());
}

bool platformPickImportFile()
{
    const QJniObject ctx = androidContext();
    if (!ctx.isValid())
        return false;
    return QJniObject::callStaticMethod<jboolean>(
        kPlatformClass, "pickImportFile",
        "(Landroid/content/Context;)Z", ctx.object());
}

QString platformPollImportResult()
{
    const QJniObject r = QJniObject::callStaticObjectMethod(
        kPlatformClass, "pollImportResult", "()Ljava/lang/String;");
    if (!r.isValid())
        return {};
    return r.toString();
}

bool platformInstallApk(const QString& apkPath)
{
    const QJniObject ctx = androidContext();
    if (!ctx.isValid())
        return false;
    const QJniObject jPath = QJniObject::fromString(apkPath);
    return QJniObject::callStaticMethod<jboolean>(
        kPlatformClass, "installApk",
        "(Landroid/content/Context;Ljava/lang/String;)Z",
        ctx.object(), jPath.object<jstring>());
}

bool platformEnsureInstallPermission()
{
    const QJniObject ctx = androidContext();
    if (!ctx.isValid())
        return false;
    return QJniObject::callStaticMethod<jboolean>(
        kPlatformClass, "ensureInstallPermission",
        "(Landroid/content/Context;)Z", ctx.object());
}

QString platformPollInstallStatus()
{
    const QJniObject r = QJniObject::callStaticObjectMethod(
        kPlatformClass, "pollInstallStatus", "()Ljava/lang/String;");
    if (!r.isValid())
        return {};
    return r.toString();
}

void platformVibrate(int ms)
{
    const QJniObject ctx = androidContext();
    if (!ctx.isValid())
        return;
    QJniObject::callStaticMethod<void>(
        kPlatformClass, "vibrate",
        "(Landroid/content/Context;I)V", ctx.object(), static_cast<jint>(ms));
}

void platformKeepScreenOn(bool on)
{
    const QJniObject ctx = androidContext();
    if (!ctx.isValid())
        return;
    QJniObject::callStaticMethod<void>(
        kPlatformClass, "keepScreenOn",
        "(Landroid/content/Context;Z)V", ctx.object(), static_cast<jboolean>(on));
}

bool platformRequestCameraPermission()
{
    const QJniObject ctx = androidContext();
    if (!ctx.isValid())
        return false;
    return QJniObject::callStaticMethod<jboolean>(
        kPlatformClass, "requestCameraPermission",
        "(Landroid/content/Context;)Z", ctx.object());
}

QString platformPollCameraPermission()
{
    const QJniObject r = QJniObject::callStaticObjectMethod(
        kPlatformClass, "pollCameraPermission", "()Ljava/lang/String;");
    if (!r.isValid())
        return {};
    return r.toString();
}

bool platformHasCameraPermission()
{
    const QJniObject ctx = androidContext();
    if (!ctx.isValid())
        return false;
    return QJniObject::callStaticMethod<jboolean>(
        kPlatformClass, "hasCameraPermission",
        "(Landroid/content/Context;)Z", ctx.object());
}

bool platformRequestBluetoothPermission()
{
    const QJniObject ctx = androidContext();
    if (!ctx.isValid())
        return false;
    return QJniObject::callStaticMethod<jboolean>(
        kPlatformClass, "requestBluetoothPermission",
        "(Landroid/content/Context;)Z", ctx.object());
}

QString platformPollBluetoothPermission()
{
    const QJniObject r = QJniObject::callStaticObjectMethod(
        kPlatformClass, "pollBluetoothPermission", "()Ljava/lang/String;");
    if (!r.isValid())
        return {};
    return r.toString();
}

bool platformHasBluetoothPermission()
{
    const QJniObject ctx = androidContext();
    if (!ctx.isValid())
        return false;
    return QJniObject::callStaticMethod<jboolean>(
        kPlatformClass, "hasBluetoothPermission",
        "(Landroid/content/Context;)Z", ctx.object());
}

bool platformEnsureBluetoothPermissions()
{
    if (platformHasBluetoothPermission())
        return true;
    if (!platformRequestBluetoothPermission())
        return false;
    if (platformHasBluetoothPermission())
        return true;

    bool granted = false;
    QEventLoop loop;
    QTimer poll;
    poll.setInterval(200);
    QObject::connect(&poll, &QTimer::timeout, &loop, [&]() {
        const QString s = platformPollBluetoothPermission();
        if (s == QLatin1String("granted")) {
            granted = true;
            loop.quit();
        } else if (s == QLatin1String("denied") || s == QLatin1String("unavailable")) {
            granted = false;
            loop.quit();
        } else if (platformHasBluetoothPermission()) {
            granted = true;
            loop.quit();
        }
    });
    QTimer::singleShot(60000, &loop, &QEventLoop::quit);
    poll.start();
    loop.exec();
    return granted || platformHasBluetoothPermission();
}

bool platformRequestBluetoothDiscoverable(int seconds)
{
    const QJniObject ctx = androidContext();
    if (!ctx.isValid())
        return false;
    return QJniObject::callStaticMethod<jboolean>(
        kPlatformClass, "requestBluetoothDiscoverable",
        "(Landroid/content/Context;I)Z", ctx.object(), static_cast<jint>(seconds));
}

bool platformIsBluetoothDiscoverable()
{
    const QJniObject ctx = androidContext();
    if (!ctx.isValid())
        return false;
    return QJniObject::callStaticMethod<jboolean>(
        kPlatformClass, "isBluetoothDiscoverable",
        "(Landroid/content/Context;)Z", ctx.object());
}

bool platformEnsureBluetoothOn()
{
    // Sur Android, power on via Adaptateur est géré par Qt / permissions.
    return true;
}

QString platformSyncDocumentsDir()
{
    const QJniObject ctx = androidContext();
    if (!ctx.isValid())
        return {};
    const QJniObject r = QJniObject::callStaticObjectMethod(
        kPlatformClass, "syncDocumentsDir",
        "(Landroid/content/Context;)Ljava/lang/String;", ctx.object());
    if (!r.isValid())
        return {};
    return r.toString();
}

bool platformPublishSyncFile(const QString& filename, const QByteArray& data)
{
    const QJniObject ctx = androidContext();
    if (!ctx.isValid())
        return false;
    QJniEnvironment jni;
    JNIEnv* env = jni.jniEnv();
    if (!env)
        return false;
    jbyteArray jData = toJByteArray(env, data);
    if (!jData)
        return false;
    const QJniObject jName = QJniObject::fromString(filename);
    const jboolean ok = QJniObject::callStaticMethod<jboolean>(
        kPlatformClass, "publishSyncFile",
        "(Landroid/content/Context;Ljava/lang/String;[B)Z",
        ctx.object(), jName.object<jstring>(), jData);
    env->DeleteLocalRef(jData);
    return ok;
}

QByteArray platformReadSyncFile(const QString& filename)
{
    const QJniObject ctx = androidContext();
    if (!ctx.isValid())
        return {};
    const QJniObject jName = QJniObject::fromString(filename);
    const QJniObject r = QJniObject::callStaticObjectMethod(
        kPlatformClass, "readSyncFile",
        "(Landroid/content/Context;Ljava/lang/String;)[B",
        ctx.object(), jName.object<jstring>());
    if (!r.isValid())
        return {};
    QJniEnvironment jni;
    JNIEnv* env = jni.jniEnv();
    if (!env)
        return {};
    const auto arr = static_cast<jbyteArray>(r.object());
    const jsize n = env->GetArrayLength(arr);
    QByteArray out;
    out.resize(n);
    env->GetByteArrayRegion(arr, 0, n, reinterpret_cast<jbyte*>(out.data()));
    return out;
}

#else

void initNotifications() {}
bool platformNotify(const QString&, const QString&, qint64) { return false; }
bool platformShare(const QString&) { return false; }
bool platformShareFile(const QString&, const QString&, const QByteArray&) { return false; }
bool platformOpenPdf(const QString& filename, const QByteArray& data)
{
    if (data.isEmpty())
        return false;
    QString safe = filename;
    safe.replace(QRegularExpression(QStringLiteral("[^a-zA-Z0-9._\\-]")), QStringLiteral("_"));
    if (safe.isEmpty())
        safe = QStringLiteral("fiche.pdf");
    if (!safe.endsWith(QStringLiteral(".pdf"), Qt::CaseInsensitive))
        safe += QStringLiteral(".pdf");
    const QString dir = QStandardPaths::writableLocation(QStandardPaths::TempLocation)
        + QStringLiteral("/ose_pdf");
    QDir().mkpath(dir);
    const QString path = dir + QLatin1Char('/') + safe;
    QFile f(path);
    if (!f.open(QIODevice::WriteOnly))
        return false;
    f.write(data);
    f.close();
    return QDesktopServices::openUrl(QUrl::fromLocalFile(path));
}
bool platformOpenPdfFromUrl(const QString& url)
{
    if (!url.startsWith(QStringLiteral("http://")) && !url.startsWith(QStringLiteral("https://")))
        return false;
    QNetworkAccessManager nam;
    QNetworkRequest req{QUrl(url)};
    req.setHeader(QNetworkRequest::UserAgentHeader, QStringLiteral("OpenSolarEnergy/2.0"));
    QNetworkReply* reply = nam.get(req);
    QEventLoop loop;
    QObject::connect(reply, &QNetworkReply::finished, &loop, &QEventLoop::quit);
    loop.exec();
    if (reply->error() != QNetworkReply::NoError) {
        reply->deleteLater();
        return false;
    }
    const QByteArray data = reply->readAll();
    reply->deleteLater();
    if (data.size() < 5 || !data.startsWith("%PDF"))
        return false;
    const QString name = QStringLiteral("fiche_%1.pdf")
        .arg(qHash(url), 0, 16);
    return platformOpenPdf(name, data);
}
bool platformPickImportFile() { return false; }
QString platformPollImportResult() { return {}; }
bool platformInstallApk(const QString&) { return false; }
bool platformEnsureInstallPermission() { return true; }
QString platformPollInstallStatus() { return {}; }
void platformVibrate(int) {}
void platformKeepScreenOn(bool) {}
bool platformRequestCameraPermission() { return false; }
QString platformPollCameraPermission() { return {}; }
bool platformHasCameraPermission() { return false; }
bool platformRequestBluetoothPermission() { return true; }
QString platformPollBluetoothPermission() { return QStringLiteral("granted"); }
bool platformHasBluetoothPermission() { return true; }
bool platformEnsureBluetoothPermissions() { return true; }
bool platformRequestBluetoothDiscoverable(int) { return true; }
bool platformIsBluetoothDiscoverable() { return true; }
bool platformEnsureBluetoothOn() { return true; }

QString platformSyncDocumentsDir()
{
    return QStandardPaths::writableLocation(QStandardPaths::DocumentsLocation)
           + QStringLiteral("/OpenSolarEnergy/sync");
}

bool platformPublishSyncFile(const QString& filename, const QByteArray& data)
{
    const QString dir = platformSyncDocumentsDir();
    QDir().mkpath(dir);
    QFile f(dir + QLatin1Char('/') + filename);
    if (!f.open(QIODevice::WriteOnly | QIODevice::Truncate))
        return false;
    return f.write(data) == data.size();
}

QByteArray platformReadSyncFile(const QString& filename)
{
    QFile f(platformSyncDocumentsDir() + QLatin1Char('/') + filename);
    if (!f.open(QIODevice::ReadOnly))
        return {};
    return f.readAll();
}

#endif

} // namespace app
