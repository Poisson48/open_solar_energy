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

    // Android : bouton retour = fermer modales/hub d’abord, double-appui pour quitter.
    // Desktop : croix / Alt+F4 doit toujours quitter (ne pas recycler le flux « back » Android).
    onClosing: function (close) {
        if (Qt.platform.os !== "android") {
            close.accepted = true
            return
        }

        close.accepted = false

        if (changelogDialog.opened) {
            changelogDialog.close()
            return
        }

        if (Updater.updateAvailable || Updater.downloading || Updater.readyToInstall
                || Updater.checking || Updater.state === 5) {
            Updater.dismiss()
            return
        }

        const web = webLoader.item
        if (web && typeof web.tryHandleBack === "function") {
            web.tryHandleBack(function (handled) {
                if (!handled)
                    Qt.quit()
            })
            return
        }

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

    ColumnLayout {
        anchors.fill: parent
        spacing: 0

        // Desktop only — sur Android la barre doublonne le header web et mange l’écran
        Rectangle {
            Layout.fillWidth: true
            Layout.preferredHeight: visible ? 36 : 0
            visible: Qt.platform.os !== "android"
            color: Theme.primary
            border.width: 0
            clip: true

            RowLayout {
                anchors.fill: parent
                anchors.leftMargin: 14
                anchors.rightMargin: 8
                spacing: 8

                Label {
                    text: "Open Solar Energy  ·  v" + Updater.currentVersion
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

        // Bandeau MAJ desktop (dans le flux). Sur Android → overlay ci-dessous.
        Rectangle {
            id: updateBannerDesktop
            Layout.fillWidth: true
            Layout.preferredHeight: visible ? 56 : 0
            visible: Qt.platform.os !== "android"
                     && (Updater.updateAvailable || Updater.downloading || Updater.readyToInstall
                         || Updater.checking || Updater.state === 5)
            color: Updater.state === 5 ? "#fdecea" : Theme.surfaceHigh
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
                            if (Updater.checking) return "Vérification des mises à jour…"
                            if (Updater.downloading)
                                return Updater.statusMessage.length > 0
                                       ? Updater.statusMessage : "Téléchargement…"
                            if (Updater.readyToInstall)
                                return "Version " + Updater.latestVersion + " prête"
                            if (Updater.state === 5)
                                return (Updater.statusMessage.length > 0
                                        ? Updater.statusMessage
                                        : "Échec de la mise à jour")
                            return "Version " + Updater.latestVersion + " disponible"
                        }
                        wrapMode: Text.WordWrap
                        maximumLineCount: 2
                    }
                    Rectangle {
                        Layout.fillWidth: true
                        Layout.preferredHeight: 4
                        radius: 2
                        visible: Updater.downloading
                        color: Theme.outline
                        Rectangle {
                            height: parent.height
                            radius: 2
                            color: Theme.accent
                            width: Math.max(parent.width * Math.max(0, Updater.progress),
                                            Updater.downloading && Updater.progress <= 0 ? 24 : 0)
                        }
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

        Loader {
            id: webLoader
            Layout.fillWidth: true
            Layout.fillHeight: true
            source: AppController.useWebEngine
                ? "WebContainerDesktop.qml"
                : "WebContainerMobile.qml"
            onLoaded: {
                item.webUrl = AppController.webUrl
                item.bridge = AppController.bridge
                // `property var updater` vaut undefined par défaut : le test
                // `!== undefined` ne marchait JAMAIS → startUpdate jamais appelé,
                // barre hub figée, faux message « apps inconnues ».
                if ("updater" in item)
                    item.updater = Updater
            }
        }
    }

    // Android : bandeau en overlay au-dessus du WebView / hub (sinon invisible /
    // confondu avec le toast JS seul).
    Rectangle {
        id: updateBannerAndroid
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.top: parent.top
        z: 100
        height: visible ? 84 : 0
        visible: Qt.platform.os === "android"
                 && (Updater.updateAvailable || Updater.downloading || Updater.readyToInstall
                     || Updater.checking || Updater.state === 5)
        color: Updater.state === 5 ? "#fdecea" : Theme.surfaceHigh
        clip: true

        Rectangle {
            anchors.bottom: parent.bottom
            width: parent.width
            height: 1
            color: Theme.outline
        }

        RowLayout {
            anchors.fill: parent
            anchors.leftMargin: 12
            anchors.rightMargin: 8
            anchors.topMargin: 10
            anchors.bottomMargin: 10
            spacing: 8

            ColumnLayout {
                Layout.fillWidth: true
                spacing: 6
                Label {
                    Layout.fillWidth: true
                    wrapMode: Text.WordWrap
                    maximumLineCount: 2
                    font.weight: Font.DemiBold
                    font.pixelSize: 13
                    text: {
                        if (Updater.checking) return "Vérification des mises à jour…"
                        if (Updater.downloading)
                            return Updater.statusMessage.length > 0
                                   ? Updater.statusMessage : "Téléchargement…"
                        if (Updater.readyToInstall)
                            return "Version " + Updater.latestVersion + " prête — installation…"
                        if (Updater.state === 5)
                            return (Updater.statusMessage.length > 0
                                    ? Updater.statusMessage
                                    : "Échec de la mise à jour")
                        return "Version " + Updater.latestVersion + " disponible"
                    }
                }
                Rectangle {
                    Layout.fillWidth: true
                    Layout.preferredHeight: 6
                    radius: 3
                    visible: Updater.downloading || Updater.checking
                    color: Theme.outline
                    Rectangle {
                        id: androidProgressFill
                        height: parent.height
                        radius: 3
                        color: Theme.accent
                        width: {
                            if (Updater.checking)
                                return parent.width * 0.35
                            return Math.max(parent.width * Math.max(0, Math.min(1, Updater.progress)),
                                            Updater.progress <= 0 ? 28 : 0)
                        }
                        Behavior on width { NumberAnimation { duration: 180 } }
                    }
                    // Animation « indéterminée » tant que 0 Mo reçu
                    SequentialAnimation on opacity {
                        running: Updater.checking || (Updater.downloading && Updater.progress <= 0.02)
                        loops: Animation.Infinite
                        NumberAnimation { from: 0.45; to: 1.0; duration: 700 }
                        NumberAnimation { from: 1.0; to: 0.45; duration: 700 }
                    }
                }
                Label {
                    Layout.fillWidth: true
                    visible: Updater.downloading && Updater.bytesReceived > 0
                    color: Theme.textDim
                    font.pixelSize: 11
                    text: (Updater.bytesReceived / 1e6).toFixed(1) + " Mo reçus"
                }
            }

            Button {
                flat: true
                visible: !Updater.downloading && !Updater.checking
                text: Updater.state === 5 ? "Réessayer"
                     : (Updater.readyToInstall ? "Installer"
                     : "Mettre à jour")
                onClicked: {
                    if (Updater.state === 5) {
                        if (Updater.canInstall) Updater.install()
                        else Updater.startUpdate()
                        return
                    }
                    if (Updater.readyToInstall) { Updater.install(); return }
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
}
