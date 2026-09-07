import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import "controls"

OseTabPage {
    id: root
    title: "Système PV"
    subtitle: "Production annuelle, stringing onduleur, finance."
    nextTabId: AppController.nextPrimaryTab()
    nextTabLabel: AppController.tabLabel(AppController.nextPrimaryTab())

    property var result: ({})
    property var stringing: ({})

    readonly property var panels: Catalog.panels
    readonly property var inverters: Catalog.inverters

    function calc() {
        let weather = Projects.currentProject.weatherData || []
        if (!weather.length) {
            AppController.toast("Chargez une météo dans Lieu (Open-Meteo ou PVGIS)", 3500)
            return
        }
        const loc = Projects.currentProject.location || {}
        const form = Projects.currentProject.formState || {}
        result = SolarMath.gridSystemAnnual({
            lat: loc.lat || 43.6,
            weatherData: weather,
            Ppeak: Number(pField.text),
            losses: Number(lossField.text),
            tilt: Number(tiltField.text),
            azimuth: Number(azField.text),
            systemCost: Number(costField.text),
            kwhPrice: Number(priceField.text)
        })
        const npv = Finance.calcNPV(Number(costField.text),
                                    (result.E_annual || 0) * Number(priceField.text) * 0.7,
                                    { lifetime: 25, discountRate: 0.03, panelDegradation: 0.005 })
        const payback = Finance.calcPayback(Number(costField.text),
                                            (result.E_annual || 0) * Number(priceField.text) * 0.7,
                                            { lifetime: 25, discountRate: 0.03 })
        const incentive = Finance.calcFrenchIncentive(Number(pField.text))
        result = Object.assign({}, result, { npv: npv, payback: payback, incentive: incentive })
        const panel = Catalog.getPanel(panelBox.currentValue) || {}
        const inv = Catalog.getInverter(invBox.currentValue) || {}
        Projects.updateCurrent({
            gridResult: result,
            formState: Object.assign({}, form, {
                Ppeak: Number(pField.text),
                tilt: Number(tiltField.text),
                azimuth: Number(azField.text),
                systemCost: Number(costField.text),
                panelId: panelBox.currentValue,
                inverterId: invBox.currentValue,
                panelWp: panel.wp || panel.pmax || 400,
                panelModel: (panel.fabricant || panel.brand || "") + " " + (panel.model || "Module"),
                inverterModel: (inv.fabricant || inv.brand || "") + " " + (inv.model || "Onduleur")
            })
        })
        Projects.updateCurrent({
            resultsFingerprint: Pipeline.fingerprint(Projects.currentProject),
            resultsBasis: Pipeline.fingerprintParts(Projects.currentProject)
        })
        runStringing()
        AppController.autoSave("Calcul réseau — "
                               + (Number(pField.text) || "?") + " kWc · "
                               + Math.round(result.E_annual || 0) + " kWh/an")
    }

    function runStringing() {
        const panel = Catalog.getPanel(panelBox.currentValue) || {
            voc: 49.5, vmp: 41, isc: 10.5, imp: 9.8, pmax: 400
        }
        const inv = Catalog.getInverter(invBox.currentValue) || {
            maxInputV: 600, mpptMinV: 120, mpptMaxV: 550, maxInputI: 18, pac: 5, mpptCount: 2
        }
        stringing = Inverter.calcStringing(panel, inv)
    }

    function selectCombo(box, id) {
        if (!id || !box.model) return
        for (let i = 0; i < box.model.length; ++i) {
            if (box.model[i].value === id) {
                box.currentIndex = i
                return
            }
        }
    }

    Component.onCompleted: {
        const form = Projects.currentProject.formState || {}
        if (form.Ppeak) pField.text = String(form.Ppeak)
        if (form.systemCost) costField.text = String(form.systemCost)
        selectCombo(panelBox, form.panelId)
        selectCombo(invBox, form.inverterId)
        if (form.panelId || form.inverterId)
            root.runStringing()
    }

    OseFormResults {
        Layout.fillWidth: true

        OseStep {
            step: 1
            title: "Matériel"
            Label { text: "Panneau"; color: Theme.textDim }
            RowLayout {
                Layout.fillWidth: true
                ComboBox {
                    id: panelBox
                    Layout.fillWidth: true
                    model: {
                        let m = [{ label: "Générique 400 Wc", value: "" }]
                        const ps = Catalog.panels || []
                        for (let i = 0; i < Math.min(ps.length, 400); ++i) {
                            m.push({
                                label: (ps[i].fabricant || ps[i].brand || "") + " "
                                       + (ps[i].model || "") + " · " + (ps[i].wp || "") + " Wc",
                                value: ps[i].id
                            })
                        }
                        return m
                    }
                    textRole: "label"
                    valueRole: "value"
                    onActivated: root.runStringing()
                }
                OseBtn { text: "Lib."; kind: "outline"; onClicked: AppController.openMateriel() }
            }
            Label { text: "Onduleur"; color: Theme.textDim }
            RowLayout {
                Layout.fillWidth: true
                ComboBox {
                    id: invBox
                    Layout.fillWidth: true
                    model: {
                        let m = [{ label: "Générique 5 kVA", value: "" }]
                        const ps = Catalog.inverters || []
                        for (let i = 0; i < Math.min(ps.length, 400); ++i) {
                            m.push({
                                label: (ps[i].brand || "") + " " + (ps[i].model || "")
                                       + " · " + (ps[i].pac || ps[i].pnom || "") + " kW",
                                value: ps[i].id
                            })
                        }
                        return m
                    }
                    textRole: "label"
                    valueRole: "value"
                    onActivated: root.runStringing()
                }
                OseBtn { text: "Lib."; kind: "outline"; onClicked: AppController.openMateriel() }
            }
        }

        OseStep {
            step: 2
            title: "Système"
            GridLayout {
                columns: 2
                Layout.fillWidth: true
                columnSpacing: 12; rowSpacing: 8
                Label { text: "Puissance" }
                OseInputUnit { id: pField; text: String((Projects.currentProject.formState || {}).Ppeak || 3); unit: "kWc"; Layout.fillWidth: true }
                Label { text: "Inclinaison" }
                OseInputUnit { id: tiltField; text: String((Projects.currentProject.formState || {}).tilt || 30); unit: "°"; Layout.fillWidth: true }
                Label { text: "Azimut" }
                OseInputUnit { id: azField; text: String((Projects.currentProject.formState || {}).azimuth || 0); unit: "°"; Layout.fillWidth: true }
                Label { text: "Pertes" }
                OseInputUnit { id: lossField; text: "14"; unit: "%"; Layout.fillWidth: true }
                Label { text: "Coût système" }
                OseInputUnit { id: costField; text: String((Projects.currentProject.formState || {}).systemCost || 3600); unit: "€"; Layout.fillWidth: true }
                Label { text: "Prix kWh" }
                OseInputUnit { id: priceField; text: "0.25"; unit: "€"; Layout.fillWidth: true }
            }
        }

        OseBtn { text: "Calculer"; onClicked: root.calc() }
        RowLayout {
            OseBtn {
                text: "Export CSV production"
                kind: "outline"
                visible: !!(result.monthly && result.monthly.length)
                onClicked: {
                    let csv = "mois,E_kWh\n"
                    const m = result.monthly || []
                    for (let i = 0; i < m.length; ++i)
                        csv += (i + 1) + "," + (m[i].E_month || 0) + "\n"
                    if (AppController.saveTextFile("production-mensuelle.csv", csv))
                        AppController.toast("CSV enregistré")
                }
            }
            OseBtn {
                text: "Appliquer → Dim."
                kind: "flat"
                visible: !!result.E_annual
                onClicked: {
                    const form = Projects.currentProject.formState || {}
                    Projects.updateCurrent({
                        formState: Object.assign({}, form, {
                            Ppeak: Number(pField.text),
                            tilt: Number(tiltField.text),
                            azimuth: Number(azField.text),
                            systemCost: Number(costField.text)
                        })
                    })
                    AppController.currentTab = "sizing"
                    AppController.toast("Paramètres envoyés au Dim.")
                }
            }
            OseBtn {
                text: "Reco onduleur auto"
                kind: "outline"
                onClicked: {
                    const ppeak = Number(pField.text) || 3
                    const invs = Catalog.inverters || []
                    let best = null
                    let bestDiff = 1e9
                    for (let i = 0; i < invs.length; ++i) {
                        const pac = Number(invs[i].pac || invs[i].pacKw || 0)
                        if (pac <= 0) continue
                        const diff = Math.abs(pac - ppeak)
                        if (diff < bestDiff) { bestDiff = diff; best = invs[i] }
                    }
                    if (best) {
                        for (let i = 0; i < invBox.model.length; ++i) {
                            if (invBox.model[i].value === best.id) {
                                invBox.currentIndex = i
                                break
                            }
                        }
                        root.runStringing()
                        AppController.toast("Onduleur " + (best.model || best.id))
                    } else {
                        AppController.toast("Catalogue onduleurs vide — Matériel", 3500)
                    }
                }
            }
        }

        results: ColumnLayout {
            spacing: 10
            RowLayout {
                visible: !!result.E_annual
                spacing: 8
                KpiCard { title: "Production"; value: result.E_annual + " kWh" }
                KpiCard { title: "PR"; value: String(result.PR) }
            }
            RowLayout {
                visible: !!result.E_annual
                spacing: 8
                KpiCard { title: "LCOE"; value: (result.LCOE || 0).toFixed(3) + " €" }
                KpiCard { title: "Rendement"; value: result.specificYield + " kWh/kWc" }
            }
            RowLayout {
                visible: result.payback !== undefined
                spacing: 8
                KpiCard { title: "Payback"; value: (result.payback || "—") + " ans" }
                KpiCard { title: "VAN"; value: Math.round(result.npv || 0) + " €" }
            }
            Label {
                visible: result.incentive !== undefined
                text: "Prime autoconsommation estimée : " + Math.round(result.incentive || 0) + " €"
                color: Theme.primary
                font.weight: Font.DemiBold
            }
            SimpleBarChart {
                Layout.fillWidth: true
                Layout.preferredHeight: 180
                visible: !!(result.monthly && result.monthly.length)
                unit: "kWh"
                decimals: 0
                values: {
                    const m = result.monthly || []
                    let out = []
                    for (let i = 0; i < m.length; ++i) out.push(m[i].E_month || 0)
                    return out
                }
            }
            OseCard {
                title: "Stringing onduleur"
                visible: !!(stringing.options && stringing.options.length)
                Label {
                    Layout.fillWidth: true
                    wrapMode: Text.WordWrap
                    font.pixelSize: 12
                    color: Theme.textDim
                    text: {
                        const opts = stringing.options || []
                        let s = "Série " + stringing.minSeries + "–" + stringing.maxSeries
                              + " · parallèle max " + stringing.maxParallel + "\n"
                        for (let i = 0; i < Math.min(6, opts.length); ++i) {
                            const o = opts[i]
                            s += o.series + "s × " + o.parallel + "p → " + o.panels
                               + " modules · " + o.dcPowerW + " Wc · ratio " + o.dcAcRatio + "\n"
                        }
                        return s
                    }
                }
            }
        }
    }
}
