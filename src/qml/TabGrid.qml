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
    property var compatibility: ({})
    property bool showAllInverters: false

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
        const site = Projects.currentProject.siteSurvey || {}
        const energyMode = form.energyMode || "fast"
        result = SolarMath.gridSystemAnnual({
            lat: loc.lat || 43.6,
            weatherData: weather,
            Ppeak: Number(pField.text),
            losses: Number(lossField.text),
            lossTree: form.lossTree && Object.keys(form.lossTree).length
                      ? form.lossTree
                      : YearPv.defaultLossTree(Number(lossField.text) || 14),
            tilt: Number(tiltField.text),
            azimuth: Number(azField.text),
            systemCost: Number(costField.text),
            kwhPrice: Number(priceField.text),
            monthlyLoss: site.monthlyLoss || [],
            annualLossPct: site.annualLossPct || 0,
            halfHourlyKeep: site.halfHourlyKeep || [],
            energyMode: energyMode,
            hourlyWeatherData: Projects.currentProject.hourlyWeatherData || {},
            useElectricalShade: energyMode === "study"
        })
        const sizingBest = (Projects.currentProject.sizingResult || {}).best || {}
        const ppeak = Number(pField.text)
        const injPrice = Number(form.injectionPrice !== undefined ? form.injectionPrice : 0.04)
        const price = Number(priceField.text)
        let annualGain = 0
        let npv = 0
        let payback = null
        let incentive = Finance.calcFrenchIncentive(ppeak)
        // Même finance que le dimensionnement si Ppeak aligné
        if (sizingBest.Ppeak !== undefined
                && Math.abs(Number(sizingBest.Ppeak) - ppeak) < 0.06
                && Number(sizingBest.savings) > 0) {
            annualGain = Number(sizingBest.savings)
            npv = sizingBest.npv
            payback = sizingBest.payback
            if (sizingBest.incentive !== undefined)
                incentive = sizingBest.incentive
        } else {
            // Fallback : ~55 % autoconso + surplus au tarif injection
            annualGain = (result.E_annual || 0) * 0.55 * price
                       + (result.E_annual || 0) * 0.45 * injPrice
            npv = Finance.calcNPV(Number(costField.text), annualGain,
                                  { lifetime: 25, discountRate: 0.03, panelDegradation: 0.005 })
            payback = Finance.calcPayback(Number(costField.text), annualGain,
                                          { lifetime: 25, discountRate: 0.03 })
        }
        result = Object.assign({}, result, {
            npv: npv,
            payback: payback,
            incentive: incentive,
            savings: Math.round(annualGain)
        })
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
                inverterModel: (inv.fabricant || inv.brand || "") + " " + (inv.model || "Onduleur"),
                batteryId: batteryBox.currentValue || form.batteryId || "",
                batteryModel: batteryBox.currentValue
                              ? ((Catalog.getBattery(batteryBox.currentValue) || {}).name || "")
                              : (form.batteryModel || "")
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
        const form = Projects.currentProject.formState || {}
        const actualPanel = Catalog.getPanel(panelBox.currentValue || form.panelId) || {}
        const actualInv = Catalog.getInverter(invBox.currentValue || form.inverterId) || {}
        const panel = actualPanel.voc ? actualPanel : {
            voc: 49.5, vmp: 41, isc: 10.5, imp: 9.8, pmax: 400
        }
        const inv = actualInv.maxInputV ? actualInv : {
            maxInputV: 600, mpptMinV: 120, mpptMaxV: 550, maxInputI: 18, pac: 5, mpptCount: 2
        }
        const battery = Catalog.getBattery(batteryBox.currentValue || form.batteryId) || {}
        const panelWp = Number(panel.pmax || panel.wp) || 400
        const nPanels = Number(form.panelCount) > 0
                      ? Number(form.panelCount)
                      : Math.max(1, Math.round((Number(pField.text) || 3) * 1000 / panelWp))
        const batteryKwh = Number(battery.energy_kwh) || Number(form.battKwh) || 0
        stringing = Inverter.calcStringing(panel, inv)
        compatibility = Inverter.checkCompatibility(actualPanel, actualInv, battery, nPanels, batteryKwh)
    }

    function compatibilityText() {
        const c = root.compatibility || {}
        let lines = []
        const errs = c.errors || []
        const warns = c.warnings || []
        const infos = c.infos || []
        for (let i = 0; i < errs.length; ++i) lines.push("⛔ " + errs[i])
        for (let i = 0; i < warns.length; ++i) lines.push("⚠️ " + warns[i])
        for (let i = 0; i < infos.length; ++i) lines.push("ℹ️ " + infos[i])
        if (errs.length > 0 || warns.length > 0)
            lines.push("Sélection conservée : vous pouvez continuer, mais vérifiez ces points.")
        if (lines.length === 0 && (c.hasPanel || c.hasInverter))
            lines.push("✅ Panneaux et onduleur compatibles.")
        return lines.join("\n")
    }

    function applyBattery() {
        const b = Catalog.getBattery(batteryBox.currentValue) || {}
        const f = Projects.currentProject.formState || {}
        const chem = (b.chemistry || "").toUpperCase()
        const tech = chem.indexOf("LFP") >= 0 ? "LFP"
                   : (chem.indexOf("NMC") >= 0 ? "NMC" : (f.battTech || "NMC"))
        Projects.updateCurrent({
            formState: Object.assign({}, f, {
                batteryId: b.id || "",
                batteryModel: b.name || "",
                battKwh: b.energy_kwh || f.battKwh || 0,
                battTech: tech,
                offgridResult: {}
            })
        })
        root.runStringing()
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
        selectCombo(batteryBox, form.batteryId)
        if (form.panelId || form.inverterId || form.batteryId)
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
                        const f = Projects.currentProject.formState || {}
                        const panel = Catalog.getPanel(panelBox.currentValue || f.panelId) || {}
                        const battery = Catalog.getBattery(f.batteryId) || {}
                        const hasCtx = !!(panel.id || battery.id)
                        const n = Number(f.panelCount) > 0
                                  ? Number(f.panelCount)
                                  : Math.max(1, Math.round((Number(f.Ppeak) || 3) * 1000
                                                           / (Number(panel.pmax || panel.wp) || 400)))
                        const kwh = Number(f.battKwh) || Number(battery.energy_kwh) || 0
                        let m = [{ label: "Générique 5 kVA", value: "" }]
                        const ps = Catalog.inverters || []
                        for (let i = 0; i < Math.min(ps.length, 400); ++i) {
                            let badge = ""
                            if (hasCtx) {
                                const c = Inverter.checkCompatibility(panel, ps[i], battery, n, kwh)
                                if (c.status === "danger" && !root.showAllInverters)
                                    continue
                                badge = c.status === "danger" ? "⛔ "
                                      : (c.status === "warning" ? "⚠️ " : "✅ ")
                            }
                            m.push({
                                label: badge + (ps[i].brand || "") + " " + (ps[i].model || "")
                                       + " · " + (ps[i].pac || ps[i].pnom || "") + " kW",
                                value: ps[i].id
                            })
                        }
                        return m
                    }
                    textRole: "label"
                    valueRole: "value"
                    onActivated: root.runStringing()
                    onModelChanged: {
                        const f = Projects.currentProject.formState || {}
                        let idx = 0
                        for (let i = 0; i < model.length; ++i) {
                            if (model[i].value === f.inverterId) { idx = i; break }
                        }
                        currentIndex = idx
                    }
                }
                OseBtn {
                    text: root.showAllInverters ? "Tous" : "✅ Compatibles"
                    kind: root.showAllInverters ? "outline" : "accent"
                    implicitHeight: 32
                    font.pixelSize: Theme.fontSizeCaption
                    leftPadding: 8
                    rightPadding: 8
                    ToolTip.visible: hovered
                    ToolTip.text: root.showAllInverters ? "Afficher aussi les onduleurs incompatibles"
                                                        : "Afficher uniquement les onduleurs compatibles"
                    onClicked: root.showAllInverters = !root.showAllInverters
                }
                OseBtn { text: "Lib."; kind: "outline"; onClicked: AppController.openMateriel() }
            }
            Label { text: "Batterie (optionnelle)"; color: Theme.textDim }
            RowLayout {
                Layout.fillWidth: true
                ComboBox {
                    id: batteryBox
                    Layout.fillWidth: true
                    model: {
                        let m = [{ label: "Aucune / saisie manuelle", value: "" }]
                        const bs = Catalog.batteries || []
                        for (let i = 0; i < Math.min(bs.length, 120); ++i) {
                            m.push({
                                label: (bs[i].name || bs[i].id) + " · "
                                       + (bs[i].energy_kwh || "?") + " kWh · "
                                       + (bs[i].voltage_nominal_v || "?") + " V",
                                value: bs[i].id
                            })
                        }
                        return m
                    }
                    textRole: "label"
                    valueRole: "value"
                    onActivated: root.applyBattery()
                }
                OseBtn { text: "Lib."; kind: "outline"; onClicked: AppController.openMateriel() }
            }
            OseAlert {
                visible: !!root.compatibility && (root.compatibility.hasPanel || root.compatibility.hasInverter)
                kind: root.compatibility.status === "danger" ? "danger"
                    : root.compatibility.status === "warning" ? "warning" : "success"
                text: root.compatibilityText()
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
