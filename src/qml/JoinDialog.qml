import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import OpenSolarEnergy

OseDialog {
    id: root
    title: "Rejoindre un projet"
    acceptText: "Importer"
    acceptEnabled: inviteField.text.length > 8

    ColumnLayout {
        Layout.fillWidth: true
        spacing: 10
        Label {
            Layout.fillWidth: true
            wrapMode: Text.WordWrap
            color: Theme.textDim
            text: "Collez une URI opensolar://, une clé OSE-… ou un payload opensolar:."
        }
        TextArea {
            id: inviteField
            Layout.fillWidth: true
            Layout.preferredHeight: 120
            wrapMode: TextEdit.Wrap
        }
        Label { text: Share.status; color: Theme.textDim }
    }

    Connections {
        target: Share
        function onProjectReceived(project) {
            Projects.importProjectJson(JSON.stringify(project))
            root.close()
        }
    }

    onAccepted: {
        const parsed = Share.parseInvitePayload(inviteField.text)
        if (parsed.ok && parsed.project) {
            Projects.importProjectJson(JSON.stringify(parsed.project))
            return
        }
        Share.join(inviteField.text)
    }
}
