package org.opensolarenergy.app;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;

import org.qtproject.qt.android.bindings.QtActivity;

/**
 * Activity Qt personnalisée :
 *  - résultat du sélecteur de fichiers (import projets)
 *  - autorisation caméra Android + grant WebView getUserMedia (ombrage photo)
 */
public class OseActivity extends QtActivity {
    private static final String TAG = "OSE-Activity";
    private static final long WEBVIEW_HOOK_RETRY_MS = 400;
    private static final int WEBVIEW_HOOK_MAX_TRIES = 40;

    private int mWebViewHookTries = 0;
    private boolean mWebViewHooked = false;
    private PermissionRequest mPendingWebCamRequest;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        scheduleWebViewHook();
    }

    @Override
    public void onResume() {
        super.onResume();
        if (!mWebViewHooked)
            scheduleWebViewHook();
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (Platform.handleActivityResult(this, requestCode, resultCode, data))
            return;
        super.onActivityResult(requestCode, resultCode, data);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode != Platform.REQ_CAMERA)
            return;
        boolean ok = grantResults.length > 0
                && grantResults[0] == PackageManager.PERMISSION_GRANTED;
        Platform.setCameraPermissionResult(ok ? "granted" : "denied");
        if (mPendingWebCamRequest != null) {
            PermissionRequest req = mPendingWebCamRequest;
            mPendingWebCamRequest = null;
            if (ok)
                grantWebCamera(req);
            else
                req.deny();
        }
    }

    private void scheduleWebViewHook() {
        final View root = getWindow() != null ? getWindow().getDecorView() : null;
        if (root == null)
            return;
        root.post(this::tryHookWebView);
    }

    private void tryHookWebView() {
        if (mWebViewHooked || isFinishing())
            return;
        WebView wv = findWebView(getWindow().getDecorView());
        if (wv == null) {
            if (mWebViewHookTries++ < WEBVIEW_HOOK_MAX_TRIES) {
                View root = getWindow().getDecorView();
                if (root != null)
                    root.postDelayed(this::tryHookWebView, WEBVIEW_HOOK_RETRY_MS);
            } else {
                Log.w(TAG, "WebView introuvable — caméra getUserMedia non branchée");
            }
            return;
        }
        try {
            WebSettings settings = wv.getSettings();
            settings.setMediaPlaybackRequiresUserGesture(false);
            settings.setDomStorageEnabled(true);
            // Conserve le client Qt (titre, progress…) et ajoute le grant caméra.
            WebChromeClient existing = null;
            if (Build.VERSION.SDK_INT >= 26) {
                try {
                    existing = wv.getWebChromeClient();
                } catch (Throwable ignored) {
                }
            }
            wv.setWebChromeClient(new CameraAwareChromeClient(existing));
            mWebViewHooked = true;
            Log.i(TAG, "WebView : client caméra installé");
        } catch (Exception e) {
            Log.e(TAG, "hook WebView caméra", e);
        }
    }

    private static WebView findWebView(View root) {
        if (root instanceof WebView)
            return (WebView) root;
        if (!(root instanceof ViewGroup))
            return null;
        ViewGroup group = (ViewGroup) root;
        for (int i = 0; i < group.getChildCount(); i++) {
            WebView found = findWebView(group.getChildAt(i));
            if (found != null)
                return found;
        }
        return null;
    }

    private void ensureAndroidCameraThenGrant(PermissionRequest request) {
        if (Build.VERSION.SDK_INT < 23
                || checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
            Platform.setCameraPermissionResult("granted");
            grantWebCamera(request);
            return;
        }
        mPendingWebCamRequest = request;
        Platform.setCameraPermissionResult("pending");
        requestPermissions(new String[]{ Manifest.permission.CAMERA }, Platform.REQ_CAMERA);
    }

    private static void grantWebCamera(PermissionRequest request) {
        if (request == null)
            return;
        try {
            String[] resources = request.getResources();
            if (resources == null || resources.length == 0) {
                request.grant(new String[]{ PermissionRequest.RESOURCE_VIDEO_CAPTURE });
                return;
            }
            // Accorde uniquement vidéo (pas de micro pour le mode photo ombrage).
            java.util.ArrayList<String> grant = new java.util.ArrayList<>();
            for (String r : resources) {
                if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(r)
                        || PermissionRequest.RESOURCE_PROTECTED_MEDIA_ID.equals(r))
                    grant.add(r);
            }
            if (grant.isEmpty())
                grant.add(PermissionRequest.RESOURCE_VIDEO_CAPTURE);
            request.grant(grant.toArray(new String[0]));
        } catch (Exception e) {
            Log.e(TAG, "grantWebCamera", e);
            try { request.deny(); } catch (Exception ignored) {}
        }
    }

    private class CameraAwareChromeClient extends WebChromeClient {
        private final WebChromeClient mDelegate;

        CameraAwareChromeClient(WebChromeClient delegate) {
            mDelegate = delegate;
        }

        @Override
        public void onPermissionRequest(PermissionRequest request) {
            if (request == null)
                return;
            boolean wantsVideo = false;
            String[] resources = request.getResources();
            if (resources != null) {
                for (String r : resources) {
                    if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(r)) {
                        wantsVideo = true;
                        break;
                    }
                }
            }
            if (wantsVideo) {
                runOnUiThread(() -> ensureAndroidCameraThenGrant(request));
                return;
            }
            if (mDelegate != null)
                mDelegate.onPermissionRequest(request);
            else
                request.deny();
        }

        @Override
        public void onPermissionRequestCanceled(PermissionRequest request) {
            if (mPendingWebCamRequest == request)
                mPendingWebCamRequest = null;
            if (mDelegate != null)
                mDelegate.onPermissionRequestCanceled(request);
            else
                super.onPermissionRequestCanceled(request);
        }

        @Override
        public void onProgressChanged(WebView view, int newProgress) {
            if (mDelegate != null)
                mDelegate.onProgressChanged(view, newProgress);
            else
                super.onProgressChanged(view, newProgress);
        }

        @Override
        public void onReceivedTitle(WebView view, String title) {
            if (mDelegate != null)
                mDelegate.onReceivedTitle(view, title);
            else
                super.onReceivedTitle(view, title);
        }

        @Override
        public boolean onConsoleMessage(android.webkit.ConsoleMessage consoleMessage) {
            if (mDelegate != null)
                return mDelegate.onConsoleMessage(consoleMessage);
            return super.onConsoleMessage(consoleMessage);
        }

        @Override
        public boolean onShowFileChooser(WebView webView,
                android.webkit.ValueCallback<android.net.Uri[]> filePathCallback,
                FileChooserParams fileChooserParams) {
            if (mDelegate != null)
                return mDelegate.onShowFileChooser(webView, filePathCallback, fileChooserParams);
            return super.onShowFileChooser(webView, filePathCallback, fileChooserParams);
        }

        @Override
        public void onGeolocationPermissionsShowPrompt(String origin,
                android.webkit.GeolocationPermissions.Callback callback) {
            if (mDelegate != null)
                mDelegate.onGeolocationPermissionsShowPrompt(origin, callback);
            else if (callback != null)
                callback.invoke(origin, false, false);
        }
    }
}
