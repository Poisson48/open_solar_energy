import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

Rectangle {
    id: root
    default property alias body: content.data
    property string title: ""
    property string hint: ""

    color: Theme.surface
    radius: Theme.radius
    border.color: Theme.outline
    implicitHeight: content.implicitHeight + 24
    Layout.fillWidth: true

    ColumnLayout {
        id: content
        anchors.fill: parent
        anchors.margins: 14
        spacing: 8

        Label {
            visible: root.title.length > 0
            text: root.title
            font.pixelSize: 15
            font.weight: Font.DemiBold
            color: Theme.text
            Layout.fillWidth: true
        }
        Label {
            visible: root.hint.length > 0
            text: root.hint
            wrapMode: Text.WordWrap
            font.pixelSize: 12
            color: Theme.textDim
            Layout.fillWidth: true
        }
    }
}
