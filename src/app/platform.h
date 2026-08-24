#pragma once

#include <QString>

namespace app {

void initNotifications();
bool platformNotify(const QString& title, const QString& body, qint64 whenMs = 0);
bool platformShare(const QString& text);
bool platformInstallApk(const QString& apkPath);
void platformVibrate(int ms);
void platformKeepScreenOn(bool on);

} // namespace app
