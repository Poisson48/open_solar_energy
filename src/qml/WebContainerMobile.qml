import QtQuick
import QtWebView

Item {
    id: root
    property url webUrl
    property var bridge

    WebView {
        anchors.fill: parent
        url: root.webUrl
    }
}
