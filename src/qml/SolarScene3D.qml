import QtQuick
import QtQuick.Controls
import QtQuick3D
import OpenSolarEnergy

/**
 * Scène 3D utilisable : toitures plates (pick fiable), panneaux inclinés visuellement,
 * multi-roofs sur +X, soleil 0°=Nord, orbit + édition.
 */
Item {
    id: root

    property var roofs: []
    property string activeRoofId: ""
    property var obstacles: []
    property var horizonObstacles: []
    property bool showHorizonStubs: false
    property bool showPanels: true
    property bool showObstacles: true
    property bool editPanels: true
    property bool editObstacles: false

    // Soleil scène = SiteShade (0°=Nord) via sunAz/sunElev ; DirectionalLight = Layout3D.sunLightEuler
    // (même vecteur que le raycast ShadingEngine.samplePrecise / computeFull).
    property real sunAz: 180
    property real sunElev: 45
    property bool showShadows: true

    property string mode: "layout"
    property string tool: "camera"
    property int selectedPanelIndex: -1
    property int selectedObstacleIndex: -1

    readonly property var sunEuler: Layout3D.sunLightEuler(sunAz, sunElev)
    readonly property var activeRoof: {
        for (let i = 0; i < roofs.length; ++i)
            if (roofs[i].id === activeRoofId)
                return roofs[i]
        return roofs.length ? roofs[0] : null
    }
    readonly property real sceneSpan: {
        let maxD = 8
        let totalW = 0
        for (let i = 0; i < roofs.length; ++i) {
            maxD = Math.max(maxD, Number(roofs[i].roofD) || 6, Number(roofs[i].roofW) || 8)
            totalW += (Number(roofs[i].roofW) || 8) + 2
        }
        return Math.max(maxD, totalW * 0.45, 10)
    }

    signal panelsEdited(string roofId, var panels)
    signal obstaclesEdited(var obstacles)
    /** Émis à chaque déplacement d’obstacle (y compris pendant le drag). */
    signal obstaclePlanChanged()
    signal roofActivated(string roofId)
    signal selectionChanged()

    property var _blockedFlickable: null
    property bool _savedInteractive: true
    property bool _savedWheel: true
    property bool _dragging: false
    property int _dragPanel: -1
    property string _dragPanelRoofId: ""
    property var _dragPanelBefore: null
    property int _dragObstacle: -1
    property var _panelUndoStack: []
    property bool _framed: false
    property bool _userLockedView: false
    property int panelMeshRev: 0

    function bumpPanelMesh() {
        panelMeshRev++
    }

    function clonePanel(p) {
        if (!p)
            return null
        return {
            id: p.id,
            x: Number(p.x) || 0,
            y: Number(p.y) || 0,
            z: Number(p.z) || 0,
            along: p.along,
            tilt: p.tilt,
            yaw: p.yaw,
            w: p.w,
            h: p.h
        }
    }

    function pushPanelUndo(roofId, index, panelSnap) {
        if (!panelSnap || index < 0)
            return
        let stack = (_panelUndoStack || []).slice()
        stack.push({ roofId: roofId, index: index, panel: clonePanel(panelSnap) })
        if (stack.length > 40)
            stack = stack.slice(stack.length - 40)
        _panelUndoStack = stack
    }

    /** Ctrl+Z : remet le panneau à la position d’avant le dernier déplacement. */
    function undoPanelMove() {
        if (!_panelUndoStack || !_panelUndoStack.length) {
            AppController.toast("Rien à annuler", 1500)
            return false
        }
        const stack = _panelUndoStack.slice()
        const entry = stack.pop()
        _panelUndoStack = stack
        const ri = findRoofIndex(entry.roofId)
        if (ri < 0) {
            AppController.toast("Annulation impossible", 2000)
            return false
        }
        const roof = Object.assign({}, roofs[ri])
        let positions = (roof.positions || []).slice()
        if (entry.index < 0 || entry.index >= positions.length) {
            AppController.toast("Panneau introuvable", 2000)
            return false
        }
        positions[entry.index] = clonePanel(entry.panel)
        roof.positions = positions
        roof.nPanels = positions.length
        let next = roofs.slice()
        next[ri] = roof
        roofs = next
        bumpPanelMesh()
        selectPanel(entry.roofId, entry.index)
        panelsEdited(entry.roofId, positions)
        AppController.toast("Déplacement annulé", 1200)
        return true
    }

    // Nav style Blender / Onshape (sphérique autour d’une cible)
    property real orbitYaw: 35
    property real orbitPitch: 32
    property real orbitDist: 18
    property real _targetX: 0
    property real _targetY: 0.5
    property real _targetZ: 0
    property string _navMode: "" // "", orbit, pan, edit
    property real _navLastX: 0
    property real _navLastY: 0

    readonly property var obstaclePresets: ({
        chimney: { type: "box", w: 0.6, d: 0.6, h: 1.5, label: "Cheminée" },
        tree: { type: "tree", w: 1.2, d: 1.2, h: 4, label: "Arbre" },
        wall: { type: "box", w: 2, d: 0.35, h: 2.5, label: "Mur" }
    })

    readonly property var selectedObstacle: {
        const i = selectedObstacleIndex
        if (i < 0 || !obstacles || i >= obstacles.length)
            return null
        return obstacles[i]
    }

    function sceneMidX() {
        let t = 0
        for (let i = 0; i < roofs.length; ++i)
            t += (Number(roofs[i].roofW) || 8) + 2
        return Math.max(0, t / 2 - 1)
    }

    function applyOrbitCamera() {
        const yawR = orbitYaw * Math.PI / 180
        const pitchR = Math.max(-1.52, Math.min(1.52, orbitPitch * Math.PI / 180))
        const cp = Math.cos(pitchR)
        const sp = Math.sin(pitchR)
        const x = _targetX + orbitDist * cp * Math.sin(yawR)
        const y = _targetY + orbitDist * sp
        const z = _targetZ + orbitDist * cp * Math.cos(yawR)
        cam.position = Qt.vector3d(x, y, z)
        cam.lookAt(Qt.vector3d(_targetX, _targetY, _targetZ))
    }

    function panOrbitTarget(dx, dy) {
        const yawR = orbitYaw * Math.PI / 180
        const scale = orbitDist * 0.0025
        // Axe droit horizontal (écran)
        const rx = Math.cos(yawR)
        const rz = -Math.sin(yawR)
        _targetX -= dx * scale * rx
        _targetZ -= dx * scale * rz
        _targetY += dy * scale
        applyOrbitCamera()
    }

    function orbitByDelta(dx, dy) {
        orbitYaw += dx * 0.4
        orbitPitch = Math.max(-85, Math.min(85, orbitPitch - dy * 0.35))
        applyOrbitCamera()
    }

    function zoomByWheel(angleDeltaY) {
        const f = angleDeltaY > 0 ? 0.88 : 1.14
        orbitDist = Math.max(2.5, Math.min(220, orbitDist * f))
        applyOrbitCamera()
    }

    function setAncestorFlickableBlocked(blocked) {
        if (blocked) {
            if (_blockedFlickable)
                return
            let p = parent
            while (p) {
                if (p.interactive !== undefined && p.contentHeight !== undefined) {
                    _blockedFlickable = p
                    _savedInteractive = p.interactive
                    _savedWheel = p.wheelEnabled !== undefined ? p.wheelEnabled : true
                    p.interactive = false
                    if (p.wheelEnabled !== undefined)
                        p.wheelEnabled = false
                    return
                }
                p = p.parent
            }
        } else if (_blockedFlickable) {
            if (_blockedFlickable.wheelEnabled !== undefined)
                _blockedFlickable.wheelEnabled = _savedWheel
            _blockedFlickable.interactive = _savedInteractive
            _blockedFlickable = null
        }
    }

    function roofSceneX(index) {
        let x = 0
        for (let i = 0; i < index; ++i)
            x += (Number(roofs[i].roofW) || 8) + 2
        return x
    }

    function findRoofIndex(id) {
        for (let i = 0; i < roofs.length; ++i)
            if (roofs[i].id === id)
                return i
        return -1
    }

    /**
     * Hauteur coplanaire via sin/cos (jamais tan — casse à 90°).
     * Prefère `along` si fourni ; sinon déduit de z (ou y à tilt≈90°).
     */
    function panelClear(roof) {
        const ph = Number(roof.panelH) || 1.76
        const tilt = Number(roof.tilt) || 30
        const gapZ = Number(roof.gapZ !== undefined ? roof.gapZ : roof.gap) || 0.03
        const rows = Math.max(1, Number(roof.rows) || 1)
        const mount = Number(roof.mountHeight !== undefined ? roof.mountHeight : 0.08)
        const t = tilt * Math.PI / 180
        const arrayAlong = rows * ph + (rows - 1) * gapZ
        return mount + (arrayAlong / 2) * Math.sin(t)
    }

    function panelAlong(roof, z, y, alongHint) {
        if (alongHint !== undefined && alongHint !== null && !isNaN(Number(alongHint)))
            return Number(alongHint)
        const tilt = Number(roof.tilt) || 30
        const t = tilt * Math.PI / 180
        const cosT = Math.cos(t)
        const sinT = Math.sin(t)
        const clear = panelClear(roof)
        if (Math.abs(cosT) >= 1e-6)
            return (Number(z) || 0) / cosT
        if (Math.abs(sinT) >= 1e-6)
            return ((Number(y) || clear) - clear) / sinT
        return Number(z) || 0
    }

    function panelY(roof, z, alongHint) {
        const tilt = Number(roof.tilt) || 30
        const t = tilt * Math.PI / 180
        const along = panelAlong(roof, z, undefined, alongHint)
        return along * Math.sin(t) + panelClear(roof)
    }

    function panelZFromAlong(roof, along) {
        const tilt = Number(roof.tilt) || 30
        return Number(along) * Math.cos(tilt * Math.PI / 180)
    }

    function clampLocal(roof, lx, lz) {
        const rw = Number(roof.roofW) || 8
        const rd = Number(roof.roofD) || 6
        const pw = Number(roof.panelW) || 1.13
        const ph = Number(roof.panelH) || 1.76
        const tilt = Number(roof.tilt) || 30
        const t = tilt * Math.PI / 180
        const fp = ph * Math.cos(t) + 0.07 * Math.sin(t)
        const hw = rw / 2 - pw / 2
        const hd = Math.max(0, rd / 2 - fp / 2)
        return {
            x: Math.max(-hw, Math.min(hw, lx)),
            z: Math.max(-hd, Math.min(hd, lz))
        }
    }

    function clampPlan(roof, x, y, w, d) {
        const rw = Number(roof.roofW) || 8
        const rd = Number(roof.roofD) || 6
        return {
            x: Math.max(0, Math.min(rw - w, x)),
            y: Math.max(0, Math.min(rd - d, y))
        }
    }

    /** Obstacles (arbres…) : zone site autour de la toiture, pas seulement le deck orange. */
    function clampObstaclePlan(roof, x, y, w, d) {
        const rw = Number(roof.roofW) || 8
        const rd = Number(roof.roofD) || 6
        const pad = Math.max(30, Math.max(rw, rd) * 3)
        return {
            x: Math.max(-pad, Math.min(rw - (w || 0) + pad, x)),
            y: Math.max(-pad, Math.min(rd - (d || 0) + pad, y))
        }
    }

    /**
     * Ancre plan = coin bas-droit du panneau le plus à droite
     * (bord droit + bord bas de l’emprise au sol).
     * Retourne { rightX, bottomY, panel } en coords plan obstacle, ou null.
     */
    function rightmostPanelAnchor(roof) {
        if (!roof)
            return null
        const pos = roof.positions || []
        if (!pos.length)
            return null
        const rw = Number(roof.roofW) || 8
        const rd = Number(roof.roofD) || 6
        const tilt = Number(roof.tilt) || 30
        const t = tilt * Math.PI / 180
        let best = null
        let bestRight = -Infinity
        let bestBottom = Infinity
        for (let i = 0; i < pos.length; ++i) {
            const p = pos[i]
            if (!p)
                continue
            const pw = Number(p.w) || Number(roof.panelW) || 1.13
            const ph = Number(p.h) || Number(roof.panelH) || 1.76
            const fp = ph * Math.cos(t) + 0.07 * Math.sin(t)
            const lx = Number(p.x) || 0
            const lz = Number(p.z) || 0
            const rightLocal = lx + pw / 2
            const bottomLocal = lz - fp / 2
            if (rightLocal > bestRight + 1e-6
                    || (Math.abs(rightLocal - bestRight) <= 1e-6 && bottomLocal < bestBottom)) {
                bestRight = rightLocal
                bestBottom = bottomLocal
                best = p
            }
        }
        if (!best)
            return null
        return {
            rightX: bestRight + rw / 2,
            bottomY: bestBottom + rd / 2,
            panel: best
        }
    }

    /** Distances (m) obstacle ← coin bas-droit du panneau le plus à droite. */
    function obstacleDistsFromRightmost(gi) {
        const idx = (gi !== undefined && gi !== null) ? gi : selectedObstacleIndex
        if (idx < 0 || idx >= obstacles.length)
            return null
        const o = obstacles[idx]
        const ri = findRoofIndex(o.roofId || activeRoofId)
        if (ri < 0)
            return null
        const anchor = rightmostPanelAnchor(roofs[ri])
        if (!anchor)
            return null
        // fromRight > 0 = à droite du bord ; fromBottom > 0 = au-delà du bord bas
        return {
            fromRight: Math.round(((Number(o.x) || 0) - anchor.rightX) * 1000) / 1000,
            fromBottom: Math.round((anchor.bottomY - (Number(o.y) || 0)) * 1000) / 1000,
            hasPanels: true
        }
    }

    /**
     * Place l’obstacle par distances depuis le coin bas-droit du panneau
     * le plus à droite : fromRight > 0 = à droite, fromBottom > 0 = au-delà du bas.
     */
    function setObstacleDistsFromRightmost(fromRight, fromBottom, gi) {
        const idx = (gi !== undefined && gi !== null) ? gi : selectedObstacleIndex
        if (idx < 0 || idx >= obstacles.length)
            return false
        const o = Object.assign({}, obstacles[idx])
        const ri = findRoofIndex(o.roofId || activeRoofId)
        if (ri < 0)
            return false
        const roof = roofs[ri]
        const anchor = rightmostPanelAnchor(roof)
        if (!anchor) {
            AppController.toast("Placez d’abord des panneaux pour mesurer depuis le bord", 3000)
            return false
        }
        const w = Number(o.w) || 0.5
        const d = Number(o.d) || 0.5
        const c = clampObstaclePlan(roof,
                                    anchor.rightX + Number(fromRight),
                                    anchor.bottomY - Number(fromBottom),
                                    w, d)
        o.x = Math.round(c.x * 1000) / 1000
        o.y = Math.round(c.y * 1000) / 1000
        let next = obstacles.slice()
        next[idx] = o
        obstacles = next
        obstaclePlanChanged()
        obstaclesEdited(next)
        return true
    }

    /** World XZ → local toiture (compense azimut du Node parent). */
    function worldToLocal(roof, scenePos) {
        if (!roof || !scenePos)
            return null
        const sx = roofSceneX(findRoofIndex(roof.id))
        const dx = scenePos.x - sx
        const dz = scenePos.z
        const a = (Number(roof.azimuth) || 0) * Math.PI / 180
        const c = Math.cos(a)
        const s = Math.sin(a)
        // Inverse de eulerRotation Y = -azimuth
        return { x: dx * c + dz * s, z: -dx * s + dz * c }
    }

    function worldToPlan(roof, scenePos) {
        const local = worldToLocal(roof, scenePos)
        if (!local)
            return null
        const rw = Number(roof.roofW) || 8
        const rd = Number(roof.roofD) || 6
        return { x: local.x + rw / 2, y: local.z + rd / 2 }
    }

    function selectPanel(roofId, index) {
        activeRoofId = roofId
        selectedPanelIndex = index
        selectedObstacleIndex = -1
        roofActivated(roofId)
        selectionChanged()
    }

    function selectObstacle(gi) {
        selectedObstacleIndex = gi
        selectedPanelIndex = -1
        if (gi >= 0 && obstacles[gi] && obstacles[gi].roofId) {
            activeRoofId = obstacles[gi].roofId
            roofActivated(activeRoofId)
        }
        selectionChanged()
    }

    function updatePanelLocal(roofId, index, lx, lz, commit) {
        const ri = findRoofIndex(roofId)
        if (ri < 0)
            return
        const roof = Object.assign({}, roofs[ri])
        let positions = (roof.positions || []).slice()
        if (index < 0 || index >= positions.length)
            return
        const c = clampLocal(roof, lx, lz)
        const p = Object.assign({}, positions[index])
        p.x = Math.round(c.x * 1000) / 1000
        p.z = Math.round(c.z * 1000) / 1000
        const along = panelAlong(roof, p.z, p.y, p.along)
        p.along = Math.round(along * 1000) / 1000
        p.z = Math.round(panelZFromAlong(roof, along) * 1000) / 1000
        p.y = Math.round(panelY(roof, p.z, along) * 1000) / 1000
        p.tilt = Number(roof.tilt) || 30
        p.yaw = 0
        p.w = Number(roof.panelW) || 1.13
        p.h = Number(roof.panelH) || 1.76
        positions[index] = p
        roof.positions = positions
        roof.nPanels = positions.length
        let next = roofs.slice()
        next[ri] = roof
        roofs = next
        if (commit !== false)
            panelsEdited(roofId, positions)
    }

    function addPanelLocal(roofId, lx, lz) {
        const ri = findRoofIndex(roofId)
        if (ri < 0)
            return
        const roof = Object.assign({}, roofs[ri])
        const c = clampLocal(roof, lx, lz)
        const along = panelAlong(roof, c.z)
        let positions = (roof.positions || []).slice()
        positions.push({
            id: "p" + Date.now() + "_" + positions.length,
            x: c.x,
            y: panelY(roof, c.z, along),
            z: panelZFromAlong(roof, along),
            along: along,
            tilt: Number(roof.tilt) || 30,
            yaw: 0,
            w: Number(roof.panelW) || 1.13,
            h: Number(roof.panelH) || 1.76
        })
        roof.positions = positions
        roof.nPanels = positions.length
        let next = roofs.slice()
        next[ri] = roof
        roofs = next
        selectPanel(roofId, positions.length - 1)
        panelsEdited(roofId, positions)
    }

    function removeSelectedPanel() {
        if (selectedPanelIndex < 0 || !activeRoof)
            return
        const ri = findRoofIndex(activeRoofId)
        if (ri < 0)
            return
        const roof = Object.assign({}, roofs[ri])
        let positions = (roof.positions || []).slice()
        positions.splice(selectedPanelIndex, 1)
        roof.positions = positions
        roof.nPanels = positions.length
        let next = roofs.slice()
        next[ri] = roof
        roofs = next
        selectedPanelIndex = positions.length ? Math.min(selectedPanelIndex, positions.length - 1) : -1
        panelsEdited(activeRoofId, positions)
        selectionChanged()
    }

    function nudgeSelectedPanel(dx, dz) {
        if (selectedPanelIndex < 0 || !activeRoof)
            return
        const p = (activeRoof.positions || [])[selectedPanelIndex]
        if (!p)
            return
        pushPanelUndo(activeRoofId, selectedPanelIndex, p)
        updatePanelLocal(activeRoofId, selectedPanelIndex, p.x + dx, p.z + dz, true)
    }

    function addObstacleAt(roofId, planX, planY, presetKey) {
        const ri = findRoofIndex(roofId)
        if (ri < 0)
            return
        const preset = obstaclePresets[presetKey] || obstaclePresets.chimney
        const c = clampObstaclePlan(roofs[ri], planX - preset.w / 2, planY - preset.d / 2, preset.w, preset.d)
        let next = obstacles.slice()
        next.push({
            id: "obs-" + Date.now(),
            type: preset.type,
            roofId: roofId,
            x: Math.round(c.x * 100) / 100,
            y: Math.round(c.y * 100) / 100,
            w: preset.w,
            d: preset.d,
            h: preset.h,
            label: preset.label
        })
        obstacles = next
        selectObstacle(next.length - 1)
        obstaclesEdited(next)
    }

    function updateObstaclePlan(gi, planX, planY, commit) {
        if (gi < 0 || gi >= obstacles.length)
            return
        const o = Object.assign({}, obstacles[gi])
        const ri = findRoofIndex(o.roofId || activeRoofId)
        if (ri < 0)
            return
        const c = clampObstaclePlan(roofs[ri], planX, planY, o.w || 0.5, o.d || 0.5)
        o.x = Math.round(c.x * 100) / 100
        o.y = Math.round(c.y * 100) / 100
        let next = obstacles.slice()
        next[gi] = o
        obstacles = next
        obstaclePlanChanged()
        // Pendant le drag : maj visuelle seule ; ombrage / persist au relâché
        if (commit !== false)
            obstaclesEdited(next)
    }

    function removeSelectedObstacle() {
        if (selectedObstacleIndex < 0)
            return
        let next = obstacles.slice()
        next.splice(selectedObstacleIndex, 1)
        obstacles = next
        selectedObstacleIndex = -1
        obstaclesEdited(next)
        selectionChanged()
    }

    /** Patch dims / type / label de l’obstacle sélectionné (ou index gi). */
    function updateObstacleProps(patch, gi) {
        const idx = (gi !== undefined && gi !== null) ? gi : selectedObstacleIndex
        if (idx < 0 || idx >= obstacles.length || !patch)
            return
        const o = Object.assign({}, obstacles[idx], patch)
        if (o.w !== undefined)
            o.w = Math.max(0.1, Math.min(40, Number(o.w) || 0.5))
        if (o.d !== undefined)
            o.d = Math.max(0.1, Math.min(40, Number(o.d) || 0.5))
        if (o.h !== undefined)
            o.h = Math.max(0.1, Math.min(40, Number(o.h) || 1))
        if (o.type === "tree") {
            o.label = o.label || "Arbre"
        } else if (o.type === "box" && (!o.label || o.label === "Arbre" || o.label === "Velux")) {
            o.label = o.label === "Arbre" ? "Boîte" : (o.label || "Obstacle")
        }
        let next = obstacles.slice()
        next[idx] = o
        obstacles = next
        obstaclesEdited(next)
    }

    function setView(preset) {
        const span = sceneSpan
        const midX = sceneMidX()
        _targetX = midX
        _targetY = 0.4
        _targetZ = 0
        if (preset === "top") {
            orbitYaw = 0
            orbitPitch = 88
            orbitDist = Math.max(12, span * 1.8)
        } else if (preset === "south") {
            orbitYaw = 0
            orbitPitch = 28
            orbitDist = Math.max(10, span * 1.5)
        } else {
            orbitYaw = 35
            orbitPitch = 32
            orbitDist = Math.max(12, span * 1.35)
        }
        applyOrbitCamera()
        _framed = true
    }

    /** Recentrage initial une seule fois — pas quand on édite la scène. */
    function frameSceneOnce() {
        if (_framed || _userLockedView)
            return
        setView("perspective")
    }

    function frameScene() {
        setView("perspective")
        _userLockedView = true
    }

    onRoofsChanged: {
        if (roofs.length)
            Qt.callLater(frameSceneOnce)
    }

    function handlePress(mx, my) {
        setAncestorFlickableBlocked(true)
        const r = view.pick(mx, my)
        if (!r || !r.scenePosition) {
            if (tool === "place" || tool.indexOf("place-") === 0)
                AppController.toast("Cliquez sur la toiture (ou le sol proche)", 2500)
            return
        }
        const hit = r.objectHit
        let roofId = (hit && hit.roofId) ? hit.roofId : activeRoofId
        if ((!roofId || findRoofIndex(roofId) < 0) && roofs.length)
            roofId = roofs[0].id || activeRoofId

        if (tool === "place" && editPanels) {
            const rid = roofId || activeRoofId
            const ri = findRoofIndex(rid)
            if (ri < 0) {
                AppController.toast("Créez d’abord une toiture", 3000)
                return
            }
            const local = worldToLocal(roofs[ri], r.scenePosition)
            if (local)
                addPanelLocal(rid, local.x, local.z)
            return
        }

        if (tool.indexOf("place-") === 0 && editObstacles) {
            const rid = roofId || activeRoofId
            const ri = findRoofIndex(rid)
            if (ri < 0) {
                AppController.toast("Créez d’abord une toiture", 3000)
                return
            }
            const plan = worldToPlan(roofs[ri], r.scenePosition)
            if (plan)
                addObstacleAt(rid, plan.x, plan.y, tool.slice(6))
            return
        }

        if (!hit)
            return

        if (tool === "select" || tool === "move") {
            if (hit.isPanel && hit.panelIndex !== undefined) {
                const rid = hit.roofId || activeRoofId
                selectPanel(rid, hit.panelIndex)
                if (editPanels) {
                    const ri = findRoofIndex(rid)
                    const pos = (ri >= 0 && roofs[ri].positions) ? roofs[ri].positions[hit.panelIndex] : null
                    _dragPanelBefore = pos ? { roofId: rid, index: hit.panelIndex, panel: clonePanel(pos) } : null
                    _dragging = true
                    _dragPanel = hit.panelIndex
                    _dragPanelRoofId = rid
                }
                return
            }
            if (hit.isObstacle) {
                const gi = hit.globalIndex !== undefined ? hit.globalIndex : hit.obstacleIndex
                selectObstacle(gi)
                if (editObstacles) {
                    _dragging = true
                    _dragObstacle = gi
                }
                return
            }
            if (hit.roofId) {
                activeRoofId = hit.roofId
                roofActivated(hit.roofId)
                selectedPanelIndex = -1
                selectedObstacleIndex = -1
                selectionChanged()
            }
        }
    }

    function handleMove(mx, my) {
        if (!_dragging)
            return
        const r = view.pick(mx, my)
        if (!r || !r.scenePosition)
            return
        if (_dragPanel >= 0 && activeRoof) {
            const local = worldToLocal(activeRoof, r.scenePosition)
            if (local)
                updatePanelLocal(activeRoofId, _dragPanel, local.x, local.z, false)
        } else if (_dragObstacle >= 0 && activeRoof) {
            const plan = worldToPlan(activeRoof, r.scenePosition)
            if (plan) {
                const o = obstacles[_dragObstacle]
                updateObstaclePlan(_dragObstacle,
                                   plan.x - (o.w || 0.5) / 2,
                                   plan.y - (o.d || 0.5) / 2,
                                   false)
            }
        }
    }

    function handleRelease() {
        const draggedObstacle = _dragObstacle >= 0
        const draggedPanel = _dragPanel >= 0
        const before = _dragPanelBefore
        const panelRoofId = _dragPanelRoofId || activeRoofId
        const panelIndex = _dragPanel
        _dragging = false
        _dragPanel = -1
        _dragPanelRoofId = ""
        _dragPanelBefore = null
        _dragObstacle = -1
        setAncestorFlickableBlocked(false)
        if (draggedObstacle)
            obstaclesEdited(obstacles)
        if (draggedPanel && panelRoofId) {
            const ri = findRoofIndex(panelRoofId)
            if (ri >= 0) {
                const positions = roofs[ri].positions || []
                if (before && panelIndex >= 0 && panelIndex < positions.length) {
                    const cur = positions[panelIndex]
                    const moved = !cur
                        || Math.abs((Number(cur.x) || 0) - (Number(before.panel.x) || 0)) > 1e-4
                        || Math.abs((Number(cur.z) || 0) - (Number(before.panel.z) || 0)) > 1e-4
                    if (moved)
                        pushPanelUndo(before.roofId, before.index, before.panel)
                }
                panelsEdited(panelRoofId, positions)
            }
        }
    }

    View3D {
        id: view
        anchors.fill: parent
        camera: cam
        renderMode: View3D.Offscreen

        environment: SceneEnvironment {
            clearColor: "#b9c9be"
            backgroundMode: SceneEnvironment.Color
            antialiasingMode: SceneEnvironment.MSAA
            antialiasingQuality: SceneEnvironment.Medium
        }

        PerspectiveCamera {
            id: cam
            position: Qt.vector3d(10, 8, 12)
            clipNear: 0.1
            clipFar: 800
            fieldOfView: 45
        }

        Node {
            id: sceneRoot

            Model {
                // Sol de site large — pick pour placer / glisser obstacles hors du deck orange
                property real groundSpan: Math.max(120, root.sceneSpan * 5)
                source: "#Rectangle"
                scale: Qt.vector3d(groundSpan * 0.01, groundSpan * 0.01, 1)
                eulerRotation: Qt.vector3d(-90, 0, 0)
                x: root.sceneMidX()
                y: -0.05
                pickable: root.tool === "place"
                         || root.tool.indexOf("place-") === 0
                         || (root._dragging && root._dragObstacle >= 0)
                objectName: "ground"
                materials: PrincipledMaterial {
                    baseColor: "#7f9a86"
                    roughness: 1
                }
            }

            DirectionalLight {
                color: Qt.rgba(1, 0.96, 0.88, 1)
                ambientColor: Qt.rgba(0.35, 0.38, 0.4, 1)
                brightness: Math.max(0.25, root.sunElev / 90 * 1.3)
                eulerRotation: Qt.vector3d(root.sunEuler.x, root.sunEuler.y, root.sunEuler.z)
                castsShadow: root.showShadows && root.sunElev > 2
                shadowMapQuality: Light.ShadowMapQualityMedium
                shadowFactor: 70
            }

            Model {
                // Marqueur soleil — ne doit PAS ombrer (sinon grosse boule orange)
                visible: root.sunElev > 2
                source: "#Sphere"
                scale: Qt.vector3d(0.35 * 0.01, 0.35 * 0.01, 0.35 * 0.01)
                pickable: false
                castsShadows: false
                receivesShadows: false
                position: {
                    const d = Layout3D.sunDirection(root.sunAz, root.sunElev)
                    const rr = Math.max(18, root.sceneSpan) * 2.2
                    return Qt.vector3d(_targetX + d.x * rr,
                                      Math.max(4, _targetY + d.y * rr),
                                      _targetZ + d.z * rr)
                }
                materials: PrincipledMaterial {
                    baseColor: "#f5a623"
                    emissiveFactor: Qt.vector3d(2.0, 1.4, 0.3)
                    lighting: PrincipledMaterial.NoLighting
                }
            }

            Repeater3D {
                model: root.roofs
                delegate: Node {
                    required property var modelData
                    required property int index
                    property string rid: modelData.id || ("roof-" + index)
                    property real rw: Number(modelData.roofW) || 8
                    property real rd: Number(modelData.roofD) || 6
                    property real sx: {
                        let x = 0
                        for (let i = 0; i < index; ++i)
                            x += (Number(root.roofs[i].roofW) || 8) + 2
                        return x
                    }
                    property real pTilt: Number(modelData.tilt) || 30
                    property real pAz: Number(modelData.azimuth) || 0
                    property real pw: Number(modelData.panelW) || 1.13
                    property real ph: Number(modelData.panelH) || 1.76
                    property bool isActive: rid === root.activeRoofId

                    // Toiture entière orientée (azimut) — panneaux en grille locale sans yaw individuel
                    Node {
                        x: sx
                        eulerRotation: Qt.vector3d(0, -pAz, 0)

                        RoofDeck3D {
                            roofId: rid
                            roofName: modelData.name || ""
                            roofW: rw
                            roofD: rd
                            sceneX: 0
                            active: isActive
                        }

                        PanelArray3D {
                            visible: root.showPanels
                            // panelMeshRev force le rebind même si la longueur ne change pas
                            panels: {
                                const _ = root.panelMeshRev
                                const pos = modelData.positions
                                if (!pos || !pos.length)
                                    return []
                                const out = []
                                for (let i = 0; i < pos.length; ++i)
                                    out.push(pos[i])
                                return out
                            }
                            panelW: pw
                            panelH: ph
                            tilt: pTilt
                            azimuth: 0
                            mountHeight: Number(modelData.mountHeight !== undefined
                                                ? modelData.mountHeight : 0.08)
                            roofId: rid
                            selectedIndex: root.selectedPanelIndex
                            editable: root.editPanels
                            activeRoof: isActive
                        }

                        ObstacleLayer3D {
                            visible: root.showObstacles
                            allObstacles: root.obstacles
                            roofW: rw
                            roofD: rd
                            roofId: rid
                            editable: root.editObstacles
                            selectedGlobalIndex: root.selectedObstacleIndex
                            showHorizonStubs: root.showHorizonStubs && isActive
                            horizonObstacles: root.horizonObstacles
                        }
                    }
                }
            }
        }
    }

    // Nav type Onshape / CAD :
    //   clic droit = orbite | molette clic = pan | scroll = zoom
    //   Alt+gauche = orbite (laptop) | gauche = édition
    Shortcut {
        sequences: [StandardKey.Undo, "Ctrl+Z", "Meta+Z"]
        context: Qt.ApplicationShortcut
        enabled: root.editPanels && root.visible
        onActivated: root.undoPanelMove()
    }

    MouseArea {
        id: navArea
        anchors.fill: parent
        acceptedButtons: Qt.LeftButton | Qt.RightButton | Qt.MiddleButton
        hoverEnabled: true
        preventStealing: true
        cursorShape: {
            if (root._navMode === "orbit") return Qt.ClosedHandCursor
            if (root._navMode === "pan") return Qt.SizeAllCursor
            if (root.tool.indexOf("place") === 0) return Qt.CrossCursor
            if (root._dragging) return Qt.ClosedHandCursor
            return Qt.ArrowCursor
        }

        onPressed: function (m) {
            root.setAncestorFlickableBlocked(true)
            root._navLastX = m.x
            root._navLastY = m.y
            root._navMode = ""
            const shift = !!(m.modifiers & Qt.ShiftModifier)
            const alt = !!(m.modifiers & Qt.AltModifier)

            // Molette : pan (Shift = orbite)
            if (m.button === Qt.MiddleButton) {
                root._navMode = shift ? "orbit" : "pan"
                return
            }
            // Droit : orbite (Shift = pan) — standard CAD / Onshape
            if (m.button === Qt.RightButton) {
                root._navMode = shift ? "pan" : "orbit"
                return
            }
            // Gauche + Alt : orbite / pan laptop
            if (alt) {
                root._navMode = shift ? "pan" : "orbit"
                return
            }
            if (root.tool === "camera") {
                root._navMode = "orbit"
                return
            }
            root._navMode = "edit"
            root.handlePress(m.x, m.y)
        }

        onPositionChanged: function (m) {
            if (!m.buttons)
                return
            const dx = m.x - root._navLastX
            const dy = m.y - root._navLastY
            root._navLastX = m.x
            root._navLastY = m.y
            if (root._navMode === "orbit")
                root.orbitByDelta(dx, dy)
            else if (root._navMode === "pan")
                root.panOrbitTarget(dx, dy)
            else if (root._navMode === "edit" && root._dragging)
                root.handleMove(m.x, m.y)
        }

        onReleased: function () {
            root.handleRelease()
            root._navMode = ""
            root.setAncestorFlickableBlocked(false)
        }
        onCanceled: {
            root.handleRelease()
            root._navMode = ""
            root.setAncestorFlickableBlocked(false)
        }
        onWheel: function (w) {
            root.setAncestorFlickableBlocked(true)
            root.zoomByWheel(w.angleDelta.y)
            w.accepted = true
        }
    }

    HoverHandler {
        acceptedDevices: PointerDevice.Mouse | PointerDevice.TouchScreen
        onHoveredChanged: root.setAncestorFlickableBlocked(hovered)
    }

    Rectangle {
        anchors.left: parent.left
        anchors.top: parent.top
        anchors.margins: 8
        visible: !Ui.isPhone && !Ui.isAndroid
        width: hintCol.implicitWidth + 16
        height: hintCol.implicitHeight + 12
        radius: 4
        color: "#e8f0ebcc"
        border.color: Theme.outline
        z: 10
        Column {
            id: hintCol
            anchors.centerIn: parent
            spacing: 2
            Label {
                text: "Clic droit = orbite · Molette = pan · Scroll = zoom"
                font.pixelSize: 12
                font.weight: Font.DemiBold
                color: Theme.text
            }
            Label {
                text: root.tool === "camera"
                      ? "Outil Caméra : clic gauche = orbite aussi"
                      : "Clic gauche = éditer · Alt+gauche = orbite (laptop)"
                font.pixelSize: 11
                color: Theme.textDim
            }
        }
    }

    Row {
        anchors.right: parent.right
        anchors.top: parent.top
        anchors.margins: 8
        spacing: 4
        z: 10
        Repeater {
            model: [
                { id: "perspective", label: "3D" },
                { id: "south", label: "Sud" },
                { id: "top", label: "Dessus" }
            ]
            delegate: Button {
                required property var modelData
                text: modelData.label
                flat: true
                font.pixelSize: 11
                implicitHeight: 26
                onClicked: {
                    root._userLockedView = true
                    root.setView(modelData.id)
                }
            }
        }
    }

    Component.onCompleted: Qt.callLater(frameSceneOnce)
    Component.onDestruction: setAncestorFlickableBlocked(false)
}
