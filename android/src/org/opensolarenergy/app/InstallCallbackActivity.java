package org.opensolarenergy.app;

import android.app.Activity;
import android.os.Bundle;

/**
 * Reçoit le statut PackageInstaller via PendingIntent.getActivity.
 * Contrairement à un BroadcastReceiver, startActivity(confirmation) n’est pas
 * bloqué par les restrictions « background activity launch » (Android 10+).
 */
public class InstallCallbackActivity extends Activity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Platform.handlePackageInstallerResult(this, getIntent());
        finish();
    }
}
