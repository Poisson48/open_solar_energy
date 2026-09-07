import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import "controls"

OseTabPage {
    id: root
    title: "Câbles"
    subtitle: "Section DC/AC et chute de tension. Stringing pour courant string."
    nextTabId: AppController.nextPrimaryTab()
    nextTabLabel: AppController.tabLabel(AppController.nextPrimaryTab())

    property var result: ({})
    property var stringing: ({})

    function calc() {
        result = CableCalc.calcSection({
            I: Number(iField.text),
            L: Number(lField.text),
            U_system: Number(uField.text),
            circuit: circuitBox.currentValue,
            material: matBox.currentValue
        })
        Projects.updateCurrent({ cableResult: result })
        AppController.autoSave("Calcul câblage — "
                               + (result.sectionMm2 || "?") + " mm²")
    }

    function fromStringing() {
        const panel = Catalog.getPanel(panelBox.currentValue) || {
            voc: 49.5, vmp: 41, isc: 10.5, imp: 9.8, pmax: 400
        }
        const inv = Catalog.getInverter(invBox.currentValue) || {
            maxInputV: 600, mpptMinV: 120, mpptMaxV: 550, maxInputI: 18, pac: 5, mpptCount: 2
        }
        stringing = Inverter.calcStringing(panel, inv)
        const opts = stringing.options || []
        if (opts.length) {
            iField.text = String(opts[0].parallel * (panel.imp || 9.8))
            uField.text = String(opts[0].vmp)
            circuitBox.currentIndex = 0
        }
    }

    OseFormResults {
        Layout.fillWidth: true

        OseStep {
            step: 1
            title: "Depuis stringing (optionnel)"
            RowLayout {
                Layout.fillWidth: true
                ComboBox {
                    id: panelBox
                    Layout.fillWidth: true
                    model: {
                        let m = [{ label: "Générique 400 Wc", value: "" }]
                        const ps = Catalog.panels || []
                        for (let i = 0; i < Math.min(ps.length, 120); ++i)
                            m.push({
                                label: (ps[i].fabricant || ps[i].brand || "") + " "
                                       + (ps[i].model || "") + " · " + (ps[i].wp || "") + " Wc",
                                value: ps[i].id
                            })
                        return m
                    }
                    textRole: "label"; valueRole: "value"
                }
                OseBtn { text: "Lib."; kind: "outline"; onClicked: AppController.openMateriel() }
            }
            RowLayout {
                Layout.fillWidth: true
                ComboBox {
                    id: invBox
                    Layout.fillWidth: true
                    model: {
                        let m = [{ label: "Générique 5 kVA", value: "" }]
                        const ps = Catalog.inverters || []
                        for (let i = 0; i < Math.min(ps.length, 120); ++i)
                            m.push({
                                label: (ps[i].brand || "") + " " + (ps[i].model || "")
                                       + " · " + (ps[i].pac || ps[i].pnom || "") + " kW",
                                value: ps[i].id
                            })
                        return m
                    }
                    textRole: "label"; valueRole: "value"
                }
                OseBtn { text: "Lib."; kind: "outline"; onClicked: AppController.openMateriel() }
            }
            OseBtn { text: "Remplir I / U depuis stringing"; kind: "outline"; onClicked: root.fromStringing() }
        }

        OseStep {
            step: 2
            title: "Paramètres câble"
            GridLayout {
                columns: 2
                Layout.fillWidth: true
                columnSpacing: 12; rowSpacing: 8
                Label { text: "Courant I" }
                OseInputUnit { id: iField; text: "10"; unit: "A"; Layout.fillWidth: true }
                Label { text: "Longueur" }
                OseInputUnit {
                    id: lField
                    text: String((Projects.currentProject.formState || {}).cableLengthM || 20)
                    unit: "m"; Layout.fillWidth: true
                }
                Label { text: "Tension" }
                OseInputUnit { id: uField; text: "400"; unit: "V"; Layout.fillWidth: true }
                Label { text: "Circuit" }
                ComboBox {
                    id: circuitBox
                    Layout.fillWidth: true
                    model: [
                        { label: "DC", value: "dc" },
                        { label: "AC mono", value: "ac_mono" },
                        { label: "AC tri", value: "ac_tri" }
                    ]
                    textRole: "label"; valueRole: "value"
                }
                Label { text: "Matériau" }
                ComboBox {
                    id: matBox
                    Layout.fillWidth: true
                    model: [
                        { label: "Cuivre", value: "Cu" },
                        { label: "Aluminium", value: "Al" }
                    ]
                    textRole: "label"; valueRole: "value"
                }
            }
        }

        OseBtn { text: "Calculer section"; onClicked: root.calc() }

        results: ColumnLayout {
            spacing: 10
            RowLayout {
                visible: !!result.sectionRecommended
                spacing: 8
                KpiCard { title: "Section"; value: result.sectionRecommended + " mm²" }
                KpiCard {
                    title: "Chute"
                    value: (result.recommended && result.recommended.dropPct
                            ? result.recommended.dropPct : 0) + " %"
                }
            }
            KpiCard {
                visible: !!(result.recommended && result.recommended.lossW !== undefined)
                title: "Pertes"
                value: (result.recommended && result.recommended.lossW
                        ? result.recommended.lossW : 0) + " W"
            }
            OseAlert {
                visible: !!result.sectionRecommended
                kind: "success"
                text: "Section recommandée " + result.sectionRecommended + " mm² — vérifiez aussi le calibre protection."
            }
            OseBtn {
                visible: !!result.sectionRecommended
                text: "Ajouter coût câble au devis"
                kind: "outline"
                onClicked: {
                    const sec = Number(result.sectionRecommended) || 6
                    const L = Number(lField.text) || 20
                    // Prix indicatif €/m selon section
                    const pricePerM = sec <= 4 ? 1.2 : (sec <= 6 ? 1.8 : (sec <= 10 ? 2.8 : 4.5))
                    const amount = Math.round(L * pricePerM * 100) / 100
                    const extra = (Projects.currentProject.quoteExtraLines || []).slice()
                    extra.push({
                        label: "Câble " + sec + " mm² × " + L + " m",
                        amount: amount,
                        manual: true
                    })
                    Projects.updateCurrent({ quoteExtraLines: extra })
                    AppController.currentTab = "quote"
                    AppController.toast("Ligne devis +" + amount + " €")
                }
            }
        }
    }
}
