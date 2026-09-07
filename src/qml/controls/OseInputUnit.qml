import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

RowLayout {
    id: root
    property alias text: field.text
    property alias placeholderText: field.placeholderText
    property string unit: ""
    property alias inputMethodHints: field.inputMethodHints
    property alias validator: field.validator
    signal editingFinished()

    spacing: 0
    Layout.fillWidth: true

    TextField {
        id: field
        Layout.fillWidth: true
        color: Theme.text
        onEditingFinished: root.editingFinished()
        background: Rectangle {
            implicitHeight: 36
            color: Theme.surfaceHigh
            border.color: field.activeFocus ? Theme.primary : Theme.outline
            border.width: 1
            radius: root.unit.length ? Theme.radius : Theme.radius
            Rectangle {
                visible: root.unit.length > 0
                anchors.right: parent.right
                anchors.top: parent.top
                anchors.bottom: parent.bottom
                width: unitLabel.width + 16
                color: Theme.surfaceHigh
                radius: Theme.radius
            }
        }
        rightPadding: root.unit.length ? unitLabel.width + 20 : 8
    }

    Label {
        id: unitLabel
        visible: root.unit.length > 0
        text: root.unit
        color: Theme.textDim
        font.pixelSize: 12
        Layout.leftMargin: -unitLabel.width - 12
        z: 1
    }
}
