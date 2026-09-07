import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import "controls"

OseTabPage {
    id: root
    title: "Dimensionnement réseau"
    subtitle: "Parcours facture → stratégie → résultat. Vérifiez le lieu et la météo avant de calculer."
    nextTabId: AppController.nextPrimaryTab()
    nextTabLabel: AppController.tabLabel(AppController.nextPrimaryTab())

    property var lastResult: Projects.currentProject.sizingResult || ({})
    property bool isHybrid: (Projects.currentProject.installType || "grid") === "hybrid"
    property bool syncing: false

    function comboIndexFor(box, value, fallback) {
        const m = box.model
        for (let i = 0; i < m.length; ++i) {
            if (m[i].value === value)
                return i
        }
        return fallback !== undefined ? fallback : 0
    }

    function loadFromProject() {
        syncing = true
        const b = Projects.currentProject.bill || {}
        const f = Projects.currentProject.formState || {}
        const e = Projects.currentProject.enedisImport || {}
        const hpHc = b.priceHpHc || {}

        tariffBox.currentIndex = comboIndexFor(tariffBox, b.tariff || f.tariff || "base", 0)
        priceBase.text = String(b.priceBase !== undefined ? b.priceBase
                                : (f.priceBase !== undefined ? f.priceBase : "0.2516"))
        subscription.text = String(b.subscriptionPerYear !== undefined ? b.subscriptionPerYear
                                   : (f.subscription !== undefined ? f.subscription : "147"))
        priceHp.text = String(hpHc.hp !== undefined ? hpHc.hp
                              : (f.priceHp !== undefined ? f.priceHp : "0.246"))
        priceHc.text = String(hpHc.hc !== undefined ? hpHc.hc
                              : (f.priceHc !== undefined ? f.priceHc : "0.186"))
        annualField.text = String(f.annualKwh !== undefined ? f.annualKwh : 4500)
        loadDay.text = f.loadDayKwh !== undefined ? String(f.loadDayKwh)
                      : (e.loadDayKwh !== undefined ? String(e.loadDayKwh) : "")
        loadNight.text = f.loadNightKwh !== undefined ? String(f.loadNightKwh)
                        : (e.loadNightKwh !== undefined ? String(e.loadNightKwh) : "")
        tiltField.text = String(f.tilt !== undefined ? f.tilt : 30)
        azField.text = String(f.azimuth !== undefined ? f.azimuth : 0)
        lossField.text = String(f.losses !== undefined ? f.losses : 14)
        costKwc.text = String(f.costPerKwc !== undefined ? f.costPerKwc : 1200)
        injPrice.text = String(f.injectionPrice !== undefined ? f.injectionPrice : "0.04")
        panelWpField.text = String(f.panelWp !== undefined ? f.panelWp : 400)
        if (f.panelArea !== undefined)
            panelArea.text = String(f.panelArea)
        if (f.panelId) {
            for (let i = 0; i < panelCatalog.model.length; ++i) {
                if (panelCatalog.model[i].value === f.panelId) {
                    panelCatalog.currentIndex = i
                    break
                }
            }
        }
        strategyBox.currentIndex = comboIndexFor(strategyBox, f.strategy || "roi", 0)
        covTarget.text = String(f.coverageTarget !== undefined ? f.coverageTarget : 70)
        limitBox.currentIndex = comboIndexFor(limitBox, f.limitMode || "none", 0)
        roofArea.text = String(f.roofArea !== undefined ? f.roofArea : 40)
        fixedPpeak.text = String(f.fixedPpeak !== undefined ? f.fixedPpeak
                                 : (f.Ppeak !== undefined ? f.Ppeak : 3))
        battKwh.text = String(f.battKwh !== undefined ? f.battKwh : 5)
        battDod.text = String(f.battDod !== undefined ? f.battDod : 80)
        syncing = false
    }

    function persistForm(extra) {
        if (syncing)
            return
        const f = Projects.currentProject.formState || {}
        const b = Projects.currentProject.bill || {}
        const patch = Object.assign({
            tariff: tariffBox.currentValue,
            priceBase: Number(priceBase.text),
            subscription: Number(subscription.text),
            priceHp: Number(priceHp.text),
            priceHc: Number(priceHc.text),
            annualKwh: Number(annualField.text),
            tilt: Number(tiltField.text),
            azimuth: Number(azField.text),
            losses: Number(lossField.text),
            costPerKwc: Number(costKwc.text),
            injectionPrice: Number(injPrice.text),
            strategy: strategyBox.currentValue,
            coverageTarget: Number(covTarget.text),
            limitMode: limitBox.currentValue,
            roofArea: Number(roofArea.text),
            fixedPpeak: Number(fixedPpeak.text),
            panelWp: Number(panelWpField.text),
            battKwh: Number(battKwh.text),
            battDod: Number(battDod.text),
            loadDayKwh: loadDay.text.length ? Number(loadDay.text) : undefined,
            loadNightKwh: loadNight.text.length ? Number(loadNight.text) : undefined
        }, extra || {})
        const bill = Object.assign({}, b, {
            tariff: tariffBox.currentValue,
            priceBase: Number(priceBase.text),
            subscriptionPerYear: Number(subscription.text),
            priceHpHc: { hp: Number(priceHp.text), hc: Number(priceHc.text) }
        })
        Projects.updateCurrent({ formState: Object.assign({}, f, patch), bill: bill })
    }

    Component.onCompleted: loadFromProject()

    Connections {
        target: Projects
        function onCurrentChanged() { root.loadFromProject() }
    }

    function ensureWeather() {
        const weather = Projects.currentProject.weatherData || []
        if (!weather.length) {
            AppController.toast("Chargez une météo dans Lieu (Open-Meteo ou PVGIS)", 3500)
            return []
        }
        return weather
    }

    function monthlyFromAnnual(a) {
        const v = Math.round(a / 12)
        let out = []
        for (let i = 0; i < 12; ++i) out.push(v)
        return out
    }

    function runSizing() {
        const weather = ensureWeather()
        if (!weather.length) return
        let monthly = Projects.currentProject.monthlyKwh || []
        const annual = Number(annualField.text) || 4500
        if (!monthly.length)
            monthly = monthlyFromAnnual(annual)
        const loc = Projects.currentProject.location || {}
        const form = Projects.currentProject.formState || {}
        const site = Projects.currentProject.siteSurvey || {}
        const enedis = Projects.currentProject.enedisImport || {}

        let dayShare = 0.55
        const day = Number(loadDay.text)
        const night = Number(loadNight.text)
        if (day > 0 || night > 0)
            dayShare = day / Math.max(0.1, day + night)
        else if (enedis.loadDayKwh !== undefined && enedis.loadNightKwh !== undefined) {
            const d = Number(enedis.loadDayKwh)
            const n = Number(enedis.loadNightKwh)
            dayShare = d / Math.max(0.1, d + n)
        }

        lastResult = Sizing.run({
            lat: loc.lat || 43.6,
            weatherData: weather,
            monthlyKwh: monthly,
            annualKwh: annual,
            tilt: Number(tiltField.text),
            azimuth: Number(azField.text),
            strategy: strategyBox.currentValue,
            priceBase: effectivePrice(),
            costPerKwc: Number(costKwc.text),
            coverageTarget: Number(covTarget.text),
            losses: Number(lossField.text),
            injectionPrice: Number(injPrice.text),
            installType: Projects.currentProject.installType || "grid",
            battKwh: isHybrid ? Number(battKwh.text) : 0,
            dod: isHybrid ? Number(battDod.text) : 80,
            dayShare: dayShare,
            monthlyLoss: site.monthlyLoss || [],
            annualLossPct: site.annualLossPct || 0,
            limitMode: limitBox.currentValue,
            roofAreaM2: Number(roofArea.text) || 40,
            panelWp: Number(panelWpField.text) || 400,
            panelAreaM2: Number(panelArea.text) || 2.0,
            fixedPpeak: Number(fixedPpeak.text) || 3
        })
        const best = lastResult.best || {}
        const bill = {
            tariff: tariffBox.currentValue,
            priceBase: Number(priceBase.text),
            subscriptionPerYear: Number(subscription.text),
            monthlyKwh: monthly,
            priceHpHc: { hp: Number(priceHp.text), hc: Number(priceHc.text) }
        }
        const annualBill = Finance.calcCurrentAnnualBill(bill)
        lastResult = Object.assign({}, lastResult, { annualBill: annualBill })
        const nextForm = Object.assign({}, form, {
            tilt: Number(tiltField.text),
            azimuth: Number(azField.text),
            tariff: tariffBox.currentValue,
            priceBase: Number(priceBase.text),
            priceHp: Number(priceHp.text),
            priceHc: Number(priceHc.text),
            annualKwh: annual,
            strategy: strategyBox.currentValue,
            limitMode: limitBox.currentValue,
            battKwh: isHybrid ? Number(battKwh.text) : 0,
            Ppeak: best.Ppeak,
            systemCost: best.systemCost,
            panelWp: Number(panelWpField.text) || 400,
            loadDayKwh: day || enedis.loadDayKwh,
            loadNightKwh: night || enedis.loadNightKwh
        })
        Projects.updateCurrent({
            sizingResult: lastResult,
            monthlyKwh: monthly,
            formState: nextForm,
            bill: bill
        })
        Projects.updateCurrent({
            resultsFingerprint: Pipeline.fingerprint(Projects.currentProject),
            resultsBasis: Pipeline.fingerprintParts(Projects.currentProject)
        })
        AppController.autoSave("Calcul dimensionnement — "
                               + (best.Ppeak || "?") + " kWc")
    }

    function effectivePrice() {
        if (tariffBox.currentValue !== "hphc")
            return Number(priceBase.text)
        // Moyenne pondérée indicative (55 % HP / 45 % HC)
        return Number(priceHp.text) * 0.55 + Number(priceHc.text) * 0.45
    }

    function optimTilt() {
        const weather = ensureWeather()
        if (!weather.length) return
        const loc = Projects.currentProject.location || {}
        const opt = SolarMath.optimalTilt(loc.lat || 43.6, weather, true)
        tiltField.text = String(opt.tilt)
        azField.text = String(opt.azimuth)
        persistForm()
        AppController.toast("Tilt optimal " + opt.tilt + "° / az " + opt.azimuth + "°")
    }

    OseFormResults {
        Layout.fillWidth: true

            OseAlert {
                visible: !!(Projects.currentProject.siteSurvey && Projects.currentProject.siteSurvey.annualLossPct)
                kind: "info"
                text: "Ombrage site appliqué : "
                      + ((Projects.currentProject.siteSurvey || {}).annualLossPct || 0)
                      + " % perte beam — le dimensionnement en tient compte."
            }

            OseAlert {
                text: "Avant de calculer : vérifiez le lieu et la météo dans l’onglet Lieu."
            }

        OseStep {
            step: 1
            title: "Votre consommation"
            hint: "Facture EDF ou export Enedis — base de tout le calcul."
            RowLayout {
                Layout.fillWidth: true
                Label { text: "Tarif"; Layout.preferredWidth: 80 }
                ComboBox {
                    id: tariffBox
                    Layout.fillWidth: true
                    model: [
                        { label: "Tarif Base", value: "base" },
                        { label: "HP / HC", value: "hphc" }
                    ]
                    textRole: "label"
                    valueRole: "value"
                    onActivated: root.persistForm()
                }
            }
            RowLayout {
                Layout.fillWidth: true
                Label { text: "Prix kWh"; Layout.preferredWidth: 80 }
                OseInputUnit { id: priceBase; text: "0.2516"; unit: "€"; Layout.fillWidth: true; onEditingFinished: root.persistForm() }
                Label { text: "Abo." }
                OseInputUnit { id: subscription; text: "147"; unit: "€/an"; Layout.fillWidth: true; onEditingFinished: root.persistForm() }
            }
            RowLayout {
                visible: tariffBox.currentValue === "hphc"
                Layout.fillWidth: true
                Label { text: "HP"; Layout.preferredWidth: 80 }
                OseInputUnit { id: priceHp; text: "0.246"; unit: "€"; Layout.fillWidth: true; onEditingFinished: root.persistForm() }
                Label { text: "HC" }
                OseInputUnit { id: priceHc; text: "0.186"; unit: "€"; Layout.fillWidth: true; onEditingFinished: root.persistForm() }
            }
            RowLayout {
                Layout.fillWidth: true
                Label { text: "Conso annuelle"; Layout.preferredWidth: 110 }
                OseInputUnit {
                    id: annualField
                    text: "4500"
                    unit: "kWh"
                    Layout.fillWidth: true
                    inputMethodHints: Qt.ImhFormattedNumbersOnly
                    onEditingFinished: root.persistForm()
                }
            }
            RowLayout {
                Layout.fillWidth: true
                Label { text: "Jour / nuit"; Layout.preferredWidth: 110 }
                OseInputUnit { id: loadDay; placeholderText: "jour"; unit: "kWh/j"; Layout.fillWidth: true; onEditingFinished: root.persistForm() }
                OseInputUnit { id: loadNight; placeholderText: "nuit"; unit: "kWh/j"; Layout.fillWidth: true; onEditingFinished: root.persistForm() }
            }
            OseBtn {
                text: "Importer Enedis…"
                kind: "outline"
                onClicked: {
                    const path = AppController.openFileDialog(
                        "Enedis (*.csv *.txt *.zip *.CSV *.ZIP);;Tous (*.*)")
                    if (!path) return
                    const r = Enedis.parseFile(path)
                    if (!r.ok) {
                        statusLabel.text = r.error || "Import échoué"
                        return
                    }
                    annualField.text = String(r.annualKwh)
                    if (r.loadDayKwh !== undefined) loadDay.text = String(r.loadDayKwh)
                    if (r.loadNightKwh !== undefined) loadNight.text = String(r.loadNightKwh)
                    Projects.updateCurrent({
                        monthlyKwh: r.monthlyKwh,
                        enedisImport: r,
                        formState: Object.assign({}, Projects.currentProject.formState || {}, {
                            annualKwh: r.annualKwh,
                            loadDayKwh: r.loadDayKwh,
                            loadNightKwh: r.loadNightKwh
                        })
                    })
                    statusLabel.text = "Enedis OK — " + r.annualKwh + " kWh/an"
                              + (r.halfHourly ? " (profil 30 min)" : "")
                }
            }
        }

        OseStep {
            step: 2
            title: "Orientation & pertes"
            RowLayout {
                Layout.fillWidth: true
                Label { text: "Inclinaison"; Layout.preferredWidth: 100 }
                OseInputUnit { id: tiltField; text: "30"; unit: "°"; Layout.fillWidth: true; onEditingFinished: root.persistForm() }
                Label { text: "Azimut" }
                OseInputUnit { id: azField; text: "0"; unit: "°"; Layout.fillWidth: true; onEditingFinished: root.persistForm() }
            }
            OseBtn { text: "Optimiser tilt / azimut (météo)"; kind: "outline"; onClicked: root.optimTilt() }
            RowLayout {
                Layout.fillWidth: true
                Label { text: "Pertes"; Layout.preferredWidth: 100 }
                OseInputUnit { id: lossField; text: "14"; unit: "%"; Layout.fillWidth: true; onEditingFinished: root.persistForm() }
                Label { text: "Coût / kWc" }
                OseInputUnit { id: costKwc; text: "1200"; unit: "€"; Layout.fillWidth: true; onEditingFinished: root.persistForm() }
            }
            RowLayout {
                Layout.fillWidth: true
                Label { text: "Injection"; Layout.preferredWidth: 100 }
                OseInputUnit { id: injPrice; text: "0.04"; unit: "€/kWh"; Layout.fillWidth: true; onEditingFinished: root.persistForm() }
            }
            Label { text: "Panneau catalogue"; color: Theme.textDim; font.pixelSize: 12 }
            RowLayout {
                Layout.fillWidth: true
                ComboBox {
                    id: panelCatalog
                    Layout.fillWidth: true
                    model: {
                        let m = [{ label: "— Choisir —", value: "", wp: 400, area: 2.0, w: 1.134, h: 1.722 }]
                        const ps = Catalog.panels || []
                        for (let i = 0; i < ps.length; ++i) {
                            const w = ps[i].largeur || ps[i].widthM || 1.134
                            const h = ps[i].hauteur || ps[i].lengthM || 1.722
                            const a = ps[i].m2 || (w * h)
                            m.push({
                                label: (ps[i].fabricant || ps[i].brand || "") + " "
                                       + (ps[i].model || "") + " · " + (ps[i].wp || ps[i].pmax || "") + " Wc",
                                value: ps[i].id,
                                wp: ps[i].wp || ps[i].pmax || 400,
                                area: a > 0.5 ? a : 2.0,
                                w: w,
                                h: h
                            })
                        }
                        return m
                    }
                    textRole: "label"
                    valueRole: "value"
                    onActivated: {
                        const it = model[currentIndex]
                        if (!it || !it.value) return
                        panelWpField.text = String(it.wp || 400)
                        panelArea.text = String((it.area || 2).toFixed(2))
                        const form = Projects.currentProject.formState || {}
                        Projects.updateCurrent({
                            formState: Object.assign({}, form, {
                                panelId: it.value,
                                panelWp: it.wp,
                                panelArea: it.area,
                                panelW: it.w,
                                panelH: it.h
                            })
                        })
                        root.persistForm()
                    }
                }
                OseBtn {
                    text: "Bibliothèque"
                    kind: "outline"
                    onClicked: AppController.openMateriel()
                }
            }
            RowLayout {
                Layout.fillWidth: true
                Label { text: "Wc module" }
                OseInputUnit { id: panelWpField; text: "400"; unit: "Wc"; Layout.fillWidth: true; onEditingFinished: root.persistForm() }
                Label { text: "Surface" }
                OseInputUnit { id: panelArea; text: "2.0"; unit: "m²"; Layout.fillWidth: true }
            }
        }

        OseStep {
            step: 3
            title: "Stratégie & limite"
            ComboBox {
                id: strategyBox
                Layout.fillWidth: true
                model: [
                    { label: "ROI / payback optimal", value: "roi" },
                    { label: "Autoconsommation max", value: "autoconso" },
                    { label: "Couverture cible", value: "coverage" }
                ]
                textRole: "label"
                valueRole: "value"
                onActivated: root.persistForm()
            }
            RowLayout {
                visible: strategyBox.currentValue === "coverage"
                Layout.fillWidth: true
                Label { text: "Couverture cible" }
                OseInputUnit { id: covTarget; text: "70"; unit: "%"; Layout.fillWidth: true; onEditingFinished: root.persistForm() }
            }
            ComboBox {
                id: limitBox
                Layout.fillWidth: true
                model: [
                    { label: "Limite : libre (sweep)", value: "none" },
                    { label: "Limite : surface toiture", value: "roof" },
                    { label: "Limite : puissance fixe", value: "fixed" }
                ]
                textRole: "label"
                valueRole: "value"
                onActivated: root.persistForm()
            }
            RowLayout {
                visible: limitBox.currentValue === "roof"
                Layout.fillWidth: true
                Label { text: "Surface utile" }
                OseInputUnit { id: roofArea; text: "40"; unit: "m²"; Layout.fillWidth: true; onEditingFinished: root.persistForm() }
            }
            RowLayout {
                visible: limitBox.currentValue === "fixed"
                Layout.fillWidth: true
                Label { text: "Ppeak fixe" }
                OseInputUnit { id: fixedPpeak; text: "3"; unit: "kWc"; Layout.fillWidth: true; onEditingFinished: root.persistForm() }
            }
        }

        OseStep {
            step: 4
            title: "Batterie hybride"
            visible: root.isHybrid
            hint: "Mode Hybride : Enedis 30 min recommandé."
            RowLayout {
                Layout.fillWidth: true
                Label { text: "Capacité"; Layout.preferredWidth: 100 }
                OseInputUnit { id: battKwh; text: "5"; unit: "kWh"; Layout.fillWidth: true; onEditingFinished: root.persistForm() }
                Label { text: "DoD" }
                OseInputUnit { id: battDod; text: "80"; unit: "%"; Layout.fillWidth: true; onEditingFinished: root.persistForm() }
            }
        }

        RowLayout {
            OseBtn { text: "Dimensionner"; onClicked: root.runSizing() }
            Label { id: statusLabel; color: Theme.textDim; Layout.fillWidth: true }
        }

        results: ColumnLayout {
            spacing: 10
            Layout.fillWidth: true
            RowLayout {
                spacing: 8
                visible: lastResult.best !== undefined && lastResult.best !== null
                Layout.fillWidth: true
                KpiCard { title: "Puissance"; value: ((lastResult.best && lastResult.best.Ppeak) || 0) + " kWc" }
                KpiCard { title: "Production"; value: ((lastResult.best && lastResult.best.E_annual) || 0) + " kWh" }
            }
            RowLayout {
                spacing: 8
                visible: lastResult.best !== undefined && lastResult.best !== null
                Layout.fillWidth: true
                KpiCard { title: "Couverture"; value: ((lastResult.best && lastResult.best.coverage) || 0) + " %" }
                KpiCard { title: "Payback"; value: (lastResult.best && lastResult.best.payback) ? (lastResult.best.payback + " ans") : "—" }
            }
            RowLayout {
                spacing: 8
                visible: lastResult.best !== undefined && lastResult.best !== null
                Layout.fillWidth: true
                KpiCard { title: "Coût"; value: ((lastResult.best && lastResult.best.systemCost) || 0) + " €" }
                KpiCard { title: "Économies"; value: ((lastResult.best && lastResult.best.savings) || 0) + " €/an" }
            }
            KpiCard {
                visible: lastResult.annualBill !== undefined
                title: "Facture actuelle (tarif)"
                value: Math.round(lastResult.annualBill || 0) + " €/an"
            }
            OseCard {
                title: "Courbe candidats (économies)"
                visible: !!(lastResult.candidates && lastResult.candidates.length)
                SimpleBarChart {
                    Layout.fillWidth: true
                    Layout.preferredHeight: 180
                    unit: "€/an"
                    decimals: 0
                    labels: {
                        const c = lastResult.candidates || []
                        let out = []
                        for (let i = 0; i < c.length; i += 5)
                            out.push(String(c[i].Ppeak || "") + " kWc")
                        return out
                    }
                    values: {
                        const c = lastResult.candidates || []
                        let out = []
                        for (let i = 0; i < c.length; i += 5)
                            out.push(c[i].savings || 0)
                        return out
                    }
                    barColor: Theme.accent
                }
            }
            OseBtn {
                visible: !!(lastResult.best && lastResult.best.Ppeak)
                text: "Appliquer au Système PV"
                kind: "outline"
                onClicked: {
                    const form = Projects.currentProject.formState || {}
                    Projects.updateCurrent({
                        formState: Object.assign({}, form, {
                            Ppeak: lastResult.best.Ppeak,
                            tilt: Number(tiltField.text),
                            azimuth: Number(azField.text),
                            systemCost: lastResult.best.systemCost
                        })
                    })
                    AppController.currentTab = "grid"
                }
            }
        }
    }
}
