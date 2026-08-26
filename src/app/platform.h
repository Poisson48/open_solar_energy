#pragma once

#include <QByteArray>
#include <QString>

namespace app {

void initNotifications();
bool platformNotify(const QString& title, const QString& body, qint64 whenMs = 0);
bool platformShare(const QString& text);
bool platformShareFile(const QString& filename, const QString& mime, const QByteArray& data);
/** Ouvre un PDF avec la visioneuse système (Android ACTION_VIEW / desktop). */
bool platformOpenPdf(const QString& filename, const QByteArray& data);
/** Télécharge un PDF (URL http) puis ouvre la visioneuse — contourne CORS WebView. */
bool platformOpenPdfFromUrl(const QString& url);
bool platformPickImportFile();
/** null si rien ; sinon "ok\\tname\\tbase64" ou "err\\tmessage" */
QString platformPollImportResult();
bool platformInstallApk(const QString& apkPath);
/** Dernier statut d'installation PackageInstaller (vide si rien). */
QString platformPollInstallStatus();
void platformVibrate(int ms);
void platformKeepScreenOn(bool on);
/** Demande CAMERA (Android). true si accordée ou dialogue lancé. */
bool platformRequestCameraPermission();
/** null / pending / granted / denied / unavailable */
QString platformPollCameraPermission();
bool platformHasCameraPermission();

} // namespace app
