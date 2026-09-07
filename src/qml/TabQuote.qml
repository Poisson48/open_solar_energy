import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

Flickable {
    contentHeight: col.implicitHeight + 24
    clip: true

    property var lines: [
        { label: "Modules PV", amount: 2400 },
        { label: "Onduleur", amount: 900 },
        { label: "Structure + câblage", amount: 600 },
        { label: "Main d'œuvre", amount: 1200 }
    ]

    ColumnLayout {
        id: col
        width: parent.width
        x: 16; y: 16
        spacing: 12
        Label { text: "Devis"; font.pixelSize: 20; font.weight: Font.DemiBold }

        TextField {
            id: clientField
            Layout.fillWidth: true
            placeholderText: "Client"
            text: Projects.currentProject.client || ""
        }

        Repeater {
            model: lines
            delegate: RowLayout {
                Layout.fillWidth: true
                Label { text: modelData.label; Layout.fillWidth: true }
                Label { text: modelData.amount.toFixed(2) + " €"; color: Theme.textDim }
            }
        }

        property real ht: {
            let s = 0
            for (let i = 0; i < lines.length; ++i) s += lines[i].amount
            return s
        }

        Label {
            text: "Total HT : " + col.ht.toFixed(2) + " €  ·  TTC (10 %) : " + (col.ht * 1.1).toFixed(2) + " €"
            font.weight: Font.DemiBold
        }

        Button {
            text: "Exporter PDF"
            Material.background: Theme.primary
            Material.foreground: "#fff"
            onClicked: {
                const path = PdfExport.exportQuote(
                    "Devis — " + (Projects.currentProject.name || "PV"),
                    clientField.text,
                    lines,
                    0.1)
                if (path)
                    AppController.openLocalFile(path)
            }
        }
    }
}
