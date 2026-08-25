import QtQuick
import QtWebView

Item {
    id: root
    property url webUrl
    property var bridge

    WebView {
        id: webView
        anchors.fill: parent
        url: root.webUrl

        // Pont JS → Qt via document.title (pas de QWebChannel sur WebView Android,
        // et ose:// rechargerait toute la page).
        onTitleChanged: {
            const t = title
            if (t === "OSE_CMD:check-updates") {
                if (root.bridge)
                    root.bridge.checkForUpdates()
                return
            }
            if (t.indexOf("OSE_CMD:open:") === 0) {
                const target = t.substring("OSE_CMD:open:".length)
                if (root.bridge)
                    root.bridge.openExternal(target)
            }
        }

        onLoadingChanged: function (request) {
            if (request.status === WebView.LoadSucceededStatus)
                injectNativeBridge()
        }

        function injectNativeBridge() {
            runJavaScript(
                "(function(){"
                + "if(window.__oseNativeInjected)return;"
                + "window.__oseNativeInjected=true;"
                + "function oseCmd(c){"
                + "var prev=document.title;"
                + "document.title=c;"
                + "setTimeout(function(){document.title=prev||'Open Solar Energy';},80);"
                + "}"
                + "var api={"
                + "checkForUpdates:function(){oseCmd('OSE_CMD:check-updates');},"
                + "openExternal:function(u){oseCmd('OSE_CMD:open:'+String(u));}"
                + "};"
                + "window.webBridge=api;window.nativeBridge=api;"
                + "})();"
            )
        }
    }
}
