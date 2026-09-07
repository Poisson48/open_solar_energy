import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

Rectangle {
    id: root
    property int step: 1
    property string title: ""
    property string hint: ""
    default property alias body: bodyCol.data

    color: Theme.surface
    radius: Theme.radius
    border.color: Theme.outline
    Layout.fillWidth: true
    implicitHeight: inner.implicitHeight + 20

    ColumnLayout {
        id: inner
        anchors.fill: parent
        anchors.margins: 14
        spacing: 10

        RowLayout {
            spacing: 10
            Rectangle {
                width: 28; height: 28; radius: 14
                color: Theme.primary
                Label {
                    anchors.centerIn: parent
                    text: String(root.step)
                    color: "#fff"
                    font.pixelSize: 13
                    font.weight: Font.Bold
                }
            }
            ColumnLayout {
                Layout.fillWidth: true
                spacing: 2
                Label {
                    text: root.title
                    font.pixelSize: 14
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

        ColumnLayout {
            id: bodyCol
            Layout.fillWidth: true
            spacing: 8
        }
    }
}
