import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import OpenSolarEnergy
import "controls"

Item {
    id: root
    signal requestNewProject()
    signal requestJoin()
    signal requestMateriel()

    property string filter: ""
    property string pendingDeleteId: ""

    Rectangle {
        anchors.fill: parent
        color: Theme.background
    }

    Dialog {
        id: deleteConfirm
        title: "Supprimer le projet ?"
        modal: true
        anchors.centerIn: Overlay.overlay
        standardButtons: Dialog.Yes | Dialog.No
        Label {
            text: "Cette action est définitive."
            wrapMode: Text.WordWrap
            width: 280
        }
        onAccepted: {
            if (root.pendingDeleteId.length)
                Projects.removeProject(root.pendingDeleteId)
            root.pendingDeleteId = ""
            AppController.toast("Projet supprimé")
        }
        onRejected: root.pendingDeleteId = ""
    }

    ColumnLayout {
        anchors.fill: parent
        anchors.margins: Ui.isPhone ? 12 : 24
        spacing: 16

        Label {
            text: "Open Solar Energy"
            font.pixelSize: Ui.isPhone ? 22 : 26
            font.weight: Font.DemiBold
            color: Theme.primary
            Layout.fillWidth: true
            wrapMode: Text.WordWrap
        }
        Label {
            Layout.fillWidth: true
            Layout.maximumWidth: 1100
            wrapMode: Text.WordWrap
            color: Theme.textDim
            text: "Dimensionnement photovoltaïque 100 % local — projets, météo, ombrage, devis."
        }

        Flow {
            Layout.fillWidth: true
            Layout.maximumWidth: 900
            spacing: 8
            OseBtn { text: "Nouveau projet"; onClicked: root.requestNewProject() }
            OseBtn { text: "Rejoindre"; kind: "outline"; onClicked: root.requestJoin() }
            OseBtn { text: "Matériel"; kind: "flat"; onClicked: root.requestMateriel() }
            OseBtn {
                text: "Importer JSON…"
                kind: "outline"
                onClicked: {
                    const path = AppController.openFileDialog("Projet (*.json);;Tous (*.*)")
                    if (!path) return
                    const json = AppController.readTextFile(path)
                    if (!json || !Projects.importProjectJson(json))
                        AppController.toast("Import échoué", 3500)
                    else
                        AppController.toast("Projet importé")
                }
            }
            OseBtn {
                text: "Exporter tout"
                kind: "outline"
                onClicked: {
                    if (AppController.saveTextFile("ose-projets.json", Projects.exportAllJson()))
                        AppController.toast("Export JSON OK")
                }
            }
            OseBtn {
                text: "Exporter ZIP"
                kind: "flat"
                onClicked: AppController.exportProjectsZip()
            }
            OseBtn { text: "Mises à jour"; kind: "flat"; onClicked: Updater.check() }
        }

        TextField {
            id: searchField
            Layout.fillWidth: true
            Layout.maximumWidth: 1100
            placeholderText: "Rechercher un projet…"
            onTextChanged: root.filter = text.trim().toLowerCase()
            background: Rectangle {
                implicitHeight: 40
                radius: Theme.radius
                color: Theme.surface
                border.color: Theme.outline
            }
        }

        ListView {
            id: projectList
            Layout.fillWidth: true
            Layout.fillHeight: true
            Layout.maximumWidth: 900
            clip: true
            spacing: 8
            ScrollBar.vertical: ScrollBar { policy: ScrollBar.AsNeeded }

            model: Projects
            delegate: Rectangle {
                required property string projectId
                required property string name
                required property string locationLabel
                required property string installType
                required property bool isDemo

                width: projectList.width
                height: showRow ? 76 : 0
                visible: showRow
                opacity: showRow ? 1 : 0

                readonly property bool showRow: {
                    if (!root.filter.length) return true
                    const hay = (name + " " + locationLabel + " " + installType).toLowerCase()
                    return hay.indexOf(root.filter) >= 0
                }

                radius: Theme.radius
                color: Theme.surface
                border.color: Theme.outline

                RowLayout {
                    anchors.fill: parent
                    anchors.margins: 14
                    spacing: 12
                    visible: parent.showRow
                    ColumnLayout {
                        Layout.fillWidth: true
                        spacing: 2
                        Label {
                            text: name
                            font.weight: Font.DemiBold
                            color: Theme.text
                            elide: Text.ElideRight
                            Layout.fillWidth: true
                        }
                        Label {
                            text: locationLabel + "  ·  "
                                  + (installType === "offgrid" ? "Autonome"
                                     : installType === "hybrid" ? "Hybride" : "Réseau")
                                  + (isDemo ? "  ·  démo" : "")
                            color: Theme.textDim
                            font.pixelSize: 12
                            elide: Text.ElideRight
                            Layout.fillWidth: true
                        }
                    }
                    Label {
                        text: "Ouvrir →"
                        color: Theme.primary
                        font.pixelSize: 12
                        font.weight: Font.DemiBold
                    }
                }

                MouseArea {
                    anchors.fill: parent
                    enabled: parent.showRow
                    acceptedButtons: Qt.LeftButton | Qt.RightButton
                    onClicked: (mouse) => {
                        if (mouse.button === Qt.RightButton) contextMenu.popup()
                        else Projects.openProject(projectId)
                    }
                    onPressAndHold: contextMenu.popup()
                }
                Menu {
                    id: contextMenu
                    MenuItem { text: "Dupliquer"; onTriggered: Projects.cloneProject(projectId) }
                    MenuItem {
                        text: "Supprimer…"
                        onTriggered: {
                            root.pendingDeleteId = projectId
                            deleteConfirm.open()
                        }
                    }
                }
            }

            Label {
                anchors.centerIn: parent
                visible: Projects.count === 0
                text: "Aucun projet — créez-en un pour commencer."
                color: Theme.textDim
            }
        }

        OseCard {
            title: "Actualités"
            Layout.fillWidth: true
            Layout.maximumWidth: 900
            Layout.preferredHeight: Math.min(200, 56 + News.items.length * 64)
            ListView {
                Layout.fillWidth: true
                Layout.fillHeight: true
                clip: true
                model: News.items
                spacing: 8
                delegate: Rectangle {
                    width: ListView.view.width
                    height: note.implicitHeight + 28
                    radius: Theme.radius
                    color: Theme.surfaceHigh
                    Column {
                        anchors.fill: parent
                        anchors.margins: 10
                        spacing: 4
                        Label { text: modelData.ver; font.weight: Font.DemiBold; color: Theme.primary }
                        Label {
                            id: note
                            width: parent.width
                            wrapMode: Text.WordWrap
                            text: modelData.notes
                            color: Theme.textDim
                            font.pixelSize: 12
                        }
                    }
                }
            }
            OseBtn {
                text: "Rafraîchir"
                kind: "flat"
                onClicked: News.refresh()
            }
        }
    }
}
