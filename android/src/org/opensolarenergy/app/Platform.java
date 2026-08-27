package org.opensolarenergy.app;

import android.Manifest;
import android.app.Activity;
import android.app.ActivityOptions;
import android.content.BroadcastReceiver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInstaller;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
import android.provider.MediaStore;
import android.provider.OpenableColumns;
import android.provider.Settings;
import android.util.Log;
import android.view.WindowManager;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.channels.FileChannel;

public class Platform {

    public static final String ACTION_INSTALL_STATUS = "org.opensolarenergy.app.INSTALL_STATUS";
    public static final int REQ_PICK_IMPORT = 0x05E1;
    public static final int REQ_CAMERA = 0x05E2;

    private static final String TAG = "OSE-Platform";
    private static final Object IMPORT_LOCK = new Object();
    private static String sImportName;
    private static String sImportBase64;
    private static String sImportError;

    private static final Object INSTALL_LOCK = new Object();
    private static String sInstallStatus;
    /** APK en attente après ouverture des réglages « apps inconnues ». */
    private static String sPendingApkPath;
    /** true seulement après need_perm — un seul retry au retour dans l’app. */
    private static boolean sRetryAfterPerm;

    private static final Object CAMERA_LOCK = new Object();
    /** null | "pending" | "granted" | "denied" | "unavailable" */
    private static String sCameraPermStatus;

