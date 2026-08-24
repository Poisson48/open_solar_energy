#include "platform.h"

#ifdef Q_OS_ANDROID
#  include <QCoreApplication>
#  include <QJniObject>
#  include <QGuiApplication>
#endif

namespace app {

#ifdef Q_OS_ANDROID

namespace {

constexpr const char* kPlatformClass = "org/opensolarenergy/app/Platform";

QJniObject androidContext()
{
    return QJniObject{ QNativeInterface::QAndroidApplication::context() };
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

#else

void initNotifications() {}
bool platformNotify(const QString&, const QString&, qint64) { return false; }
bool platformShare(const QString&) { return false; }
bool platformInstallApk(const QString&) { return false; }
void platformVibrate(int) {}
void platformKeepScreenOn(bool) {}

#endif

} // namespace app
