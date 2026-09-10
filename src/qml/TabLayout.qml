import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import OpenSolarEnergy
import "controls"

/** Implantation : split desktop / empilé téléphone. */
Item {
    id: root

    readonly property bool compact: Ui.isCompact

    property var layoutState: ({ activeId: "", roofs: [] })
    property var shadeSample: ({})
    property var sceneShade: ({})
    property bool _syncing: false
    property bool _suppressSync: false
    property bool _shadeDirty: false
    property real _shadeEtaSec: 0
    property string _shadeEtaLabel: ""

    readonly property bool shadeComputing: ShadingEngine.computing
    readonly property int shadePercent: ShadingEngine.computePercent
    readonly property real shadeEtaSec: ShadingEngine.computeEtaSec
    readonly property string shadeStatus: ShadingEngine.computeStatus

    Connections {
        target: ShadingEngine
        function onComputeFinished(result) {
            root.onAnnualShadeFinished(result)
        }
        function onComputeFailed(err) {
            root._shadeDirty = true
            AppController.toast("Échec ombrage annuel : " + err, 4000)
        }
    }

    readonly property var form: Projects.currentProject.formState || {}
    readonly property var site: Projects.currentProject.siteSurvey || {}
    readonly property var loc: Projects.currentProject.location || {}
    readonly property var activeRoof: LayoutRoofs.getActiveRoof(layoutState)
    readonly property var monthNames: [
        "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
        "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"
    ]
    readonly property real surfaceUsed: LayoutRoofs.totalPanelSurfaceM2(layoutState)
    readonly property real surfaceRoof: LayoutRoofs.totalRoofSurfaceM2(layoutState)
    readonly property int panelCount: LayoutRoofs.totalPanels(layoutState)

    function panelCountFromPeak() {
        const ppeak = form.Ppeak
            || ((Projects.currentProject.sizingResult || {}).best || {}).Ppeak
            || ((Projects.currentProject.offgridResult || {}).best || {}).Ppeak
            || 3
        return Pipeline.estimatePanelCount(ppeak, form.panelWp || 400)
    }

    function syncFromProject() {
        _syncing = true
        layoutState = LayoutRoofs.migrate(Projects.currentProject.layout || {})
        const formNow = Projects.currentProject.formState || {}
        // Si toiture encore aux dims défaut mais formulaire a un module biblio → reprendre
        if (formNow.panelW > 0.2 && formNow.panelH > 0.2) {
            let roofs = (layoutState.roofs || []).slice()
            let changed = false
            for (let i = 0; i < roofs.length; ++i) {
                const r = Object.assign({}, roofs[i])
                if (!r.panelW || Math.abs(Number(r.panelW) - 1.13) < 0.02) {
                    r.panelW = Number(formNow.panelW); changed = true
                }
                if (!r.panelH || Math.abs(Number(r.panelH) - 1.76) < 0.02) {
                    r.panelH = Number(formNow.panelH); changed = true
                }
                roofs[i] = r
            }
            if (changed)
                layoutState = Object.assign({}, layoutState, { roofs: roofs })
        }
        const r = LayoutRoofs.getActiveRoof(layoutState)
        if (r) {
            roofNameField.text = r.name || "Toiture"
            roofLen.text = String(r.roofW !== undefined ? r.roofW : 10)
            roofWid.text = String(r.roofD !== undefined ? r.roofD : 6)
            pwField.text = String(formNow.panelW !== undefined ? formNow.panelW : (r.panelW || 1.134))
            phField.text = String(formNow.panelH !== undefined ? formNow.panelH : (r.panelH || 1.722))
            tiltField.text = String(r.tilt !== undefined ? r.tilt : 30)
            azField.text = String(r.azimuth !== undefined ? r.azimuth : 0)
            gapFieldX.text = String(r.gapX !== undefined ? r.gapX : (r.gap !== undefined ? r.gap : 0.03))
            gapFieldZ.text = String(r.gapZ !== undefined ? r.gapZ : (r.gap !== undefined ? r.gap : 0.03))
            mountHeightField.text = String(r.mountHeight !== undefined ? r.mountHeight : 0.08)
            rowField.text = String(r.rows !== undefined ? r.rows : 2)
            colField.text = String(r.cols !== undefined ? r.cols : 4)
            nGenField.text = String((Number(r.rows) || 2) * (Number(r.cols) || 4))
        }
        const m = formNow.layoutSunMonth >= 1 && formNow.layoutSunMonth <= 12 ? formNow.layoutSunMonth : 6
        monthBox.currentIndex = m - 1
        hourBox.value = formNow.layoutSunHour !== undefined ? formNow.layoutSunHour : 12
        scene3d.roofs = layoutState.roofs || []
        scene3d.activeRoofId = layoutState.activeId || ""
        scene3d.obstacles = site.obstacles || []
        updateSun()
        _syncing = false
        Qt.callLater(function () { scene3d.frameSceneOnce() })
    }

    function persistLayout() {
        if (_syncing)
            return
        const ori = LayoutRoofs.weightedOrientation(layoutState, form.panelWp || 400) || {}
        _suppressSync = true
        Projects.updateCurrent({
            layout: layoutState,
            formState: Object.assign({}, form, {
                tilt: ori.tilt !== undefined ? ori.tilt : Number(tiltField.text),
                azimuth: ori.azimuth !== undefined ? ori.azimuth : Number(azField.text),
                layoutSunMonth: monthBox.currentIndex + 1,
                layoutSunHour: hourBox.value,
                panelWp: form.panelWp || 400,
                panelW: Number(pwField.text),
                panelH: Number(phField.text)
            })
        })
        _suppressSync = false
    }

    function pushRoofsToScene() {
        const roofs = layoutState.roofs || []
        scene3d.activeRoofId = layoutState.activeId || ""
        // Vide puis réassigne au tick suivant pour forcer Repeater3D
        scene3d.roofs = []
        Qt.callLater(function () {
            scene3d.roofs = roofs
            scene3d.bumpPanelMesh()
        })
    }

    /** Grille 3D = lignes × colonnes choisies (toiture active). */
    function generateGrid() {
        ensureUsableLayout()
        const rows = Math.max(1, Math.round(Number(rowField.text) || 2))
        const cols = Math.max(1, Math.round(Number(colField.text) || 4))
        const dims = {
            name: (roofNameField.text || "").trim() || "Toiture",
            roofW: Number(roofLen.text) || 10,
            roofD: Number(roofWid.text) || 6,
            panelW: Number(pwField.text) || 1.13,
            panelH: Number(phField.text) || 1.76,
            tilt: Number(tiltField.text) || 30,
            azimuth: Number(azField.text) || 0,
            gapX: Math.max(0, Number(gapFieldX.text) || 0.03),
            gapZ: Math.max(0, Number(gapFieldZ.text) || 0.03),
            gap: Math.max(0, Number(gapFieldX.text) || 0.03),
            mountHeight: Math.max(0, Math.min(5, Number(mountHeightField.text) || 0.08))
        }
        _suppressSync = true
        layoutState = LayoutRoofs.generateGrid(layoutState, rows, cols, dims, layoutState.activeId || "")
        nGenField.text = String(rows * cols)
        fillActiveForm()
        pushRoofsToScene()
        _suppressSync = false
        persistLayout()
        refreshShadeSample()
        scheduleShadeApply()
        const n = LayoutRoofs.totalPanels(layoutState)
        AppController.toast(rows + "×" + cols + " → " + n + " panneaux sur la toiture")
        if (n <= 0)
            AppController.toast("Échec génération — vérifiez lignes/colonnes", 4000)
    }

    function patchActive(patch) {
        layoutState = LayoutRoofs.updateRoof(layoutState, layoutState.activeId, patch)
        pushRoofsToScene()
        persistLayout()
        refreshShadeSample()
    }

    function applySceneDims() {
        const gapX = Math.max(0, Number(gapFieldX.text) || 0.03)
        const gapZ = Math.max(0, Number(gapFieldZ.text) || 0.03)
        const mountHeight = Math.max(0, Math.min(5, Number(mountHeightField.text) || 0.08))
        patchActive({
            name: (roofNameField.text || "").trim() || "Toiture",
            roofW: Number(roofLen.text),
            roofD: Number(roofWid.text),
            panelW: Number(pwField.text),
            panelH: Number(phField.text),
            tilt: Number(tiltField.text),
            azimuth: Number(azField.text),
            gap: gapX,
            gapX: gapX,
            gapZ: gapZ,
            mountHeight: mountHeight,
            rows: Number(rowField.text) || 2,
            cols: Number(colField.text) || 4
        })
        const r = LayoutRoofs.getActiveRoof(layoutState)
        if (r && r.positions && r.positions.length) {
            const tilt = Number(tiltField.text)
            const pw = Number(pwField.text)
            const ph = Number(phField.text)
            const rows = Math.max(1, Number(rowField.text) || 1)
            const t = tilt * Math.PI / 180
            const cosT = Math.cos(t)
            const sinT = Math.sin(t)
            const thick = 0.07
            const fp = ph * cosT + thick * sinT
            const hw = Number(roofLen.text) / 2 - pw / 2
            const hd = Math.max(0, Number(roofWid.text) / 2 - fp / 2)
            const arrayAlong = rows * ph + (rows - 1) * gapZ
            const clear = mountHeight + (arrayAlong / 2) * sinT
            const next = []
            for (let i = 0; i < r.positions.length; ++i) {
                const p = r.positions[i]
                const x = Math.max(-hw, Math.min(hw, Number(p.x) || 0))
                // along depuis z (ou y à ~90°) — jamais tan()
                let along = Number(p.along)
                if (isNaN(along)) {
                    if (Math.abs(cosT) >= 1e-6)
                        along = (Number(p.z) || 0) / cosT
                    else if (Math.abs(sinT) >= 1e-6)
                        along = ((Number(p.y) || clear) - clear) / sinT
                    else
                        along = Number(p.z) || 0
                }
                const z = Math.max(-hd, Math.min(hd, along * cosT))
                const y = along * sinT + clear
                next.push({
                    id: p.id || ("p" + i),
                    x: x,
                    z: z,
                    y: y,
                    along: along,
                    tilt: tilt,
                    yaw: 0,
                    w: pw,
                    h: ph
                })
            }
            patchActive({ positions: next, nPanels: next.length })
        }
        // Dims / azimut changent l’ombrage même sans régénérer la grille
        scheduleShadeApply()
    }

    function fillActiveForm() {
        const r = LayoutRoofs.getActiveRoof(layoutState)
        if (!r)
            return
        _syncing = true
        roofNameField.text = r.name || "Toiture"
        roofLen.text = String(r.roofW)
        roofWid.text = String(r.roofD)
        pwField.text = String(r.panelW)
        phField.text = String(r.panelH)
        tiltField.text = String(r.tilt)
        azField.text = String(r.azimuth)
        gapFieldX.text = String(r.gapX !== undefined ? r.gapX : (r.gap !== undefined ? r.gap : 0.03))
        gapFieldZ.text = String(r.gapZ !== undefined ? r.gapZ : (r.gap !== undefined ? r.gap : 0.03))
        mountHeightField.text = String(r.mountHeight !== undefined ? r.mountHeight : 0.08)
        rowField.text = String(r.rows || 2)
        colField.text = String(r.cols || 4)
        nGenField.text = String((Number(r.rows) || 2) * (Number(r.cols) || 4))
        _syncing = false
    }

    function setActiveRoof(id) {
        layoutState = LayoutRoofs.setActive(layoutState, id)
        scene3d.activeRoofId = layoutState.activeId
        fillActiveForm()
        persistLayout()
    }

    function addRoof() {
        const form = Projects.currentProject.formState || {}
        layoutState = LayoutRoofs.addRoof(layoutState, "")
        // Appliquer dims catalogue au nouveau pan
        if (form.panelW > 0.2 && form.panelH > 0.2) {
            layoutState = LayoutRoofs.updateRoof(layoutState, layoutState.activeId, {
                panelW: Number(form.panelW),
                panelH: Number(form.panelH)
            })
        }
        scene3d.roofs = layoutState.roofs
        scene3d.activeRoofId = layoutState.activeId
        fillActiveForm()
        persistLayout()
    }

    function removeActiveRoof() {
        layoutState = LayoutRoofs.removeRoof(layoutState, layoutState.activeId)
        scene3d.roofs = layoutState.roofs
        scene3d.activeRoofId = layoutState.activeId
        fillActiveForm()
        persistLayout()
    }

    function updateSun() {
        const lat = loc.lat || 43.6
        const doy = [15, 45, 74, 105, 135, 166, 196, 227, 258, 288, 319, 349][monthBox.currentIndex]
        let hour = hourBox.value
        let sp = SiteShade.sunPos(lat, doy, hour)
        // Si heure hors soleil, basculer sur midi pour une lumière exploitable
        if (Number(sp.elev) < 5) {
            hour = 12
            if (hourBox.value !== 12)
                hourBox.value = 12
            sp = SiteShade.sunPos(lat, doy, 12)
        }
        scene3d.sunAz = sp.az
        scene3d.sunElev = Math.max(8, Number(sp.elev) || 45)
        refreshShadeSample()
    }

    function refreshShadeSample() {
        shadeSample = ShadingEngine.samplePrecise(
            layoutState,
            scene3d.obstacles || site.obstacles || [],
            site.points || [],
            scene3d.sunAz, scene3d.sunElev, 0.55)
    }

    /** Garantit une toiture + dims catalogue / formulaire. */
    function ensureUsableLayout() {
        const form = Projects.currentProject.formState || {}
        let st = LayoutRoofs.migrate(Projects.currentProject.layout || {})
        const roofs = st.roofs || []
        if (!roofs.length) {
            st = LayoutRoofs.addRoof(st, "Toiture 1")
            st = LayoutRoofs.updateRoof(st, st.activeId, {
                tilt: Number(form.tilt) || 30,
                azimuth: Number(form.azimuth) || 0,
                panelW: Number(form.panelW) || 1.13,
                panelH: Number(form.panelH) || 1.76
            })
        }
        // Propager dims module du projet (biblio) vers chaque toiture sans positions custom dims
        const pw = Number(form.panelW) || 0
        const ph = Number(form.panelH) || 0
        if (pw > 0.2 && ph > 0.2) {
            let next = (st.roofs || []).slice()
            for (let i = 0; i < next.length; ++i) {
                const r = Object.assign({}, next[i])
                if (!r.panelW || Math.abs(Number(r.panelW) - 1.13) < 0.01)
                    r.panelW = pw
                if (!r.panelH || Math.abs(Number(r.panelH) - 1.76) < 0.01)
                    r.panelH = ph
                next[i] = r
            }
            st = Object.assign({}, st, { roofs: next })
        }
        layoutState = st
        scene3d.roofs = layoutState.roofs || []
        scene3d.activeRoofId = layoutState.activeId || ""
        if (!Projects.currentProject.layout || !(Projects.currentProject.layout.roofs || []).length)
            persistLayout()
    }

    function scheduleShadeApply() {
        // Ne lance plus le calcul annuel auto (trop lourd) — marque dirty + ETA
        _shadeDirty = true
        refreshShadeEta()
    }

    function refreshShadeEta() {
        const weather = Projects.currentProject.weatherData || []
        if (!weather.length || panelCount <= 0) {
            _shadeEtaSec = 0
            _shadeEtaLabel = ""
            return
        }
        const est = ShadingEngine.estimateCompute({
            layout: layoutState,
            obstacles: scene3d.obstacles || site.obstacles || [],
            shadeEngine: "precise"
        })
        _shadeEtaSec = Number(est.etaSec) || 0
        const s = Math.max(1, Math.round(_shadeEtaSec))
        _shadeEtaLabel = s < 60
                         ? ("~" + s + " s")
                         : ("~" + Math.round(s / 60) + " min")
    }

    function startAnnualShadeCompute() {
        const lat = loc.lat || 43.6
        const weather = Projects.currentProject.weatherData || []
        if (!weather.length) {
            AppController.toast("Chargez une météo dans Lieu", 3500)
            return
        }
        const obs = scene3d.obstacles || site.obstacles || []
        if (panelCount <= 0 && obs.length === 0) {
            AppController.toast("Placez au moins un panneau ou un obstacle", 3000)
            return
        }
        if (ShadingEngine.computing) {
            AppController.toast("Calcul déjà en cours…", 2000)
            return
        }
        persistLayout()
        refreshShadeEta()
        const ok = ShadingEngine.startComputeFull({
            lat: lat,
            weatherData: weather,
            horizonPoints: site.points || [],
            obstacles: obs,
            layout: layoutState,
            shadeEngine: "precise"
        })
        if (!ok)
            AppController.toast("Impossible de démarrer le calcul", 3000)
        else
            AppController.toast("Ombrage annuel démarré (" + (_shadeEtaLabel || "…") + ")", 2500)
    }

    function onAnnualShadeFinished(result) {
        sceneShade = result || {}
        const obs = scene3d.obstacles || site.obstacles || []
        Projects.updateCurrent({
            siteSurvey: Object.assign({}, site, {
                points: site.points || [],
                obstacles: obs,
                monthlyLoss: sceneShade.monthlyLoss || [],
                halfHourlyKeep: sceneShade.halfHourlyKeep || [],
                annualLossPct: sceneShade.annualLossPct,
                source: "shading3d"
            }),
            resultsFingerprint: ""
        })
        _shadeDirty = false
        const ms = Number(sceneShade.elapsedMs) || 0
        const took = ms < 1000 ? (ms + " ms") : ((Math.round(ms / 100) / 10) + " s")
        AppController.toast("Ombrage annuel OK — "
                            + (sceneShade.annualLossPct || 0) + " %/an · " + took, 4000)
        AppController.autoSave("Ombrage annuel 3D raycast")
    }

    /** @deprecated utiliser startAnnualShadeCompute — conservé pour appels silencieux legacy */
    function applySceneShadeToProject(silent) {
        if (silent) {
            scheduleShadeApply()
            return
        }
        startAnnualShadeCompute()
    }

    function onPanelsEdited(roofId, panels) {
        layoutState = LayoutRoofs.updateRoof(layoutState, roofId, {
            positions: panels,
            nPanels: panels.length
        })
        scene3d.roofs = layoutState.roofs
        persistLayout()
        refreshShadeSample()
        scheduleShadeApply()
    }

    function onObstaclesEdited(list) {
        scene3d.obstacles = list
        Projects.updateCurrent({
            siteSurvey: Object.assign({}, site, {
                points: site.points || [],
                obstacles: list
            })
        })
        refreshShadeSample()
        scheduleShadeApply()
    }

    function exportPng() {
        scene3d.grabToImage(function (img) {
            const full = AppController.tempExportPath("ose-layout", "png")
            if (img.saveToFile(full)) {
                AppController.openLocalFile(full)
                AppController.toast("PNG enregistré")
            } else {
                AppController.toast("Échec export PNG", 3000)
            }
        })
    }

    function panelsNeedRegrid() {
        const roofs = layoutState.roofs || []
        for (let i = 0; i < roofs.length; ++i) {
            const pos = roofs[i].positions || []
            if (!pos.length)
                continue
            for (let j = 0; j < pos.length; ++j) {
                // Ancien bug : yaw = azimut toiture → panneaux empilés
                if (Math.abs(Number(pos[j].yaw) || 0) > 0.5)
                    return true
            }
        }
        return false
    }

    Component.onCompleted: {
        syncFromProject()
        ensureUsableLayout()
        fillActiveForm()
        if (panelCount === 0 || panelsNeedRegrid())
            Qt.callLater(function () {
                const wasEmpty = root.panelCount === 0
                generateGrid()
                scene3d.tool = "select"
                AppController.toast(
                    wasEmpty
                        ? "Grille auto — Sélection pour déplacer, Panneau pour ajouter"
                        : "Grille recalée (orientation toiture corrigée)",
                    4000)
            })
    }
    Connections {
        target: Projects
        function onCurrentChanged() {
            if (root._suppressSync || root._syncing)
                return
            root.syncFromProject()
        }
    }

    ColumnLayout {
        anchors.fill: parent
        anchors.margins: Ui.pageMargin
        spacing: 8

        RowLayout {
            Layout.fillWidth: true
            Label {
                text: "Implantation 3D"
                font.pixelSize: Ui.isPhone ? 18 : 20
                font.weight: Font.DemiBold
                color: Theme.text
            }
            Item { Layout.fillWidth: true; visible: !Ui.isPhone }
            Label {
                Layout.fillWidth: Ui.isPhone
                text: panelCount + " pan. · " + surfaceUsed + " m²"
                font.pixelSize: 12
                color: Theme.textDim
                elide: Text.ElideRight
            }
        }

        // compact = colonne (scène sous le formulaire via order swap with Loader-less Grid)
        GridLayout {
            Layout.fillWidth: true
            Layout.fillHeight: true
            columns: root.compact ? 1 : 2
            columnSpacing: 12
            rowSpacing: 8

            // Panneau formulaire (sous la 3D en mode compact)
            ScrollView {
                id: formScroll
                Layout.row: root.compact ? 1 : 0
                Layout.column: 0
                Layout.preferredWidth: root.compact ? parent.width : Math.min(380, parent.width * 0.38)
                Layout.minimumWidth: root.compact ? 0 : 280
                Layout.maximumWidth: root.compact ? parent.width : 420
                Layout.fillWidth: root.compact
                Layout.fillHeight: true
                Layout.preferredHeight: root.compact ? -1 : -1
                clip: true
                contentWidth: availableWidth

                ColumnLayout {
                    width: formScroll.availableWidth
                    spacing: 10

                    OseStep {
                        step: 1
                        title: "Toitures"
                        Flow {
                            Layout.fillWidth: true
                            spacing: 6
                            Repeater {
                                model: layoutState.roofs || []
                                OseBtn {
                                    required property var modelData
                                    text: modelData.name || "Toiture"
                                    kind: modelData.id === layoutState.activeId ? "primary" : "outline"
                                    implicitHeight: 28
                                    onClicked: root.setActiveRoof(modelData.id)
                                }
                            }
                            OseBtn { text: "+"; kind: "flat"; onClicked: root.addRoof() }
                            OseBtn {
                                text: "Suppr."
                                kind: "outline"
                                enabled: (layoutState.roofs || []).length > 1
                                onClicked: root.removeActiveRoof()
                            }
                        }
                        GridLayout {
                            columns: Ui.isPhone ? 1 : 2
                            Layout.fillWidth: true
                            columnSpacing: 10
                            rowSpacing: 6
                            Label { text: "Nom" }
                            TextField { id: roofNameField; Layout.fillWidth: true; onEditingFinished: root.applySceneDims() }
                            Label { text: "L / l" }
                            RowLayout {
                                Layout.fillWidth: true
                                OseInputUnit { id: roofLen; text: "10"; unit: "m"; Layout.fillWidth: true; onEditingFinished: root.applySceneDims() }
                                OseInputUnit { id: roofWid; text: "6"; unit: "m"; Layout.fillWidth: true; onEditingFinished: root.applySceneDims() }
                            }
                            Label { text: "Panneau" }
                            RowLayout {
                                Layout.fillWidth: true
                                OseInputUnit { id: pwField; text: "1.134"; unit: "m"; Layout.fillWidth: true; onEditingFinished: root.applySceneDims() }
                                OseInputUnit { id: phField; text: "1.722"; unit: "m"; Layout.fillWidth: true; onEditingFinished: root.applySceneDims() }
                            }
                            Label { text: "Tilt / Az" }
                            RowLayout {
                                Layout.fillWidth: true
                                OseInputUnit {
                                    id: tiltField
                                    text: "30"
                                    unit: "°"
                                    Layout.fillWidth: true
                                    onEditingFinished: {
                                        // Recalcule emprise + inclinaison 3D
                                        if (root.panelCount > 0)
                                            root.generateGrid()
                                        else
                                            root.applySceneDims()
                                    }
                                }
                                OseInputUnit { id: azField; text: "0"; unit: "°"; Layout.fillWidth: true; onEditingFinished: root.applySceneDims() }
                            }
                            Label { text: "Écart H / V" }
                            RowLayout {
                                Layout.fillWidth: true
                                OseInputUnit {
                                    id: gapFieldX
                                    text: "0.03"
                                    unit: "m"
                                    Layout.fillWidth: true
                                    onEditingFinished: {
                                        if (root.panelCount > 0)
                                            root.generateGrid()
                                        else
                                            root.applySceneDims()
                                    }
                                }
                                OseInputUnit {
                                    id: gapFieldZ
                                    text: "0.03"
                                    unit: "m"
                                    Layout.fillWidth: true
                                    onEditingFinished: {
                                        if (root.panelCount > 0)
                                            root.generateGrid()
                                        else
                                            root.applySceneDims()
                                    }
                                }
                            }
                            Label { text: "Hauteur sol" }
                            OseInputUnit {
                                id: mountHeightField
                                text: "0.08"
                                unit: "m"
                                Layout.fillWidth: true
                                placeholderText: "dégagement"
                                onEditingFinished: root.applySceneDims()
                            }
                            Label { text: "Lignes / cols" }
                            RowLayout {
                                Layout.fillWidth: true
                                OseInputUnit { id: rowField; text: "2"; unit: "lig."; Layout.fillWidth: true }
                                OseInputUnit { id: colField; text: "4"; unit: "col."; Layout.fillWidth: true }
                            }
                        }
                    }

                    OseStep {
                        step: 2
                        title: "Panneaux"
                        GridLayout {
                            columns: 2
                            Layout.fillWidth: true
                            Label { text: "Total" }
                            OseInputUnit {
                                id: nGenField
                                text: "8"
                                unit: "pan."
                                Layout.fillWidth: true
                            }
                        }
                        Flow {
                            Layout.fillWidth: true
                            spacing: 6
                            OseBtn { text: "Générer grille"; onClicked: root.generateGrid() }
                            OseBtn {
                                text: "Depuis Ppeak"
                                kind: "flat"
                                onClicked: {
                                    const n = root.panelCountFromPeak()
                                    const rows = Math.max(1, Math.round(Number(rowField.text) || 2))
                                    const cols = Math.max(1, Math.ceil(n / rows))
                                    rowField.text = String(rows)
                                    colField.text = String(cols)
                                    nGenField.text = String(rows * cols)
                                    root.generateGrid()
                                }
                            }
                            OseBtn {
                                text: "Suppr. sél."
                                kind: "outline"
                                enabled: scene3d.selectedPanelIndex >= 0
                                onClicked: scene3d.removeSelectedPanel()
                            }
                            OseBtn {
                                text: "Effacer"
                                kind: "flat"
                                onClicked: {
                                    root.patchActive({ positions: [], nPanels: 0 })
                                    scene3d.selectedPanelIndex = -1
                                }
                            }
                        }
                        RowLayout {
                            visible: scene3d.selectedPanelIndex >= 0
                            OseBtn { text: "←"; kind: "outline"; onClicked: scene3d.nudgeSelectedPanel(-0.2, 0) }
                            OseBtn { text: "→"; kind: "outline"; onClicked: scene3d.nudgeSelectedPanel(0.2, 0) }
                            OseBtn { text: "↑"; kind: "outline"; onClicked: scene3d.nudgeSelectedPanel(0, -0.2) }
                            OseBtn { text: "↓"; kind: "outline"; onClicked: scene3d.nudgeSelectedPanel(0, 0.2) }
                        }
                    }

                    OseStep {
                        step: 3
                        title: "Soleil"
                        GridLayout {
                            columns: 2
                            Layout.fillWidth: true
                            Label { text: "Mois" }
                            ComboBox {
                                id: monthBox
                                Layout.fillWidth: true
                                model: root.monthNames
                                onActivated: root.updateSun()
                            }
                            Label { text: "Heure" }
                            SpinBox {
                                id: hourBox
                                from: 4; to: 21; value: 12
                                onValueChanged: root.updateSun()
                            }
                        }
                        CheckBox {
                            text: "Ombres GPU"
                            checked: true
                            onCheckedChanged: scene3d.showShadows = checked
                        }
                        Flow {
                            Layout.fillWidth: true
                            spacing: 6
                            OseBtn {
                                text: shadeComputing
                                      ? "Calcul…"
                                      : ("Calculer ombrage annuel"
                                         + (_shadeEtaLabel ? " (" + _shadeEtaLabel + ")" : ""))
                                enabled: !shadeComputing && panelCount > 0
                                onClicked: root.startAnnualShadeCompute()
                            }
                            OseBtn { text: "PNG"; kind: "outline"; onClicked: root.exportPng() }
                            OseBtn {
                                text: "→ Câbles"
                                kind: "flat"
                                onClicked: {
                                    const L = Math.max(8, Math.sqrt(surfaceRoof || 60)) * 1.2
                                    Projects.updateCurrent({
                                        formState: Object.assign({}, form, {
                                            cableLengthM: Math.round(L * 10) / 10
                                        })
                                    })
                                    AppController.currentTab = "cables"
                                }
                            }
                        }
                        ColumnLayout {
                            Layout.fillWidth: true
                            spacing: 4
                            visible: shadeComputing || _shadeDirty
                            ProgressBar {
                                Layout.fillWidth: true
                                from: 0
                                to: 100
                                value: shadeComputing ? shadePercent : 0
                                indeterminate: shadeComputing && shadePercent <= 0
                            }
                            Label {
                                Layout.fillWidth: true
                                wrapMode: Text.WordWrap
                                font.pixelSize: 12
                                color: Theme.textDim
                                text: {
                                    if (shadeComputing) {
                                        const eta = Math.max(0, Math.round(shadeEtaSec))
                                        const etaTxt = eta <= 0 ? ""
                                                     : (eta < 60 ? (" · reste ~" + eta + " s")
                                                                 : (" · reste ~" + Math.round(eta / 60) + " min"))
                                        return (shadeStatus || "Calcul…") + " — " + shadePercent + "%" + etaTxt
                                    }
                                    return "Profil annuel à jour manquant"
                                           + (_shadeEtaLabel ? (" (estim. " + _shadeEtaLabel + ")") : "")
                                           + " — le KPI live (mois/heure) reste à jour."
                                }
                            }
                        }
                        OseAlert {
                            kind: "info"
                            text: "Az " + Math.round(scene3d.sunAz) + "°N · élév "
                                  + Math.round(scene3d.sunElev) + "° · ombre live "
                                  + (shadeSample.shadedFraction || 0) + "%"
                                  + (sceneShade.annualLossPct !== undefined
                                     ? (" · annuel " + sceneShade.annualLossPct + "%")
                                     : "")
                        }
                    }

                    OseBtn {
                        Layout.fillWidth: true
                        text: "Continuer → " + AppController.tabLabel(AppController.nextPrimaryTab())
                        kind: "primary"
                        onClicked: AppController.goNextPrimaryTab()
                    }
                }
            }

            // Vue 3D
            ColumnLayout {
                Layout.row: root.compact ? 0 : 0
                Layout.column: root.compact ? 0 : 1
                Layout.fillWidth: true
                Layout.fillHeight: !root.compact
                Layout.preferredHeight: root.compact ? Ui.sceneHeight : -1
                Layout.minimumHeight: root.compact ? 220 : 280
                spacing: 6

                Flow {
                    Layout.fillWidth: true
                    spacing: 6
                    OseBtn {
                        text: "Caméra"
                        kind: scene3d.tool === "camera" ? "primary" : "outline"
                        onClicked: scene3d.tool = "camera"
                    }
                    OseBtn {
                        text: "Sélection"
                        kind: scene3d.tool === "select" ? "primary" : "outline"
                        onClicked: scene3d.tool = "select"
                    }
                    OseBtn {
                        text: "Panneau"
                        kind: scene3d.tool === "place" ? "primary" : "outline"
                        onClicked: scene3d.tool = "place"
                    }
                    OseBtn {
                        text: "Grille"
                        kind: "outline"
                        onClicked: root.generateGrid()
                    }
                }
                Flow {
                    Layout.fillWidth: true
                    spacing: 6
                    OseBtn {
                        text: "Cheminée"
                        kind: scene3d.tool === "place-chimney" ? "primary" : "outline"
                        onClicked: scene3d.tool = "place-chimney"
                    }
                    OseBtn {
                        text: "Arbre"
                        kind: scene3d.tool === "place-tree" ? "primary" : "outline"
                        onClicked: scene3d.tool = "place-tree"
                    }
                    OseBtn {
                        text: "Mur"
                        kind: scene3d.tool === "place-wall" ? "primary" : "outline"
                        onClicked: scene3d.tool = "place-wall"
                    }
                    OseBtn {
                        text: "Suppr. obst."
                        kind: "outline"
                        enabled: scene3d.selectedObstacleIndex >= 0
                        onClicked: scene3d.removeSelectedObstacle()
                    }
                }
                GridLayout {
                    visible: scene3d.selectedObstacleIndex >= 0
                    columns: 2
                    Layout.fillWidth: true
                    columnSpacing: 8
                    rowSpacing: 4
                    property bool _sync: false
                    function fillFromSelection() {
                        const o = scene3d.selectedObstacle
                        if (!o)
                            return
                        _sync = true
                        obsLabelField.text = o.label || ""
                        obsWField.text = String(o.w !== undefined ? o.w : 0.6)
                        obsDField.text = String(o.d !== undefined ? o.d : 0.6)
                        obsHField.text = String(o.h !== undefined ? o.h : 1.5)
                        obsTypeBox.currentIndex = (o.type === "tree") ? 1 : 0
                        refreshObstacleDists()
                        _sync = false
                    }
                    function refreshObstacleDists() {
                        if (scene3d.selectedObstacleIndex < 0)
                            return
                        const wasSync = _sync
                        _sync = true
                        const dist = scene3d.obstacleDistsFromRightmost()
                        if (dist) {
                            obsDistRight.text = String(dist.fromRight)
                            obsDistBottom.text = String(dist.fromBottom)
                        } else {
                            obsDistRight.text = ""
                            obsDistBottom.text = ""
                        }
                        _sync = wasSync
                    }
                    Connections {
                        target: scene3d
                        function onSelectionChanged() { parent.fillFromSelection() }
                        function onSelectedObstacleIndexChanged() { parent.fillFromSelection() }
                        function onObstaclePlanChanged() { parent.refreshObstacleDists() }
                        function onObstaclesChanged() {
                            if (scene3d.selectedObstacleIndex >= 0)
                                parent.refreshObstacleDists()
                        }
                        function onRoofsChanged() {
                            if (scene3d.selectedObstacleIndex >= 0)
                                parent.refreshObstacleDists()
                        }
                    }
                    Component.onCompleted: fillFromSelection()
                    Label { text: "Obstacle"; font.pixelSize: 12; color: Theme.textDim }
                    TextField {
                        id: obsLabelField
                        Layout.fillWidth: true
                        placeholderText: "Libellé"
                        onEditingFinished: {
                            if (parent._sync) return
                            scene3d.updateObstacleProps({ label: text.trim() || "Obstacle" })
                        }
                    }
                    Label { text: "Type" }
                    ComboBox {
                        id: obsTypeBox
                        Layout.fillWidth: true
                        model: ["Boîte / mur", "Arbre"]
                        onActivated: {
                            if (parent._sync) return
                            const tree = currentIndex === 1
                            scene3d.updateObstacleProps({
                                type: tree ? "tree" : "box",
                                label: tree ? "Arbre" : (obsLabelField.text.trim() || "Obstacle")
                            })
                        }
                    }
                    Label { text: "L / l / H" }
                    RowLayout {
                        Layout.fillWidth: true
                        OseInputUnit {
                            id: obsWField
                            text: "0.6"
                            unit: "m"
                            Layout.fillWidth: true
                            onEditingFinished: {
                                if (parent.parent._sync) return
                                scene3d.updateObstacleProps({ w: Number(text) })
                            }
                        }
                        OseInputUnit {
                            id: obsDField
                            text: "0.6"
                            unit: "m"
                            Layout.fillWidth: true
                            onEditingFinished: {
                                if (parent.parent._sync) return
                                scene3d.updateObstacleProps({ d: Number(text) })
                            }
                        }
                        OseInputUnit {
                            id: obsHField
                            text: "1.5"
                            unit: "m"
                            Layout.fillWidth: true
                            onEditingFinished: {
                                if (parent.parent._sync) return
                                scene3d.updateObstacleProps({ h: Number(text) })
                            }
                        }
                    }
                    Label {
                        text: "Dist. panneau"
                        font.pixelSize: 12
                        color: Theme.textDim
                    }
                    Label {
                        Layout.fillWidth: true
                        wrapMode: Text.WordWrap
                        font.pixelSize: 11
                        color: Theme.textDim
                        text: "Depuis coin bas-droit du panneau le plus à droite (+droite / +au-delà du bas)"
                    }
                    Label { text: "Droite / bas" }
                    RowLayout {
                        Layout.fillWidth: true
                        OseInputUnit {
                            id: obsDistRight
                            text: "0"
                            unit: "m"
                            Layout.fillWidth: true
                            placeholderText: "droite"
                            onEditingFinished: {
                                if (parent.parent._sync) return
                                scene3d.setObstacleDistsFromRightmost(
                                    Number(text) || 0,
                                    Number(obsDistBottom.text) || 0)
                            }
                        }
                        OseInputUnit {
                            id: obsDistBottom
                            text: "0"
                            unit: "m"
                            Layout.fillWidth: true
                            placeholderText: "bas"
                            onEditingFinished: {
                                if (parent.parent._sync) return
                                scene3d.setObstacleDistsFromRightmost(
                                    Number(obsDistRight.text) || 0,
                                    Number(text) || 0)
                            }
                        }
                    }
                }

                Label {
                    Layout.fillWidth: true
                    wrapMode: Text.WordWrap
                    font.pixelSize: 12
                    color: Theme.textDim
                    text: Ui.isPhone
                          ? (scene3d.tool === "camera"
                             ? "1 doigt = orbite · 2 doigts = pan/zoom"
                             : "Touchez pour éditer · 1 doigt = orbite")
                          : (scene3d.tool === "camera"
                          ? "Clic droit (ou gauche) = orbite · Molette = pan · Scroll = zoom"
                          : scene3d.tool.indexOf("place-") === 0
                            ? "Clic = obstacle · Clic droit = orbite · Scroll = zoom"
                          : scene3d.tool === "place"
                            ? "Clic = panneau · Clic droit = orbite · Scroll = zoom"
                            : "Clic = éditer · Clic droit = orbite · Molette = pan · Scroll = zoom")
                }

                Rectangle {
                    Layout.fillWidth: true
                    Layout.fillHeight: true
                    Layout.minimumHeight: root.compact ? 200 : 280
                    radius: Theme.radius
                    border.color: Theme.outline
                    clip: true
                    color: "#b9c9be"

                    SolarScene3D {
                        id: scene3d
                        anchors.fill: parent
                        anchors.margins: 1
                        mode: "layout"
                        tool: "camera"
                        showPanels: true
                        showObstacles: true
                        editPanels: true
                        editObstacles: true
                        onPanelsEdited: function (roofId, panels) { root.onPanelsEdited(roofId, panels) }
                        onObstaclesEdited: function (list) { root.onObstaclesEdited(list) }
                        onRoofActivated: function (id) {
                            if (id !== layoutState.activeId)
                                root.setActiveRoof(id)
                        }
                    }
                }

                OseAlert {
                    visible: shadeComputing
                    kind: "info"
                    text: "Ombrage annuel en cours… " + shadePercent + "%"
                          + (shadeEtaSec > 0.5 ? (" · ~" + Math.round(shadeEtaSec) + " s restantes") : "")
                }
                OseAlert {
                    visible: _shadeDirty && !shadeComputing
                    kind: "warning"
                    text: "Profil annuel obsolète — cliquez « Calculer ombrage annuel »"
                          + (_shadeEtaLabel ? (" (estim. " + _shadeEtaLabel + ")") : "")
                }
                OseAlert {
                    visible: panelCount === 0
                    kind: "warning"
                    text: "Aucun panneau — cliquez « Grille » ou « Générer grille », puis Sélection pour ajuster."
                }
            }
        }
    }
}
