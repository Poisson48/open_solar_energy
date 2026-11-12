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
/** Ouvre « apps inconnues » si besoin. true = déjà autorisé. */
bool platformEnsureInstallPermission();
/** Dernier statut d'installation PackageInstaller (vide si rien). */
QString platformPollInstallStatus();
void platformVibrate(int ms);
void platformKeepScreenOn(bool on);
/** Demande CAMERA (Android). true si accordée ou dialogue lancé. */
bool platformRequestCameraPermission();
/** null / pending / granted / denied / unavailable */
QString platformPollCameraPermission();
bool platformHasCameraPermission();

/** Demande BLUETOOTH_* (Android 12+). true si déjà OK ou dialogue lancé. */
bool platformRequestBluetoothPermission();
QString platformPollBluetoothPermission();
bool platformHasBluetoothPermission();
/** Bloque jusqu’à réponse utilisateur (Android) ; true si accordé. */
bool platformEnsureBluetoothPermissions();
/** BT ON seulement (pas de dialogue « visible »). */
bool platformEnsureBluetoothOn();
/** true si déjà en mode discoverable. */
bool platformIsBluetoothDiscoverable();
/**
 * Rend l’appareil visible. Sur Android : dialogue système au plus une fois
 * tant que déjà visible / demandé récemment. Desktop : HostDiscoverable silencieux.
 */
bool platformRequestBluetoothDiscoverable(int seconds = 120);

/** Dossier Documents/OpenSolarEnergy/sync (Android public / desktop Documents). */
QString platformSyncDocumentsDir();
/** Publie un fichier sync (MediaStore Documents) pour le rendre visible en MTP. */
bool platformPublishSyncFile(const QString& filename, const QByteArray& data);
/** Lit un fichier sync depuis le stockage public si possible. */
QByteArray platformReadSyncFile(const QString& filename);

} // namespace app
