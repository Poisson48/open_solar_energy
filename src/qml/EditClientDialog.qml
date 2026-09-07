import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import OpenSolarEnergy

OseDialog {
    id: root
    title: "Fiche client"
    acceptText: "Enregistrer"

    property string projectId: ""

    function openForCurrent() {
        const c = Projects.clientObject()
        nameField.text = c.name || (typeof Projects.currentProject.client === "string"
                                    ? Projects.currentProject.client : "")
        emailField.text = c.email || ""
        phoneField.text = c.phone || c.tel || ""
        addressField.text = c.address || ""
        cityField.text = c.city || ""
        zipField.text = c.zip || c.cp || ""
        open()
    }

    onAccepted: {
        Projects.setClientObject({
            name: nameField.text.trim(),
            email: emailField.text.trim(),
            phone: phoneField.text.trim(),
            address: addressField.text.trim(),
            city: cityField.text.trim(),
            zip: zipField.text.trim()
        })
        AppController.toast("Client enregistré")
    }

    ColumnLayout {
        Layout.fillWidth: true
        spacing: 8
        TextField { id: nameField; Layout.fillWidth: true; placeholderText: "Nom / société" }
        TextField { id: emailField; Layout.fillWidth: true; placeholderText: "E-mail" }
        TextField { id: phoneField; Layout.fillWidth: true; placeholderText: "Téléphone" }
        TextField { id: addressField; Layout.fillWidth: true; placeholderText: "Adresse" }
        RowLayout {
            Layout.fillWidth: true
            TextField { id: zipField; Layout.preferredWidth: 100; placeholderText: "CP" }
            TextField { id: cityField; Layout.fillWidth: true; placeholderText: "Ville" }
        }
    }
}
