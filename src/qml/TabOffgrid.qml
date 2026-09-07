import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import "controls"

OseTabPage {
    id: root
    title: "Hors réseau"
    subtitle: "Optimisation Ppeak × batterie pour autonomie."
    nextTabId: AppController.nextPrimaryTab()
    nextTabLabel: AppController.tabLabel(AppController.nextPrimaryTab())

    property var lastResult: Projects.currentProject.offgridResult || ({})
    property var recommendedBest: (Projects.currentProject.offgridResult || {}).best || ({})

    readonly property real dayNightTotal: (Number(dayField.text) || 0) + (Number(nightField.text) || 0)

    function applyBattTech() {
        const t = battTech.currentText
        if (t.indexOf("LiFePO4") >= 0) dodField.text = "90"
        else if (t.indexOf("NMC") >= 0) dodField.text = "80"
        else dodField.text = "50"
    }

    function syncFromProject() {
        const form = Projects.currentProject.formState || {}
        const en = Projects.currentProject.enedisImport || {}
        if (form.loadDayKwh !== undefined || form.loadNightKwh !== undefined) {
            dayField.text = String(form.loadDayKwh !== undefined ? form.loadDayKwh : 0)
            nightField.text = String(form.loadNightKwh !== undefined ? form.loadNightKwh : 0)
        } else if (en.loadDayKwh !== undefined || en.loadNightKwh !== undefined) {
            dayField.text = String(en.loadDayKwh || 0)
            nightField.text = String(en.loadNightKwh || 0)
        } else {
            const wh = form.dailyWh !== undefined ? Number(form.dailyWh)
                     : (lastResult.dailyConsumptionWh !== undefined ? Number(lastResult.dailyConsumptionWh) : 8000)
            const kwh = wh / 1000
            // Défaut ~55 % jour / 45 % nuit (21h–6h)
            dayField.text = String(Math.round(kwh * 0.55 * 10) / 10)
            nightField.text = String(Math.round(kwh * 0.45 * 10) / 10)
        }
        if (form.dod !== undefined) dodField.text = String(form.dod)
        if (form.battTech) {
            const m = battTech.model
            for (let i = 0; i < m.length; ++i) {
                if (m[i] === form.battTech) { battTech.currentIndex = i; break }
            }
        }
        recommendedBest = (lastResult && lastResult.best) ? lastResult.best : {}
    }

    function run() {
        applyBattTech()
        let weather = Projects.currentProject.weatherData || []
        if (!weather.length) {
            AppController.toast("Chargez une météo dans Lieu (Open-Meteo ou PVGIS)", 3500)
            return
        }
        const dayK = Number(dayField.text) || 0
        const nightK = Number(nightField.text) || 0
        if (dayK + nightK <= 0) {
            AppController.toast("Renseignez la conso jour et/ou nuit (kWh/j)", 3500)
            return
        }
        const loc = Projects.currentProject.location || {}
        const form = Projects.currentProject.formState || {}
        const site = Projects.currentProject.siteSurvey || {}
        const en = Projects.currentProject.enedisImport || {}
        const dailyWh = Math.round((dayK + nightK) * 1000)
        const params = {
            lat: loc.lat || 43.6,
            weatherData: weather,
            dayKwhPerDay: dayK,
            nightKwhPerDay: nightK,
            dailyConsumptionWh: dailyWh,
            dod: Number(dodField.text),
            coverageTarget: Number(covField.text),
            tilt: form.tilt !== undefined ? form.tilt : 30,
            azimuth: form.azimuth !== undefined ? form.azimuth : 0,
            battCostPerKwh: 400,
            pvCostPerKwc: 1000,
            maxDeficitDaysPct: Number(deficitMax.text),
            mode: modeBox.currentValue,
            monthlyLoss: site.monthlyLoss || [],
            halfHourlyKeep: site.halfHourlyKeep || [],
            annualLossPct: site.annualLossPct || 0
        }
        // Si Enedis a fourni un profil 30 min, on l’utilise (forme réelle jour/nuit)
        if (en.halfHourly && en.halfHourlyProfile && en.halfHourlyProfile.length >= 48)
            params.halfHourlyLoadProfile = en.halfHourlyProfile

        lastResult = Offgrid.run(params)
        recommendedBest = lastResult.best || {}
        Projects.updateCurrent({
            offgridResult: lastResult,
            formState: Object.assign({}, form, {
                Ppeak: (lastResult.best || {}).Ppeak,
                battKwh: (lastResult.best || {}).battKwh,
                dailyWh: dailyWh,
                loadDayKwh: dayK,
                loadNightKwh: nightK,
                battTech: battTech.currentText,
                dod: Number(dodField.text)
            })
        })
        Projects.updateCurrent({
            resultsFingerprint: Pipeline.fingerprint(Projects.currentProject),
            resultsBasis: Pipeline.fingerprintParts(Projects.currentProject)
        })
        const b = lastResult.best || {}
        AppController.autoSave("Calcul hors-réseau — "
                               + (b.Ppeak || "?") + " kWc · "
                               + (b.battKwh || "?") + " kWh batterie")
    }

    Component.onCompleted: syncFromProject()

    OseFormResults {
        Layout.fillWidth: true

        OseStep {
            step: 1
            title: "Consommation jour / nuit"
            Label {
                Layout.fillWidth: true
                wrapMode: Text.WordWrap
                font.pixelSize: 12
                color: Theme.textDim
                text: "La nuit (21h–6h) n’a pas de production PV : la batterie doit couvrir cette part. Saisie manuelle ou import Enedis."
            }
            GridLayout {
                columns: 2
                Layout.fillWidth: true
                columnSpacing: 12; rowSpacing: 8
                Label { text: "Conso jour (6h–21h)" }
                OseInputUnit { id: dayField; text: "5"; unit: "kWh/j"; Layout.fillWidth: true }
                Label { text: "Conso nuit (21h–6h)" }
                OseInputUnit { id: nightField; text: "3"; unit: "kWh/j"; Layout.fillWidth: true }
                Label { text: "Total journalier" }
                Label {
                    text: root.dayNightTotal.toFixed(1) + " kWh/j"
                    font.weight: Font.DemiBold
                    color: Theme.primary
                }
            }
            OseBtn {
                text: "Importer Enedis → jour / nuit"
                kind: "outline"
                onClicked: {
                    const path = AppController.openFileDialog("Enedis (*.csv *.txt *.zip);;Tous (*.*)")
                    if (!path) return
                    const r = Enedis.parseFile(path)
                    if (!r.ok) {
                        AppController.toast(r.error || "Import Enedis échoué", 3500)
                        return
                    }
                    let dayK = r.loadDayKwh
                    let nightK = r.loadNightKwh
                    if (dayK === undefined && nightK === undefined) {
                        const kwh = (r.annualKwh || 0) / 365.0
                        dayK = Math.round(kwh * 0.55 * 10) / 10
                        nightK = Math.round(kwh * 0.45 * 10) / 10
                    }
                    dayField.text = String(dayK || 0)
                    nightField.text = String(nightK || 0)
                    Projects.updateCurrent({
                        monthlyKwh: r.monthlyKwh,
                        enedisImport: r,
                        formState: Object.assign({}, Projects.currentProject.formState || {}, {
                            loadDayKwh: dayK || 0,
                            loadNightKwh: nightK || 0,
                            dailyWh: Math.round(((dayK || 0) + (nightK || 0)) * 1000)
                        })
                    })
                    AppController.toast(
                        r.halfHourly
                            ? ("Enedis 30 min : " + (dayK || 0) + " / " + (nightK || 0) + " kWh/j")
                            : ("Enedis : " + (dayK || 0) + " / " + (nightK || 0) + " kWh/j")
                    )
                }
            }
        }

        OseStep {
            step: 2
            title: "Batterie & objectif"
            Label {
                Layout.fillWidth: true
                wrapMode: Text.WordWrap
                font.pixelSize: 12
                color: Theme.textDim
                text: {
                    const form = Projects.currentProject.formState || {}
                    if (form.panelModel)
                        return "Panneau projet : " + form.panelModel + " (" + (form.panelWp || "?") + " Wc)"
                    return "Astuce : choisissez un panneau dans Matériel pour caler l’implantation."
                }
            }
            OseBtn {
                text: "Bibliothèque matériel"
                kind: "outline"
                onClicked: AppController.openMateriel()
            }
            GridLayout {
                columns: 2
                Layout.fillWidth: true
                columnSpacing: 12; rowSpacing: 8
                Label { text: "Mode" }
                ComboBox {
                    id: modeBox
                    Layout.fillWidth: true
                    model: [
                        { label: "Autonomie max", value: "autonomy" },
                        { label: "Économique", value: "economic" }
                    ]
                    textRole: "label"
                    valueRole: "value"
                }
                Label { text: "DoD batterie" }
                OseInputUnit { id: dodField; text: "80"; unit: "%"; Layout.fillWidth: true }
                Label { text: "Couverture cible" }
                OseInputUnit { id: covField; text: "95"; unit: "%"; Layout.fillWidth: true }
                Label { text: "Déficit max" }
                OseInputUnit { id: deficitMax; text: "10"; unit: "% jours"; Layout.fillWidth: true }
                Label { text: "Tech. batterie" }
                ComboBox {
                    id: battTech
                    Layout.fillWidth: true
                    model: ["LiFePO4", "NMC", "Plomb gel"]
                    onActivated: root.applyBattTech()
                }
            }
            Label {
                Layout.fillWidth: true
                wrapMode: Text.WordWrap
                font.pixelSize: 12
                color: Theme.textDim
                text: {
                    const form = Projects.currentProject.formState || {}
                    const t = form.tilt !== undefined ? form.tilt : 30
                    const a = form.azimuth !== undefined ? form.azimuth : 0
                    return "Orientation prise depuis Lieu / Dimensionnement : tilt " + t + "° · azimut " + a + "°."
                }
            }
        }

        OseBtn { text: "Optimiser Ppeak × batterie"; onClicked: root.run() }

        results: ColumnLayout {
            spacing: 10
            RowLayout {
                visible: lastResult.best !== undefined && lastResult.best !== null
                spacing: 8
                KpiCard { title: "PV"; value: ((lastResult.best && lastResult.best.Ppeak) || 0) + " kWc" }
                KpiCard { title: "Batterie"; value: ((lastResult.best && lastResult.best.battKwh) || 0) + " kWh" }
                KpiCard {
                    title: "Couverture"
                    value: ((lastResult.best && lastResult.best.coverage) || 0) + " %"
                }
            }
            Label {
                visible: !!(lastResult.loadSource)
                Layout.fillWidth: true
                font.pixelSize: 11
                color: Theme.textDim
                text: {
                    let s = "Charge : "
                    if (lastResult.loadSource === "enedis_halfhourly")
                        s += "profil Enedis 30 min"
                    else if (lastResult.loadSource === "day_night")
                        s += "jour/nuit saisis"
                    else
                        s += "profil synthétique"
                    s += " · " + (lastResult.dayKwhPerDay || 0) + " kWh jour / "
                       + (lastResult.nightKwhPerDay || 0) + " kWh nuit"
                    return s
                }
            }
            OseAlert {
                visible: !!(lastResult.best) && lastResult.meetsTarget === false
                kind: "warning"
                text: "Aucune config n’atteint la couverture cible sur la grille explorée — recommandation = meilleure couverture possible."
            }
            OseCard {
                title: "Couverture mensuelle (batterie)"
                hint: {
                    const form = Projects.currentProject.formState || {}
                    const t = form.tilt !== undefined ? form.tilt : 30
                    const a = form.azimuth !== undefined ? form.azimuth : 0
                    let s = "Météo Lieu + orientation " + t + "°/" + a + "°"
                    if (lastResult.temporalShade)
                        s += " + ombrage site (demi-heures)"
                    else if (lastResult.shadeApplied)
                        s += " + pertes ombrage mensuelles"
                    else
                        s += " · pas d’ombrage site"
                    s += " · conso jour/nuit + SOC batterie."
                    return s
                }
                visible: !!(lastResult.best && lastResult.best.monthly)
                SimpleBarChart {
                    Layout.fillWidth: true
                    Layout.preferredHeight: 180
                    unit: "% couverture"
                    decimals: 0
                    minScale: 100
                    values: {
                        const m = (lastResult.best && lastResult.best.monthly) || []
                        let out = []
                        for (let i = 0; i < m.length; ++i)
                            out.push(m[i].coverageRatio || 0)
                        return out
                    }
                }
                Label {
                    Layout.fillWidth: true
                    wrapMode: Text.WordWrap
                    font.pixelSize: 11
                    color: Theme.textDim
                    visible: !!(lastResult.best && lastResult.best.monthly)
                    text: {
                        const m = (lastResult.best && lastResult.best.monthly) || []
                        if (!m.length) return ""
                        let s = "Prod moy. kWh/j : "
                        for (let i = 0; i < m.length; ++i) {
                            if (i) s += " · "
                            s += (m[i].name || ("M" + (i + 1))) + " "
                               + (m[i].solarDaily != null ? m[i].solarDaily : "—")
                        }
                        return s
                    }
                }
            }
            OseCard {
                title: "Heatmap candidats"
                hint: "Axes : puissance PV (lignes) × capacité batterie (colonnes)."
                visible: !!(lastResult.candidates && lastResult.candidates.length)
                OffgridHeatmap {
                    Layout.fillWidth: true
                    candidates: lastResult.candidates || []
                    recommended: root.recommendedBest
                    selected: lastResult.best || {}
                    onCellClicked: function (cand) {
                        lastResult = Object.assign({}, lastResult, { best: cand })
                        const form = Projects.currentProject.formState || {}
                        Projects.updateCurrent({
                            offgridResult: lastResult,
                            formState: Object.assign({}, form, {
                                Ppeak: cand.Ppeak,
                                battKwh: cand.battKwh
                            })
                        })
                        AppController.toast("Config " + cand.Ppeak + " kWc / " + cand.battKwh + " kWh")
                    }
                }
            }
        }
    }
}
