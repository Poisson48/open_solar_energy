import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

Rectangle {
    id: root
    property string kind: "info" // info | success | warning | danger
    property alias text: label.text
    Layout.fillWidth: true
    implicitHeight: label.implicitHeight + 20
    radius: Theme.radius
    color: {
        if (kind === "success") return "#e8f5e9"
        if (kind === "warning") return "#fff3e0"
        if (kind === "danger") return "#fdecea"
        return "#e3f2fd"
    }
    border.color: {
        if (kind === "success") return "#a5d6a7"
        if (kind === "warning") return "#ffcc80"
        if (kind === "danger") return "#ef9a9a"
        return "#90caf9"
    }

    Label {
        id: label
        anchors.fill: parent
        anchors.margins: 10
        wrapMode: Text.WordWrap
        font.pixelSize: 12
        color: Theme.text
    }
}
