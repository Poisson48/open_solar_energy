import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import "controls"

OseTabPage {
    id: root
    title: "Dimensionnement réseau"
    subtitle: "1) Estimer le besoin selon la conso → 2) Choisir le modèle et le nombre de panneaux."
    nextTabId: AppController.nextPrimaryTab()
    nextTabLabel: AppController.tabLabel(AppController.nextPrimaryTab())

    property var lastResult: Projects.currentProject.sizingResult || ({})
    /** Suggestion après estimation libre (avant choix manuel). */
    property var estimateHint: ({})
    property bool isHybrid: (Projects.currentProject.installType || "grid") === "hybrid"
    property bool syncing: false
    readonly property var monthShort: [
        "Jan", "Fév", "Mar", "Avr", "Mai", "Juin",
        "Juil", "Aoû", "Sep", "Oct", "Nov", "Déc"
    ]
    /** Textes des 12 champs kWh (source de vérité UI). */
    property var monthKwhTexts: ["0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0"]

    function comboIndexFor(box, value, fallback) {
        const m = box.model
        for (let i = 0; i < m.length; ++i) {
            if (m[i].value === value)
                return i
        }
        return fallback !== undefined ? fallback : 0
    }

    function setMonthKwhTexts(arr) {
        const next = []
        for (let i = 0; i < 12; ++i)
            next.push(String(Math.round(Number(arr && arr[i]) || 0)))
        monthKwhTexts = next
    }

    function monthlyFromUi() {
        const out = []
        for (let i = 0; i < 12; ++i)
            out.push(Math.max(0, Number(monthKwhTexts[i]) || 0))
        return out
    }

    function sumMonths(arr) {
        let s = 0
        for (let i = 0; i < 12; ++i)
            s += Math.max(0, Number(arr[i]) || 0)
        return Math.round(s)
    }

    function syncAnnualFromMonths() {
        annualField.text = String(sumMonths(monthlyFromUi()))
    }

    /** Enregistre seulement l’annuel — ne touche pas aux 12 mois. */
    function persistAnnualOnly() {
        if (syncing)
            return
        const a = Math.round(Math.max(0, Number(annualField.text) || 0))
        annualField.text = String(a)
        const f = Projects.currentProject.formState || {}
        syncing = true
        Projects.updateCurrent({
            formState: Object.assign({}, f, { annualKwh: a })
        })
        syncing = false
    }

    function distributeAnnualToMonths() {
        if (syncing)
            return
        const a = Math.round(Math.max(0, Number(annualField.text) || 0))
        annualField.text = String(a)
        setMonthKwhTexts(monthlyFromAnnual(a))
        persistMonthlyAndForm()
        AppController.toast("Annuel réparti sur 12 mois (" + a + " kWh)", 2500)
    }

    function onMonthEdited(index, text) {
        if (syncing)
            return
        const next = monthKwhTexts.slice()
        next[index] = text
        monthKwhTexts = next
        syncAnnualFromMonths()
        persistMonthlyAndForm()
    }

    function persistMonthlyAndForm() {
        if (syncing)
            return
        const monthly = monthlyFromUi()
        const annual = sumMonths(monthly)
        annualField.text = String(annual)
        const f = Projects.currentProject.formState || {}
        const b = Projects.currentProject.bill || {}
        // syncing pendant update pour éviter loadFromProject qui écrase la saisie
        syncing = true
        Projects.updateCurrent({
            monthlyKwh: monthly,
            formState: Object.assign({}, f, { annualKwh: annual }),
            bill: Object.assign({}, b, {
                tariff: tariffBox.currentValue,
                priceBase: Number(priceBase.text),
                subscriptionPerYear: Number(subscription.text),
                priceHpHc: { hp: Number(priceHp.text), hc: Number(priceHc.text) },
                monthlyKwh: monthly
            })
        })
        syncing = false
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

        let monthly = Projects.currentProject.monthlyKwh || b.monthlyKwh || []
        if (!monthly.length || monthly.length < 12) {
            const annual = Number(f.annualKwh !== undefined ? f.annualKwh : 4500)
            monthly = monthlyFromAnnual(annual)
        }
        setMonthKwhTexts(monthly)
        // Garder l’annuel saisi (formState) même s’il n’a pas encore été réparti
        const monthSum = sumMonths(monthly)
        const storedAnnual = Number(f.annualKwh)
        if (storedAnnual > 0)
            annualField.text = String(Math.round(storedAnnual))
        else
            annualField.text = String(monthSum > 0 ? monthSum : 4500)

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
        roofArea.text = String(f.roofArea !== undefined ? f.roofArea : 40)
        fixedPpeak.text = String(f.fixedPpeak !== undefined ? f.fixedPpeak
                                 : (f.Ppeak !== undefined ? f.Ppeak : 3))
        panelCountField.text = String(f.panelCount !== undefined ? f.panelCount
                                      : (f.suggestedPanelCount !== undefined ? f.suggestedPanelCount
                                      : (f.panelWp > 0 && f.Ppeak > 0
                                         ? Math.max(1, Math.round(Number(f.Ppeak) * 1000 / Number(f.panelWp)))
                                         : 10)))
        if (f.suggestedPanelCount !== undefined || f.suggestedPpeak !== undefined) {
            estimateHint = {
                panelCount: f.suggestedPanelCount,
                Ppeak: f.suggestedPpeak
            }
        }
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
            limitMode: "panels",
            roofArea: Number(roofArea.text),
            fixedPpeak: Number(fixedPpeak.text),
            panelCount: Math.max(1, Math.round(Number(panelCountField.text) || 1)),
            panelWp: Number(panelWpField.text),
            Ppeak: root.derivedPpeak(),
            systemCost: root.derivedSystemCost(),
            battKwh: Number(battKwh.text),
            battDod: Number(battDod.text),
            loadDayKwh: loadDay.text.length ? Number(loadDay.text) : undefined,
            loadNightKwh: loadNight.text.length ? Number(loadNight.text) : undefined
        }, extra || {})
        const monthly = monthlyFromUi()
        const bill = Object.assign({}, b, {
            tariff: tariffBox.currentValue,
            priceBase: Number(priceBase.text),
            subscriptionPerYear: Number(subscription.text),
            priceHpHc: { hp: Number(priceHp.text), hc: Number(priceHc.text) },
            monthlyKwh: monthly
        })
        Projects.updateCurrent({
            formState: Object.assign({}, f, patch),
            bill: bill,
            monthlyKwh: monthly
        })
    }

    Component.onCompleted: loadFromProject()

    Connections {
        target: Projects
        function onCurrentChanged() {
            if (!root.syncing)
                root.loadFromProject()
        }
    }

    function derivedPpeak() {
        const wp = Number(panelWpField.text) || 400
        const n = Math.max(1, Math.round(Number(panelCountField.text) || 1))
        return Math.round(n * wp / 10) / 100
    }

    function derivedSystemCost() {
        return Math.round(derivedPpeak() * (Number(costKwc.text) || 1200))
    }

    function syncPeakFromPanels() {
        const p = derivedPpeak()
        const n = Math.max(1, Math.round(Number(panelCountField.text) || 1))
        persistForm({
            Ppeak: p,
            fixedPpeak: p,
            panelCount: n,
            systemCost: derivedSystemCost(),
            limitMode: "panels"
        })
    }

    function panelCountForPeak(ppeak) {
        const wp = Number(panelWpField.text) || 400
        return Math.max(1, Math.round((Number(ppeak) || 0) * 1000 / wp))
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

    function runSizing(phase) {
        // phase: "estimate" = sweep selon conso ; "confirm" = nb panneaux choisi
        const mode = phase || "confirm"
        const weather = ensureWeather()
        if (!weather.length) return
        let monthly = monthlyFromUi()
        let annual = sumMonths(monthly)
        if (annual <= 0) {
            annual = Number(annualField.text) || 4500
            monthly = monthlyFromAnnual(annual)
            setMonthKwhTexts(monthly)
        }
        annualField.text = String(annual)
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

        const limitMode = (mode === "estimate")
                          ? (roofLimitCheck.checked ? "roof" : "none")
                          : "panels"
        if (mode === "confirm")
            syncPeakFromPanels()

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
            lossTree: (form.lossTree && Object.keys(form.lossTree).length)
                      ? form.lossTree
                      : YearPv.defaultLossTree(Number(lossField.text) || 14),
            injectionPrice: Number(injPrice.text),
            installType: Projects.currentProject.installType || "grid",
            battKwh: isHybrid ? Number(battKwh.text) : 0,
            dod: isHybrid ? Number(battDod.text) : 80,
            dayShare: dayShare,
            loadDayKwh: day || undefined,
            loadNightKwh: night || undefined,
            monthlyLoss: site.monthlyLoss || [],
            annualLossPct: site.annualLossPct || 0,
            halfHourlyKeep: site.halfHourlyKeep || [],
            energyMode: form.energyMode || "fast",
            hourlyWeatherData: Projects.currentProject.hourlyWeatherData || {},
            useElectricalShade: form.energyMode === "study",
            thermal: form.thermal || undefined,
            limitMode: limitMode,
            roofAreaM2: Number(roofArea.text) || 40,
            panelWp: Number(panelWpField.text) || 400,
            panelAreaM2: Number(panelArea.text) || 2.0,
            fixedPpeak: Number(fixedPpeak.text) || derivedPpeak(),
            panelCount: Math.max(1, Math.round(Number(panelCountField.text) || 1))
        })
        const best = lastResult.best || {}
        const nPanels = mode === "confirm"
                        ? Math.max(1, Math.round(Number(panelCountField.text) || 1))
                        : panelCountForPeak(best.Ppeak)

        const bill = {
            tariff: tariffBox.currentValue,
            priceBase: Number(priceBase.text),
            subscriptionPerYear: Number(subscription.text),
            monthlyKwh: monthly,
            priceHpHc: { hp: Number(priceHp.text), hc: Number(priceHc.text) }
        }
        const annualBill = Finance.calcCurrentAnnualBill(bill)

        if (mode === "estimate") {
            estimateHint = {
                Ppeak: best.Ppeak,
                panelCount: nPanels,
                E_annual: best.E_annual,
                coverage: best.coverage,
                payback: best.payback,
                systemCost: best.systemCost
            }
            panelCountField.text = String(nPanels)
            statusLabel.text = "Suggestion : " + nPanels + " panneaux ≈ " + (best.Ppeak || "?")
                              + " kWc — choisissez le modèle, ajustez N, puis validez."
            lastResult = Object.assign({}, lastResult, { annualBill: annualBill, phase: "estimate" })
            persistForm({
                suggestedPpeak: best.Ppeak,
                suggestedPanelCount: nPanels
            })
            Projects.updateCurrent({ sizingResult: lastResult })
            AppController.toast("Estimation selon conso : ~" + nPanels + " panneaux ("
                                + (best.Ppeak || "?") + " kWc)", 4000)
            return
        }

        // confirm : figer N panneaux choisis
        const bal = YearPv.buildBalancesReport({
            lat: loc.lat || 43.6,
            tilt: Number(tiltField.text),
            azimuth: Number(azField.text),
            Ppeak: best.Ppeak || derivedPpeak(),
            weatherData: weather,
            losses: Number(lossField.text),
            lossTree: (form.lossTree && Object.keys(form.lossTree).length)
                      ? form.lossTree
                      : YearPv.defaultLossTree(Number(lossField.text) || 14),
            halfHourlyKeep: site.halfHourlyKeep || [],
            monthlyLoss: site.monthlyLoss || [],
            annualLossPct: site.annualLossPct || 0,
            useElectricalShade: form.energyMode === "study",
            useInverterModel: !!form.useInverterModel,
            pacNom: Number(form.pacNom) || (best.Ppeak || 3) * 0.9,
            etaEuro: Number(form.etaEuro) || 0.97,
            energyMode: form.energyMode || "fast",
            hourlyWeatherData: Projects.currentProject.hourlyWeatherData || {},
            thermal: form.thermal || {
                model: form.energyMode === "study" ? "uValue" : "noct",
                U: Number(form.mountU) || 29,
                wind: Number(form.wind) || 1
            }
        })
        lastResult = Object.assign({}, lastResult, { annualBill: annualBill, phase: "confirm" })
        const nextForm = Object.assign({}, form, {
            tilt: Number(tiltField.text),
            azimuth: Number(azField.text),
            tariff: tariffBox.currentValue,
            priceBase: Number(priceBase.text),
            priceHp: Number(priceHp.text),
            priceHc: Number(priceHc.text),
            annualKwh: annual,
            strategy: strategyBox.currentValue,
            limitMode: "panels",
            battKwh: isHybrid ? Number(battKwh.text) : 0,
            Ppeak: best.Ppeak,
            systemCost: best.systemCost,
            panelWp: Number(panelWpField.text) || 400,
            panelCount: nPanels,
            fixedPpeak: best.Ppeak,
            loadDayKwh: day || enedis.loadDayKwh,
            loadNightKwh: night || enedis.loadNightKwh
        })
        let layoutPatch = Projects.currentProject.layout || {}
        if (nPanels > 0) {
            layoutPatch = LayoutRoofs.migrate(layoutPatch)
            let r = 2, c = Math.ceil(nPanels / 2)
            for (let tryC = nPanels; tryC >= 1; --tryC) {
                if (nPanels % tryC === 0) {
                    c = tryC
                    r = nPanels / tryC
                    break
                }
            }
            layoutPatch = LayoutRoofs.generateGrid(layoutPatch, r, c, {
                panelWp: Number(panelWpField.text) || 400,
                tilt: Number(tiltField.text),
                azimuth: Number(azField.text),
                panelW: Number(form.panelW) || undefined,
                panelH: Number(form.panelH) || undefined
            })
        }
        Projects.updateCurrent({
            sizingResult: lastResult,
            monthlyKwh: monthly,
            formState: nextForm,
            bill: bill,
            pvsystBalances: bal,
            layout: layoutPatch
        })
        Projects.updateCurrent({
            resultsFingerprint: Pipeline.fingerprint(Projects.currentProject),
            resultsBasis: Pipeline.fingerprintParts(Projects.currentProject)
        })
        statusLabel.text = "Validé : " + nPanels + " panneaux · " + (best.Ppeak || "?") + " kWc"
        AppController.autoSave("Dimensionnement validé — "
                               + nPanels + " panneaux · " + (best.Ppeak || "?") + " kWc")
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
        const site = Projects.currentProject.siteSurvey || {}
        const shade = {
            monthlyLoss: site.monthlyLoss || [],
            annualLossPct: Number(site.annualLossPct) || 0,
            halfHourlyKeep: site.halfHourlyKeep || []
        }
        const opt = SolarMath.optimalTilt(loc.lat || 43.6, weather, true, shade)
        tiltField.text = String(opt.tilt)
        azField.text = String(opt.azimuth)
        persistForm()
        const shadeNote = opt.shadeApplied ? " (avec ombrage site)" : ""
        AppController.toast("Tilt optimal " + opt.tilt + "° / az " + opt.azimuth + "°" + shadeNote)
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
                Label { text: "Tarif"; Layout.preferredWidth: Ui.isPhone ? 72 : 80 }
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
            GridLayout {
                columns: Ui.isPhone ? 1 : 2
                Layout.fillWidth: true
                columnSpacing: 8
                rowSpacing: 6
                RowLayout {
                    Layout.fillWidth: true
                    Label { text: "Prix kWh"; Layout.preferredWidth: 80 }
                    OseInputUnit { id: priceBase; text: "0.2516"; unit: "€"; Layout.fillWidth: true; onEditingFinished: root.persistForm() }
                }
                RowLayout {
                    Layout.fillWidth: true
                    Label { text: "Abo."; Layout.preferredWidth: 80 }
                    OseInputUnit { id: subscription; text: "147"; unit: "€/an"; Layout.fillWidth: true; onEditingFinished: root.persistForm() }
                }
                RowLayout {
                    Layout.fillWidth: true
                    Label { text: "Revente surplus"; Layout.preferredWidth: Ui.isPhone ? 110 : 110 }
                    OseInputUnit {
                        id: injPrice
                        text: "0.04"
                        unit: "€/kWh"
                        Layout.fillWidth: true
                        onEditingFinished: root.persistForm()
                    }
                }
            }
            Label {
                Layout.fillWidth: true
                wrapMode: Text.WordWrap
                font.pixelSize: 11
                color: Theme.textDim
                text: "Tarif de rachat du surplus injecté (EDF OA / agrégateur). Défaut 0,04 €/kWh."
            }
            GridLayout {
                visible: tariffBox.currentValue === "hphc"
                columns: Ui.isPhone ? 1 : 2
                Layout.fillWidth: true
                columnSpacing: 8
                rowSpacing: 6
                RowLayout {
                    Layout.fillWidth: true
                    Label { text: "HP"; Layout.preferredWidth: 80 }
                    OseInputUnit { id: priceHp; text: "0.246"; unit: "€"; Layout.fillWidth: true; onEditingFinished: root.persistForm() }
                }
                RowLayout {
                    Layout.fillWidth: true
                    Label { text: "HC"; Layout.preferredWidth: 80 }
                    OseInputUnit { id: priceHc; text: "0.186"; unit: "€"; Layout.fillWidth: true; onEditingFinished: root.persistForm() }
                }
            }
            RowLayout {
                Layout.fillWidth: true
                Label { text: "Conso annuelle"; Layout.preferredWidth: Ui.isPhone ? 110 : 110 }
                OseInputUnit {
                    id: annualField
                    text: "4500"
                    unit: "kWh"
                    Layout.fillWidth: true
                    inputMethodHints: Qt.ImhFormattedNumbersOnly
                    onEditingFinished: root.persistAnnualOnly()
                }
            }
            Label {
                Layout.fillWidth: true
                wrapMode: Text.WordWrap
                font.pixelSize: 12
                font.weight: Font.DemiBold
                color: Theme.text
                text: "Conso mensuelle (kWh)"
            }
            Label {
                Layout.fillWidth: true
                wrapMode: Text.WordWrap
                font.pixelSize: 11
                color: Theme.textDim
                text: "Saisissez les 12 mois, ou l’annuel puis « Répartir l’annuel sur 12 mois »."
            }
            GridLayout {
                columns: Ui.isPhone ? 2 : 4
                Layout.fillWidth: true
                columnSpacing: 8
                rowSpacing: 6
                Repeater {
                    model: 12
                    RowLayout {
                        Layout.fillWidth: true
                        spacing: 4
                        Label {
                            text: root.monthShort[index]
                            Layout.preferredWidth: Ui.isPhone ? 36 : 40
                            font.pixelSize: 12
                            color: Theme.textDim
                        }
                        OseInputUnit {
                            Layout.fillWidth: true
                            text: root.monthKwhTexts[index]
                            unit: "kWh"
                            inputMethodHints: Qt.ImhFormattedNumbersOnly
                            onEditingFinished: root.onMonthEdited(index, text)
                        }
                    }
                }
            }
            RowLayout {
                Layout.fillWidth: true
                spacing: 8
                OseBtn {
                    text: "Répartir l’annuel sur 12 mois"
                    kind: "outline"
                    Layout.fillWidth: true
                    onClicked: root.distributeAnnualToMonths()
                }
            }
            Label {
                Layout.fillWidth: true
                wrapMode: Text.WordWrap
                font.pixelSize: 12
                color: Theme.textDim
                text: {
                    const a = Number(annualField.text) || 0
                    const d = a / 365
                    return "Moyenne : " + d.toFixed(1).replace(".", ",") + " kWh/jour"
                }
            }
            GridLayout {
                columns: Ui.isPhone ? 1 : 2
                Layout.fillWidth: true
                columnSpacing: 8
                rowSpacing: 6
                RowLayout {
                    Layout.fillWidth: true
                    Label { text: "Jour"; Layout.preferredWidth: 80 }
                    OseInputUnit { id: loadDay; placeholderText: "jour"; unit: "kWh/j"; Layout.fillWidth: true; onEditingFinished: root.persistForm() }
                }
                RowLayout {
                    Layout.fillWidth: true
                    Label { text: "Nuit"; Layout.preferredWidth: 80 }
                    OseInputUnit { id: loadNight; placeholderText: "nuit"; unit: "kWh/j"; Layout.fillWidth: true; onEditingFinished: root.persistForm() }
                }
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
                    root.setMonthKwhTexts(r.monthlyKwh || root.monthlyFromAnnual(r.annualKwh || 0))
                    annualField.text = String(r.annualKwh || root.sumMonths(root.monthlyFromUi()))
                    if (r.loadDayKwh !== undefined) loadDay.text = String(r.loadDayKwh)
                    if (r.loadNightKwh !== undefined) loadNight.text = String(r.loadNightKwh)
                    Projects.updateCurrent({
                        monthlyKwh: root.monthlyFromUi(),
                        enedisImport: r,
                        formState: Object.assign({}, Projects.currentProject.formState || {}, {
                            annualKwh: Number(annualField.text),
                            loadDayKwh: r.loadDayKwh,
                            loadNightKwh: r.loadNightKwh
                        }),
                        bill: Object.assign({}, Projects.currentProject.bill || {}, {
                            monthlyKwh: root.monthlyFromUi()
                        })
                    })
                    statusLabel.text = "Enedis OK — " + annualField.text + " kWh/an"
                              + (r.halfHourly ? " (profil 30 min)" : "")
                }
            }
        }

        OseStep {
            step: 2
            title: "Orientation & pertes"
            GridLayout {
                columns: Ui.isPhone ? 1 : 2
                Layout.fillWidth: true
                columnSpacing: 8
                rowSpacing: 6
                RowLayout {
                    Layout.fillWidth: true
                    Label { text: "Inclinaison"; Layout.preferredWidth: 100 }
                    OseInputUnit { id: tiltField; text: "30"; unit: "°"; Layout.fillWidth: true; onEditingFinished: root.persistForm() }
                }
                RowLayout {
                    Layout.fillWidth: true
                    Label { text: "Azimut"; Layout.preferredWidth: 100 }
                    OseInputUnit { id: azField; text: "0"; unit: "°"; Layout.fillWidth: true; onEditingFinished: root.persistForm() }
                }
            }
            OseBtn { text: Ui.isPhone ? "Optimiser tilt / azimut" : "Optimiser tilt / azimut (météo)"; kind: "outline"; onClicked: root.optimTilt() }
            GridLayout {
                columns: Ui.isPhone ? 1 : 2
                Layout.fillWidth: true
                columnSpacing: 8
                rowSpacing: 6
                RowLayout {
                    Layout.fillWidth: true
                    Label { text: "Pertes"; Layout.preferredWidth: 100 }
                    OseInputUnit {
                        id: lossField
                        text: "14"
                        unit: "%"
                        Layout.fillWidth: true
                        onEditingFinished: {
                            const form = Projects.currentProject.formState || {}
                            Projects.updateCurrent({
                                formState: Object.assign({}, form, {
                                    losses: Number(lossField.text),
                                    lossTree: YearPv.defaultLossTree(Number(lossField.text))
                                })
                            })
                            root.persistForm()
                        }
                    }
                }
                RowLayout {
                    Layout.fillWidth: true
                    Label { text: "Coût / kWc"; Layout.preferredWidth: 100 }
                    OseInputUnit { id: costKwc; text: "1200"; unit: "€"; Layout.fillWidth: true; onEditingFinished: root.persistForm() }
                }
            }
            Label {
                Layout.fillWidth: true
                wrapMode: Text.WordWrap
                font.pixelSize: 11
                color: Theme.textDim
                text: {
                    const t = (Projects.currentProject.formState || {}).lossTree
                              || YearPv.defaultLossTree(Number(lossField.text) || 14)
                    const f = YearPv.effectiveLossFactor({ lossTree: t })
                    return "Arbre pertes : soiling " + (t.soiling || 0)
                           + " · LID " + (t.lid || 0)
                           + " · mismatch " + (t.mismatch || 0)
                           + " · IAM " + (t.iam || 0)
                           + " · ohm DC/AC " + (t.ohmicDc || 0) + "/" + (t.ohmicAc || 0)
                           + " · dispo " + (t.availability || 0)
                           + " · autre " + (t.other || 0)
                           + " → facteur " + f.toFixed(3)
                           + " (" + (((Projects.currentProject.formState || {}).energyMode) || "fast") + ")"
                }
            }
            GridLayout {
                columns: Ui.isPhone ? 1 : 2
                Layout.fillWidth: true
                columnSpacing: 8
                rowSpacing: 4
                Repeater {
                    model: [
                        { key: "soiling", label: "Salissure" },
                        { key: "lid", label: "LID" },
                        { key: "mismatch", label: "Mismatch" },
                        { key: "iam", label: "IAM" },
                        { key: "ohmicDc", label: "Ohm DC" },
                        { key: "ohmicAc", label: "Ohm AC" },
                        { key: "availability", label: "Dispo" },
                        { key: "other", label: "Autre" }
                    ]
                    delegate: RowLayout {
                        Layout.fillWidth: true
                        Label { text: modelData.label; Layout.preferredWidth: 90; font.pixelSize: 12 }
                        OseInputUnit {
                            text: {
                                const t = (Projects.currentProject.formState || {}).lossTree
                                          || YearPv.defaultLossTree(14)
                                return String(t[modelData.key] !== undefined ? t[modelData.key] : 0)
                            }
                            unit: "%"
                            Layout.fillWidth: true
                            onEditingFinished: {
                                const form = Projects.currentProject.formState || {}
                                const t = Object.assign({}, form.lossTree || YearPv.defaultLossTree(14))
                                t[modelData.key] = Number(text)
                                const f = YearPv.effectiveLossFactor({ lossTree: t })
                                lossField.text = String(Math.round((1 - f) * 1000) / 10)
                                Projects.updateCurrent({
                                    formState: Object.assign({}, form, {
                                        lossTree: t,
                                        losses: Number(lossField.text)
                                    })
                                })
                            }
                        }
                    }
                }
            }
            RowLayout {
                Layout.fillWidth: true
                Label { text: "Montage U"; Layout.preferredWidth: 100 }
                OseInputUnit {
                    id: mountUField
                    text: String(((Projects.currentProject.formState || {}).mountU) || 29)
                    unit: "W/m²K"
                    Layout.fillWidth: true
                    onEditingFinished: {
                        const form = Projects.currentProject.formState || {}
                        Projects.updateCurrent({
                            formState: Object.assign({}, form, {
                                mountU: Number(mountUField.text),
                                thermal: {
                                    model: (form.energyMode === "study") ? "uValue" : "noct",
                                    U: Number(mountUField.text),
                                    wind: Number(form.wind) || 1
                                }
                            })
                        })
                    }
                }
            }
            CheckBox {
                id: invModelCheck
                text: "Onduleur η(P) + clipping (mode étude)"
                checked: !!(Projects.currentProject.formState || {}).useInverterModel
                onToggled: {
                    const form = Projects.currentProject.formState || {}
                    Projects.updateCurrent({
                        formState: Object.assign({}, form, { useInverterModel: checked })
                    })
                }
            }
        }

        OseStep {
            step: 3
            title: "1 — Estimer le besoin (selon la conso)"
            hint: "L’algo balaye les puissances pour ROI / autoconso / couverture. Ça propose un nombre de panneaux — ce n’est pas encore le choix final."
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
            CheckBox {
                id: roofLimitCheck
                text: "Borner l’estimation par la surface toiture"
                checked: false
                onToggled: root.persistForm()
            }
            RowLayout {
                visible: roofLimitCheck.checked
                Layout.fillWidth: true
                Label { text: "Surface utile" }
                OseInputUnit { id: roofArea; text: "40"; unit: "m²"; Layout.fillWidth: true; onEditingFinished: root.persistForm() }
            }
            // champs techniques conservés (non visibles) pour compat persist
            OseInputUnit { id: fixedPpeak; visible: false; text: "3" }
            OseBtn {
                text: "Estimer le besoin"
                kind: "primary"
                onClicked: root.runSizing("estimate")
            }
            OseAlert {
                visible: estimateHint.panelCount !== undefined
                kind: "info"
                text: "Suggestion : ~" + (estimateHint.panelCount || "?") + " panneaux ≈ "
                      + (estimateHint.Ppeak || "?") + " kWc"
                      + (estimateHint.coverage !== undefined ? (" · couverture " + estimateHint.coverage + " %") : "")
                      + (estimateHint.payback !== undefined ? (" · payback " + estimateHint.payback + " ans") : "")
                      + " — passez à l’étape 2 pour choisir le modèle et le nombre exact."
            }
        }

        OseStep {
            step: 4
            title: "2 — Choisir modèle + nombre de panneaux"
            hint: "Ex. vous avez acheté 10 panneaux : sélectionnez le modèle, tapez 10, validez. Ppeak et coût se recalculent."
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
                        // Après estimation : recalculer N depuis le kWc suggéré
                        const hintPeak = Number(estimateHint.Ppeak)
                                      || Number((Projects.currentProject.formState || {}).suggestedPpeak)
                        if (hintPeak > 0 && (it.wp || 0) > 0)
                            panelCountField.text = String(Math.max(1, Math.round(hintPeak * 1000 / it.wp)))
                        const form = Projects.currentProject.formState || {}
                        Projects.updateCurrent({
                            formState: Object.assign({}, form, {
                                panelId: it.value,
                                panelWp: it.wp,
                                panelArea: it.area,
                                panelW: it.w,
                                panelH: it.h,
                                panelModel: it.label
                            })
                        })
                        root.syncPeakFromPanels()
                    }
                }
                OseBtn {
                    text: "Bibliothèque"
                    kind: "outline"
                    onClicked: AppController.openMateriel()
                }
            }
            GridLayout {
                columns: Ui.isPhone ? 1 : 2
                Layout.fillWidth: true
                columnSpacing: 8
                rowSpacing: 6
                RowLayout {
                    Layout.fillWidth: true
                    Label { text: "Wc module"; Layout.preferredWidth: 90 }
                    OseInputUnit {
                        id: panelWpField
                        text: "400"
                        unit: "Wc"
                        Layout.fillWidth: true
                        onEditingFinished: root.syncPeakFromPanels()
                    }
                }
                RowLayout {
                    Layout.fillWidth: true
                    Label { text: "Surface"; Layout.preferredWidth: 90 }
                    OseInputUnit { id: panelArea; text: "2.0"; unit: "m²"; Layout.fillWidth: true }
                }
                RowLayout {
                    Layout.fillWidth: true
                    Label { text: "Nb panneaux"; Layout.preferredWidth: 90 }
                    OseInputUnit {
                        id: panelCountField
                        text: "10"
                        unit: "pcs"
                        Layout.fillWidth: true
                        inputMethodHints: Qt.ImhDigitsOnly
                        onEditingFinished: root.syncPeakFromPanels()
                    }
                }
            }
            Label {
                Layout.fillWidth: true
                wrapMode: Text.WordWrap
                font.pixelSize: 13
                font.weight: Font.DemiBold
                color: Theme.text
                text: {
                    const n = Math.max(1, Math.round(Number(panelCountField.text) || 1))
                    const wp = Number(panelWpField.text) || 400
                    const p = Math.round(n * wp / 10) / 100
                    const cost = Math.round(p * (Number(costKwc.text) || 1200))
                    return "Installation : " + n + " × " + wp + " Wc = " + p + " kWc · coût ~ "
                           + cost + " €"
                }
            }
            OseBtn {
                text: "Valider avec ces panneaux"
                kind: "primary"
                onClicked: root.runSizing("confirm")
            }
        }

        OseStep {
            step: 5
            title: "Batterie hybride"
            visible: root.isHybrid
            hint: "Mode Hybride : Enedis 30 min recommandé."
            GridLayout {
                columns: Ui.isPhone ? 1 : 2
                Layout.fillWidth: true
                columnSpacing: 8
                rowSpacing: 6
                RowLayout {
                    Layout.fillWidth: true
                    Label { text: "Capacité"; Layout.preferredWidth: 100 }
                    OseInputUnit { id: battKwh; text: "5"; unit: "kWh"; Layout.fillWidth: true; onEditingFinished: root.persistForm() }
                }
                RowLayout {
                    Layout.fillWidth: true
                    Label { text: "DoD"; Layout.preferredWidth: 100 }
                    OseInputUnit { id: battDod; text: "80"; unit: "%"; Layout.fillWidth: true; onEditingFinished: root.persistForm() }
                }
            }
        }

        Label {
            id: statusLabel
            Layout.fillWidth: true
            wrapMode: Text.WordWrap
            color: Theme.textDim
            font.pixelSize: 12
        }

        results: ColumnLayout {
            spacing: 10
            Layout.fillWidth: true
            RowLayout {
                spacing: 8
                visible: lastResult.best !== undefined && lastResult.best !== null
                Layout.fillWidth: true
                KpiCard { title: "Puissance"; value: ((lastResult.best && lastResult.best.Ppeak) || 0) + " kWc" }
                KpiCard {
                    title: "Panneaux"
                    value: {
                        const n = (Projects.currentProject.formState || {}).panelCount
                                  || (estimateHint.panelCount)
                                  || "—"
                        return String(n)
                    }
                }
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
                            panelCount: form.panelCount
                                        || root.panelCountForPeak(lastResult.best.Ppeak),
                            tilt: Number(tiltField.text),
                            azimuth: Number(azField.text),
                            systemCost: lastResult.best.systemCost,
                            limitMode: "panels"
                        })
                    })
                    AppController.currentTab = "grid"
                }
            }
        }
    }
}
