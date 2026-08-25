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
                root.updater.check()
            else if (root.bridge)
                root.bridge.checkForUpdates()
            return
        }
        if (c.indexOf("open:") === 0 && root.bridge)
            root.bridge.openExternal(c.substring(5))
    }

    function notifyWebToast(message, kind) {
        if (!message || !webView)
            return
        const msg = JSON.stringify(String(message))
        const k = JSON.stringify(kind || "")
        webView.runJavaScript(
            "(function(){"
            + "if(typeof closeStartupModal==='function')closeStartupModal();"
            + "if(typeof showToast==='function')showToast(" + msg + "," + k + ");"
            + "})();"
        )
    }

    function notifyWebUpdaterState() {
        if (!webView || !root.updater)
            return
        const st = root.updater.state
        const msg = JSON.stringify(String(root.updater.statusMessage || ""))
        const ver = JSON.stringify(String(root.updater.currentVersion || ""))
        webView.runJavaScript(
            "(function(){"
            + "window.__oseNativeVersion=" + ver + ";"
            + "window.__oseUpdaterState=" + st + ";"
            + "if(typeof window.__oseOnUpdaterState==='function')"
            + "window.__oseOnUpdaterState(" + st + "," + msg + ");"
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
                + "var api={"
                + "checkForUpdates:function(){oseCmd('check-updates');},"
                + "openExternal:function(u){oseCmd('open:'+String(u));},"
                + "nativeReady:true"
                + "};"
                + "window.webBridge=api;window.nativeBridge=api;"
                + "window.__oseNativeInjected=true;"
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
                + "window.webBridge={checkForUpdates:function(){oseCmd('check-updates');},"
                + "openExternal:function(u){oseCmd('open:'+String(u));},nativeReady:true};"
                + "window.nativeBridge=window.webBridge;window.__oseNativeInjected=true;"
                + "}"
                + "var q=window.__oseCmdQueue;if(!q||!q.length)return '';"
                + "return q.shift();"
                + "})()",
                function (result) {
                    if (result)
                        handleNativeCmd(result)
                }
            )
        }
    }

    Timer {
        interval: 350
        running: true
        repeat: true
        onTriggered: webView.pollCmdQueue()
    }
}
