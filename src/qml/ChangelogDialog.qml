import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import OpenSolarEnergy

OseDialog {
    id: dlg
    property string mode: "history"

    title: mode === "pending" ? ("Nouveautés — " + Updater.latestVersion)
         : mode === "whatsNew" ? ("Quoi de neuf — " + Updater.currentVersion)
         : "Notes de version"
    acceptText: mode === "pending" ? "Télécharger"
              : mode === "whatsNew" ? "Compris"
              : "Fermer"
    showCancel: mode === "pending"

    readonly property string bodyText: {
        if (mode === "pending")
            return Updater.releaseNotes
        if (mode === "whatsNew")
            return Updater.whatsNewNotes
        let blocks = []
        for (let i = 0; i < Updater.changelog.length; ++i) {
            const e = Updater.changelog[i]
            const ver = e.version || ""
            const notes = (e.notes || "").trim()
            if (!ver) continue
            blocks.push(notes.length > 0 ? ("Version " + ver + "\n\n" + notes) : ("Version " + ver))
        }
        return blocks.join("\n\n————————————\n\n")
    }

    function openPending() { mode = "pending"; open() }
    function openWhatsNew() { mode = "whatsNew"; open() }
    function openHistory() { mode = "history"; open() }

    Label {
        Layout.fillWidth: true
        visible: dlg.bodyText.length === 0
        text: "Corrections et améliorations."
        color: Theme.textDim
        wrapMode: Text.WordWrap
    }

    ScrollView {
        Layout.fillWidth: true
        Layout.preferredHeight: visible ? Math.min(Math.max(notes.implicitHeight, 80), 360) : 0
        visible: dlg.bodyText.length > 0
        clip: true
        Label {
            id: notes
            width: dlg.width - 64
            text: dlg.bodyText
            color: Theme.textDim
            wrapMode: Text.WordWrap
        }
    }

    onAccepted: {
        if (mode === "pending")
            Updater.download()
        else if (mode === "whatsNew")
            Updater.acknowledgeNotes()
    }
}
