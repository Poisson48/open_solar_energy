import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import "controls"

OseTabPage {
    id: root
    title: "Analyse horaire"
    subtitle: "Journée type, année, ou horizon 30 ans @ 30 min avec ombrage site + batterie."
    nextTabId: AppController.nextPrimaryTab()
    nextTabLabel: AppController.tabLabel(AppController.nextPrimaryTab())

    property var result: Projects.currentProject.hourlyResult || ({})
    property var yearResult: Projects.currentProject.hourlyYear || ({})
    property var horizonResult: Projects.currentProject.horizonResult || ({})
    property bool _syncing: false
    /** day | year | horizon — un seul mode affiché à la fois */
    property string analysisMode: "day"

    readonly property var monthNames: [
        "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
        "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"
    ]

    readonly property real dayNightTotal: (Number(dayField.text) || 0) + (Number(nightField.text) || 0)

    readonly property string modeTitle: {
        if (analysisMode === "year") return "Année complète (12 mois)"
        if (analysisMode === "horizon") return "Horizon 30 ans @ 30 min"
        return "Journée type — " + monthBox.currentText
    }

    function setMode(m) {
        analysisMode = m
        if (m === "day")
            tryAutoSimulate()
        else if (m === "year") {
            if (!(yearResult.months && yearResult.months.length))
                simulateYear()
        } else if (m === "horizon") {
            if (!(horizonResult && horizonResult.ok))
                simulateHorizon30()
        }
    }

    function syncFromProject() {
        _syncing = true
        const form = Projects.currentProject.formState || {}
        const off = Projects.currentProject.offgridResult || {}
        const sizing = (Projects.currentProject.sizingResult || {}).best || {}
        const grid = (Projects.currentProject.gridResult || {}).best || {}
        const en = Projects.currentProject.enedisImport || {}

        const p = form.Ppeak !== undefined ? form.Ppeak
               : (off.best && off.best.Ppeak !== undefined ? off.best.Ppeak
               : (sizing.Ppeak !== undefined ? sizing.Ppeak
               : (grid.Ppeak !== undefined ? grid.Ppeak : 3)))
        pField.text = String(p)

        const batt = form.battKwh !== undefined ? form.battKwh
                   : (off.best && off.best.battKwh !== undefined ? off.best.battKwh : 0)
        battField.text = String(batt)

        dodField.text = String(form.dod !== undefined ? form.dod : 80)

        let dayK = form.loadDayKwh
        let nightK = form.loadNightKwh
        if (dayK === undefined && nightK === undefined) {
            if (en.loadDayKwh !== undefined || en.loadNightKwh !== undefined) {
                dayK = en.loadDayKwh || 0
                nightK = en.loadNightKwh || 0
            } else if (form.dailyWh !== undefined) {
                const kwh = Number(form.dailyWh) / 1000
                dayK = Math.round(kwh * 0.55 * 10) / 10
                nightK = Math.round(kwh * 0.45 * 10) / 10
            } else {
                dayK = 6
                nightK = 4
            }
        }
        dayField.text = String(dayK !== undefined ? dayK : 0)
        nightField.text = String(nightK !== undefined ? nightK : 0)

        if (form.analysisMonth >= 1 && form.analysisMonth <= 12)
            monthBox.currentIndex = form.analysisMonth - 1
        else
            monthBox.currentIndex = 5 // Juin

        useEnedis.checked = !!(en.halfHourly && en.halfHourlyProfile)
        _syncing = false
    }

    function persistForm() {
        if (_syncing) return
        const form = Projects.currentProject.formState || {}
        const dayK = Number(dayField.text) || 0
        const nightK = Number(nightField.text) || 0
        Projects.updateCurrent({
            formState: Object.assign({}, form, {
                Ppeak: Number(pField.text) || 0,
                battKwh: Number(battField.text) || 0,
                dod: Number(dodField.text) || 80,
                loadDayKwh: dayK,
                loadNightKwh: nightK,
                dailyWh: Math.round((dayK + nightK) * 1000),
                analysisMonth: monthBox.currentIndex + 1
            })
        })
    }

    function hasChartData() {
        return !!(result && result.hours && result.hours.length)
    }

    function tryAutoSimulate() {
        if (analysisMode !== "day") return
        const weather = Projects.currentProject.weatherData || []
        if (!weather.length) return
        if (dayNightTotal <= 0) return
        simulate()
    }

    function baseParams() {
        let weather = Projects.currentProject.weatherData || []
        if (!weather.length) {
            AppController.toast("Chargez une météo dans Lieu (Open-Meteo ou PVGIS)", 3500)
            return null
        }
        persistForm()
        const loc = Projects.currentProject.location || {}
        const form = Projects.currentProject.formState || {}
        const site = Projects.currentProject.siteSurvey || {}
        const enedis = Projects.currentProject.enedisImport || {}
        let dayK = Number(dayField.text) || 0
        let nightK = Number(nightField.text) || 0
        if (useEnedis.checked && enedis.loadDayKwh !== undefined) {
            dayK = Number(enedis.loadDayKwh) || 0
            nightK = Number(enedis.loadNightKwh) || 0
        }
        const daily = dayK + nightK
        if (daily <= 0) {
            AppController.toast("Renseignez la conso jour et/ou nuit", 3500)
            return null
        }
        return {
            weather: weather,
            loc: loc,
            form: form,
            site: site,
            enedis: enedis,
            daily: daily,
            dayShare: daily > 0 ? dayK / daily : 0.55,
            dayK: dayK,
            nightK: nightK
        }
    }

    function simulate() {
        const b = baseParams()
        if (!b) return
        const month = monthBox.currentIndex + 1
        const w = b.weather[month - 1] || b.weather[0]
        result = Hourly.analyzeMonth({
            lat: b.loc.lat || 43.6,
            month: month,
            GHI: w.GHI, DHI: w.DHI, T_avg: w.T_avg || 15,
            Ppeak: Number(pField.text),
            tilt: b.form.tilt || 30,
            azimuth: b.form.azimuth || 0,
            losses: 14,
            dailyKwh: b.daily,
            dayShare: b.dayShare,
            battKwh: Number(battField.text),
            dod: Number(dodField.text),
            halfHourlyKeep: b.site.halfHourlyKeep || []
        })
        Projects.updateCurrent({ hourlyResult: result })
    }

    function simulateYear() {
        const b = baseParams()
        if (!b) return
        yearResult = Hourly.analyzeYear({
            lat: b.loc.lat || 43.6,
            weatherData: b.weather,
            Ppeak: Number(pField.text),
            tilt: b.form.tilt || 30,
            azimuth: b.form.azimuth || 0,
            losses: 14,
            dailyKwh: b.daily,
            dayShare: b.dayShare,
            battKwh: Number(battField.text),
            dod: Number(dodField.text),
            halfHourlyKeep: b.site.halfHourlyKeep || []
        })
        Projects.updateCurrent({ hourlyYear: yearResult })
        AppController.toast("12 mois calculés")
    }

    function simulateHorizon30() {
        const b = baseParams()
        if (!b) return
        const losses = Number(b.form["og2-losses"] || b.form["inp-losses"] || b.form.losses || 14)
        horizonResult = Horizon.simulate({
            lat: b.loc.lat || 43.6,
            weatherData: b.weather,
            halfHourlyKeep: b.site.halfHourlyKeep || [],
            Ppeak: Number(pField.text),
            tilt: Number(b.form.tilt || 30),
            azimuth: Number(b.form.azimuth || 0),
            losses: losses,
            dailyKwh: b.daily,
            dayShare: b.dayShare,
            battKwh: Number(battField.text),
            dod: Number(dodField.text),
            years: 30,
            stepMin: 30
        })
        Projects.updateCurrent({ horizonResult: horizonResult })
        AppController.toast(
            "30 ans @ 30 min : " + (horizonResult.steps || 0) + " pas en "
            + (horizonResult.elapsedMs || 0) + " ms — couverture "
            + (horizonResult.coveragePct || 0) + " %", 4500)
    }

    Component.onCompleted: {
        syncFromProject()
        Qt.callLater(tryAutoSimulate)
    }

    OseFormResults {
        Layout.fillWidth: true

        OseStep {
            step: 1
            title: "Paramètres (repris du projet)"
            Label {
                Layout.fillWidth: true
                wrapMode: Text.WordWrap
                font.pixelSize: 12
                color: Theme.textDim
                text: "Prérempli depuis Hors réseau / Dimensionnement. Toute modification est reportée dans les autres onglets."
            }
            GridLayout {
                columns: 2
                Layout.fillWidth: true
                columnSpacing: 12; rowSpacing: 8

                Label { text: "Mois"; visible: root.analysisMode === "day" }
                ComboBox {
                    id: monthBox
                    visible: root.analysisMode === "day"
                    Layout.fillWidth: true
                    model: root.monthNames
                    onActivated: {
                        root.persistForm()
                        root.tryAutoSimulate()
                    }
                }

                Label { text: "Ppeak" }
                OseInputUnit {
                    id: pField
                    text: "3"
                    unit: "kWc"
                    Layout.fillWidth: true
                    onEditingFinished: { root.persistForm(); root.tryAutoSimulate() }
                }

                Label { text: "Conso jour (6h–21h)" }
                OseInputUnit {
                    id: dayField
                    text: "6"
                    unit: "kWh/j"
                    Layout.fillWidth: true
                    onEditingFinished: { root.persistForm(); root.tryAutoSimulate() }
                }

                Label { text: "Conso nuit (21h–6h)" }
                OseInputUnit {
                    id: nightField
                    text: "4"
                    unit: "kWh/j"
                    Layout.fillWidth: true
                    onEditingFinished: { root.persistForm(); root.tryAutoSimulate() }
                }

                Label { text: "Total journalier" }
                Label {
                    text: root.dayNightTotal.toFixed(1) + " kWh/j"
                    font.weight: Font.DemiBold
                    color: Theme.primary
                }

                Label { text: "Batterie" }
                OseInputUnit {
                    id: battField
                    text: "0"
                    unit: "kWh"
                    Layout.fillWidth: true
                    onEditingFinished: { root.persistForm(); root.tryAutoSimulate() }
                }

                Label { text: "DoD" }
                OseInputUnit {
                    id: dodField
                    text: "80"
                    unit: "%"
                    Layout.fillWidth: true
                    onEditingFinished: { root.persistForm(); root.tryAutoSimulate() }
                }
            }

            CheckBox {
                id: useEnedis
                text: "Utiliser profil Enedis jour/nuit si disponible"
                checked: false
            }
            Label {
                Layout.fillWidth: true
                wrapMode: Text.WordWrap
                font.pixelSize: 11
                color: Theme.textDim
                text: {
                    const form = Projects.currentProject.formState || {}
                    const t = form.tilt !== undefined ? form.tilt : 30
                    const a = form.azimuth !== undefined ? form.azimuth : 0
                    return "Orientation (Lieu) : tilt " + t + "° · azimut " + a + "° · ombrage site repris automatiquement."
                }
            }
        }

        OseStep {
            step: 2
            title: "Type d’analyse"
            Label {
                Layout.fillWidth: true
                wrapMode: Text.WordWrap
                font.pixelSize: 12
                color: Theme.textDim
                text: "Choisissez un mode — seuls ses graphiques s’affichent à droite."
            }
            RowLayout {
                Layout.fillWidth: true
                spacing: 6
                OseBtn {
                    Layout.fillWidth: true
                    text: "Journée"
                    kind: root.analysisMode === "day" ? "primary" : "outline"
                    onClicked: root.setMode("day")
                }
                OseBtn {
                    Layout.fillWidth: true
                    text: "Année"
                    kind: root.analysisMode === "year" ? "primary" : "outline"
                    onClicked: root.setMode("year")
                }
                OseBtn {
                    Layout.fillWidth: true
                    text: "30 ans"
                    kind: root.analysisMode === "horizon" ? "primary" : "outline"
                    onClicked: root.setMode("horizon")
                }
            }
            Label {
                Layout.fillWidth: true
                wrapMode: Text.WordWrap
                font.pixelSize: 13
                font.weight: Font.DemiBold
                color: Theme.primary
                text: "Affiché : " + root.modeTitle
            }
            OseBtn {
                Layout.fillWidth: true
                text: {
                    if (root.analysisMode === "year") return "Recalculer les 12 mois"
                    if (root.analysisMode === "horizon") return "Recalculer 30 ans @ 30 min"
                    return "Recalculer " + monthBox.currentText
                }
                onClicked: {
                    if (root.analysisMode === "year") root.simulateYear()
                    else if (root.analysisMode === "horizon") root.simulateHorizon30()
                    else root.simulate()
                }
            }
        }

        results: ColumnLayout {
            spacing: 8

            OseAlert {
                visible: !(Projects.currentProject.weatherData || []).length
                kind: "warning"
                text: "Pas de météo projet — chargez-en une dans Lieu et météo."
            }

            // ── Mode journée ──
            ColumnLayout {
                visible: root.analysisMode === "day"
                spacing: 8
                Layout.fillWidth: true

                OseAlert {
                    visible: (Projects.currentProject.weatherData || []).length > 0 && !root.hasChartData()
                    kind: "info"
                    text: "Calcul de la journée type en cours ou indisponible — vérifiez météo et conso."
                }
                Label {
                    visible: root.hasChartData()
                    text: root.modeTitle
                    font.pixelSize: 14
                    font.weight: Font.DemiBold
                    color: Theme.text
                }
                RowLayout {
                    visible: root.hasChartData()
                    spacing: 8
                    KpiCard { title: "PV"; value: (result.pvTotal || 0) + " kWh" }
                    KpiCard { title: "Charge"; value: (result.loadTotal || 0) + " kWh" }
                }
                RowLayout {
                    visible: root.hasChartData()
                    spacing: 8
                    KpiCard { title: "Autoconso"; value: (result.autoconsoRate || 0) + " %" }
                    KpiCard { title: "Surplus"; value: (result.surplus || 0) + " kWh" }
                }
                Label {
                    visible: root.hasChartData()
                    text: "Production PV (heure par heure)"
                    font.pixelSize: 12; color: Theme.textDim
                }
                SimpleBarChart {
                    visible: root.hasChartData()
                    Layout.fillWidth: true; Layout.preferredHeight: 160
                    unit: "kWh"
                    decimals: 2
                    values: {
                        const h = result.hours || []
                        let out = []
                        for (let i = 0; i < h.length; ++i) out.push(h[i].pv || 0)
                        return out
                    }
                }
                Label {
                    visible: root.hasChartData()
                    text: "Consommation"
                    font.pixelSize: 12; color: Theme.textDim
                }
                SimpleBarChart {
                    visible: root.hasChartData()
                    Layout.fillWidth: true; Layout.preferredHeight: 160
                    unit: "kWh"
                    decimals: 2
                    barColor: Theme.accent
                    values: {
                        const h = result.hours || []
                        let out = []
                        for (let i = 0; i < h.length; ++i) out.push(h[i].conso || 0)
                        return out
                    }
                }
                Label {
                    text: "SOC batterie"
                    font.pixelSize: 12; color: Theme.textDim
                    visible: root.hasChartData() && Number(battField.text) > 0
                }
                SimpleBarChart {
                    Layout.fillWidth: true; Layout.preferredHeight: 140
                    visible: root.hasChartData() && Number(battField.text) > 0
                    unit: "kWh SOC"
                    decimals: 1
                    barColor: Theme.primaryLight
                    values: {
                        const h = result.hours || []
                        let out = []
                        for (let i = 0; i < h.length; ++i) out.push(h[i].soc || 0)
                        return out
                    }
                }
                Label {
                    visible: root.hasChartData() && Number(battField.text) <= 0
                    Layout.fillWidth: true
                    wrapMode: Text.WordWrap
                    font.pixelSize: 12
                    color: Theme.textDim
                    text: "Pas de batterie (0 kWh) — SOC masqué. Repris de Hors réseau si dimensionné."
                }
            }

            // ── Mode année ──
            ColumnLayout {
                visible: root.analysisMode === "year"
                spacing: 8
                Layout.fillWidth: true

                Label {
                    text: root.modeTitle
                    font.pixelSize: 14
                    font.weight: Font.DemiBold
                    color: Theme.text
                }
                OseAlert {
                    visible: !(yearResult.months && yearResult.months.length)
                    kind: "info"
                    text: "Pas encore de synthèse annuelle — lancez le recalcul."
                }
                RowLayout {
                    visible: !!(yearResult.months && yearResult.months.length)
                    KpiCard { title: "PV/an"; value: Math.round(yearResult.pvYear || 0) + " kWh" }
                    KpiCard { title: "Autoconso"; value: (yearResult.autoconsoRate || 0) + " %" }
                }
                Label {
                    visible: !!(yearResult.months && yearResult.months.length)
                    text: "PV jour type / mois"
                    font.pixelSize: 12; color: Theme.textDim
                }
                SimpleBarChart {
                    visible: !!(yearResult.months && yearResult.months.length)
                    Layout.fillWidth: true
                    Layout.preferredHeight: 180
                    unit: "kWh/j"
                    decimals: 1
                    labels: root.monthNames
                    values: {
                        const m = yearResult.months || []
                        let out = []
                        for (let i = 0; i < m.length; ++i) out.push(m[i].pvTotal || 0)
                        return out
                    }
                }
                Label {
                    visible: !!(yearResult.months && yearResult.months.length)
                    text: "Autoconso % / mois"
                    font.pixelSize: 12; color: Theme.textDim
                }
                SimpleBarChart {
                    visible: !!(yearResult.months && yearResult.months.length)
                    Layout.fillWidth: true
                    Layout.preferredHeight: 160
                    unit: "%"
                    decimals: 0
                    barColor: Theme.accent
                    labels: root.monthNames
                    values: {
                        const m = yearResult.months || []
                        let out = []
                        for (let i = 0; i < m.length; ++i) out.push(m[i].autoconsoRate || 0)
                        return out
                    }
                }
            }

            // ── Mode 30 ans ──
            ColumnLayout {
                visible: root.analysisMode === "horizon"
                spacing: 8
                Layout.fillWidth: true

                Label {
                    text: root.modeTitle
                    font.pixelSize: 14
                    font.weight: Font.DemiBold
                    color: Theme.text
                }
                Label {
                    Layout.fillWidth: true
                    wrapMode: Text.WordWrap
                    font.pixelSize: 12
                    color: Theme.textDim
                    text: horizonResult.shadeApplied
                          ? "Ombrage site (demi-heures) + batterie · pas de 30 min."
                          : "Sans masque d’ombrage · pas de 30 min."
                    visible: !!(horizonResult && horizonResult.ok)
                }
                OseAlert {
                    visible: !(horizonResult && horizonResult.ok)
                    kind: "info"
                    text: "Pas encore de simulation 30 ans — lancez le recalcul."
                }
                Flow {
                    visible: !!(horizonResult && horizonResult.ok)
                    Layout.fillWidth: true
                    spacing: 8
                    KpiCard { title: "Pas"; value: String(horizonResult.steps || 0) }
                    KpiCard { title: "Temps"; value: (horizonResult.elapsedMs || 0) + " ms" }
                    KpiCard { title: "Couverture"; value: (horizonResult.coveragePct || 0) + " %" }
                    KpiCard { title: "PV 30 ans"; value: Math.round((horizonResult.pvTotal || 0) / 1000) + " MWh" }
                    KpiCard { title: "Déficit/an"; value: (horizonResult.avgDeficitDaysPerYear || 0) + " j" }
                }
                Label {
                    visible: !!(horizonResult && horizonResult.ok)
                    text: "Couverture annuelle (%)"
                    font.pixelSize: 12; color: Theme.textDim
                }
                SimpleBarChart {
                    visible: !!(horizonResult && horizonResult.ok)
                    Layout.fillWidth: true
                    Layout.preferredHeight: 180
                    unit: "%"
                    decimals: 0
                    minScale: 100
                    values: {
                        const ys = horizonResult.yearSeries || []
                        let out = []
                        for (let i = 0; i < ys.length; ++i) out.push(ys[i].coverage || 0)
                        return out
                    }
                }
                Label {
                    visible: !!(horizonResult && horizonResult.ok)
                    text: "Production PV annuelle (kWh)"
                    font.pixelSize: 12; color: Theme.textDim
                }
                SimpleBarChart {
                    visible: !!(horizonResult && horizonResult.ok)
                    Layout.fillWidth: true
                    Layout.preferredHeight: 160
                    unit: "kWh"
                    decimals: 0
                    barColor: Theme.accent
                    values: {
                        const ys = horizonResult.yearSeries || []
                        let out = []
                        for (let i = 0; i < ys.length; ++i) out.push(ys[i].pv || 0)
                        return out
                    }
                }
            }
        }
    }
}
