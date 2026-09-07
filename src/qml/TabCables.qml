import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

Flickable {
    contentHeight: col.implicitHeight + 24
    clip: true
    property var result: ({})

    ColumnLayout {
        id: col
        width: parent.width
        x: 16; y: 16
        spacing: 12
        Label { text: "Câbles"; font.pixelSize: 20; font.weight: Font.DemiBold }

        GridLayout {
            columns: 2
            Layout.fillWidth: true
            columnSpacing: 12
            rowSpacing: 8
            Label { text: "Courant I (A)" }
            TextField { id: iField; text: "10"; Layout.fillWidth: true }
            Label { text: "Longueur (m)" }
            TextField { id: lField; text: "20"; Layout.fillWidth: true }
            Label { text: "Tension (V)" }
            TextField { id: uField; text: "400"; Layout.fillWidth: true }
            Label { text: "Circuit" }
            ComboBox {
                id: circuitBox
                Layout.fillWidth: true
                model: [
                    { label: "DC", value: "dc" },
                    { label: "AC mono", value: "ac_mono" },
                    { label: "AC tri", value: "ac_tri" }
                ]
                textRole: "label"
                valueRole: "value"
            }
        }

        Button {
            text: "Calculer section"
            Material.background: Theme.primary
            Material.foreground: "#fff"
            onClicked: {
                result = CableCalc.calcSection({
                    I: Number(iField.text),
                    L: Number(lField.text),
                    U_system: Number(uField.text),
                    circuit: circuitBox.currentValue,
                    material: "Cu"
                })
            }
        }

        RowLayout {
            visible: !!result.sectionRecommended
            spacing: 10
            KpiCard { title: "Section"; value: result.sectionRecommended + " mm²" }
            KpiCard {
                title: "Chute"
                value: (result.recommended && result.recommended.dropPct
                        ? result.recommended.dropPct : 0) + " %"
            }
            KpiCard {
                title: "Pertes"
                value: (result.recommended && result.recommended.lossW
                        ? result.recommended.lossW : 0) + " W"
            }
        }
    }
}
