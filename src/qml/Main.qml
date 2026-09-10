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
        if (editClientDialog.opened) { editClientDialog.close(); return }
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
        Ui.windowWidth = width
        Ui.windowHeight = height
        if (Qt.platform.os === "android")
            showMaximized()
    }

    onWidthChanged: Ui.windowWidth = width
    onHeightChanged: Ui.windowHeight = height

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
        anchors.topMargin: Qt.platform.os === "android" ? 4 : 0
        spacing: 0

        Rectangle {
            id: updateBannerDesktop
            Layout.fillWidth: true
            Layout.preferredHeight: visible ? 56 : 0
            visible: Qt.platform.os !== "android"
                     && (Updater.updateAvailable || Updater.downloading || Updater.readyToInstall
                         || Updater.state === 5)
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
