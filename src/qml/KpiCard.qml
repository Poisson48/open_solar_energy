import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

Rectangle {
    property string title: ""
    property string value: ""
    property string subtitle: ""
    width: 140
    height: 80
    radius: Theme.radius
    color: Theme.surface
    border.color: Theme.outline

    ColumnLayout {
        anchors.fill: parent
        anchors.margins: 10
        spacing: 2
        Label { text: title; color: Theme.textDim; font.pixelSize: 11 }
        Label { text: value; color: Theme.primary; font.pixelSize: 20; font.weight: Font.DemiBold }
        Label { text: subtitle; color: Theme.textDim; font.pixelSize: 10; visible: subtitle.length > 0 }
    }
}
