import QtQuick
import QtQuick.Controls
import QtQuick.Controls.Material
import QtQuick.Layouts
import OpenSolarEnergy

ApplicationWindow {
    id: window
    visible: true
    title: "Open Solar Energy"
    width: 1400
    height: 900
    minimumWidth: 900
    minimumHeight: 600
    color: Theme.background

    Material.theme: Material.Light
    Material.background: Theme.background
    Material.foreground: Theme.text
    Material.primary: Theme.primary
    Material.accent: Theme.accent

    ChangelogDialog { id: changelogDialog }

    Component.onCompleted: {
        if (Qt.platform.os === "android")
            showMaximized()
    }

    Connections {
        target: Updater
        function onChangelogChanged() {
            if (Updater.hasWhatsNew && !Updater.updateAvailable
                && !Updater.downloading && !Updater.readyToInstall)
                changelogDialog.openWhatsNew()
        }
    }

    ColumnLayout {
        anchors.fill: parent
        spacing: 0

        // Desktop only — sur Android la barre doublonne le header web et mange l’écran
        Rectangle {
            Layout.fillWidth: true
            Layout.preferredHeight: visible ? 40 : 0
            visible: Qt.platform.os !== "android"
            color: Theme.surface
            border.color: Theme.outline
            border.width: 0
            clip: true

            RowLayout {
                anchors.fill: parent
                anchors.leftMargin: 12
                anchors.rightMargin: 8
                spacing: 8

                Label {
                    text: "Open Solar Energy  ·  v" + Updater.currentVersion
                    color: Theme.textDim
                    font.pixelSize: 12
                }
                Item { Layout.fillWidth: true }
                Button {
                    flat: true
                    text: Updater.downloading ? "Téléchargement…"
                         : (Updater.state === 1 ? "Vérification…" : "Vérifier les mises à jour")
                    enabled: !Updater.downloading && Updater.state !== 1
                    onClicked: Updater.check()
                }
            }
        }

        Rectangle {
            id: updateBanner
            Layout.fillWidth: true
            Layout.preferredHeight: visible ? 56 : 0
            visible: Updater.updateAvailable || Updater.downloading || Updater.readyToInstall || Updater.state === 5
            color: Theme.surfaceHigh
            clip: true

            RowLayout {
                anchors.fill: parent
                anchors.margins: 12
                spacing: 8

                ColumnLayout {
                    Layout.fillWidth: true
                    spacing: 4
                    Label {
                        Layout.fillWidth: true
                        elide: Text.ElideRight
                        font.weight: Font.DemiBold
                        text: {
                            if (Updater.downloading) return "Téléchargement…"
                            if (Updater.readyToInstall)
                                return "Version " + Updater.latestVersion + " prête"
                            if (Updater.state === 5)
                                return "Échec du téléchargement"
                            return "Version " + Updater.latestVersion + " disponible"
                        }
                    }
                    Rectangle {
                        Layout.fillWidth: true
                        Layout.preferredHeight: 3
                        radius: 2
                        visible: Updater.downloading
                        color: Theme.outline
                        Rectangle {
                            height: parent.height
                            radius: 2
                            color: Theme.accent
                            width: parent.width * Updater.progress
                        }
                    }
                    Label {
                        Layout.fillWidth: true
                        visible: !Updater.downloading
                        color: Theme.textDim
                        font.pixelSize: 12
                        text: Updater.readyToInstall
                              ? (Qt.platform.os === "android"
                                 ? "Android vous demandera confirmation"
                                 : "Ouvrir la page de téléchargement")
                              : ("Vous avez la v" + Updater.currentVersion)
                    }
                }

                Button {
                    flat: true
                    visible: !Updater.downloading
                    text: Updater.readyToInstall ? "Installer"
                         : (Updater.canInstall ? "Mettre à jour" : "Télécharger")
                    onClicked: {
                        if (Updater.readyToInstall)
                            Updater.install()
                        else if (Updater.releaseNotes.length > 0)
                            changelogDialog.openPending()
                        else
                            Updater.download()
                    }
                }
                ToolButton {
                    visible: !Updater.downloading
                    text: "✕"
                    onClicked: Updater.dismiss()
                }
            }
        }

        Loader {
            Layout.fillWidth: true
            Layout.fillHeight: true
            source: AppController.useWebEngine
                ? "WebContainerDesktop.qml"
                : "WebContainerMobile.qml"
            onLoaded: {
                item.webUrl = AppController.webUrl
                item.bridge = AppController.bridge
            }
        }
    }
}
