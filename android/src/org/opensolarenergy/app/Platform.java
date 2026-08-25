package org.opensolarenergy.app;

import android.app.Activity;
import android.content.BroadcastReceiver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInstaller;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
import android.provider.MediaStore;
import android.provider.OpenableColumns;
import android.view.WindowManager;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;

public class Platform {

    public static final String ACTION_INSTALL_STATUS = "org.opensolarenergy.app.INSTALL_STATUS";
    public static final int REQ_PICK_IMPORT = 0x05E1;

    private static final Object IMPORT_LOCK = new Object();
    private static String sImportName;
    private static String sImportBase64;
    private static String sImportError;

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

    public static boolean installApk(Context ctx, String apkPath) {
        if (ctx == null || apkPath == null)
            return false;
        File apk = new File(apkPath);
        if (!apk.isFile() || apk.length() == 0)
            return false;

        PackageInstaller.Session session = null;
        try {
            PackageInstaller installer = ctx.getPackageManager().getPackageInstaller();
            PackageInstaller.SessionParams params = new PackageInstaller.SessionParams(
                    PackageInstaller.SessionParams.MODE_FULL_INSTALL);
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

            Intent status = new Intent(ACTION_INSTALL_STATUS).setPackage(ctx.getPackageName());
            int flags = android.app.PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S)
                flags |= android.app.PendingIntent.FLAG_MUTABLE;

            android.app.PendingIntent pending = android.app.PendingIntent.getBroadcast(
                    ctx, sessionId, status, flags);
            session.commit(pending.getIntentSender());
            return true;
        } catch (Exception e) {
            if (session != null)
                session.abandon();
            return false;
        } finally {
            if (session != null)
                session.close();
        }
    }

    public static class InstallReceiver extends BroadcastReceiver {
        @Override
        public void onReceive(Context ctx, Intent intent) {
            int status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS,
                                            PackageInstaller.STATUS_FAILURE);
            if (status != PackageInstaller.STATUS_PENDING_USER_ACTION)
                return;
            Intent confirm;
            if (Build.VERSION.SDK_INT >= 33)
                confirm = intent.getParcelableExtra(Intent.EXTRA_INTENT, Intent.class);
            else
                confirm = intent.getParcelableExtra(Intent.EXTRA_INTENT);
            if (confirm == null)
                return;
            confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx.startActivity(confirm);
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
}
