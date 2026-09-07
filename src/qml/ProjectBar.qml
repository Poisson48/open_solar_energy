import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

Rectangle {
    id: root
    signal requestHistory()
    signal requestClose()
    signal requestMateriel()
    signal requestShare()

    height: 56
    color: Theme.surface

    Rectangle {
        anchors.bottom: parent.bottom
        width: parent.width
        height: 1
        color: Theme.outline
    }

    readonly property var project: Projects.currentProject

    RowLayout {
        anchors.fill: parent
        anchors.leftMargin: 12
        anchors.rightMargin: 8
        spacing: 8

        ToolButton { text: "←"; onClicked: root.requestClose() }

        TextField {
            Layout.preferredWidth: 160
            text: root.project.name || ""
            placeholderText: "Nom du projet…"
            onEditingFinished: Projects.setCurrentField("name", text)
        }

        Label {
            text: {
                const loc = root.project.location || {}
                return loc.name || (loc.lat !== undefined ? (loc.lat.toFixed(3) + ", " + loc.lon.toFixed(3)) : "Lieu —")
            }
            color: Theme.textDim
            font.pixelSize: 12
            elide: Text.ElideRight
            Layout.preferredWidth: 120
        }

        Item { Layout.fillWidth: true }

        ComboBox {
            model: [
                { label: "Réseau", value: "grid" },
                { label: "Hybride", value: "hybrid" },
                { label: "Autonome", value: "offgrid" }
            ]
            textRole: "label"
            valueRole: "value"
            currentIndex: {
                const t = root.project.installType || "grid"
                if (t === "hybrid") return 1
                if (t === "offgrid") return 2
                return 0
            }
            onActivated: Projects.setCurrentField("installType", currentValue)
        }

        Button {
            text: "Sauver"
            Material.background: Theme.primary
            Material.foreground: "#ffffff"
            onClicked: {
                History.saveSnapshot(Projects.currentId, Projects.exportCurrentJson(), "Sauvegarde manuelle")
                Projects.updateCurrent({})
            }
        }
        Button { text: "Export"; flat: true; onClicked: AppController.saveTextFile((root.project.name || "projet") + ".json", Projects.exportCurrentJson()) }
        Button { text: "Partager"; flat: true; onClicked: root.requestShare() }
        Button { text: "Matériel"; flat: true; onClicked: root.requestMateriel() }
        Button { text: "Historique"; flat: true; onClicked: root.requestHistory() }
    }
}
