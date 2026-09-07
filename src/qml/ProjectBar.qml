import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import "controls"

Rectangle {
    id: root
    signal requestHistory()
    signal requestClose()
    signal requestMateriel()
    signal requestShare()
    signal requestGotoLocation()
    signal requestEditClient()

    height: 56
    color: Theme.surface

    Rectangle {
        anchors.bottom: parent.bottom
        width: parent.width
        height: 1
        color: Theme.outline
    }

    readonly property var project: Projects.currentProject

    property string saveStatus: ""

    Timer {
        id: saveStatusTimer
        interval: 3000
        onTriggered: root.saveStatus = ""
    }

    RowLayout {
        anchors.fill: parent
        anchors.leftMargin: 8
        anchors.rightMargin: 8
        spacing: 6

        OseBtn {
            text: "←"
            kind: "flat"
            implicitWidth: 40
            onClicked: root.requestClose()
        }

        TextField {
            Layout.preferredWidth: 200
            Layout.minimumWidth: 140
            Layout.fillWidth: true
            Layout.maximumWidth: 280
            text: root.project.name || ""
            placeholderText: "Nom du projet…"
            onEditingFinished: Projects.setCurrentField("name", text)
            background: Rectangle {
                implicitHeight: 34
                radius: Theme.radius
                color: Theme.surfaceHigh
                border.color: Theme.outline
            }
        }

        Button {
            flat: true
            Layout.preferredWidth: Math.max(140, locLabel.implicitWidth + 16)
            Layout.maximumWidth: 280
            text: {
                const loc = root.project.location || {}
                return loc.name || (loc.lat !== undefined
                    ? (Number(loc.lat).toFixed(3) + ", " + Number(loc.lon).toFixed(3))
                    : "Lieu —")
            }
            contentItem: Text {
                id: locLabel
                text: parent.text
                color: Theme.primary
                font.pixelSize: 12
                elide: Text.ElideNone
                verticalAlignment: Text.AlignVCenter
            }
            onClicked: {
                AppController.currentTab = "location"
                root.requestGotoLocation()
            }
        }

        Button {
            flat: true
            Layout.preferredWidth: Math.max(100, clientLabel.implicitWidth + 16)
            Layout.maximumWidth: 220
            text: {
                const c = Projects.clientObject()
                return c.name || "Client…"
            }
            contentItem: Text {
                id: clientLabel
                text: parent.text
                color: Theme.textDim
                font.pixelSize: 12
                elide: Text.ElideNone
                verticalAlignment: Text.AlignVCenter
            }
            onClicked: root.requestEditClient()
        }

        Item { Layout.fillWidth: true }

        Label {
            visible: root.saveStatus.length > 0
            text: root.saveStatus
            color: Theme.success
            font.pixelSize: Theme.fontSizeCaption
        }

        ComboBox {
            id: typeBox
            Layout.preferredWidth: 140
            Layout.minimumWidth: 140
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
            onActivated: {
                Projects.setCurrentField("installType", currentValue)
                const flow = AppController.primaryTabFlow()
                let ok = false
                for (let i = 0; i < flow.length; ++i)
                    if (flow[i] === AppController.currentTab) ok = true
                if (!ok && flow.length)
                    AppController.currentTab = flow[0]
            }
        }

        OseBtn {
            text: "Sauver"
            onClicked: {
                Projects.updateCurrent({})
                AppController.autoSave("Sauvegarde manuelle")
                root.saveStatus = "Enregistré"
                saveStatusTimer.restart()
                AppController.toast("Projet sauvegardé (git)")
            }
        }
        OseBtn {
            text: "Export"
            kind: "outline"
            onClicked: {
                if (AppController.saveTextFile((root.project.name || "projet") + ".json", Projects.exportCurrentJson()))
                    AppController.toast("Export JSON OK")
            }
        }
        OseBtn { text: "Partager"; kind: "flat"; onClicked: root.requestShare() }
        OseBtn { text: "Matériel"; kind: "flat"; onClicked: root.requestMateriel() }
        OseBtn { text: "Historique"; kind: "flat"; onClicked: root.requestHistory() }
    }
}
