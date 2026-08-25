package org.opensolarenergy.app;

import android.content.Intent;
import org.qtproject.qt.android.bindings.QtActivity;

/**
 * Activity Qt personnalisée : reçoit le résultat du sélecteur de fichiers (import projets).
 */
public class OseActivity extends QtActivity {
    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (Platform.handleActivityResult(this, requestCode, resultCode, data))
            return;
        super.onActivityResult(requestCode, resultCode, data);
    }
}
