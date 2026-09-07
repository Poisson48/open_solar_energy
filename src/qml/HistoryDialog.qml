import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import OpenSolarEnergy
import "controls"

OseDialog {
    id: root
    title: "Historique & variantes"
    showAccept: false
    width: Math.min(Overlay.overlay ? Overlay.overlay.width - 48 : 560, 560)

    property var commits: []
    property var branchList: []
    property bool creatingBranch: false

    function refresh() {
        const id = Projects.currentId
        if (!id) {
            commits = []
            branchList = []
            return
        }
        commits = History.list(id)
        branchList = History.branches(id)
        if (!commits.length) {
            AppController.autoSave("État initial")
            commits = History.list(id)
            branchList = History.branches(id)
        }
    }

    onAboutToShow: {
        creatingBranch = false
        refresh()
    }

    ColumnLayout {
        Layout.fillWidth: true
        spacing: Theme.spaceMd

        Label {
            Layout.fillWidth: true
            wrapMode: Text.WordWrap
            font.pixelSize: Theme.fontSizeCaption
            color: Theme.textDim
            text: History.gitAvailable()
                  ? "Sauvegarde Git automatique à chaque calcul / action importante. Les variantes sont des branches pour tester plusieurs configs."
                  : "Git n’est pas disponible sur cette machine — historique limité."
        }

        // Variantes (branches)
        Rectangle {
            Layout.fillWidth: true
            implicitHeight: branchCol.implicitHeight + 16
            radius: Theme.radius
            color: Theme.surfaceHigh
            border.color: Theme.outline

            ColumnLayout {
                id: branchCol
                anchors.left: parent.left
                anchors.right: parent.right
                anchors.top: parent.top
                anchors.margins: 10
                spacing: 8

                Label {
                    text: "Variante"
                    font.weight: Font.DemiBold
                    font.pixelSize: Theme.fontSizeBody
                    color: Theme.text
                }

                Flow {
                    Layout.fillWidth: true
                    spacing: 6
                    visible: !root.creatingBranch
                    Repeater {
                        model: root.branchList
                        OseBtn {
                            required property var modelData
                            text: (modelData.current ? "✓ " : "") + (modelData.name || "")
                            kind: modelData.current ? "primary" : "outline"
                            implicitHeight: 28
                            font.pixelSize: Theme.fontSizeCaption
                            enabled: !modelData.current
                            onClicked: {
                                if (AppController.switchGitBranch(modelData.name))
                                    root.refresh()
                            }
                        }
                    }
                    OseBtn {
                        text: "+ Nouvelle variante"
                        kind: "outline"
                        implicitHeight: 28
                        font.pixelSize: Theme.fontSizeCaption
                        onClicked: root.creatingBranch = true
                    }
                }

                RowLayout {
                    visible: root.creatingBranch
                    Layout.fillWidth: true
                    spacing: 6
                    OseTextField {
                        id: branchName
                        Layout.fillWidth: true
                        hint: "ex. option-batterie-15kWh"
                    }
                    OseBtn {
                        text: "Créer"
                        kind: "primary"
                        onClicked: {
                            if (!branchName.text.trim()) return
                            if (AppController.createGitBranch(branchName.text.trim())) {
                                branchName.text = ""
                                root.creatingBranch = false
                                root.refresh()
                            }
                        }
                    }
                    OseBtn {
                        text: "Annuler"
                        kind: "flat"
                        onClicked: root.creatingBranch = false
                    }
                }
            }
        }

        Label {
            text: "Commits"
            font.weight: Font.DemiBold
            color: Theme.text
        }

        ListView {
            Layout.fillWidth: true
            Layout.preferredHeight: 300
            model: root.commits
            clip: true
            spacing: 6
            ScrollBar.vertical: ScrollBar { policy: ScrollBar.AsNeeded }

            delegate: Rectangle {
                width: ListView.view.width
                height: 58
                radius: Theme.radius
                color: index === 0 ? Theme.primarySubtle : Theme.surfaceHigh
                border.color: index === 0 ? Theme.primary : "transparent"
                border.width: index === 0 ? 1 : 0

                RowLayout {
                    anchors.fill: parent
                    anchors.margins: 10
                    spacing: 8
                    ColumnLayout {
                        Layout.fillWidth: true
                        spacing: 2
                        Label {
                            Layout.fillWidth: true
                            elide: Text.ElideRight
                            font.weight: Font.DemiBold
                            font.pixelSize: Theme.fontSizeBody
                            color: Theme.text
                            text: (modelData.message || "Sauvegarde")
                                  + (index === 0 ? "  (actuel)" : "")
                        }
                        Label {
                            Layout.fillWidth: true
                            elide: Text.ElideRight
                            font.pixelSize: Theme.fontSizeCaption
                            color: Theme.textDim
                            text: {
                                let d = modelData.createdAt || modelData.date || ""
                                try {
                                    const dt = new Date(d)
                                    if (!isNaN(dt.getTime()))
                                        d = Qt.formatDateTime(dt, "dd MMM yyyy hh:mm")
                                } catch (e) {}
                                const h = (modelData.hash || modelData.id || "").toString().slice(0, 7)
                                return d + (h ? (" · " + h) : "")
                            }
                        }
                    }
                    OseBtn {
                        visible: index > 0
                        text: "Restaurer"
                        kind: "outline"
                        implicitHeight: 28
                        font.pixelSize: Theme.fontSizeCaption
                        onClicked: {
                            if (AppController.restoreGitCommit(modelData.hash || modelData.id)) {
                                root.refresh()
                                root.close()
                            }
                        }
                    }
                }
            }

            Label {
                anchors.centerIn: parent
                visible: root.commits.length === 0
                text: "Aucun commit — lancez un calcul ou Sauver."
                color: Theme.textDim
            }
        }

        OseBtn {
            Layout.alignment: Qt.AlignRight
            text: "Sauvegarder maintenant"
            kind: "outline"
            onClicked: {
                AppController.autoSave("Sauvegarde manuelle")
                root.refresh()
            }
        }
    }
}
