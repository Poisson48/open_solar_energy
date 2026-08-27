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
    }

    // Main.qml pose `bridge` dans onLoaded — après Component.onCompleted.
    // Sans re-register, channel.objects.webBridge reste vide → pas de
    // saveProjectsBackup / openExternal / MAJ depuis le JS (météo perdue).
    property bool bridgeRegistered: false
    function ensureBridgeRegistered() {
        if (!bridge || bridgeRegistered)
            return
        channel.registerObject("webBridge", bridge)
        bridgeRegistered = true
    }
    onBridgeChanged: ensureBridgeRegistered()
    Component.onCompleted: ensureBridgeRegistered()

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
