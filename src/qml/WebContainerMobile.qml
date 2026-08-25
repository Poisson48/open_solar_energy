import QtQuick
import QtWebView

Item {
    id: root
    property url webUrl
    property var bridge

    function handleNativeCmd(cmd) {
        if (!cmd || !root.bridge)
            return
        const c = String(cmd)
        if (c === "check-updates") {
            root.bridge.checkForUpdates()
            return
        }
        if (c.indexOf("open:") === 0)
            root.bridge.openExternal(c.substring(5))
    }

    WebView {
        id: webView
        anchors.fill: parent
        url: root.webUrl

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
            if (request.status === WebView.LoadSucceededStatus)
                injectNativeBridge()
        }

        function injectNativeBridge() {
            runJavaScript(
                "(function(){"
                + "window.__oseCmdQueue=window.__oseCmdQueue||[];"
                + "function oseCmd(c){"
                + "window.__oseCmdQueue.push(c);"
                + "try{document.title='OSE_CMD:'+c;}catch(e){}"
                + "}"
                + "var api={"
                + "checkForUpdates:function(){oseCmd('check-updates');},"
                + "openExternal:function(u){oseCmd('open:'+String(u));}"
                + "};"
                + "window.webBridge=api;window.nativeBridge=api;"
                + "window.__oseNativeInjected=true;"
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
                + "openExternal:function(u){oseCmd('open:'+String(u));}};"
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

    // Polling : document.title est peu fiable sur WebView Android
    Timer {
        interval: 350
        running: true
        repeat: true
        onTriggered: webView.pollCmdQueue()
    }
}
