import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

Item {
    id: root
    signal requestNewProject()
    signal requestJoin()

    RowLayout {
        anchors.fill: parent
        anchors.margins: Theme.gap
        spacing: Theme.gap

        Rectangle {
            Layout.fillWidth: true
            Layout.fillHeight: true
            Layout.preferredWidth: 2
            color: Theme.surface
            radius: Theme.radius
            border.color: Theme.outline

            ColumnLayout {
                anchors.fill: parent
                anchors.margins: 16
                spacing: 12

                RowLayout {
                    Label {
                        text: "Projets"
                        font.pixelSize: 22
                        font.weight: Font.DemiBold
                        color: Theme.text
                    }
                    Item { Layout.fillWidth: true }
                    Button {
                        text: "Rejoindre"
                        flat: true
                        onClicked: root.requestJoin()
                    }
                    Button {
                        text: "Nouveau"
                        Material.background: Theme.primary
                        Material.foreground: "#ffffff"
                        onClicked: root.requestNewProject()
                    }
                    Button {
                        text: "↻ MAJ"
                        flat: true
                        onClicked: Updater.check()
                    }
                }

                ListView {
                    Layout.fillWidth: true
                    Layout.fillHeight: true
                    clip: true
                    model: Projects
                    spacing: 8
                    delegate: Rectangle {
                        width: ListView.view.width
                        height: 72
                        radius: Theme.radius
                        color: Theme.surfaceHigh
                        border.color: Theme.outline

                        ColumnLayout {
                            anchors.fill: parent
                            anchors.margins: 12
                            spacing: 2
                            Label {
                                text: model.name
                                font.weight: Font.DemiBold
                                color: Theme.text
                                elide: Text.ElideRight
                                Layout.fillWidth: true
                            }
                            Label {
                                text: model.locationLabel + "  ·  " + model.installType
                                      + (model.isDemo ? "  ·  démo" : "")
                                color: Theme.textDim
                                font.pixelSize: 12
                                elide: Text.ElideRight
                                Layout.fillWidth: true
                            }
                        }

                        MouseArea {
                            anchors.fill: parent
                            onClicked: Projects.openProject(model.projectId)
                            onPressAndHold: contextMenu.popup()
                        }

                        Menu {
                            id: contextMenu
                            MenuItem {
                                text: "Dupliquer"
                                onTriggered: Projects.cloneProject(model.projectId)
                            }
                            MenuItem {
                                text: "Supprimer"
                                onTriggered: Projects.removeProject(model.projectId)
                            }
                        }
                    }

                    Label {
                        anchors.centerIn: parent
                        visible: Projects.count === 0
                        text: "Aucun projet — créez-en un."
                        color: Theme.textDim
                    }
                }
            }
        }

        // News / welcome
        Rectangle {
            Layout.fillWidth: true
            Layout.fillHeight: true
            Layout.preferredWidth: 1
            visible: width > 280
            color: Theme.surface
            radius: Theme.radius
            border.color: Theme.outline

            ColumnLayout {
                anchors.fill: parent
                anchors.margins: 16
                spacing: 10

                Label {
                    text: "Open Solar Energy"
                    font.pixelSize: 20
                    font.weight: Font.DemiBold
                    color: Theme.primary
                }
                Label {
                    Layout.fillWidth: true
                    wrapMode: Text.WordWrap
                    color: Theme.textDim
                    text: "Dimensionnement photovoltaïque 100 % local — interface native QML."
                }

                Label {
                    text: "Actualités"
                    font.weight: Font.DemiBold
                    color: Theme.text
                }

                ListView {
                    Layout.fillWidth: true
                    Layout.fillHeight: true
                    clip: true
                    model: News.items
                    spacing: 8
                    delegate: Rectangle {
                        width: ListView.view.width
                        height: note.implicitHeight + 20
                        radius: Theme.radius
                        color: Theme.surfaceHigh
                        Column {
                            anchors.fill: parent
                            anchors.margins: 10
                            spacing: 4
                            Label {
                                text: modelData.ver
                                font.weight: Font.DemiBold
                                color: Theme.primary
                            }
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

                Button {
                    text: "Rafraîchir les news"
                    flat: true
                    onClicked: News.refresh()
                }
            }
        }
    }
}
