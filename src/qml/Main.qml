import QtQuick
import QtQuick.Controls
import QtQuick.Controls.Material
import QtQuick.Layouts
import OpenSolarEnergy
import "controls"

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
    SyncDialog { id: syncDialog }
    EditClientDialog { id: editClientDialog }

    function showToast(msg, ms) { toast.show(msg, ms || 2800) }

    Shortcut {
        sequences: [StandardKey.Save]
        enabled: AppController.inWorkspace
        onActivated: {
            AppController.autoSave("Ctrl+S")
            AppController.toast("Sauvegardé (git)")
            Projects.updateCurrent({})
            window.showToast("Projet sauvegardé")
        }
    }

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
        if (syncDialog.opened) { syncDialog.close(); return }
        if (editClientDialog.opened) { editClientDialog.close(); return }
        if (Updater.updateAvailable || Updater.downloading || Updater.readyToInstall
                || Updater.checking || Updater.failed) {
            Updater.dismiss()
            return
        }
        if (AppController.handleBack())
            return
        Qt.quit()
    }

    Component.onCompleted: {
        Ui.windowWidth = width
        Ui.windowHeight = height
        if (Qt.platform.os === "android")
            showMaximized()
        // Vérif silencieuse au démarrage (bandeau si une release GitHub est plus récente)
        startupUpdateCheck.restart()
    }

    onWidthChanged: Ui.windowWidth = width
    onHeightChanged: Ui.windowHeight = height

    Timer {
        id: startupUpdateCheck
        interval: 2500
        repeat: false
        onTriggered: {
            if (!Updater.checking && !Updater.downloading)
                Updater.check()
        }
    }

    // PackageInstaller Android : remonter besoin de permission / succès / erreur
    Timer {
        id: installPollTimer
        interval: 800
        repeat: true
        running: Qt.platform.os === "android"
                 && (Updater.readyToInstall || Updater.downloading
                     || Updater.statusMessage.indexOf("Installation") >= 0
                     || Updater.statusMessage.indexOf("autorisez") >= 0)
        onTriggered: Updater.pollNativeInstallStatus()
    }

    Connections {
        target: Updater
        function onChangelogChanged() {
            if (Updater.hasWhatsNew && !Updater.updateAvailable
                && !Updater.downloading && !Updater.readyToInstall)
                changelogDialog.openWhatsNew()
        }
        function onStatusMessageChanged() {
            // Idle + message = à jour / erreur réseau sans bandeau
            if (!Updater.updateAvailable && !Updater.downloading && !Updater.readyToInstall
                    && !Updater.checking && !Updater.failed
                    && Updater.statusMessage.length > 0)
                window.showToast(Updater.statusMessage, 3200)
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
        anchors.topMargin: Qt.platform.os === "android" ? 4 : 0
        spacing: 0

        Rectangle {
            id: updateBanner
            Layout.fillWidth: true
            Layout.preferredHeight: visible ? (Ui.isPhone ? 72 : 56) : 0
            // PC + téléphone : même bandeau (téléchargement APK / AppImage via GitHub Releases)
            visible: Updater.updateAvailable || Updater.downloading || Updater.readyToInstall
                     || Updater.failed
            color: Updater.failed ? "#fdecea" : Theme.surfaceHigh
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
                        if (Updater.failed)
                            return Updater.statusMessage.length > 0 ? Updater.statusMessage : "Échec de la mise à jour"
                        return "Version " + Updater.latestVersion + " disponible"
                    }
                }
                Button {
                    flat: true
                    visible: !Updater.downloading && !Updater.checking
                    text: Updater.failed ? "Réessayer"
                         : (Updater.readyToInstall ? "Installer"
                         : (Updater.canInstall ? "Mettre à jour" : "Télécharger"))
                    onClicked: {
                        if (Updater.failed) {
                            Updater.startUpdate()
                            return
                        }
                        if (Updater.readyToInstall) { Updater.install(); return }
                        if (Updater.releaseNotes.length > 0)
                            changelogDialog.openPending()
                        else
                            Updater.startUpdate()
                    }
                }
                ToolButton {
                    visible: !Updater.downloading && !Updater.checking
                    text: "✕"
                    onClicked: Updater.dismiss()
                }
            }
        }

        Item {
            Layout.fillWidth: true
            Layout.fillHeight: true

            // Remonter Hub / Workspace à chaque bascule — évite le layout cassé
            // après visible:false (ColumnLayout + Repeater).
            Loader {
                id: hubLoader
                anchors.fill: parent
                active: !AppController.inWorkspace
                visible: active
                sourceComponent: HubView {
                    onRequestNewProject: newProjectDialog.open()
                    onRequestJoin: joinDialog.open()
                    onRequestMateriel: materielDialog.open()
                    onRequestSyncSend: syncDialog.openSend()
                    onRequestSyncReceive: syncDialog.openReceive()
                }
            }

            Loader {
                id: workspaceLoader
                anchors.fill: parent
                active: AppController.inWorkspace
                visible: active
                sourceComponent: WorkspaceView {
                    onRequestHistory: historyDialog.open()
                    onRequestClose: AppController.closeWorkspace()
                    onRequestMateriel: materielDialog.open()
                    onRequestShare: shareDialog.open()
                    onRequestEditClient: {
                        if (Projects.currentId.length > 0)
                            editClientDialog.openForCurrent()
                    }
                }
            }

            OseToast {
                id: toast
                anchors.left: parent.left
                anchors.right: parent.right
                anchors.bottom: parent.bottom
                z: 100
            }

            Connections {
                target: AppController
                function onToastRequested(message, ms) { toast.show(message, ms) }
                function onMaterielRequested() { materielDialog.open() }
            }
        }
    }
}
