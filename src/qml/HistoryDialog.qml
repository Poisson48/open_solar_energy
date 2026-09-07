import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import OpenSolarEnergy

OseDialog {
    id: root
    title: "Historique des versions"
    showAccept: false

    property var snapshots: []

    onAboutToShow: snapshots = History.list(Projects.currentId)

    ListView {
        Layout.fillWidth: true
        Layout.preferredHeight: 320
        model: root.snapshots
        clip: true
        spacing: 6
        delegate: Rectangle {
            width: ListView.view.width
            height: 56
            radius: Theme.radius
            color: Theme.surfaceHigh
            RowLayout {
                anchors.fill: parent
                anchors.margins: 10
                ColumnLayout {
                    Layout.fillWidth: true
                    Label { text: modelData.message || "Snapshot"; font.weight: Font.DemiBold }
                    Label { text: modelData.createdAt || modelData.id; color: Theme.textDim; font.pixelSize: 11 }
                }
                Button {
                    text: "Restaurer"
                    flat: true
                    onClicked: {
                        const json = History.loadSnapshot(Projects.currentId, modelData.id)
                        if (json.length > 0)
                            Projects.importProjectJson(json)
                        root.close()
                    }
                }
            }
        }
        Label {
            anchors.centerIn: parent
            visible: root.snapshots.length === 0
            text: "Aucun snapshot pour ce projet"
            color: Theme.textDim
        }
    }
}
