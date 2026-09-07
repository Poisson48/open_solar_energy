import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import OpenSolarEnergy

OseDialog {
    id: root
    title: "Bibliothèque matériel"
    showAccept: false
    width: Math.min(Overlay.overlay.width - 32, 560)

    property int tab: 0

    ColumnLayout {
        Layout.fillWidth: true
        spacing: 8

        TabBar {
            Layout.fillWidth: true
            TabButton { text: "Panneaux"; onClicked: root.tab = 0 }
            TabButton { text: "Onduleurs"; onClicked: root.tab = 1 }
        }

        ListView {
            Layout.fillWidth: true
            Layout.preferredHeight: 280
            clip: true
            model: root.tab === 0 ? Catalog.panels : Catalog.inverters
            spacing: 6
            delegate: Rectangle {
                width: ListView.view.width
                height: 56
                radius: Theme.radius
                color: Theme.surfaceHigh
                RowLayout {
                    anchors.fill: parent
                    anchors.margins: 10
                    ColumnLayout {
                        Layout.fillWidth: true
                        Label {
                            text: root.tab === 0
                                  ? ((modelData.fabricant || "") + " " + (modelData.model || ""))
                                  : ((modelData.brand || "") + " " + (modelData.model || ""))
                            font.weight: Font.DemiBold
                            elide: Text.ElideRight
                            Layout.fillWidth: true
                        }
                        Label {
                            text: root.tab === 0
                                  ? ((modelData.wp || 0) + " Wc")
                                  : ((modelData.pac || 0) + " kVA · " + (modelData.type || ""))
                            color: Theme.textDim
                            font.pixelSize: 12
                        }
                    }
                    ToolButton {
                        text: "✕"
                        onClicked: {
                            if (root.tab === 0) Catalog.removePanel(modelData.id)
                            else Catalog.removeInverter(modelData.id)
                        }
                    }
                }
            }
        }

        Label { text: root.tab === 0 ? "Nouveau panneau" : "Nouvel onduleur"; font.weight: Font.DemiBold }

        GridLayout {
            columns: 2
            Layout.fillWidth: true
            visible: root.tab === 0
            TextField { id: pModel; placeholderText: "Modèle"; Layout.fillWidth: true }
            TextField { id: pWp; placeholderText: "Wc"; Layout.fillWidth: true }
            TextField { id: pVoc; placeholderText: "Voc"; Layout.fillWidth: true }
            TextField { id: pVmp; placeholderText: "Vmp"; Layout.fillWidth: true }
            TextField { id: pIsc; placeholderText: "Isc"; Layout.fillWidth: true }
            TextField { id: pImp; placeholderText: "Imp"; Layout.fillWidth: true }
        }
        GridLayout {
            columns: 2
            Layout.fillWidth: true
            visible: root.tab === 1
            TextField { id: iModel; placeholderText: "Modèle"; Layout.fillWidth: true }
            TextField { id: iPac; placeholderText: "kVA"; Layout.fillWidth: true }
            TextField { id: iMaxV; placeholderText: "Vmax DC"; Layout.fillWidth: true }
            TextField { id: iMaxI; placeholderText: "Imax"; Layout.fillWidth: true }
        }

        Button {
            text: "Ajouter"
            Material.background: Theme.primary
            Material.foreground: "#fff"
            onClicked: {
                if (root.tab === 0) {
                    Catalog.savePanel({
                        model: pModel.text, fabricant: "Perso", wp: Number(pWp.text),
                        voc: Number(pVoc.text), vmp: Number(pVmp.text),
                        isc: Number(pIsc.text), imp: Number(pImp.text)
                    })
                } else {
                    Catalog.saveInverter({
                        model: iModel.text, brand: "Perso", type: "string",
                        pac: Number(iPac.text), maxInputV: Number(iMaxV.text),
                        maxInputI: Number(iMaxI.text), mpptCount: 2,
                        mpptMinV: 120, mpptMaxV: Number(iMaxV.text) * 0.9
                    })
                }
            }
        }
    }
}
