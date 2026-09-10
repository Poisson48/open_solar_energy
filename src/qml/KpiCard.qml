import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import OpenSolarEnergy

Rectangle {
    id: root
    property string title: ""
    property string value: ""
    property string subtitle: ""

    implicitWidth: Ui.kpiMinWidth
    implicitHeight: Ui.isPhone ? 72 : 80
    Layout.minimumWidth: Ui.kpiMinWidth
    Layout.preferredWidth: Ui.isPhone ? 1 : Ui.kpiMinWidth
    Layout.fillWidth: Ui.isPhone
    height: implicitHeight
    radius: Theme.radius
    color: Theme.surface
    border.color: Theme.outline

    ColumnLayout {
        anchors.fill: parent
        anchors.margins: Ui.isPhone ? 8 : 10
        spacing: 2
        Label {
            text: root.title
            color: Theme.textDim
            font.pixelSize: 11
            Layout.fillWidth: true
            elide: Text.ElideRight
        }
        Label {
            text: root.value
            color: Theme.primary
            font.pixelSize: Ui.isPhone ? 18 : 20
            font.weight: Font.DemiBold
            Layout.fillWidth: true
            elide: Text.ElideRight
        }
        Label {
            text: root.subtitle
            color: Theme.textDim
            font.pixelSize: 10
            visible: root.subtitle.length > 0
            Layout.fillWidth: true
            elide: Text.ElideRight
        }
    }
}
