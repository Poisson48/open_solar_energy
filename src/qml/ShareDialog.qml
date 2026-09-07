import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import OpenSolarEnergy

OseDialog {
    id: root
    title: "Partager le projet"
    showAccept: false

    ColumnLayout {
        Layout.fillWidth: true
        spacing: 10

        Label {
            Layout.fillWidth: true
            wrapMode: Text.WordWrap
            text: "Publie un snapshot chiffré (AES-GCM) sur des relais Nostr (kind 30078) et génère une clé courte / URI."
            color: Theme.textDim
        }

        Button {
            text: Share.busy ? "Publication…" : "Publier sur Nostr"
            enabled: !Share.busy && Projects.currentId.length > 0
            Material.background: Theme.primary
            Material.foreground: "#fff"
            onClicked: Share.publish(Projects.currentId, Projects.exportCurrentJson(),
                                     Projects.currentProject.name || "Projet")
        }

        Label {
            Layout.fillWidth: true
            wrapMode: Text.WrapAnywhere
            text: Share.lastInvite.length ? Share.lastInvite : (Share.status || "—")
            color: Theme.text
        }

        Button {
            text: "Enregistrer l’invite"
            enabled: Share.lastInvite.length > 0
            flat: true
            onClicked: AppController.saveTextFile("invite-ose.txt", Share.lastInvite)
        }
    }
}