    public static boolean shareText(Context ctx, String text) {
        if (ctx == null)
            return false;
        try {
            Intent send = new Intent(Intent.ACTION_SEND);
            send.setType("text/plain");
            send.putExtra(Intent.EXTRA_TEXT, text);
            Intent chooser = Intent.createChooser(send, "Partager");
            chooser.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx.startActivity(chooser);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    /**
     * Enregistre dans Téléchargements (MediaStore) puis ouvre le partage système.
     * Pas de dépendance androidx FileProvider (packaging Qt).
     */
    public static boolean shareFile(Context ctx, String filename, String mime, byte[] data) {
        if (ctx == null || filename == null || data == null)
            return false;
        try {
            String safe = filename.replaceAll("[^a-zA-Z0-9._\\-]", "_");
            if (safe.isEmpty())
                safe = "export.bin";
            String type = (mime != null && !mime.isEmpty()) ? mime : "application/octet-stream";
            Uri uri = writeToDownloads(ctx, safe, type, data);
            if (uri == null)
                return false;

            Intent send = new Intent(Intent.ACTION_SEND);
            send.setType(type);
            send.putExtra(Intent.EXTRA_STREAM, uri);
            send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            Intent chooser = Intent.createChooser(send, "Exporter");
            if (!(ctx instanceof Activity))
                chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx.startActivity(chooser);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    /**
     * Télécharge un PDF depuis une URL (sans CORS WebView) puis ACTION_VIEW.
     */
    public static boolean openPdfFromUrl(Context ctx, String url) {
        if (ctx == null || url == null || url.isEmpty())
            return false;
        try {
            java.net.URL u = new java.net.URL(url);
            java.net.HttpURLConnection conn = (java.net.HttpURLConnection) u.openConnection();
            conn.setConnectTimeout(20000);
            conn.setReadTimeout(60000);
            conn.setRequestProperty("User-Agent", "OpenSolarEnergy/2.0");
            conn.setInstanceFollowRedirects(true);
            int code = conn.getResponseCode();
            if (code >= 400)
                return false;
            ByteArrayOutputStream bos = new ByteArrayOutputStream();
            try (InputStream in = conn.getInputStream()) {
                byte[] buf = new byte[8192];
                int n;
                int total = 0;
                final int max = 40 * 1024 * 1024;
                while ((n = in.read(buf)) >= 0) {
                    total += n;
                    if (total > max)
                        return false;
                    bos.write(buf, 0, n);
                }
            }
            byte[] data = bos.toByteArray();
            String name = "fiche_" + Integer.toHexString(url.hashCode()) + ".pdf";
            return openPdf(ctx, name, data);
        } catch (Exception e) {
            Log.w(TAG, "openPdfFromUrl failed", e);
            return false;
        }
    }

    /**
     * Écrit le PDF en cache / Downloads et lance ACTION_VIEW (visioneuse PDF système).
     */
    public static boolean openPdf(Context ctx, String filename, byte[] data) {
        if (ctx == null || data == null || data.length == 0)
            return false;
        try {
            String safe = filename != null ? filename.replaceAll("[^a-zA-Z0-9._\\-]", "_") : "fiche.pdf";
            if (safe.isEmpty())
                safe = "fiche.pdf";
            if (!safe.toLowerCase().endsWith(".pdf"))
                safe = safe + ".pdf";

            Uri uri = writeToDownloads(ctx, safe, "application/pdf", data);
            if (uri == null) {
                // fallback cache
                File dir = new File(ctx.getCacheDir(), "ose_pdf");
                if (!dir.exists() && !dir.mkdirs())
                    return false;
                File out = new File(dir, safe);
                try (FileOutputStream fos = new FileOutputStream(out)) {
                    fos.write(data);
                }
                uri = Uri.fromFile(out);
            }

            Intent view = new Intent(Intent.ACTION_VIEW);
            view.setDataAndType(uri, "application/pdf");
            view.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            if (!(ctx instanceof Activity))
                view.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            Intent chooser = Intent.createChooser(view, "Ouvrir la fiche PDF");
            if (!(ctx instanceof Activity))
                chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx.startActivity(chooser);
            return true;
        } catch (Exception e) {
            Log.w(TAG, "openPdf failed", e);
            return false;
        }
    }

    private static Uri writeToDownloads(Context ctx, String filename, String mime, byte[] data)
            throws Exception {
        if (Build.VERSION.SDK_INT >= 29) {
            ContentValues values = new ContentValues();
            values.put(MediaStore.Downloads.DISPLAY_NAME, filename);
            values.put(MediaStore.Downloads.MIME_TYPE, mime);
            values.put(MediaStore.Downloads.IS_PENDING, 1);
            Uri collection = MediaStore.Downloads.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY);
            Uri item = ctx.getContentResolver().insert(collection, values);
            if (item == null)
                return null;
            try (OutputStream out = ctx.getContentResolver().openOutputStream(item)) {
                if (out == null) {
                    ctx.getContentResolver().delete(item, null, null);
                    return null;
                }
                out.write(data);
            }
            values.clear();
            values.put(MediaStore.Downloads.IS_PENDING, 0);
            ctx.getContentResolver().update(item, values, null, null);
            return item;
        }
        // API < 29 : fichier dans le cache app + file:// (partage limité)
        File dir = new File(ctx.getCacheDir(), "ose_share");
        if (!dir.exists() && !dir.mkdirs())
            return null;
        File out = new File(dir, filename);
        try (FileOutputStream fos = new FileOutputStream(out)) {
            fos.write(data);
        }
        return Uri.fromFile(out);
    }

    /** Ouvre le sélecteur de documents (JSON / ZIP). Résultat via pollImportResult(). */
    public static boolean pickImportFile(Context ctx) {
        if (!(ctx instanceof Activity))
            return false;
        Activity activity = (Activity) ctx;
        try {
            synchronized (IMPORT_LOCK) {
                sImportName = null;
                sImportBase64 = null;
                sImportError = null;
            }
            Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setType("*/*");
            intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[] {
                    "application/json",
                    "application/zip",
                    "application/x-zip-compressed",
                    "text/plain",
                    "*/*"
            });
            activity.startActivityForResult(intent, REQ_PICK_IMPORT);
            return true;
        } catch (Exception e) {
            synchronized (IMPORT_LOCK) {
                sImportError = e.getMessage() != null ? e.getMessage() : "pick_failed";
            }
            return false;
        }
    }

    /**
     * @return null si rien ; sinon "ok\\tname\\tbase64" ou "err\\tmessage"
     */
    public static String pollImportResult() {
        synchronized (IMPORT_LOCK) {
            if (sImportError != null) {
                String err = sImportError;
                sImportError = null;
                return "err\t" + err;
            }
            if (sImportBase64 == null)
                return null;
            String name = sImportName != null ? sImportName : "import.json";
            String b64 = sImportBase64;
            sImportName = null;
            sImportBase64 = null;
            return "ok\t" + name + "\t" + b64;
        }
    }

    static boolean handleActivityResult(Activity activity, int requestCode, int resultCode, Intent data) {
        if (requestCode != REQ_PICK_IMPORT)
            return false;
        if (resultCode != Activity.RESULT_OK || data == null || data.getData() == null) {
            synchronized (IMPORT_LOCK) {
                sImportError = "cancelled";
            }
            return true;
        }
        Uri uri = data.getData();
        try {
            String name = queryDisplayName(activity, uri);
            byte[] bytes = readAll(activity, uri);
            if (bytes == null) {
                synchronized (IMPORT_LOCK) {
                    sImportError = "read_failed";
                }
                return true;
            }
            String b64 = android.util.Base64.encodeToString(bytes, android.util.Base64.NO_WRAP);
            synchronized (IMPORT_LOCK) {
                sImportName = name != null ? name : "import.bin";
                sImportBase64 = b64;
                sImportError = null;
            }
        } catch (Exception e) {
            synchronized (IMPORT_LOCK) {
                sImportError = e.getMessage() != null ? e.getMessage() : "read_failed";
            }
        }
        return true;
    }

    private static String queryDisplayName(Context ctx, Uri uri) {
        try (Cursor c = ctx.getContentResolver().query(uri, null, null, null, null)) {
            if (c != null && c.moveToFirst()) {
                int idx = c.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                if (idx >= 0)
                    return c.getString(idx);
            }
        } catch (Exception ignored) {
        }
        String last = uri.getLastPathSegment();
        return last != null ? last : "import.bin";
    }

    private static byte[] readAll(Context ctx, Uri uri) throws Exception {
        try (InputStream in = ctx.getContentResolver().openInputStream(uri);
             ByteArrayOutputStream bos = new ByteArrayOutputStream()) {
            if (in == null)
                return null;
            byte[] buf = new byte[65536];
            int n;
            while ((n = in.read(buf)) > 0)
                bos.write(buf, 0, n);
            return bos.toByteArray();
        }
    }

    /**
     * Ouvre l’écran « Installer des apps inconnues » si besoin.
     * @return true si déjà autorisé (ou API &lt; O), false si l’écran réglages a été ouvert.
     */
    public static boolean ensureInstallPermission(Context ctx) {
        if (ctx == null)
            return false;
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O)
            return true;
        PackageManager pm = ctx.getPackageManager();
        if (pm != null && pm.canRequestPackageInstalls())
            return true;
        try {
            Intent settings = new Intent(
                    Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:" + ctx.getPackageName()));
            settings.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx.startActivity(settings);
        } catch (Exception e) {
            Log.e(TAG, "open unknown-sources settings", e);
        }
        return false;
    }

    public static boolean installApk(Context ctx, String apkPath) {
        if (ctx == null || apkPath == null)
            return false;
        File apk = new File(apkPath);
        if (!apk.isFile() || apk.length() == 0) {
            setInstallStatus("err\tAPK introuvable ou vide");
            return false;
        }
        synchronized (INSTALL_LOCK) {
            sPendingApkPath = apkPath;
        }

        // Android 8+ : sans cette autorisation, PackageInstaller échoue sans UI.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            PackageManager pm = ctx.getPackageManager();
            if (pm != null && !pm.canRequestPackageInstalls()) {
                ensureInstallPermission(ctx);
                synchronized (INSTALL_LOCK) {
                    sRetryAfterPerm = true;
                }
                setInstallStatus("need_perm\tAutorisez « Installer des apps inconnues » pour Open Solar, puis revenez dans l’app");
                return false;
            }
        }

        if (installApkWithPackageInstaller(ctx, apk))
            return true;
        // Fallback fiable : Intent ACTION_VIEW (écran install système).
        return installApkWithViewIntent(ctx, apk);
    }

    /**
     * Relance l’install après retour des réglages (permission accordée).
     * Appelé depuis OseActivity.onResume.
     */
    public static boolean retryPendingInstallIfReady(Context ctx) {
        if (ctx == null)
            return false;
        synchronized (INSTALL_LOCK) {
            if (!sRetryAfterPerm)
                return false;
            sRetryAfterPerm = false;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            PackageManager pm = ctx.getPackageManager();
            if (pm == null || !pm.canRequestPackageInstalls())
                return false;
        }
        String path;
        synchronized (INSTALL_LOCK) {
            path = sPendingApkPath;
        }
        if (path == null || path.isEmpty())
            return false;
        File apk = new File(path);
        if (!apk.isFile() || apk.length() == 0)
            return false;
        Log.i(TAG, "retryPendingInstallIfReady " + path);
        return installApk(ctx, path);
    }

    private static boolean installApkWithPackageInstaller(Context ctx, File apk) {
        PackageInstaller.Session session = null;
        try {
            PackageInstaller installer = ctx.getPackageManager().getPackageInstaller();
            PackageInstaller.SessionParams params = new PackageInstaller.SessionParams(
                    PackageInstaller.SessionParams.MODE_FULL_INSTALL);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                params.setRequireUserAction(
                        PackageInstaller.SessionParams.USER_ACTION_REQUIRED);
            }
            int sessionId = installer.createSession(params);
            session = installer.openSession(sessionId);

            try (InputStream in = new FileInputStream(apk);
                 OutputStream out = session.openWrite("opensolarenergy", 0, apk.length())) {
                byte[] buffer = new byte[65536];
                int read;
                while ((read = in.read(buffer)) > 0)
                    out.write(buffer, 0, read);
                session.fsync(out);
            }

            // getActivity (pas getBroadcast) : la confirmation système n’est plus
            // bloquée en « background activity launch » sur Android 10–14.
            Intent status = new Intent(ctx, InstallCallbackActivity.class);
            status.setAction(ACTION_INSTALL_STATUS);
            int flags = android.app.PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S)
                flags |= android.app.PendingIntent.FLAG_MUTABLE;

            android.app.PendingIntent pending = android.app.PendingIntent.getActivity(
                    ctx, sessionId, status, flags);
            session.commit(pending.getIntentSender());
            setInstallStatus("pending\tConfirmation Android…");
            return true;
        } catch (Exception e) {
            Log.e(TAG, "installApkWithPackageInstaller", e);
            if (session != null) {
                try { session.abandon(); } catch (Exception ignored) {}
            }
            return false;
        } finally {
            if (session != null) {
                try { session.close(); } catch (Exception ignored) {}
            }
        }
    }

    /** Copie l’APK dans le cache app + ACTION_VIEW via ContentProvider. */
    private static boolean installApkWithViewIntent(Context ctx, File apk) {
        try {
            File dest = ApkFileProvider.updateFile(ctx);
            copyFile(apk, dest);
            Uri uri = ApkFileProvider.updateUri();
            Intent view = new Intent(Intent.ACTION_VIEW);
            view.setDataAndType(uri, "application/vnd.android.package-archive");
            view.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            view.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx.startActivity(view);
            setInstallStatus("pending\tConfirmez l'installation sur l'écran Android");
            return true;
        } catch (Exception e) {
            Log.e(TAG, "installApkWithViewIntent", e);
            String msg = e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName();
            setInstallStatus("err\tInstallation impossible : " + msg);
            return false;
        }
    }

    private static void copyFile(File src, File dest) throws Exception {
        try (FileChannel in = new FileInputStream(src).getChannel();
             FileChannel out = new FileOutputStream(dest).getChannel()) {
            long size = in.size();
            long pos = 0;
            while (pos < size)
                pos += in.transferTo(pos, size - pos, out);
        }
    }

    private static void setInstallStatus(String s) {
        synchronized (INSTALL_LOCK) {
            sInstallStatus = s;
        }
    }

    /** @return null si rien ; "pending\\t…" / "ok\\t…" / "err\\t…" / "need_perm\\t…" */
    public static String pollInstallStatus() {
        synchronized (INSTALL_LOCK) {
            if (sInstallStatus == null)
                return null;
            String s = sInstallStatus;
            sInstallStatus = null;
            return s;
        }
    }

    /** Statut PackageInstaller (Activity callback ou ancien BroadcastReceiver). */
    public static void handlePackageInstallerResult(Context ctx, Intent intent) {
        if (intent == null)
            return;
        int status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS,
                                        PackageInstaller.STATUS_FAILURE);
        String msg = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE);
        Log.i(TAG, "PackageInstaller status=" + status + " msg=" + msg);

        if (status == PackageInstaller.STATUS_PENDING_USER_ACTION) {
            Intent confirm;
            if (Build.VERSION.SDK_INT >= 33)
                confirm = intent.getParcelableExtra(Intent.EXTRA_INTENT, Intent.class);
            else
                confirm = intent.getParcelableExtra(Intent.EXTRA_INTENT);
            if (confirm == null) {
                setInstallStatus("err\tÉcran de confirmation Android manquant");
                return;
            }
            if (!(ctx instanceof Activity))
                confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            try {
                if (Build.VERSION.SDK_INT >= 34) {
                    ActivityOptions opts = ActivityOptions.makeBasic();
                    opts.setPendingIntentBackgroundActivityStartMode(
                            ActivityOptions.MODE_BACKGROUND_ACTIVITY_START_ALLOWED);
                    ctx.startActivity(confirm, opts.toBundle());
                } else {
                    ctx.startActivity(confirm);
                }
                setInstallStatus("pending\tConfirmez l'installation sur l'écran Android");
            } catch (Exception e) {
                Log.e(TAG, "start confirm", e);
                // Dernier recours : ACTION_VIEW sur le fichier déjà téléchargé
                String path;
                synchronized (INSTALL_LOCK) {
                    path = sPendingApkPath;
                }
                if (path != null && installApkWithViewIntent(ctx, new File(path)))
                    return;
                setInstallStatus("err\tImpossible d'ouvrir la confirmation Android");
            }
            return;
        }
        if (status == PackageInstaller.STATUS_SUCCESS) {
            synchronized (INSTALL_LOCK) {
                sPendingApkPath = null;
            }
            setInstallStatus("ok\tInstallation réussie — redémarrez l'app si besoin");
            return;
        }
        if (status == PackageInstaller.STATUS_FAILURE_ABORTED) {
            setInstallStatus("err\tInstallation annulée");
            return;
        }
        String detail = (msg != null && !msg.isEmpty()) ? msg : ("code " + status);
        setInstallStatus("err\tÉchec installation : " + detail);
    }

    /** Conservé pour compat ; le chemin principal passe par InstallCallbackActivity. */
    public static class InstallReceiver extends BroadcastReceiver {
        @Override
        public void onReceive(Context ctx, Intent intent) {
            handlePackageInstallerResult(ctx, intent);
        }
    }

    public static void vibrate(Context ctx, int ms) {
        if (ctx == null)
            return;
        try {
            Vibrator vibrator;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                VibratorManager manager = ctx.getSystemService(VibratorManager.class);
                vibrator = manager != null ? manager.getDefaultVibrator() : null;
            } else {
                vibrator = (Vibrator) ctx.getSystemService(Context.VIBRATOR_SERVICE);
            }
            if (vibrator == null || !vibrator.hasVibrator())
                return;
            vibrator.vibrate(VibrationEffect.createOneShot(ms, VibrationEffect.DEFAULT_AMPLITUDE));
        } catch (Exception ignored) {
        }
    }

    public static void keepScreenOn(Context ctx, final boolean on) {
        if (!(ctx instanceof Activity))
            return;
        final Activity activity = (Activity) ctx;
        activity.runOnUiThread(() -> {
            if (on)
                activity.getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            else
                activity.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        });
    }

    /** Appelé depuis OseActivity quand le dialogue runtime se termine. */
    static void setCameraPermissionResult(String status) {
        synchronized (CAMERA_LOCK) {
            sCameraPermStatus = status;
        }
    }

    /**
     * Demande la permission caméra Android (runtime).
     * @return true si déjà accordée ou dialogue lancé ; false si indisponible
     */
    public static boolean requestCameraPermission(Context ctx) {
        if (!(ctx instanceof Activity)) {
            setCameraPermissionResult("unavailable");
            return false;
        }
        final Activity activity = (Activity) ctx;
        if (Build.VERSION.SDK_INT < 23) {
            setCameraPermissionResult("granted");
            return true;
        }
        if (activity.checkSelfPermission(Manifest.permission.CAMERA)
                == PackageManager.PERMISSION_GRANTED) {
            setCameraPermissionResult("granted");
            return true;
        }
        setCameraPermissionResult("pending");
        activity.runOnUiThread(() ->
                activity.requestPermissions(new String[]{ Manifest.permission.CAMERA }, REQ_CAMERA));
        return true;
    }

    /** @return null si rien de nouveau ; sinon pending/granted/denied/unavailable */
    public static String pollCameraPermission() {
        synchronized (CAMERA_LOCK) {
            if (sCameraPermStatus == null)
                return null;
            String s = sCameraPermStatus;
            // Garder "pending" jusqu'à granted/denied pour le poll JS
            if (!"pending".equals(s))
                sCameraPermStatus = null;
            return s;
        }
    }

    public static boolean hasCameraPermission(Context ctx) {
        if (ctx == null)
            return false;
        if (Build.VERSION.SDK_INT < 23)
            return true;
        return ctx.checkSelfPermission(Manifest.permission.CAMERA)
                == PackageManager.PERMISSION_GRANTED;
    }
}
