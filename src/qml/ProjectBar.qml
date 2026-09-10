import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import OpenSolarEnergy
import "controls"

Rectangle {
    id: root
    signal requestHistory()
    signal requestClose()
    signal requestMateriel()
    signal requestShare()
    signal requestGotoLocation()
    signal requestEditClient()

    height: 52
    color: Theme.surface

    Rectangle {
        anchors.bottom: parent.bottom
        width: parent.width
        height: 1
        color: Theme.outline
    }

    readonly property var project: Projects.currentProject
    readonly property bool compact: Ui.isCompact

    property string saveStatus: ""

    Timer {
        id: saveStatusTimer
        interval: 3000
        onTriggered: root.saveStatus = ""
    }

    function doSave() {
        Projects.updateCurrent({})
        AppController.autoSave("Sauvegarde manuelle")
        root.saveStatus = "OK"
        saveStatusTimer.restart()
        AppController.toast("Projet sauvegardé")
    }

    RowLayout {
        anchors.fill: parent
        anchors.leftMargin: 6
        anchors.rightMargin: 6
        spacing: 4

        OseBtn {
            text: "←"
            kind: "flat"
            implicitWidth: 40
            implicitHeight: Theme.touchTarget
            onClicked: root.requestClose()
        }

        TextField {
            Layout.fillWidth: true
            Layout.minimumWidth: root.compact ? 80 : 120
            Layout.maximumWidth: root.compact ? 10000 : 280
            text: root.project.name || ""
            // Évite le label flottant Material qui se superpose au nom
            placeholderText: text.length > 0 ? "" : "Projet…"
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
            visible: !root.compact
            Layout.preferredWidth: Math.min(200, Math.max(100, locLabel.implicitWidth + 16))
            Layout.maximumWidth: 220
            text: {
                const loc = root.project.location || {}
                return loc.name || (loc.lat !== undefined
                    ? (Number(loc.lat).toFixed(3) + ", " + Number(loc.lon).toFixed(3))
                    : "Lieu")
            }
            contentItem: Text {
                id: locLabel
                text: parent.text
                color: Theme.primary
                font.pixelSize: 12
                elide: Text.ElideRight
                verticalAlignment: Text.AlignVCenter
            }
            onClicked: {
                AppController.currentTab = "location"
                root.requestGotoLocation()
            }
        }

        Button {
            flat: true
            visible: !root.compact
            Layout.preferredWidth: Math.min(160, Math.max(80, clientLabel.implicitWidth + 16))
            Layout.maximumWidth: 180
            text: {
                const c = Projects.clientObject()
                return c.name || "Client"
            }
            contentItem: Text {
                id: clientLabel
                text: parent.text
                color: Theme.textDim
                font.pixelSize: 12
                elide: Text.ElideRight
                verticalAlignment: Text.AlignVCenter
            }
            onClicked: root.requestEditClient()
        }

        Label {
            visible: root.saveStatus.length > 0 && !root.compact
            text: root.saveStatus
            color: Theme.success
            font.pixelSize: Theme.fontSizeCaption
        }

        ComboBox {
            id: typeBox
            visible: !root.compact
            Layout.preferredWidth: 120
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
            visible: !root.compact
            text: "Sauver"
            onClicked: root.doSave()
        }
        OseBtn {
            visible: !root.compact
            text: "Export"
            kind: "outline"
            onClicked: {
                if (AppController.saveTextFile((root.project.name || "projet") + ".json", Projects.exportCurrentJson()))
                    AppController.toast("Export JSON OK")
            }
        }
        OseBtn {
            visible: !root.compact
            text: "Partager"
            kind: "flat"
            onClicked: root.requestShare()
        }
        OseBtn {
            visible: !root.compact
            text: "Matériel"
            kind: "flat"
            onClicked: root.requestMateriel()
        }
        OseBtn {
            visible: !root.compact
            text: "Historique"
            kind: "flat"
            onClicked: root.requestHistory()
        }

        ToolButton {
            visible: root.compact
            text: "⋯"
            font.pixelSize: 22
            implicitWidth: Theme.touchTarget
            implicitHeight: Theme.touchTarget
            onClicked: overflowMenu.open()
            Menu {
                id: overflowMenu
                MenuItem {
                    text: "Lieu"
                    onTriggered: {
                        AppController.currentTab = "location"
                        root.requestGotoLocation()
                    }
                }
                MenuItem {
                    text: "Client"
                    onTriggered: root.requestEditClient()
                }
                MenuSeparator {}
                MenuItem {
                    text: "Type : Réseau"
                    onTriggered: {
                        Projects.setCurrentField("installType", "grid")
                        typeBox.currentIndex = 0
                    }
                }
                MenuItem {
                    text: "Type : Hybride"
                    onTriggered: {
                        Projects.setCurrentField("installType", "hybrid")
                        typeBox.currentIndex = 1
                    }
                }
                MenuItem {
                    text: "Type : Autonome"
                    onTriggered: {
                        Projects.setCurrentField("installType", "offgrid")
                        typeBox.currentIndex = 2
                    }
                }
                MenuSeparator {}
                MenuItem { text: "Sauver"; onTriggered: root.doSave() }
                MenuItem {
                    text: "Exporter JSON"
                    onTriggered: {
                        if (AppController.saveTextFile((root.project.name || "projet") + ".json",
                                                       Projects.exportCurrentJson()))
                            AppController.toast("Export JSON OK")
                    }
                }
                MenuItem { text: "Partager"; onTriggered: root.requestShare() }
                MenuItem { text: "Matériel"; onTriggered: root.requestMateriel() }
                MenuItem { text: "Historique"; onTriggered: root.requestHistory() }
            }
        }
    }
}
