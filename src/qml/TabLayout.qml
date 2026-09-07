import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import "controls"

OseTabPage {
    id: root
    title: "Implantation"
    subtitle: "Éditeur 3D de toiture : placez, déplacez et sélectionnez les panneaux. L’ombrage scène alimente Dim. / Analyse."
    nextTabId: AppController.nextPrimaryTab()
    nextTabLabel: AppController.tabLabel(AppController.nextPrimaryTab())

    property var panels: []
    property var shadeSample: ({})
    property var sceneShade: ({})
    property bool _syncing: false
    property int nextPanelId: 1

    readonly property var form: Projects.currentProject.formState || {}
    readonly property var site: Projects.currentProject.siteSurvey || {}
    readonly property var loc: Projects.currentProject.location || {}
    readonly property var savedLayout: Projects.currentProject.layout || {}

    readonly property var monthNames: [
        "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
        "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"
    ]

    readonly property real surfaceUsed: {
        const a = Number(pwField.text) * Number(phField.text)
        return Math.round(panels.length * a * 100) / 100
    }
    readonly property real surfaceRoof: Math.round(Number(roofLen.text) * Number(roofWid.text) * 100) / 100
    readonly property bool fitsRoof: {
        // Approx : tous les centres dans la toiture (déjà clampés à l’édition)
        return panels.length > 0
    }

    function panelCountFromPeak() {
        const ppeak = form.Ppeak
            || ((Projects.currentProject.sizingResult || {}).best || {}).Ppeak
            || ((Projects.currentProject.offgridResult || {}).best || {}).Ppeak
            || 3
        const wp = form.panelWp || 400
        return Pipeline.estimatePanelCount(ppeak, wp)
    }

    function obstaclesFromSite() {
        const pts = site.points || []
        const span = Math.max(Number(roofLen.text) || 10, Number(roofWid.text) || 6)
        let out = []
        for (let i = 0; i < pts.length; ++i) {
            out.push({
                az: pts[i].az,
                elev: pts[i].elev,
                dist: span * 1.3,
                width: 3
            })
        }
        return out
    }

    function syncFromProject() {
        _syncing = true
        const L = savedLayout
        roofLen.text = String(L.roofL !== undefined ? L.roofL : 10)
        roofWid.text = String(L.roofW !== undefined ? L.roofW : 6)
        pwField.text = String(form.panelW !== undefined ? form.panelW
                             : (L.panelW !== undefined ? L.panelW : 1.134))
        phField.text = String(form.panelH !== undefined ? form.panelH
                             : (L.panelH !== undefined ? L.panelH : 1.722))
        tiltField.text = String(form.tilt !== undefined ? form.tilt : (L.tilt !== undefined ? L.tilt : 30))
        azField.text = String(form.azimuth !== undefined ? form.azimuth : (L.azimuth !== undefined ? L.azimuth : 0))
        gapField.text = String(L.gap !== undefined ? L.gap : 0.03)
        rowField.text = String(L.rows !== undefined ? L.rows : 2)

        if (L.positions && L.positions.length) {
            panels = L.positions.map(function (p, i) {
                return Object.assign({ id: p.id || ("p" + i) }, p)
            })
        } else {
            panels = []
        }

        const m = form.layoutSunMonth >= 1 && form.layoutSunMonth <= 12 ? form.layoutSunMonth : 6
        monthBox.currentIndex = m - 1
        hourBox.value = form.layoutSunHour !== undefined ? form.layoutSunHour : 12

        scene3d.roofW = Number(roofLen.text)
        scene3d.roofD = Number(roofWid.text)
        scene3d.tilt = Number(tiltField.text)
        scene3d.azimuth = Number(azField.text)
        scene3d.panelW = Number(pwField.text)
        scene3d.panelH = Number(phField.text)
        scene3d.panels = panels
        scene3d.obstacles = obstaclesFromSite()
        updateSun()
        _syncing = false
    }

    function persistLayout() {
        if (_syncing) return
        const cfg = currentCfg()
        Projects.updateCurrent({
            layout: {
                roofL: cfg.roofW,
                roofW: cfg.roofD,
                panelW: cfg.panelW,
                panelH: cfg.panelH,
                gap: cfg.gap,
                rows: Number(rowField.text) || 2,
                cols: 0,
                panelCount: panels.length,
                tilt: cfg.tilt,
                azimuth: cfg.azimuth,
                fits: true,
                surfaceUsed: surfaceUsed,
                positions: panels
            },
            formState: Object.assign({}, Projects.currentProject.formState || {}, {
                tilt: cfg.tilt,
                azimuth: cfg.azimuth,
                layoutSunMonth: monthBox.currentIndex + 1,
                layoutSunHour: hourBox.value,
                panelWp: form.panelWp || 400
            })
        })
    }

    function currentCfg() {
        return {
            roofW: Number(roofLen.text),
            roofD: Number(roofWid.text),
            panelW: Number(pwField.text),
            panelH: Number(phField.text),
            gap: Number(gapField.text) || 0.03,
            tilt: Number(tiltField.text),
            azimuth: Number(azField.text),
            nPanels: panels.length,
            rows: Number(rowField.text) || 2,
            cols: 0
        }
    }

    function applySceneDims() {
        scene3d.roofW = Number(roofLen.text)
        scene3d.roofD = Number(roofWid.text)
        scene3d.tilt = Number(tiltField.text)
        scene3d.azimuth = Number(azField.text)
        scene3d.panelW = Number(pwField.text)
        scene3d.panelH = Number(phField.text)
        scene3d.obstacles = obstaclesFromSite()
        scene3d.syncPanelGeometry()
        persistLayout()
        refreshShadeSample()
    }

    function generateGrid() {
        const n = Number(nGenField.text) || panelCountFromPeak()
        const cfg = Object.assign({}, currentCfg(), {
            nPanels: n,
            rows: Number(rowField.text) || 2,
            cols: 0
        })
        const r = Layout3D.computeLayout(cfg)
        panels = (r.positions || []).map(function (p, i) {
            return Object.assign({ id: "g" + Date.now() + "_" + i }, p)
        })
        scene3d.panels = panels
        scene3d.selectedIndex = panels.length ? 0 : -1
        persistLayout()
        refreshShadeSample()
        AppController.toast(panels.length + " panneau(x) générés — déplacez-les librement")
    }

    function updateSun() {
        const lat = loc.lat || 43.6
        const month = monthBox.currentIndex + 1
        const hour = hourBox.value
        const doy = [15, 45, 74, 105, 135, 166, 196, 227, 258, 288, 319, 349][month - 1]
        const sp = SiteShade.sunPos(lat, doy, hour)
        scene3d.sunAz = sp.az
        scene3d.sunElev = sp.elev
        refreshShadeSample()
        if (!_syncing)
            persistLayout()
    }

    function refreshShadeSample() {
        const layout = {
            positions: panels,
            panelsPlaced: panels.length,
            roofW: Number(roofLen.text),
            roofD: Number(roofWid.text)
        }
        shadeSample = Layout3D.sampleShading(layout, scene3d.obstacles, scene3d.sunAz, scene3d.sunElev)
    }

    function applySceneShadeToProject() {
        const lat = loc.lat || 43.6
        let weather = Projects.currentProject.weatherData || []
        if (!weather.length) {
            AppController.toast("Chargez une météo dans Lieu (Open-Meteo ou PVGIS)", 3500)
            return
        }
        if (!panels.length) {
            AppController.toast("Placez au moins un panneau", 3000)
            return
        }
        persistLayout()
        const cfg = Object.assign({}, currentCfg(), {
            positions: panels,
            panelsPlaced: panels.length
        })
        sceneShade = Layout3D.computeSceneShading(lat, cfg, scene3d.obstacles, weather)
        Projects.updateCurrent({
            siteSurvey: Object.assign({}, site, {
                points: site.points || [],
                monthlyLoss: sceneShade.monthlyLoss || [],
                halfHourlyKeep: sceneShade.halfHourlyKeep || [],
                annualLossPct: sceneShade.annualLossPct,
                source: "layout3d"
            }),
            resultsFingerprint: ""
        })
        AppController.toast("Ombrage scène → projet (" + (sceneShade.annualLossPct || 0) + " %/an)")
    }

    function onPanelsEdited() {
        panels = scene3d.panels
        persistLayout()
        refreshShadeSample()
    }

    Component.onCompleted: syncFromProject()

    ColumnLayout {
        Layout.fillWidth: true
        spacing: 10

        OseFormResults {
            Layout.fillWidth: true

            OseStep {
                step: 1
                title: "Toiture & modules"
                Label {
                    Layout.fillWidth: true
                    wrapMode: Text.WordWrap
                    font.pixelSize: 12
                    color: Theme.textDim
                    text: "Dimensions reprises du projet. Orientation liée à Lieu / Hors réseau (modifiable ici)."
                }
                GridLayout {
                    columns: 2
                    Layout.fillWidth: true
                    columnSpacing: 12; rowSpacing: 8
                    Label { text: "Toiture L" }
                    OseInputUnit {
                        id: roofLen; text: "10"; unit: "m"; Layout.fillWidth: true
                        onEditingFinished: root.applySceneDims()
                    }
                    Label { text: "Toiture l" }
                    OseInputUnit {
                        id: roofWid; text: "6"; unit: "m"; Layout.fillWidth: true
                        onEditingFinished: root.applySceneDims()
                    }
                    Label { text: "Panneau L" }
                    OseInputUnit {
                        id: pwField; text: "1.134"; unit: "m"; Layout.fillWidth: true
                        onEditingFinished: root.applySceneDims()
                    }
                    Label { text: "Panneau H" }
                    OseInputUnit {
                        id: phField; text: "1.722"; unit: "m"; Layout.fillWidth: true
                        onEditingFinished: root.applySceneDims()
                    }
                    Label {
                        text: {
                            const f = Projects.currentProject.formState || {}
                            return f.panelModel
                                   ? ("Catalogue : " + f.panelModel)
                                   : "Catalogue : dimensions manuelles"
                        }
                        Layout.columnSpan: 2
                        color: Theme.textDim
                        font.pixelSize: 12
                        wrapMode: Text.WordWrap
                        Layout.fillWidth: true
                    }
                    OseBtn {
                        Layout.columnSpan: 2
                        Layout.fillWidth: true
                        text: "Bibliothèque matériel"
                        kind: "outline"
                        onClicked: AppController.openMateriel()
                    }
                    Label { text: "Écart" }
                    OseInputUnit {
                        id: gapField; text: "0.03"; unit: "m"; Layout.fillWidth: true
                    }
                    Label { text: "Inclinaison" }
                    OseInputUnit {
                        id: tiltField; text: "30"; unit: "°"; Layout.fillWidth: true
                        onEditingFinished: root.applySceneDims()
                    }
                    Label { text: "Azimut (0=Sud)" }
                    OseInputUnit {
                        id: azField; text: "0"; unit: "°"; Layout.fillWidth: true
                        onEditingFinished: root.applySceneDims()
                    }
                }
            }

            OseStep {
                step: 2
                title: "Édition 3D"
                Label {
                    Layout.fillWidth: true
                    wrapMode: Text.WordWrap
                    font.pixelSize: 12
                    color: Theme.textDim
                    text: "Caméra pour naviguer · Sélection pour déplacer · Placer pour ajouter au clic. La grille n’est qu’un point de départ."
                }
                RowLayout {
                    Layout.fillWidth: true
                    spacing: 6
                    OseBtn {
                        Layout.fillWidth: true
                        text: "Caméra"
                        kind: scene3d.tool === "camera" ? "primary" : "outline"
                        onClicked: scene3d.tool = "camera"
                    }
                    OseBtn {
                        Layout.fillWidth: true
                        text: "Sélection"
                        kind: scene3d.tool === "select" ? "primary" : "outline"
                        onClicked: scene3d.tool = "select"
                    }
                    OseBtn {
                        Layout.fillWidth: true
                        text: "Placer"
                        kind: scene3d.tool === "place" ? "primary" : "outline"
                        onClicked: scene3d.tool = "place"
                    }
                }
                GridLayout {
                    columns: 2
                    Layout.fillWidth: true
                    columnSpacing: 12; rowSpacing: 8
                    Label { text: "Nb à générer" }
                    OseInputUnit {
                        id: nGenField
                        text: String(root.panelCountFromPeak())
                        unit: "pan."
                        Layout.fillWidth: true
                    }
                    Label { text: "Lignes (grille)" }
                    OseInputUnit {
                        id: rowField; text: "2"; unit: ""; Layout.fillWidth: true
                    }
                }
                Flow {
                    Layout.fillWidth: true
                    spacing: 8
                    OseBtn { text: "Générer grille"; kind: "outline"; onClicked: root.generateGrid() }
                    OseBtn {
                        text: "Depuis Ppeak"
                        kind: "flat"
                        onClicked: {
                            nGenField.text = String(root.panelCountFromPeak())
                            root.generateGrid()
                        }
                    }
                    OseBtn {
                        text: "Supprimer sélection"
                        kind: "outline"
                        enabled: scene3d.selectedIndex >= 0
                        onClicked: scene3d.removeSelected()
                    }
                    OseBtn {
                        text: "Tout effacer"
                        kind: "flat"
                        enabled: panels.length > 0
                        onClicked: {
                            panels = []
                            scene3d.panels = []
                            scene3d.selectedIndex = -1
                            root.persistLayout()
                            root.refreshShadeSample()
                        }
                    }
                }
                RowLayout {
                    visible: scene3d.selectedIndex >= 0
                    Layout.fillWidth: true
                    Label { text: "Déplacer #"+ (scene3d.selectedIndex + 1); color: Theme.textDim; font.pixelSize: 12 }
                    OseBtn { text: "←"; kind: "outline"; onClicked: scene3d.nudgeSelected(-0.2, 0) }
                    OseBtn { text: "→"; kind: "outline"; onClicked: scene3d.nudgeSelected(0.2, 0) }
                    OseBtn { text: "↑"; kind: "outline"; onClicked: scene3d.nudgeSelected(0, -0.2) }
                    OseBtn { text: "↓"; kind: "outline"; onClicked: scene3d.nudgeSelected(0, 0.2) }
                }
            }

            OseStep {
                step: 3
                title: "Soleil & ombres"
                GridLayout {
                    columns: 2
                    Layout.fillWidth: true
                    columnSpacing: 12; rowSpacing: 8
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
                    text: "Ombres portées (GPU)"
                    checked: true
                    onCheckedChanged: scene3d.showShadows = checked
                }
                Flow {
                    Layout.fillWidth: true
                    spacing: 8
                    OseBtn { text: "Ombrage scène → projet"; onClicked: root.applySceneShadeToProject() }
                    OseBtn {
                        text: "Export PNG"
                        kind: "outline"
                        onClicked: {
                            scene3d.grabToImage(function (img) {
                                const tmp = "/tmp/ose-layout-" + Date.now() + ".png"
                                if (img.saveToFile(tmp)) {
                                    AppController.openLocalFile(tmp)
                                    AppController.toast("PNG enregistré")
                                }
                            })
                        }
                    }
                    OseBtn {
                        text: "Longueur → Câbles"
                        kind: "flat"
                        onClicked: {
                            const L = Math.max(Number(roofLen.text), Number(roofWid.text)) * 1.2
                            Projects.updateCurrent({
                                formState: Object.assign({}, Projects.currentProject.formState || {}, {
                                    cableLengthM: Math.round(L * 10) / 10
                                })
                            })
                            AppController.currentTab = "cables"
                            AppController.toast("Longueur " + Math.round(L) + " m → Câbles")
                        }
                    }
                }
                Label {
                    Layout.fillWidth: true
                    wrapMode: Text.WordWrap
                    color: Theme.textDim
                    font.pixelSize: 12
                    text: sceneShade.annualLossPct !== undefined
                          ? ("Perte annuelle scène : " + sceneShade.annualLossPct + " % — Dim. / Hors réseau à recalculer")
                          : ((site.points && site.points.length)
                             ? (site.points.length + " obstacle(s) horizon (Site)")
                             : "Aucun horizon Site — ajoutez des points pour des ombres réalistes")
                }
            }

            results: ColumnLayout {
                spacing: 8
                RowLayout {
                    spacing: 8
                    KpiCard { title: "Panneaux"; value: String(panels.length) }
                    KpiCard { title: "Surface"; value: surfaceUsed + " m²" }
                }
                RowLayout {
                    spacing: 8
                    KpiCard { title: "Toiture"; value: surfaceRoof + " m²" }
                    KpiCard {
                        title: "Lit maintenant"
                        value: (shadeSample.litPanels || 0) + "/" + (shadeSample.totalPanels || panels.length)
                    }
                }
                OseAlert {
                    kind: "info"
                    text: "Soleil az " + Math.round(scene3d.sunAz) + "° · élév. "
                          + Math.round(scene3d.sunElev) + "° · ombre "
                          + (shadeSample.shadedFraction || 0) + " %"
                }
                OseAlert {
                    visible: panels.length === 0
                    kind: "warning"
                    text: "Aucun panneau — utilisez Placer ou Générer grille, puis ajustez à la main."
                }
            }
        }

        Rectangle {
            Layout.fillWidth: true
            Layout.preferredHeight: 480
            radius: Theme.radius
            border.color: Theme.outline
            clip: true
            color: "#b9c9be"

            SceneRoof3D {
                id: scene3d
                anchors.fill: parent
                anchors.margins: 1
                tool: "select"
                onPanelsEdited: root.onPanelsEdited()
                onSelectionChanged: function () { /* KPI refresh via selectedIndex bindings */ }
            }
        }
    }
}
