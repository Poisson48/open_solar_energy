import QtQuick
import QtQuick.Controls

Item {
    id: root
    height: toast.implicitHeight
    z: 1000

    function show(msg, ms) {
        toastText.text = msg
        toast.opacity = 1
        hideTimer.interval = ms || 2800
        hideTimer.restart()
    }

    Rectangle {
        id: toast
        anchors.horizontalCenter: parent.horizontalCenter
        anchors.bottom: parent.bottom
        width: Math.min(parent.width - 32, toastText.implicitWidth + 32)
        implicitHeight: toastText.implicitHeight + 20
        radius: 8
        color: "#1a2e23"
        opacity: 0
        Behavior on opacity { NumberAnimation { duration: 180 } }

        Label {
            id: toastText
            anchors.centerIn: parent
            color: "#fff"
            font.pixelSize: 13
            wrapMode: Text.WordWrap
            width: Math.min(root.width - 48, 420)
            horizontalAlignment: Text.AlignHCenter
        }
    }

    Timer {
        id: hideTimer
        onTriggered: toast.opacity = 0
    }
}
