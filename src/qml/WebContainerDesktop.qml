import QtQuick
import QtWebEngine
import QtWebChannel

Item {
    id: root
    property url webUrl
    property var bridge

    WebChannel {
        id: channel
        Component.onCompleted: {
            if (bridge)
                registerObject("webBridge", bridge)
        }
    }

    WebEngineView {
        anchors.fill: parent
        url: root.webUrl
        webChannel: channel
    }
}
