#include "platform.h"

#ifdef Q_OS_ANDROID
#  include <QCoreApplication>
#  include <QGuiApplication>
#  include <QJniEnvironment>
#  include <QJniObject>
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

#else

void initNotifications() {}
bool platformNotify(const QString&, const QString&, qint64) { return false; }
bool platformShare(const QString&) { return false; }
bool platformShareFile(const QString&, const QString&, const QByteArray&) { return false; }
bool platformPickImportFile() { return false; }
QString platformPollImportResult() { return {}; }
bool platformInstallApk(const QString&) { return false; }
QString platformPollInstallStatus() { return {}; }
void platformVibrate(int) {}
void platformKeepScreenOn(bool) {}
bool platformRequestCameraPermission() { return false; }
QString platformPollCameraPermission() { return {}; }
bool platformHasCameraPermission() { return false; }

#endif

} // namespace app
