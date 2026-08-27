package org.opensolarenergy.app;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;

import java.io.File;
import java.io.FileNotFoundException;

/**
 * ContentProvider minimal pour exposer l’APK de mise à jour (sans androidx).
 * URI : content://org.opensolarenergy.app.fileprovider/update.apk
 */
public class ApkFileProvider extends ContentProvider {
    public static final String AUTHORITY = "org.opensolarenergy.app.fileprovider";
    public static final String UPDATE_NAME = "update.apk";

    public static Uri updateUri() {
        return Uri.parse("content://" + AUTHORITY + "/" + UPDATE_NAME);
    }

    public static File updateFile(Context ctx) {
        return new File(ctx.getCacheDir(), UPDATE_NAME);
    }

    @Override
    public boolean onCreate() {
        return true;
    }

    @Override
    public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        Context ctx = getContext();
        if (ctx == null)
            throw new FileNotFoundException("no context");
        File f = updateFile(ctx);
        if (!f.isFile())
            throw new FileNotFoundException(f.getAbsolutePath());
        int m = ParcelFileDescriptor.MODE_READ_ONLY;
        if (mode != null && mode.contains("w"))
            m = ParcelFileDescriptor.MODE_READ_WRITE;
        return ParcelFileDescriptor.open(f, m);
    }

    @Override
    public String getType(Uri uri) {
        return "application/vnd.android.package-archive";
    }

    @Override
    public Cursor query(Uri uri, String[] projection, String selection,
                        String[] selectionArgs, String sortOrder) {
        return null;
    }

    @Override
    public Uri insert(Uri uri, ContentValues values) {
        return null;
    }

    @Override
    public int delete(Uri uri, String selection, String[] selectionArgs) {
        return 0;
    }

    @Override
    public int update(Uri uri, ContentValues values, String selection,
                      String[] selectionArgs) {
        return 0;
    }
}
