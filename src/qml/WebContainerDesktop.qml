import QtQuick
import QtWebEngine
import QtWebChannel

Item {
    id: root
    property url webUrl
    property var bridge

    function tryHandleBack(callback) {
        if (!webView) {
            if (callback) callback(false)
            return
        }
        webView.runJavaScript(
            "(function(){"
            + "return (typeof handleAndroidBack==='function' && handleAndroidBack());"
            + "})()",
            function (result) {
                if (callback) callback(result === true)
            }
        )
    }

    WebChannel {
        id: channel
        Component.onCompleted: {
            if (bridge)
                registerObject("webBridge", bridge)
        }
    }

    // Profil DISQUE obligatoire : le profil par défaut QML était OffTheRecord
    // (--disable-databases) → localStorage/IndexedDB perdus à chaque redémarrage / MAJ.
    WebEngineProfile {
        id: oseProfile
        storageName: "OpenSolarEnergy"
        offTheRecord: false
        persistentCookiesPolicy: WebEngineProfile.ForcePersistentCookies
        httpCacheType: WebEngineProfile.DiskHttpCache
    }

    WebEngineView {
        id: webView
        anchors.fill: parent
        url: root.webUrl
        webChannel: channel
        profile: oseProfile
        settings.localStorageEnabled: true
        settings.javascriptEnabled: true
    }
}
