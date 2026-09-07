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
    minimumWidth: 360
    minimumHeight: 560
    color: Theme.background

    Material.theme: Material.Light
    Material.background: Theme.background
    Material.foreground: Theme.text
    Material.primary: Theme.primary
    Material.accent: Theme.accent

    ChangelogDialog { id: changelogDialog }
    NewProjectDialog { id: newProjectDialog }
    HistoryDialog { id: historyDialog }
    MaterielDialog { id: materielDialog }
    ShareDialog { id: shareDialog }
    JoinDialog { id: joinDialog }

    onClosing: function (close) {
        if (Qt.platform.os !== "android") {
            close.accepted = true
            return
        }
        close.accepted = false
        if (changelogDialog.opened) { changelogDialog.close(); return }
        if (newProjectDialog.opened) { newProjectDialog.close(); return }
        if (historyDialog.opened) { historyDialog.close(); return }
        if (materielDialog.opened) { materielDialog.close(); return }
        if (shareDialog.opened) { shareDialog.close(); return }
        if (joinDialog.opened) { joinDialog.close(); return }
        if (Updater.updateAvailable || Updater.downloading || Updater.readyToInstall
                || Updater.checking || Updater.state === 5) {
            Updater.dismiss()
            return
        }
        if (AppController.handleBack())
            return
        Qt.quit()
    }

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

    Connections {
        target: Projects
        function onCurrentChanged() {
            if (Projects.currentId.length > 0)
                AppController.openWorkspace()
        }
    }

    ColumnLayout {
        anchors.fill: parent
        spacing: 0

        Rectangle {
            Layout.fillWidth: true
            Layout.preferredHeight: visible ? 36 : 0
            visible: Qt.platform.os !== "android"
            color: Theme.primary
            RowLayout {
                anchors.fill: parent
                anchors.leftMargin: 14
                anchors.rightMargin: 8
                Label {
                    text: "Open Solar Energy  ·  v" + Updater.currentVersion + "  ·  QML"
                    color: "#ffffff"
                    font.pixelSize: 12
                    opacity: 0.9
                }
                Item { Layout.fillWidth: true }
                Button {
                    flat: true
                    text: Updater.downloading ? "Téléchargement…"
                         : (Updater.state === 1 ? "Vérification…" : "Vérifier les mises à jour")
                    enabled: !Updater.downloading && Updater.state !== 1
                    onClicked: Updater.check()
                    contentItem: Text {
                        text: parent.text
                        color: "#ffffff"
                        font.pixelSize: 12
                        horizontalAlignment: Text.AlignHCenter
                        verticalAlignment: Text.AlignVCenter
                    }
                    background: Rectangle {
                        color: parent.hovered ? "#ffffff22" : "transparent"
                        radius: 4
                    }
                }
            }
        }

        Rectangle {
            id: updateBannerDesktop
            Layout.fillWidth: true
            Layout.preferredHeight: visible ? 56 : 0
            visible: Qt.platform.os !== "android"
                     && (Updater.updateAvailable || Updater.downloading || Updater.readyToInstall
                         || Updater.checking || Updater.state === 5)
            color: Updater.state === 5 ? "#fdecea" : Theme.surfaceHigh
            RowLayout {
                anchors.fill: parent
                anchors.margins: 12
                spacing: 8
                Label {
                    Layout.fillWidth: true
                    wrapMode: Text.WordWrap
                    font.weight: Font.DemiBold
                    text: {
                        if (Updater.checking) return "Vérification des mises à jour…"
                        if (Updater.downloading)
                            return Updater.statusMessage.length > 0 ? Updater.statusMessage : "Téléchargement…"
                        if (Updater.readyToInstall)
                            return "Version " + Updater.latestVersion + " prête"
                        if (Updater.state === 5)
                            return Updater.statusMessage.length > 0 ? Updater.statusMessage : "Échec de la mise à jour"
                        return "Version " + Updater.latestVersion + " disponible"
                    }
                }
                Button {
                    flat: true
                    visible: !Updater.downloading && !Updater.checking
                    text: Updater.state === 5 ? "Réessayer"
                         : (Updater.readyToInstall ? "Installer"
                         : (Updater.canInstall ? "Mettre à jour" : "Télécharger"))
                    onClicked: {
                        if (Updater.state === 5) {
                            if (Updater.canInstall) Updater.install()
                            else Updater.check()
                            return
                        }
                        if (Updater.readyToInstall) { Updater.install(); return }
                        if (Updater.releaseNotes.length > 0)
                            changelogDialog.openPending()
                        else
                            Updater.download()
                    }
                }
                ToolButton {
                    visible: !Updater.downloading && !Updater.checking
                    text: "✕"
                    onClicked: Updater.dismiss()
                }
            }
        }

        StackLayout {
            Layout.fillWidth: true
            Layout.fillHeight: true
            currentIndex: AppController.inWorkspace ? 1 : 0

            HubView {
                onRequestNewProject: newProjectDialog.open()
                onRequestJoin: joinDialog.open()
            }

            WorkspaceView {
                onRequestHistory: historyDialog.open()
                onRequestClose: AppController.closeWorkspace()
                onRequestMateriel: materielDialog.open()
                onRequestShare: shareDialog.open()
            }
        }
    }
}
