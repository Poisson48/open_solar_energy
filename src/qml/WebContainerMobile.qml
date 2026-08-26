import QtQuick
import QtWebView

Item {
    id: root
    property url webUrl
    property var bridge
    property var updater

    function handleNativeCmd(cmd) {
        if (!cmd)
            return
        const c = String(cmd)
        if (c === "check-updates") {
            if (root.updater)
                root.updater.checkFromUser()
            else if (root.bridge)
                root.bridge.checkForUpdates()
            return
        }
        if (c === "start-update") {
            if (root.updater)
                root.updater.startUpdate()
            else if (root.bridge)
                root.bridge.checkForUpdates()
            return
        }
        if (c.indexOf("open:") === 0 && root.bridge)
            root.bridge.openExternal(c.substring(5))
        if (c === "share-file") {
            webView.runJavaScript(
                "(function(){try{return JSON.stringify(window.__oseSharePending||null);}catch(e){return 'null';}})()",
                function (result) {
                    try {
                        const payload = JSON.parse(result || "null")
                        if (!payload || !payload.name || !payload.b64) {
                            notifyWebToast("Export impossible", "error")
                            return
                        }
                        const ok = AppController.shareFile(
                            String(payload.name),
                            String(payload.mime || "application/octet-stream"),
                            String(payload.b64))
                        if (ok)
                            notifyWebToast("Choisissez où enregistrer / partager", "")
                        else
                            notifyWebToast("Partage impossible", "error")
                    } catch (e) {
                        notifyWebToast("Export impossible", "error")
                    } finally {
                        webView.runJavaScript("window.__oseSharePending=null")
                    }
                })
            return
        }
        if (c === "pick-import") {
            if (!AppController.pickImportFile())
                notifyWebToast("Sélecteur de fichiers indisponible", "error")
            return
        }
        if (c === "request-camera") {
            if (!AppController.requestCameraPermission())
                notifyWebToast("Permission caméra indisponible", "error")
            return
        }
    }

    function notifyWebToast(message, kind) {
        if (!message || !webView)
            return
        const msg = JSON.stringify(String(message))
        const k = JSON.stringify(kind || "")
        webView.runJavaScript(
            "(function(){"
            + "if(typeof showToast==='function')showToast(" + msg + "," + k + ");"
            + "})();"
        )
    }

    function deliverImportResult(raw) {
        if (!raw || !webView)
            return
        const s = String(raw)
        if (s.indexOf("err\t") === 0) {
            const err = s.substring(4)
            if (err === "cancelled")
                return
            notifyWebToast("Import : " + err, "error")
            return
        }
        if (s.indexOf("ok\t") !== 0)
            return
        const rest = s.substring(3)
        const tab = rest.indexOf("\t")
        if (tab < 0)
            return
        const name = rest.substring(0, tab)
        const b64 = rest.substring(tab + 1)
        const nameJs = JSON.stringify(name)
        const b64Js = JSON.stringify(b64)
        webView.runJavaScript(
            "(function(){"
            + "if(typeof importProjectsFromNative==='function')"
            + "importProjectsFromNative(" + nameJs + "," + b64Js + ");"
            + "})();"
        )
    }

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

    function notifyWebUpdaterState() {
        if (!webView || !root.updater)
            return
        const st = root.updater.state
        const msg = JSON.stringify(String(root.updater.statusMessage || ""))
        const ver = JSON.stringify(String(root.updater.currentVersion || ""))
        const latest = JSON.stringify(String(root.updater.latestVersion || ""))
        const notes = JSON.stringify(String(root.updater.releaseNotes || "").slice(0, 4000))
        const avail = root.updater.updateAvailable ? "true" : "false"
        webView.runJavaScript(
            "(function(){"
            + "window.__oseNativeVersion=" + ver + ";"
            + "window.__oseUpdaterState=" + st + ";"
            + "window.__oseUpdaterLatest=" + latest + ";"
            + "window.__oseUpdaterNotes=" + notes + ";"
            + "window.__oseUpdaterAvailable=" + avail + ";"
            + "if(typeof window.__oseOnUpdaterState==='function')"
            + "window.__oseOnUpdaterState(" + st + "," + msg + ");"
            + "if(typeof refreshHubNews==='function')try{refreshHubNews(false);}catch(e){}"
            + "})();"
        )
    }

    Connections {
        target: root.updater
        function onStateChanged() {
            if (!root.updater)
                return
            const msg = root.updater.statusMessage
            if (msg.length > 0) {
                const kind = root.updater.state === 5 ? "error"
                           : (root.updater.state === 2 ? "warning" : "")
                notifyWebToast(msg, kind)
            }
            notifyWebUpdaterState()
        }
        function onStatusMessageChanged() {
            notifyWebUpdaterState()
        }
    }

    WebView {
        id: webView
        anchors.fill: parent
        url: root.webUrl

        Component.onCompleted: injectNativeBridge()

        onTitleChanged: {
            const t = String(title)
            if (t.indexOf("OSE_CMD:") === 0) {
                handleNativeCmd(t.substring(8))
                Qt.callLater(function () {
                    webView.runJavaScript("document.title='Open Solar Energy'")
                })
            }
        }

        onLoadingChanged: function (request) {
            if (request.status === WebView.LoadSucceededStatus) {
                injectNativeBridge()
                notifyWebUpdaterState()
            }
        }

        function injectNativeBridge() {
            const ver = root.updater ? root.updater.currentVersion : ""
            runJavaScript(
                "(function(){"
                + "window.__oseCmdQueue=window.__oseCmdQueue||[];"
                + "function oseCmd(c){"
                + "window.__oseCmdQueue.push(c);"
                + "try{document.title='OSE_CMD:'+c;}catch(e){}"
                + "}"
                + "var prev=window.webBridge||window.nativeBridge||{};"
                + "var api={"
                + "checkForUpdates:function(){oseCmd('check-updates');},"
                + "startUpdate:function(){oseCmd('start-update');},"
                + "openExternal:function(u){oseCmd('open:'+String(u));},"
                + "shareFile:function(name,mime,b64){"
                + "window.__oseSharePending={name:String(name),mime:String(mime||''),b64:String(b64)};"
                + "oseCmd('share-file');},"
                + "pickImportFile:function(){oseCmd('pick-import');},"
                + "requestCameraPermission:function(){oseCmd('request-camera');},"
                + "pollCameraPermission:function(){return window.__oseCamPoll?window.__oseCamPoll():null;},"
                + "hasCameraPermission:function(){return !!window.__oseCamHas;},"
                + "nativeReady:true"
                + "};"
                + "['gitSave','gitLog','gitRead','gitCheckout','gitBranches','gitCreateBranch','gitSwitchBranch'].forEach(function(k){"
                + "if(typeof prev[k]==='function')api[k]=prev[k];"
                + "});"
                + "window.webBridge=api;window.nativeBridge=api;"
                + "window.__oseNativeInjected=true;"
                + "if(typeof OseGit!=='undefined'&&OseGit.polyfillNativeBridge)try{OseGit.polyfillNativeBridge();}catch(e){}"
                + (ver ? ("window.__oseNativeVersion='" + ver + "';") : "")
                + "})();"
            )
        }

        function pollCmdQueue() {
            runJavaScript(
                "(function(){"
                + "if(!window.__oseNativeInjected){"
                + "window.__oseCmdQueue=window.__oseCmdQueue||[];"
                + "function oseCmd(c){window.__oseCmdQueue.push(c);try{document.title='OSE_CMD:'+c;}catch(e){}}"
                + "var prev=window.webBridge||{};"
                + "window.webBridge={checkForUpdates:function(){oseCmd('check-updates');},"
                + "startUpdate:function(){oseCmd('start-update');},"
                + "openExternal:function(u){oseCmd('open:'+String(u));},"
                + "shareFile:function(name,mime,b64){window.__oseSharePending={name:String(name),mime:String(mime||''),b64:String(b64)};oseCmd('share-file');},"
                + "pickImportFile:function(){oseCmd('pick-import');},"
                + "requestCameraPermission:function(){oseCmd('request-camera');},"
                + "pollCameraPermission:function(){return window.__oseCamPoll?window.__oseCamPoll():null;},"
                + "hasCameraPermission:function(){return !!window.__oseCamHas;},nativeReady:true};"
                + "['gitSave','gitLog','gitRead','gitCheckout','gitBranches','gitCreateBranch','gitSwitchBranch'].forEach(function(k){"
                + "if(typeof prev[k]==='function')window.webBridge[k]=prev[k];"
                + "});"
                + "window.nativeBridge=window.webBridge;window.__oseNativeInjected=true;"
                + "if(typeof OseGit!=='undefined'&&OseGit.polyfillNativeBridge)try{OseGit.polyfillNativeBridge();}catch(e){}"
                + "}"
                + "var q=window.__oseCmdQueue;if(!q||!q.length)return '';"
                + "return q.shift();"
                + "})()",
                function (result) {
                    if (result)
                        handleNativeCmd(result)
                }
            )
            const imp = AppController.pollImportResult()
            if (imp)
                deliverImportResult(imp)
            // Synchronise le statut permission caméra vers le JS (poll async natif).
            const cam = AppController.pollCameraPermission()
            const hasCam = AppController.hasCameraPermission() ? "true" : "false"
            const camJs = cam && cam.length > 0 ? JSON.stringify(String(cam)) : ""
            webView.runJavaScript(
                "(function(){"
                + "window.__oseCamHas=" + hasCam + ";"
                + (camJs ? ("window.__oseCamLast=" + camJs + ";") : "")
                + "if(!window.__oseCamPoll)window.__oseCamPoll=function(){"
                + "var v=window.__oseCamLast;window.__oseCamLast=null;return v;};"
                + "})();"
            )
        }
    }

    Timer {
        interval: 350
        running: true
        repeat: true
        onTriggered: {
            webView.pollCmdQueue()
            if (root.updater)
                root.updater.pollNativeInstallStatus()
        }
    }
}
