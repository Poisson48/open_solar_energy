import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import OpenSolarEnergy
import "controls"

OseTabPage {
    id: root
    title: "Site et ombrage"
    subtitle: Ui.isPhone
              ? "Horizon et carte, puis vue 3D pour les obstacles. Implantation pour les panneaux."
              : "Plus bas : vue 3D pour placer cheminée / arbre / mur. Gauche : horizon et carte. Puis onglet Implantation pour les panneaux."
    nextTabId: AppController.nextPrimaryTab()
    nextTabLabel: AppController.tabLabel(AppController.nextPrimaryTab())

    property var points: []
    property var obstacles: []
    property var shadeResult: ({})
    property bool syncing: false
    property int nextPointId: 1
    property real roofAzimuth: 0
    property real roofLineLenM: 0
    property bool hasRoofLine: false
    property var layoutRoofs: ({ activeId: "", roofs: [] })

    readonly property var monthlyLossPct: {
        const m = shadeResult.monthly
                || (Projects.currentProject.siteSurvey || {}).monthlyLoss
                || []
        let out = []
        for (let i = 0; i < m.length; ++i)
            out.push(Math.round(((m[i] || 0) * 100) * 10) / 10)
        return out
    }
    readonly property real annualLoss: {
        if (shadeResult.annualLossPct !== undefined)
            return Number(shadeResult.annualLossPct) || 0
        return Number((Projects.currentProject.siteSurvey || {}).annualLossPct) || 0
    }
    readonly property real maxMonthLoss: {
        let m = 0
        for (let i = 0; i < monthlyLossPct.length; ++i)
            m = Math.max(m, monthlyLossPct[i])
        return m
    }

    readonly property var halfHourlyKeep: {
        return shadeResult.halfHourlyKeep
                || (Projects.currentProject.siteSurvey || {}).halfHourlyKeep
                || []
    }

    /** % perte beam par demi-heure pour un mois 0..11 */
    function lossDaySeries(monthIndex) {
        const keep = halfHourlyKeep
        const row = (monthIndex >= 0 && monthIndex < keep.length) ? (keep[monthIndex] || []) : []
        let out = []
        for (let s = 0; s < 48; ++s) {
            const k = row.length > s ? Number(row[s]) : 1
            out.push(Math.round((1 - Math.min(1, Math.max(0, k))) * 1000) / 10)
        }
        return out
    }

    readonly property var lossSummer: lossDaySeries(5)   // juin
    readonly property var lossEquinox: lossDaySeries(2)  // mars
    readonly property var lossWinter: lossDaySeries(11)  // décembre

    readonly property var horizonElevValues: {
        let out = []
        for (let i = 0; i < points.length; ++i)
            out.push(Number(points[i].elev) || 0)
        return out
    }
    readonly property var horizonElevLabels: {
        let out = []
        for (let i = 0; i < points.length; ++i)
            out.push("#" + pointLabel(points[i], i))
        return out
    }
    readonly property var horizonAzValues: {
        let out = []
        if (!points.length) return out
        for (let az = 0; az <= 330; az += 30)
            out.push(Math.round(horizonElevAt(az) * 10) / 10)
        return out
    }
    readonly property var horizonAzLabels: [
        "N", "30°", "E", "90°", "S", "150°", "O", "210°", "240°", "O", "300°", "330°"
    ]

    function horizonElevAt(az) {
        if (!points.length) return 0
        const pts = points.slice().sort(function (a, b) { return a.az - b.az })
        if (pts.length === 1) return Number(pts[0].elev) || 0
        const a = ((az % 360) + 360) % 360
        const ext = pts.slice()
        ext.unshift({ az: pts[pts.length - 1].az - 360, elev: pts[pts.length - 1].elev })
        ext.push({ az: pts[0].az + 360, elev: pts[0].elev })
        for (let i = 0; i + 1 < ext.length; ++i) {
            if (a >= ext[i].az && a <= ext[i + 1].az) {
                const t = (a - ext[i].az) / Math.max(1e-6, ext[i + 1].az - ext[i].az)
                return (Number(ext[i].elev) || 0) + t * ((Number(ext[i + 1].elev) || 0) - (Number(ext[i].elev) || 0))
            }
        }
        return 0
    }

    /** Heures « utiles » approx. (keep moyen > 0.5, jour 6h–20h) */
    readonly property real clearHoursSummer: clearHoursForMonth(5)
    readonly property real clearHoursWinter: clearHoursForMonth(11)

    function clearHoursForMonth(monthIndex) {
        const keep = halfHourlyKeep
        const row = (monthIndex >= 0 && monthIndex < keep.length) ? (keep[monthIndex] || []) : []
        if (!row.length) return 0
        let sum = 0
        // slots 12..40 ≈ 6h–20h
        for (let s = 12; s < 40 && s < row.length; ++s)
            sum += Number(row[s]) || 0
        return Math.round((sum / 2) * 10) / 10 // 2 slots / heure
    }

    function ensurePointIds(pts) {
        let maxId = 0
        let out = []
        for (let i = 0; i < pts.length; ++i) {
            const p = Object.assign({}, pts[i])
            if (p.id === undefined || p.id === null || p.id === "")
                p.id = ++maxId
            else
                maxId = Math.max(maxId, Number(p.id) || 0)
            out.push(p)
        }
        root.nextPointId = maxId + 1
        return out
    }

    function loadFromProject() {
        const site = Projects.currentProject.siteSurvey || {}
        syncing = true
        points = ensurePointIds(site.points || [])
        obstacles = site.obstacles || []
        layoutRoofs = LayoutRoofs.migrate(Projects.currentProject.layout || {})
        slope.text = String(site.slope !== undefined ? site.slope
                           : ((Projects.currentProject.formState || {}).tilt !== undefined
                              ? (Projects.currentProject.formState || {}).tilt : 30))
        compass.text = String(site.compassOffset !== undefined ? site.compassOffset : 0)
        panelTiltField.text = String((Projects.currentProject.formState || {}).tilt !== undefined
                                     ? (Projects.currentProject.formState || {}).tilt
                                     : (site.slope !== undefined ? site.slope : 30))
        if (site.roofLine && site.roofLine.lat1 !== undefined) {
            root.hasRoofLine = true
            root.roofAzimuth = Number(site.roofLine.pvAzimuth) || 0
            root.roofLineLenM = Number(site.roofLine.distanceM) || 0
            Qt.callLater(function () {
                if (typeof siteMap !== "undefined") {
                    siteMap.setRoofLine(site.roofLine.lat1, site.roofLine.lon1,
                                        site.roofLine.lat2, site.roofLine.lon2)
                    siteMap.mapLayer = "sat"
                }
            })
        } else {
            root.hasRoofLine = false
            Qt.callLater(function () {
                if (typeof siteMap !== "undefined")
                    siteMap.clearRoofLine()
            })
        }
        if (site.monthlyLoss && site.monthlyLoss.length)
            shadeResult = {
                monthly: site.monthlyLoss,
                halfHourlyKeep: site.halfHourlyKeep || [],
                annualLossPct: site.annualLossPct || 0
            }
        syncing = false
        syncSiteScene()
        if (typeof sunHost !== "undefined" && sunHost.repaintAll)
            sunHost.repaintAll()
    }

    function syncSiteScene() {
        if (typeof siteScene === "undefined")
            return
        // Garantir au moins une toiture pour poser arbre / cheminée
        let st = layoutRoofs
        if (!st || !(st.roofs || []).length) {
            st = LayoutRoofs.migrate(Projects.currentProject.layout || {})
            if (!(st.roofs || []).length)
                st = LayoutRoofs.addRoof(st, "Toiture 1")
            const form = Projects.currentProject.formState || {}
            if (form.panelW > 0.2 && form.panelH > 0.2 && st.activeId) {
                st = LayoutRoofs.updateRoof(st, st.activeId, {
                    panelW: Number(form.panelW),
                    panelH: Number(form.panelH),
                    tilt: Number(form.tilt) || Number(slope.text) || 30,
                    azimuth: Number(form.azimuth) || 0
                })
            }
            layoutRoofs = st
            if (!(Projects.currentProject.layout || {}).roofs
                || !(Projects.currentProject.layout.roofs || []).length) {
                Projects.updateCurrent({ layout: st })
            }
        }
        siteScene.roofs = layoutRoofs.roofs || []
        siteScene.activeRoofId = layoutRoofs.activeId || ""
        siteScene.obstacles = obstacles
        const lat = (Projects.currentProject.location || {}).lat || 43.6
        const doy = 166
        const sp = SiteShade.sunPos(lat, doy, 12)
        siteScene.sunAz = sp.az
        siteScene.sunElev = sp.elev
    }

    function persistObstacles() {
        if (syncing) return
        const site = Projects.currentProject.siteSurvey || {}
        Projects.updateCurrent({
            siteSurvey: Object.assign({}, site, {
                points: root.points,
                obstacles: root.obstacles,
                compassOffset: Number(compass.text),
                slope: Number(slope.text)
            })
        })
    }

    function persistSiteInputs() {
        if (syncing) return
        const site = Projects.currentProject.siteSurvey || {}
        Projects.updateCurrent({
            siteSurvey: Object.assign({}, site, {
                points: root.points,
                obstacles: root.obstacles,
                compassOffset: Number(compass.text),
                slope: Number(slope.text)
            })
        })
    }

    function persistAndCompute() {
        let weather = Projects.currentProject.weatherData || []
        if (!weather.length) {
            AppController.toast("Chargez une météo dans Lieu et météo", 3500)
            persistSiteInputs()
            return
        }
        const loc = Projects.currentProject.location || {}
        const site = Projects.currentProject.siteSurvey || {}
        const layout = LayoutRoofs.migrate(Projects.currentProject.layout || {})
        const hasPanels = LayoutRoofs.totalPanels(layout) > 0
        const hasObstacles = (root.obstacles || []).length > 0

        let monthly = []
        let keep = []
        let annual = 0
        let source = "horizon"

        // Panneaux / obstacles 3D → moteur riche ; sinon horizon seul (plus rapide)
        if (hasPanels || hasObstacles) {
            const full = ShadingEngine.computeFull({
                lat: loc.lat || 43.6,
                weatherData: weather,
                horizonPoints: points,
                obstacles: root.obstacles || [],
                layout: layout,
                shadeEngine: "precise"
            })
            monthly = full.monthlyLoss || []
            keep = full.halfHourlyKeep || []
            annual = Number(full.annualLossPct) || 0
            source = "shading3d"
            shadeResult = {
                monthly: monthly,
                halfHourlyKeep: keep,
                halfHourlyKeepElectrical: full.halfHourlyKeepElectrical || [],
                annualLossPct: annual,
                mode: full.mode
            }
        } else {
            shadeResult = SiteShade.computeShading(loc.lat || 43.6, points, weather)
            monthly = shadeResult.monthly || []
            keep = shadeResult.halfHourlyKeep || []
            annual = Number(shadeResult.annualLossPct) || 0
            source = "horizon"
        }

        Projects.updateCurrent({
            siteSurvey: Object.assign({}, site, {
                points: points,
                obstacles: root.obstacles,
                compassOffset: Number(compass.text),
                slope: Number(slope.text),
                monthlyLoss: monthly,
                halfHourlyKeep: keep,
                halfHourlyKeepElectrical: shadeResult.halfHourlyKeepElectrical
                        || (site.halfHourlyKeepElectrical || []),
                annualLossPct: annual,
                source: source
            }),
            resultsFingerprint: ""
        })
        if (typeof sunHost !== "undefined" && sunHost.repaintAll)
            sunHost.repaintAll()
    }

    Component.onCompleted: {
        loadFromProject()
        // Ne pas recalculer l'ombrage horizon au boot (lent) — bouton « Calculer »
    }

    function addPoint(az, elev) {
        let pts = root.points.slice()
        pts.push({ az: az, elev: elev, source: "manual", id: root.nextPointId++ })
        pts.sort(function (a, b) { return a.az - b.az })
        root.points = pts
        root.persistAndCompute()
    }

    function removePoint(index) {
        let pts = root.points.slice()
        pts.splice(index, 1)
        root.points = pts
        root.persistAndCompute()
    }

    function removePointById(id) {
        root.points = root.points.filter(function (p) { return Number(p.id) !== Number(id) })
        root.persistAndCompute()
    }

    function pointLabel(p, fallbackIndex) {
        const id = p && p.id !== undefined ? Number(p.id) : (fallbackIndex + 1)
        return id
    }

    function applyRoofOrientation() {
        const tilt = Number(panelTiltField.text)
        const az = Number(root.roofAzimuth) || 0
        const form = Projects.currentProject.formState || {}
        const site = Projects.currentProject.siteSurvey || {}
        const line = siteMap.hasLine ? {
            lat1: siteMap.lineLat1, lon1: siteMap.lineLon1,
            lat2: siteMap.lineLat2, lon2: siteMap.lineLon2,
            pvAzimuth: az,
            bearingNorth: root._lastBearingNorth,
            distanceM: root.roofLineLenM
        } : (site.roofLine || null)

        // Propager aussi sur le layout 3D (toiture active) — Implantation lit roofs[].azimuth
        let st = LayoutRoofs.migrate(Projects.currentProject.layout || {})
        if (!(st.roofs || []).length)
            st = LayoutRoofs.addRoof(st, "Toiture 1")
        const activeId = st.activeId || ((st.roofs[0] || {}).id || "")
        st = LayoutRoofs.updateRoof(st, activeId, {
            tilt: tilt,
            azimuth: az
        })
        const r = LayoutRoofs.getActiveRoof(st)
        if (r && r.positions && r.positions.length) {
            const pw = Number(r.panelW) || 1.13
            const ph = Number(r.panelH) || 1.76
            const rows = Math.max(1, Number(r.rows) || 1)
            const gapZ = Number(r.gapZ !== undefined ? r.gapZ : r.gap) || 0.03
            const mount = Number(r.mountHeight !== undefined ? r.mountHeight : 0.08)
            const t = tilt * Math.PI / 180
            const cosT = Math.cos(t)
            const sinT = Math.sin(t)
            const arrayAlong = rows * ph + (rows - 1) * gapZ
            const clear = mount + (arrayAlong / 2) * sinT
            const next = []
            for (let i = 0; i < r.positions.length; ++i) {
                const p = Object.assign({}, r.positions[i])
                let along = Number(p.along)
                if (isNaN(along)) {
                    if (Math.abs(cosT) >= 1e-6)
                        along = (Number(p.z) || 0) / cosT
                    else if (Math.abs(sinT) >= 1e-6)
                        along = ((Number(p.y) || clear) - clear) / sinT
                    else
                        along = Number(p.z) || 0
                }
                p.along = along
                p.z = along * cosT
                p.y = along * sinT + clear
                p.tilt = tilt
                p.yaw = 0
                if (p.w === undefined)
                    p.w = pw
                if (p.h === undefined)
                    p.h = ph
                next.push(p)
            }
            st = LayoutRoofs.updateRoof(st, activeId, { positions: next })
        }

        layoutRoofs = st
        Projects.updateCurrent({
            formState: Object.assign({}, form, {
                tilt: tilt,
                azimuth: az
            }),
            layout: st,
            siteSurvey: Object.assign({}, site, {
                points: root.points,
                obstacles: root.obstacles,
                slope: tilt,
                compassOffset: Number(compass.text),
                roofLine: line,
                monthlyLoss: (shadeResult.monthly || site.monthlyLoss),
                halfHourlyKeep: (shadeResult.halfHourlyKeep || site.halfHourlyKeep),
                annualLossPct: (shadeResult.annualLossPct !== undefined
                                ? shadeResult.annualLossPct : site.annualLossPct)
            })
        })
        slope.text = String(tilt)
        syncSiteScene()
        AppController.toast("Orientation appliquée : tilt " + tilt + "° · azimut "
                            + Math.round(az * 10) / 10 + "° → Implantation")
        AppController.autoSave("Orientation toiture carte — tilt " + tilt
                               + "° / az " + Math.round(az))
    }

    property real _lastBearingNorth: 0

    function onRoofLine(lat1, lon1, lat2, lon2) {
        const b = AppController.bearingBetween(lat1, lon1, lat2, lon2)
        root.roofAzimuth = Number(b.pvAzimuth) || 0
        root.roofLineLenM = Number(b.distanceM) || 0
        root._lastBearingNorth = Number(b.bearingNorth) || 0
        root.hasRoofLine = true
    }

    Connections {
        target: Projects
        function onCurrentChanged() { root.loadFromProject() }
    }

    OseFormResults {
        Layout.fillWidth: true

        OseCard {
            title: "Points d’horizon"
            hint: "Azimut depuis le nord (0° = N, 180° = S). Élévation en degrés."

            GridLayout {
                columns: Ui.isPhone ? 2 : 4
                Layout.fillWidth: true
                columnSpacing: 8
                rowSpacing: 8
                Label { text: "Azimut"; color: Theme.textDim }
                OseInputUnit { id: azIn; text: "180"; unit: "°"; Layout.fillWidth: true }
                Label { text: "Élévation"; color: Theme.textDim }
                OseInputUnit { id: elIn; text: "20"; unit: "°"; Layout.fillWidth: true }
            }
            Flow {
                Layout.fillWidth: true
                spacing: 8
                OseBtn {
                    text: "Ajouter le point"
                    onClicked: root.addPoint(Number(azIn.text), Number(elIn.text))
                }
                OseBtn {
                    text: "Recalculer"
                    kind: "outline"
                    onClicked: root.persistAndCompute()
                }
                OseBtn {
                    text: "Tout effacer"
                    kind: "flat"
                    enabled: root.points.length > 0
                    onClicked: {
                        root.points = []
                        root.shadeResult = {}
                        root.persistAndCompute()
                    }
                }
            }

            Repeater {
                model: root.points
                delegate: Rectangle {
                    required property int index
                    required property var modelData
                    Layout.fillWidth: true
                    height: 44
                    radius: Theme.radius
                    color: Theme.surfaceHigh
                    border.color: Theme.outline
                    RowLayout {
                        anchors.fill: parent
                        anchors.margins: 8
                        spacing: 8
                        Rectangle {
                            width: 28
                            height: 28
                            radius: 14
                            color: Theme.primary
                            Label {
                                anchors.centerIn: parent
                                text: String(root.pointLabel(modelData, index))
                                color: "#ffffff"
                                font.weight: Font.DemiBold
                                font.pixelSize: 13
                            }
                        }
                        Label {
                            text: "Az " + Math.round(modelData.az) + "°"
                            font.weight: Font.DemiBold
                            color: Theme.text
                        }
                        Label {
                            text: "élév. " + Math.round(modelData.elev * 10) / 10 + "°"
                            color: Theme.textDim
                            Layout.fillWidth: true
                        }
                        OseBtn {
                            text: "Suppr. #" + root.pointLabel(modelData, index)
                            kind: "flat"
                            onClicked: root.removePointById(modelData.id !== undefined ? modelData.id : (index + 1))
                        }
                    }
                }
            }
            Label {
                visible: root.points.length === 0
                text: "Aucun obstacle — ajoutez des points ou cliquez dans le diagramme."
                color: Theme.textDim
                font.pixelSize: 12
                wrapMode: Text.WordWrap
                Layout.fillWidth: true
            }
        }

        OseCard {
            title: "Carte 2D — orientation toiture"
            hint: "Vue satellite : tracez une flèche du faîtage vers l’égout (sens de la pente = face des panneaux). Puis précisez l’inclinaison."

            Flow {
                Layout.fillWidth: true
                spacing: 6
                OseBtn {
                    text: siteMap.interactionMode === "line" ? "Mode tracé actif" : "Tracer la ligne"
                    kind: siteMap.interactionMode === "line" ? "primary" : "outline"
                    onClicked: {
                        siteMap.interactionMode = "line"
                        siteMap.mapLayer = "sat"
                        AppController.toast("Glissez sur la carte : A → B = sens de la pente", 3500)
                    }
                }
                OseBtn {
                    text: "Déplacer la carte"
                    kind: "outline"
                    onClicked: siteMap.interactionMode = "pan"
                }
                OseBtn {
                    text: "Effacer la ligne"
                    kind: "flat"
                    enabled: siteMap.hasLine || root.hasRoofLine
                    onClicked: {
                        siteMap.clearRoofLine()
                        root.hasRoofLine = false
                        const site = Projects.currentProject.siteSurvey || {}
                        const next = Object.assign({}, site)
                        delete next.roofLine
                        Projects.updateCurrent({ siteSurvey: next })
                    }
                }
                OseBtn {
                    text: "Satellite"
                    kind: siteMap.mapLayer === "sat" ? "primary" : "outline"
                    onClicked: siteMap.mapLayer = "sat"
                }
                OseBtn {
                    text: "Plan"
                    kind: siteMap.mapLayer === "map" ? "primary" : "outline"
                    onClicked: siteMap.mapLayer = "map"
                }
            }

            OsmMapView {
                id: siteMap
                Layout.fillWidth: true
                Layout.preferredHeight: Ui.mapHeight
                mapLayer: "sat"
                showPin: true
                interactionMode: "pan"
                zoom: 18
                Component.onCompleted: {
                    const loc = Projects.currentProject.location || {}
                    setLocation(loc.lat || 43.6045, loc.lon || 1.444, true)
                    zoom = 18
                }
                onRoofLineChanged: (lat1, lon1, lat2, lon2) => root.onRoofLine(lat1, lon1, lat2, lon2)
            }

            GridLayout {
                columns: 2
                Layout.fillWidth: true
                columnSpacing: 12
                rowSpacing: 8
                visible: root.hasRoofLine
                Label { text: "Azimut calculé (0=Sud)"; color: Theme.textDim }
                Label {
                    text: (Math.round(root.roofAzimuth * 10) / 10) + " °"
                    font.weight: Font.DemiBold
                    color: Theme.primary
                }
                Label { text: "Longueur tracé"; color: Theme.textDim }
                Label {
                    text: root.roofLineLenM >= 1
                          ? (Math.round(root.roofLineLenM * 10) / 10 + " m")
                          : (Math.round(root.roofLineLenM * 100) / 100 + " m")
                    color: Theme.text
                }
                Label { text: "Inclinaison panneaux"; color: Theme.textDim }
                OseInputUnit {
                    id: panelTiltField
                    text: "30"
                    unit: "°"
                    Layout.fillWidth: true
                }
            }

            RowLayout {
                visible: root.hasRoofLine
                Layout.fillWidth: true
                OseBtn {
                    text: "Appliquer tilt + azimut au projet"
                    onClicked: root.applyRoofOrientation()
                }
                Label {
                    Layout.fillWidth: true
                    wrapMode: Text.WordWrap
                    font.pixelSize: Theme.fontSizeCaption
                    color: Theme.textDim
                    text: "Met à jour Dim. / Hors réseau / Implantation / Devis."
                }
            }

            Label {
                visible: !root.hasRoofLine
                Layout.fillWidth: true
                wrapMode: Text.WordWrap
                font.pixelSize: Theme.fontSizeCaption
                color: Theme.textDim
                text: "Astuce : zoomez sur le bâtiment en Satellite, activez « Tracer la ligne », "
                      + "puis tirez du haut de pente vers le bas (direction où regardent les panneaux)."
            }

            Connections {
                target: Projects
                function onCurrentChanged() {
                    const loc = Projects.currentProject.location || {}
                    if (loc.lat !== undefined)
                        siteMap.setLocation(loc.lat, loc.lon, true)
                }
            }
        }

        OseCard {
            title: "Terrain & boussole"
            hint: "La pente DEM du lieu peut aussi venir de Lieu et météo."
            GridLayout {
                columns: 2
                Layout.fillWidth: true
                columnSpacing: 12
                rowSpacing: 8
                Label { text: "Pente site"; color: Theme.textDim }
                OseInputUnit {
                    id: slope
                    text: "0"
                    unit: "°"
                    Layout.fillWidth: true
                    onEditingFinished: root.persistSiteInputs()
                }
                Label { text: "Offset boussole"; color: Theme.textDim }
                OseInputUnit {
                    id: compass
                    text: "0"
                    unit: "°"
                    Layout.fillWidth: true
                    onEditingFinished: root.persistSiteInputs()
                }
            }
            RowLayout {
                Layout.fillWidth: true
                OseBtn {
                    text: Terrain.busy ? "Relief…" : "Pente depuis DEM"
                    kind: "outline"
                    enabled: !Terrain.busy
                    Layout.fillWidth: true
                    onClicked: {
                        const loc = Projects.currentProject.location || {}
                        Terrain.estimate(loc.lat || 43.6, loc.lon || 1.44)
                    }
                }
            }
            Connections {
                target: Terrain
                function onFinished(ok) {
                    if (!ok) return
                    const r = Terrain.result || {}
                    if (r.tilt !== undefined) slope.text = String(r.tilt)
                    root.persistAndCompute()
                    AppController.toast("Pente site " + (r.tilt || 0) + "°")
                }
            }
            Label {
                Layout.fillWidth: true
                wrapMode: Text.WordWrap
                font.pixelSize: 12
                color: Theme.textDim
                text: "Boussole device / photo terrain : pas encore branchés en natif — offset manuel pour l’instant."
            }
        }

        OseCard {
            title: "Diagramme solaire"
            hint: "Horizon (vert) · trajectoires soleil été / équinoxe / hiver. Cliquez pour ajouter, glissez un point."

            Item {
                id: sunHost
                Layout.fillWidth: true
                Layout.preferredHeight: Ui.sunDiagramHeight

                property int dragIndex: -1
                property real dragLiveAz: 0
                property real dragLiveElev: 0
                property var _blockedFlickable: null
                property bool _savedInteractive: true
                property bool _savedWheel: true
                property real pressX: 0
                property real pressY: 0
                property bool moved: false
                property bool paintPending: false
                readonly property real hitRadius: Qt.platform.os === "android" ? 32 : 22

                function mapX(az) { return (az / 360) * width }
                function mapY(elev) { return height * 0.88 - (elev / 90) * height * 0.72 }
                function azAt(x) { return Math.max(0, Math.min(360, (x / Math.max(1, width)) * 360)) }
                function elevAt(y) {
                    return Math.max(0, Math.min(90, ((height * 0.88 - y) / (height * 0.72)) * 90))
                }

                function displayPoint(i) {
                    const p = root.points[i]
                    if (!p) return { az: 0, elev: 0, id: i + 1 }
                    if (i === dragIndex && dragIndex >= 0)
                        return { az: dragLiveAz, elev: dragLiveElev, id: p.id }
                    return p
                }

                function setAncestorFlickableBlocked(blocked) {
                    if (blocked) {
                        if (_blockedFlickable)
                            return _blockedFlickable
                        let p = parent
                        while (p) {
                            if (p.flickableDirection !== undefined) {
                                _blockedFlickable = p
                                _savedWheel = (p.wheelEnabled !== undefined) ? p.wheelEnabled : true
                                _savedInteractive = p.interactive
                                if (p.wheelEnabled !== undefined)
                                    p.wheelEnabled = false
                                p.interactive = false
                                return p
                            }
                            p = p.parent
                        }
                        return null
                    }
                    if (_blockedFlickable) {
                        if (_blockedFlickable.wheelEnabled !== undefined)
                            _blockedFlickable.wheelEnabled = _savedWheel
                        _blockedFlickable.interactive = _savedInteractive
                        _blockedFlickable = null
                    }
                    return null
                }

                function requestOverlayPaint() {
                    if (paintPending) return
                    paintPending = true
                    overlayPaintTimer.start()
                }

                function repaintAll() {
                    sunBg.requestPaint()
                    sunFg.requestPaint()
                }

                Timer {
                    id: overlayPaintTimer
                    interval: 16
                    repeat: false
                    onTriggered: {
                        sunHost.paintPending = false
                        sunFg.requestPaint()
                    }
                }

                // Calque 1 : fond + soleil (jamais pendant le drag)
                Canvas {
                    id: sunBg
                    anchors.fill: parent
                    renderTarget: Canvas.FramebufferObject
                    renderStrategy: Canvas.Cooperative

                    function drawSunPath(ctx, day, color, widthPx) {
                        const loc = Projects.currentProject.location || {}
                        const lat = loc.lat || 43.6
                        ctx.strokeStyle = color
                        ctx.lineWidth = widthPx
                        ctx.beginPath()
                        let started = false
                        for (let h = 3.5; h <= 20.5; h += 0.35) {
                            const s = SiteShade.sunPos(lat, day, h)
                            if (s.elev <= 0) { started = false; continue }
                            const x = sunHost.mapX(s.az)
                            const y = sunHost.mapY(s.elev)
                            if (!started) { ctx.moveTo(x, y); started = true }
                            else ctx.lineTo(x, y)
                        }
                        ctx.stroke()
                    }

                    onPaint: {
                        const ctx = getContext("2d")
                        const w = width
                        const h = height
                        if (w < 2 || h < 2) return
                        ctx.reset()
                        const g = ctx.createLinearGradient(0, 0, 0, h)
                        g.addColorStop(0, "#dceef8")
                        g.addColorStop(0.55, "#f3f7f4")
                        g.addColorStop(1, "#e7eee9")
                        ctx.fillStyle = g
                        ctx.fillRect(0, 0, w, h)

                        ctx.strokeStyle = "#c5d2cb"
                        ctx.lineWidth = 1
                        for (let elev = 0; elev <= 90; elev += 15) {
                            const y = sunHost.mapY(elev)
                            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke()
                        }
                        for (let az = 0; az <= 360; az += 45) {
                            const x = sunHost.mapX(az)
                            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke()
                        }

                        drawSunPath(ctx, 172, "#e8a317", 2.5)
                        drawSunPath(ctx, 80, "#5b8def", 2)
                        drawSunPath(ctx, 355, "#7a5cff", 2)

                        ctx.fillStyle = Theme.text
                        ctx.font = "600 11px sans-serif"
                        ctx.fillText("N", 6, h - 8)
                        ctx.fillText("E", w * 0.25 - 4, h - 8)
                        ctx.fillText("S", w * 0.5 - 4, h - 8)
                        ctx.fillText("O", w * 0.75 - 4, h - 8)
                        ctx.fillText("N", w - 14, h - 8)
                        ctx.font = "11px sans-serif"
                        ctx.fillStyle = "#e8a317"; ctx.fillText("Été", 8, 16)
                        ctx.fillStyle = "#5b8def"; ctx.fillText("Équinoxe", 48, 16)
                        ctx.fillStyle = "#7a5cff"; ctx.fillText("Hiver", 120, 16)
                        ctx.fillStyle = Theme.textDim
                        ctx.fillText("Toucher = point · glisser un n° = déplacer", 8, 34)
                    }
                }

                // Calque 2 : horizon + points seulement (léger pendant le drag)
                Canvas {
                    id: sunFg
                    anchors.fill: parent
                    renderTarget: Canvas.FramebufferObject
                    renderStrategy: Canvas.Cooperative

                    onPaint: {
                        const ctx = getContext("2d")
                        const w = width
                        const h = height
                        if (w < 2 || h < 2) return
                        ctx.reset()
                        ctx.clearRect(0, 0, w, h)

                        if (root.points.length === 0) {
                            if (sunHost.dragIndex >= 0) {
                                ctx.fillStyle = Theme.textDim
                                ctx.font = "11px sans-serif"
                                ctx.fillText("Relâcher pour recalculer l’ombrage…", 8, 34)
                            }
                            return
                        }

                        ctx.fillStyle = "#2f6b4f55"
                        ctx.strokeStyle = Theme.primary
                        ctx.lineWidth = 2
                        const p0 = sunHost.displayPoint(0)
                        ctx.beginPath()
                        ctx.moveTo(0, h)
                        ctx.lineTo(sunHost.mapX(p0.az), sunHost.mapY(p0.elev))
                        for (let i = 1; i < root.points.length; ++i) {
                            const pi = sunHost.displayPoint(i)
                            ctx.lineTo(sunHost.mapX(pi.az), sunHost.mapY(pi.elev))
                        }
                        ctx.lineTo(w, h)
                        ctx.closePath()
                        ctx.fill()
                        ctx.beginPath()
                        ctx.moveTo(sunHost.mapX(p0.az), sunHost.mapY(p0.elev))
                        for (let i = 1; i < root.points.length; ++i) {
                            const pi = sunHost.displayPoint(i)
                            ctx.lineTo(sunHost.mapX(pi.az), sunHost.mapY(pi.elev))
                        }
                        ctx.stroke()

                        const r = Qt.platform.os === "android" ? 12 : 10
                        for (let i = 0; i < root.points.length; ++i) {
                            const pi = sunHost.displayPoint(i)
                            const x = sunHost.mapX(pi.az)
                            const y = sunHost.mapY(pi.elev)
                            ctx.fillStyle = "#ffffff"
                            ctx.beginPath(); ctx.arc(x, y, r + 2, 0, Math.PI * 2); ctx.fill()
                            ctx.fillStyle = (i === sunHost.dragIndex) ? Theme.accent : Theme.primary
                            ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill()
                            ctx.fillStyle = "#ffffff"
                            ctx.font = "bold " + (Qt.platform.os === "android" ? "12" : "11") + "px sans-serif"
                            ctx.textAlign = "center"
                            ctx.textBaseline = "middle"
                            ctx.fillText(String(root.pointLabel(root.points[i], i)), x, y + 0.5)
                        }
                        ctx.textAlign = "left"
                        ctx.textBaseline = "alphabetic"

                        if (sunHost.dragIndex >= 0) {
                            ctx.fillStyle = Theme.textDim
                            ctx.font = "11px sans-serif"
                            ctx.fillText("Relâcher pour recalculer l’ombrage…", 8, 50)
                        }
                    }
                }

                Component.onCompleted: repaintAll()
                Component.onDestruction: { _blockedFlickable = null }
                onWidthChanged: repaintAll()
                onHeightChanged: repaintAll()

                Connections {
                    target: root
                    function onPointsChanged() {
                        if (sunHost.dragIndex < 0)
                            sunHost.repaintAll()
                        else
                            sunHost.requestOverlayPaint()
                    }
                }

                MouseArea {
                    anchors.fill: parent
                    hoverEnabled: false
                    preventStealing: true
                    acceptedButtons: Qt.LeftButton
                    cursorShape: pressed ? Qt.ClosedHandCursor : Qt.CrossCursor

                    onPressed: (mouse) => {
                        sunHost.setAncestorFlickableBlocked(true)
                        sunHost.pressX = mouse.x
                        sunHost.pressY = mouse.y
                        sunHost.moved = false
                        let best = -1
                        let bestD = sunHost.hitRadius
                        for (let i = 0; i < root.points.length; ++i) {
                            const x = sunHost.mapX(root.points[i].az)
                            const y = sunHost.mapY(root.points[i].elev)
                            const d = Math.hypot(mouse.x - x, mouse.y - y)
                            if (d < bestD) { bestD = d; best = i }
                        }
                        sunHost.dragIndex = best
                        if (best >= 0) {
                            sunHost.dragLiveAz = root.points[best].az
                            sunHost.dragLiveElev = root.points[best].elev
                            sunFg.requestPaint()
                        }
                    }
                    onPositionChanged: (mouse) => {
                        if (Math.hypot(mouse.x - sunHost.pressX, mouse.y - sunHost.pressY) > 8)
                            sunHost.moved = true
                        if (sunHost.dragIndex < 0) return
                        sunHost.dragLiveAz = sunHost.azAt(mouse.x)
                        sunHost.dragLiveElev = sunHost.elevAt(mouse.y)
                        sunHost.requestOverlayPaint()
                    }
                    onReleased: (mouse) => {
                        sunHost.setAncestorFlickableBlocked(false)
                        if (sunHost.dragIndex >= 0) {
                            const i = sunHost.dragIndex
                            let pts = root.points.slice()
                            const p = Object.assign({}, pts[i])
                            p.az = sunHost.dragLiveAz
                            p.elev = sunHost.dragLiveElev
                            pts[i] = p
                            pts.sort(function (a, b) { return a.az - b.az })
                            sunHost.dragIndex = -1
                            root.points = pts
                            root.persistAndCompute()
                            sunHost.repaintAll()
                            return
                        }
                        if (!sunHost.moved)
                            root.addPoint(sunHost.azAt(mouse.x), sunHost.elevAt(mouse.y))
                    }
                    onCanceled: {
                        sunHost.setAncestorFlickableBlocked(false)
                        sunHost.dragIndex = -1
                        sunHost.repaintAll()
                    }
                }
            }
        }

        results: ColumnLayout {
            spacing: 12

            Label {
                text: "Vue 3D — obstacles"
                font.pixelSize: 14
                font.weight: Font.DemiBold
                color: Theme.text
            }
            Label {
                Layout.fillWidth: true
                wrapMode: Text.WordWrap
                font.pixelSize: 12
                color: Theme.textDim
                text: "Choisissez Cheminée / Arbre / Mur puis cliquez sur le toit ou le sol. Sélection pour modifier L×l×H."
            }
            Flow {
                Layout.fillWidth: true
                spacing: 6
                OseBtn {
                    text: "Caméra"
                    kind: siteScene.tool === "camera" ? "primary" : "outline"
                    onClicked: siteScene.tool = "camera"
                }
                OseBtn {
                    text: "Sélection"
                    kind: siteScene.tool === "select" ? "primary" : "outline"
                    onClicked: siteScene.tool = "select"
                }
                OseBtn {
                    text: "Cheminée"
                    kind: siteScene.tool === "place-chimney" ? "primary" : "outline"
                    onClicked: siteScene.tool = "place-chimney"
                }
                OseBtn {
                    text: "Arbre"
                    kind: siteScene.tool === "place-tree" ? "primary" : "outline"
                    onClicked: siteScene.tool = "place-tree"
                }
                OseBtn {
                    text: "Mur"
                    kind: siteScene.tool === "place-wall" ? "primary" : "outline"
                    onClicked: siteScene.tool = "place-wall"
                }
                OseBtn {
                    text: "Suppr."
                    kind: "outline"
                    enabled: siteScene.selectedObstacleIndex >= 0
                    onClicked: siteScene.removeSelectedObstacle()
                }
            }
            GridLayout {
                visible: siteScene.selectedObstacleIndex >= 0
                columns: 2
                Layout.fillWidth: true
                columnSpacing: 8
                rowSpacing: 4
                property bool _sync: false
                function fillFromSelection() {
                    const o = siteScene.selectedObstacle
                    if (!o)
                        return
                    _sync = true
                    siteObsLabel.text = o.label || ""
                    siteObsW.text = String(o.w !== undefined ? o.w : 0.6)
                    siteObsD.text = String(o.d !== undefined ? o.d : 0.6)
                    siteObsH.text = String(o.h !== undefined ? o.h : 1.5)
                    siteObsType.currentIndex = (o.type === "tree") ? 1 : 0
                    refreshObstacleDists()
                    _sync = false
                }
                function refreshObstacleDists() {
                    if (siteScene.selectedObstacleIndex < 0)
                        return
                    const wasSync = _sync
                    _sync = true
                    const dist = siteScene.obstacleDistsFromRightmost()
                    if (dist) {
                        siteObsDistRight.text = String(dist.fromRight)
                        siteObsDistBottom.text = String(dist.fromBottom)
                    } else {
                        siteObsDistRight.text = ""
                        siteObsDistBottom.text = ""
                    }
                    _sync = wasSync
                }
                Connections {
                    target: siteScene
                    function onSelectionChanged() { parent.fillFromSelection() }
                    function onSelectedObstacleIndexChanged() { parent.fillFromSelection() }
                    function onObstaclePlanChanged() { parent.refreshObstacleDists() }
                    function onObstaclesChanged() {
                        if (siteScene.selectedObstacleIndex >= 0)
                            parent.refreshObstacleDists()
                    }
                    function onRoofsChanged() {
                        if (siteScene.selectedObstacleIndex >= 0)
                            parent.refreshObstacleDists()
                    }
                }
                Component.onCompleted: fillFromSelection()
                Label { text: "Obstacle"; font.pixelSize: 12; color: Theme.textDim }
                TextField {
                    id: siteObsLabel
                    Layout.fillWidth: true
                    placeholderText: "Libellé"
                    onEditingFinished: {
                        if (parent._sync) return
                        siteScene.updateObstacleProps({ label: text.trim() || "Obstacle" })
                    }
                }
                Label { text: "Type" }
                ComboBox {
                    id: siteObsType
                    Layout.fillWidth: true
                    model: ["Boîte / mur", "Arbre"]
                    onActivated: {
                        if (parent._sync) return
                        const tree = currentIndex === 1
                        siteScene.updateObstacleProps({
                            type: tree ? "tree" : "box",
                            label: tree ? "Arbre" : (siteObsLabel.text.trim() || "Obstacle")
                        })
                    }
                }
                Label { text: "L / l / H" }
                RowLayout {
                    Layout.fillWidth: true
                    OseInputUnit {
                        id: siteObsW
                        text: "0.6"
                        unit: "m"
                        Layout.fillWidth: true
                        onEditingFinished: {
                            if (parent.parent._sync) return
                            siteScene.updateObstacleProps({ w: Number(text) })
                        }
                    }
                    OseInputUnit {
                        id: siteObsD
                        text: "0.6"
                        unit: "m"
                        Layout.fillWidth: true
                        onEditingFinished: {
                            if (parent.parent._sync) return
                            siteScene.updateObstacleProps({ d: Number(text) })
                        }
                    }
                    OseInputUnit {
                        id: siteObsH
                        text: "1.5"
                        unit: "m"
                        Layout.fillWidth: true
                        onEditingFinished: {
                            if (parent.parent._sync) return
                            siteScene.updateObstacleProps({ h: Number(text) })
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
                        id: siteObsDistRight
                        text: "0"
                        unit: "m"
                        Layout.fillWidth: true
                        placeholderText: "droite"
                        onEditingFinished: {
                            if (parent.parent._sync) return
                            siteScene.setObstacleDistsFromRightmost(
                                Number(text) || 0,
                                Number(siteObsDistBottom.text) || 0)
                        }
                    }
                    OseInputUnit {
                        id: siteObsDistBottom
                        text: "0"
                        unit: "m"
                        Layout.fillWidth: true
                        placeholderText: "bas"
                        onEditingFinished: {
                            if (parent.parent._sync) return
                            siteScene.setObstacleDistsFromRightmost(
                                Number(siteObsDistRight.text) || 0,
                                Number(text) || 0)
                        }
                    }
                }
            }
            Rectangle {
                Layout.fillWidth: true
                Layout.preferredHeight: Ui.sceneHeight
                radius: Theme.radius
                border.color: Theme.outline
                clip: true
                color: "#b9c9be"
                SolarScene3D {
                    id: siteScene
                    anchors.fill: parent
                    anchors.margins: 1
                    mode: "site"
                    tool: "camera"
                    showPanels: true
                    showObstacles: true
                    editPanels: false
                    editObstacles: true
                    onObstaclesEdited: function (list) {
                        root.obstacles = list
                        root.persistAndCompute()
                    }
                    onRoofActivated: function (id) {
                        root.layoutRoofs = LayoutRoofs.setActive(root.layoutRoofs, id)
                    }
                }
            }
            Label {
                Layout.fillWidth: true
                font.pixelSize: 12
                color: Theme.textDim
                text: (root.obstacles.length || 0) + " obstacle(s) · "
                      + ((layoutRoofs.roofs || []).length) + " toiture(s)"
            }
            OseBtn {
                text: "Créer / réparer toiture 3D"
                kind: "outline"
                visible: !(layoutRoofs.roofs || []).length
                onClicked: {
                    layoutRoofs = LayoutRoofs.addRoof({}, "Toiture 1")
                    const form = Projects.currentProject.formState || {}
                    layoutRoofs = LayoutRoofs.updateRoof(layoutRoofs, layoutRoofs.activeId, {
                        panelW: Number(form.panelW) || 1.13,
                        panelH: Number(form.panelH) || 1.76,
                        tilt: Number(form.tilt) || 30,
                        azimuth: Number(form.azimuth) || 0
                    })
                    Projects.updateCurrent({ layout: layoutRoofs })
                    syncSiteScene()
                    AppController.toast("Toiture créée — placez un arbre / cheminée")
                }
            }

            Flow {
                Layout.fillWidth: true
                spacing: 8
                KpiCard {
                    title: "Points horizon"
                    value: String(root.points.length)
                }
                KpiCard {
                    title: "Perte annuelle"
                    value: root.annualLoss.toFixed(1) + " %"
                    subtitle: "beam"
                }
                KpiCard {
                    title: "Pic mensuel"
                    value: root.maxMonthLoss.toFixed(1) + " %"
                    subtitle: "perte max"
                }
                KpiCard {
                    title: "Jour clair été"
                    value: root.clearHoursSummer + " h"
                    subtitle: "keep > 0 · 6–20 h"
                }
                KpiCard {
                    title: "Jour clair hiver"
                    value: root.clearHoursWinter + " h"
                    subtitle: "keep > 0 · 6–20 h"
                }
            }

            OseCard {
                title: "Pertes dans la journée selon la saison"
                hint: "Pourcentage de beam perdu chaque demi-heure — été / équinoxe / hiver."
                visible: halfHourlyKeep.length >= 12
                SeasonShadeChart {
                    Layout.fillWidth: true
                    Layout.preferredHeight: 240
                    summer: root.lossSummer
                    equinox: root.lossEquinox
                    winter: root.lossWinter
                }
            }

            OseCard {
                title: "Pertes beam mensuelles"
                hint: "Part du rayonnement direct intercepté par l’horizon, mois par mois."
                visible: monthlyLossPct.length > 0
                SimpleBarChart {
                    Layout.fillWidth: true
                    Layout.preferredHeight: 190
                    unit: "% perte"
                    decimals: 1
                    minScale: 10
                    values: monthlyLossPct
                    barColor: Theme.danger
                }
            }

            OseCard {
                title: "Profil d’horizon (élévation)"
                hint: "Obstacle le plus haut vu tous les 30° d’azimut (N → tour complet)."
                visible: root.points.length > 0
                SimpleBarChart {
                    Layout.fillWidth: true
                    Layout.preferredHeight: 180
                    unit: "° élév."
                    decimals: 0
                    minScale: 15
                    values: root.horizonAzValues
                    labels: root.horizonAzLabels
                    barColor: Theme.primary
                }
            }

            OseCard {
                title: "Points relevés"
                hint: "Élévation de chaque point numéroté (même n° que sur le diagramme)."
                visible: root.points.length > 0
                SimpleBarChart {
                    Layout.fillWidth: true
                    Layout.preferredHeight: 160
                    unit: "°"
                    decimals: 1
                    values: root.horizonElevValues
                    labels: root.horizonElevLabels
                    barColor: Theme.accent
                }
            }

            OseCard {
                title: "Masque 30 min — été (juin)"
                hint: "Facteur keep (100 % = soleil libre). Utilisé par Analyse / Dim."
                visible: halfHourlyKeep.length >= 12
                SimpleBarChart {
                    Layout.fillWidth: true
                    Layout.preferredHeight: 160
                    unit: "% keep"
                    decimals: 0
                    minScale: 100
                    labelEvery: 4
                    valueEvery: 8
                    values: {
                        const row = halfHourlyKeep[5] || []
                        let out = []
                        for (let s = 0; s < 48; ++s)
                            out.push(Math.round((row.length > s ? Number(row[s]) : 1) * 100))
                        return out
                    }
                    barColor: "#e8a317"
                }
            }

            OseAlert {
                visible: !(Projects.currentProject.weatherData || []).length
                kind: "warning"
                text: "Importez une météo dans Lieu et météo pour calculer les pertes d’ombrage."
            }
            OseAlert {
                visible: (Projects.currentProject.weatherData || []).length > 0 && root.points.length === 0
                kind: "info"
                text: "Sans points d’horizon, la perte d’ombrage est nulle. Cliquez dans le diagramme pour placer des obstacles."
            }
            OseAlert {
                visible: root.points.length > 0 && monthlyLossPct.length > 0
                kind: "info"
                text: "Le masque 30 min alimente Analyse ; les pertes mensuelles sont reprises dans Dimensionnement / Hors réseau."
            }
        }
    }
}
