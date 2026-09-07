import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

Flickable {
    id: root
    contentHeight: pageCol.implicitHeight + 32
    clip: true
    ScrollBar.vertical: ScrollBar { policy: ScrollBar.AsNeeded }

    property string title: ""
    property string subtitle: ""
    property string nextTabId: ""
    property string nextTabLabel: ""
    default property alias body: bodySlot.data

    signal continueClicked()

    ColumnLayout {
        id: pageCol
        width: root.width
        spacing: 0

        ColumnLayout {
            Layout.fillWidth: true
            Layout.leftMargin: 16
            Layout.rightMargin: 16
            Layout.topMargin: 16
            spacing: 4
            Label {
                text: root.title
                font.pixelSize: 20
                font.weight: Font.DemiBold
                color: Theme.text
            }
            Label {
                visible: root.subtitle.length > 0
                text: root.subtitle
                wrapMode: Text.WordWrap
                font.pixelSize: 13
                color: Theme.textDim
                Layout.fillWidth: true
            }
        }

        ColumnLayout {
            id: bodySlot
            Layout.fillWidth: true
            Layout.leftMargin: 16
            Layout.rightMargin: 16
            Layout.topMargin: 12
            spacing: 12
        }

        OseBtn {
            Layout.fillWidth: true
            Layout.leftMargin: 16
            Layout.rightMargin: 16
            Layout.topMargin: 8
            Layout.bottomMargin: 16
            visible: root.nextTabId.length > 0 || root.nextTabLabel.length > 0
            text: root.nextTabLabel.length
                  ? ("Continuer → " + root.nextTabLabel)
                  : "Continuer →"
            kind: "primary"
            onClicked: {
                root.continueClicked()
                if (root.nextTabId.length)
                    AppController.goNextPrimaryTab()
            }
        }
    }
}
