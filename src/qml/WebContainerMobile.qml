import QtQuick
import QtWebView

Item {
    id: root
    property url webUrl
    property var bridge
    // Contexte global Updater (même si Main.qml oublie l’assignation).
    property var updater: Updater

    function updaterObj() {
        return root.updater || Updater
    }

    function handleNativeCmd(cmd) {
        if (!cmd)
            return
        const c = String(cmd)
        if (c === "check-updates") {
            const u = updaterObj()
            if (u)
                u.checkFromUser()
            else if (root.bridge)
                root.bridge.checkForUpdates()
            return
        }
        if (c === "start-update") {
            const u = updaterObj()
            if (u)
                u.startUpdate()
            else if (root.bridge)
                root.bridge.checkForUpdates()
            return
        }
        if (c === "ensure-install-perm") {
            AppController.ensureInstallPermission()
            return
        }
        if (c.indexOf("open:") === 0 && root.bridge)
            root.bridge.openExternal(c.substring(5))
        if (c === "open-pdf") {
            webView.runJavaScript(
                "(function(){try{return JSON.stringify(window.__osePdfPending||null);}catch(e){return 'null';}})()",
                function (result) {
                    try {
                        const payload = JSON.parse(result || "null")
                        if (!payload || !payload.name || !payload.b64) {
                            notifyWebToast("PDF indisponible", "error")
                            return
                        }
                        let ok = false
                        if (root.bridge && root.bridge.openPdf)
                            ok = root.bridge.openPdf(String(payload.name), String(payload.b64))
                        else
                            ok = AppController.openPdf(String(payload.name), String(payload.b64))
                        if (ok)
                            notifyWebToast("Choisissez une visioneuse PDF", "")
                        else
                            notifyWebToast("Impossible d’ouvrir le PDF", "error")
                    } catch (e) {
                        notifyWebToast("Impossible d’ouvrir le PDF", "error")
                    } finally {
                        webView.runJavaScript("window.__osePdfPending=null")
                    }
                })
            return
        }
        if (c.indexOf("open-pdf-url:") === 0) {
            const url = c.substring("open-pdf-url:".length)
            let ok = false
            if (root.bridge && root.bridge.openPdfFromUrl)
                ok = root.bridge.openPdfFromUrl(url)
            else
                ok = AppController.openPdfFromUrl(url)
            if (ok)
                notifyWebToast("Choisissez une visioneuse PDF", "")
            else
                notifyWebToast("Impossible de télécharger le PDF", "error")
            return
        }
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
        if (c === "save-projects-backup") {
            webView.runJavaScript(
                "(function(){try{return String(window.__oseBackupPending||'');}catch(e){return '';}})()",
                function (json) {
                    try {
                        if (root.bridge && root.bridge.saveProjectsBackup)
                            root.bridge.saveProjectsBackup(String(json || ""))
                    } catch (e) {}
                    webView.runJavaScript("window.__oseBackupPending=null")
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
        const u = updaterObj()
        if (!webView || !u)
            return
        const st = u.state
        const msg = JSON.stringify(String(u.statusMessage || ""))
        const ver = JSON.stringify(String(u.currentVersion || ""))
        const latest = JSON.stringify(String(u.latestVersion || ""))
        const notes = JSON.stringify(String(u.releaseNotes || "").slice(0, 4000))
        const avail = u.updateAvailable ? "true" : "false"
        const prog = Number(u.progress || 0)
        const bytes = Number(u.bytesReceived || 0)
        webView.runJavaScript(
            "(function(){"
            + "window.__oseNativeVersion=" + ver + ";"
            + "window.__oseUpdaterState=" + st + ";"
            + "window.__oseUpdaterLatest=" + latest + ";"
            + "window.__oseUpdaterNotes=" + notes + ";"
            + "window.__oseUpdaterAvailable=" + avail + ";"
            + "window.__oseUpdaterProgress=" + prog + ";"
            + "window.__oseUpdaterBytes=" + bytes + ";"
            + "if(typeof window.__oseOnUpdaterState==='function')"
            + "window.__oseOnUpdaterState(" + st + "," + msg + ");"
            + "})();"
        )
    }

    Connections {
        target: Updater
        function onStateChanged() {
            const u = Updater
            if (!u)
                return
            const msg = u.statusMessage
            // Toast seulement hors téléchargement (sinon spam % / Mo)
            if (msg.length > 0 && u.state !== 3) {
                const kind = u.state === 5 ? "error"
                           : (u.state === 2 ? "warning" : "")
                notifyWebToast(msg, kind)
            }
            notifyWebUpdaterState()
            // Ne pas recharger le hub pendant check / download / install
            const st = u.state
            if (st !== 1 && st !== 3 && st !== 4) {
                webView.runJavaScript(
                    "if(typeof refreshHubNews==='function')try{refreshHubNews(false);}catch(e){}"
                )
            }
        }
        function onStatusMessageChanged() {
            notifyWebUpdaterState()
        }
        function onProgressChanged() {
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
                + "openPdf:function(name,b64){window.__osePdfPending={name:String(name),b64:String(b64)};oseCmd('open-pdf');return true;},"
                + "openPdfFromUrl:function(u){oseCmd('open-pdf-url:'+String(u));return true;},"
                + "shareFile:function(name,mime,b64){"
                + "window.__oseSharePending={name:String(name),mime:String(mime||''),b64:String(b64)};"
                + "oseCmd('share-file');},"
                + "saveProjectsBackup:function(json){window.__oseBackupPending=String(json||'');oseCmd('save-projects-backup');return true;},"
                + "loadProjectsBackup:function(){return window.__oseProjectsBackup||'';},"
                + "pickImportFile:function(){oseCmd('pick-import');},"
                + "requestCameraPermission:function(){oseCmd('request-camera');},"
                + "pollCameraPermission:function(){return window.__oseCamPoll?window.__oseCamPoll():null;},"
                + "hasCameraPermission:function(){return !!window.__oseCamHas;},"
                + "ensureInstallPermission:function(){oseCmd('ensure-install-perm');},"
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
            // Précharger le miroir projets pour restauration si localStorage vide
            try {
                const backup = (root.bridge && root.bridge.loadProjectsBackup)
                    ? String(root.bridge.loadProjectsBackup() || "")
                    : ""
                if (backup.length > 2) {
                    const js = JSON.stringify(backup)
                    webView.runJavaScript("window.__oseProjectsBackup=" + js + ";")
                }
            } catch (e) {}
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
                + "openPdf:function(name,b64){window.__osePdfPending={name:String(name),b64:String(b64)};oseCmd('open-pdf');return true;},"
                + "openPdfFromUrl:function(u){oseCmd('open-pdf-url:'+String(u));return true;},"
                + "shareFile:function(name,mime,b64){window.__oseSharePending={name:String(name),mime:String(mime||''),b64:String(b64)};oseCmd('share-file');},"
                + "saveProjectsBackup:function(json){window.__oseBackupPending=String(json||'');oseCmd('save-projects-backup');return true;},"
                + "loadProjectsBackup:function(){return window.__oseProjectsBackup||'';},"
                + "pickImportFile:function(){oseCmd('pick-import');},"
                + "requestCameraPermission:function(){oseCmd('request-camera');},"
                + "pollCameraPermission:function(){return window.__oseCamPoll?window.__oseCamPoll():null;},"
                + "hasCameraPermission:function(){return !!window.__oseCamHas;},"
                + "ensureInstallPermission:function(){oseCmd('ensure-install-perm');},nativeReady:true};"
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
