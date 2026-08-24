import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

Dialog {
    id: dlg
    property string acceptText: "OK"
    property bool acceptEnabled: true
    property bool destructive: false
    property bool showAccept: true
    property bool showCancel: true

    default property alias body: content.data

    parent: Overlay.overlay
    anchors.centerIn: parent
    width: Math.min(parent.width - 48, 420)
    contentWidth: availableWidth
    modal: true
    focus: true
    padding: 20
    closePolicy: Popup.CloseOnEscape | Popup.CloseOnPressOutside

    background: Rectangle {
        color: Theme.surface
        radius: Theme.radius * 2
        border.color: Theme.outline
    }

    header: Label {
        text: dlg.title
        color: Theme.text
        font.pixelSize: 18
        font.weight: Font.DemiBold
        padding: 16
        bottomPadding: 4
    }

    contentItem: ColumnLayout {
        id: content
        spacing: Theme.gap
    }

    footer: RowLayout {
        spacing: 8
        Item { Layout.fillWidth: true }
        Button {
            flat: true
            visible: dlg.showCancel
            text: "Annuler"
            onClicked: dlg.reject()
        }
        Button {
            visible: dlg.showAccept
            enabled: dlg.acceptEnabled
            text: dlg.acceptText
            Material.background: dlg.destructive ? "#c62828" : Theme.primary
            Material.foreground: "white"
            onClicked: dlg.accept()
        }
    }
}
