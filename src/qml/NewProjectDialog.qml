import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import OpenSolarEnergy

OseDialog {
    id: root
    title: "Nouveau projet"
    acceptText: "Créer"

    property string installType: "grid"

    ColumnLayout {
        Layout.fillWidth: true
        spacing: 10

        OseTextField {
            id: nameField
            Layout.fillWidth: true
            placeholderText: "Nom du projet"
        }
        OseTextField {
            id: clientField
            Layout.fillWidth: true
            placeholderText: "Client (optionnel)"
        }
        Label { text: "Type d'installation"; color: Theme.textDim }
        ButtonGroup { id: typeGroup }
        ColumnLayout {
            RadioButton {
                text: "Réseau"
                checked: true
                ButtonGroup.group: typeGroup
                onCheckedChanged: if (checked) root.installType = "grid"
            }
            RadioButton {
                text: "Hybride"
                ButtonGroup.group: typeGroup
                onCheckedChanged: if (checked) root.installType = "hybrid"
            }
            RadioButton {
                text: "Autonome"
                ButtonGroup.group: typeGroup
                onCheckedChanged: if (checked) root.installType = "offgrid"
            }
        }
    }

    onAccepted: {
        Projects.createProject(nameField.text || "Nouveau projet", root.installType, clientField.text)
        nameField.text = ""
        clientField.text = ""
    }
}
