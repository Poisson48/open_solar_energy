import QtQuick
import QtQuick.Controls
import QtQuick3D
import QtQuick3D.Helpers

/**
 * Éditeur toiture 3D : caméra orbite, sélection/drag panneaux, placement au clic.
 * Les panneaux sont la source de vérité (pas une grille figée non éditable).
 */
Item {
    id: root

    property real roofW: 10
    property real roofD: 6
    property real tilt: 30
    property real azimuth: 0
    property real sunAz: 180
    property real sunElev: 45
    property real panelW: 1.134
    property real panelH: 1.722
    property bool showShadows: true

    /** Liste éditable [{id,x,y,z,tilt,yaw,w,h}] */
    property var panels: []
    property var obstacles: []
    property int selectedIndex: -1
    /** camera | select | place */
    property string tool: "camera"

    signal panelsEdited()
    signal selectionChanged(int index)

    readonly property var sunEuler: Layout3D.sunLightEuler(sunAz, sunElev)

    property var _blockedFlickable: null
    property bool _savedInteractive: true
    property bool _savedWheel: true
    property bool _dragging: false
    property int _dragIndex: -1

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

    function panelY() {
        const rise = panelH * Math.sin(tilt * Math.PI / 180)
        return rise / 2 + 0.06
    }

    function clampToRoof(x, z) {
        const hw = roofW / 2 - panelW / 2
        const hd = roofD / 2 - panelH * Math.cos(tilt * Math.PI / 180) / 2
        return {
            x: Math.max(-hw, Math.min(hw, x)),
            z: Math.max(-hd, Math.min(hd, z))
        }
    }

    function pickPanelIndex(mx, my) {
        const r = view.pick(mx, my)
        if (!r || !r.objectHit)
            return -1
        const hit = r.objectHit
        if (hit.panelIndex !== undefined && hit.panelIndex >= 0)
            return hit.panelIndex
        return -1
    }

    function pickRoofXZ(mx, my) {
        const r = view.pick(mx, my)
        if (!r || !r.objectHit)
            return null
        const p = r.scenePosition
        return clampToRoof(p.x, p.z)
    }

    function selectIndex(i) {
        selectedIndex = i
        selectionChanged(i)
    }

    function updatePanelAt(i, x, z) {
        if (i < 0 || i >= panels.length)
            return
        const c = clampToRoof(x, z)
        let next = panels.slice()
        const p = Object.assign({}, next[i])
        p.x = Math.round(c.x * 1000) / 1000
        p.z = Math.round(c.z * 1000) / 1000
        p.y = panelY()
        p.tilt = tilt
        p.yaw = azimuth
        p.w = panelW
        p.h = panelH
        next[i] = p
        panels = next
        panelsEdited()
    }

    function addPanelAt(x, z) {
        const c = clampToRoof(x, z)
        let next = panels.slice()
        next.push({
            id: "p" + Date.now() + "_" + next.length,
            x: c.x,
            y: panelY(),
            z: c.z,
            tilt: tilt,
            yaw: azimuth,
            w: panelW,
            h: panelH
        })
        panels = next
        selectIndex(next.length - 1)
        panelsEdited()
    }

    function removeSelected() {
        if (selectedIndex < 0 || selectedIndex >= panels.length)
            return
        let next = panels.slice()
        next.splice(selectedIndex, 1)
        panels = next
        selectIndex(next.length ? Math.min(selectedIndex, next.length - 1) : -1)
        panelsEdited()
    }

    function nudgeSelected(dx, dz) {
        if (selectedIndex < 0 || selectedIndex >= panels.length)
            return
        const p = panels[selectedIndex]
        updatePanelAt(selectedIndex, p.x + dx, p.z + dz)
    }

    function syncPanelGeometry() {
        // Recale tilt/yaw/w/h/y de tous les panneaux (orientation toiture changée)
        if (!panels.length)
            return
        let next = []
        for (let i = 0; i < panels.length; ++i) {
            const p = Object.assign({}, panels[i])
            const c = clampToRoof(p.x, p.z)
            p.x = c.x
            p.z = c.z
            p.y = panelY()
            p.tilt = tilt
            p.yaw = azimuth
            p.w = panelW
            p.h = panelH
            next.push(p)
        }
        panels = next
        panelsEdited()
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
            antialiasingQuality: SceneEnvironment.High
        }

        PerspectiveCamera {
            id: cam
            position: Qt.vector3d(root.roofW * 0.95, Math.max(4, root.roofW * 0.65), root.roofD * 1.15)
            eulerRotation: Qt.vector3d(-32, 40, 0)
            clipNear: 0.05
            clipFar: 800
        }

        OrbitCameraController {
            id: orbit
            anchors.fill: parent
            origin: sceneRoot
            camera: cam
            // Caméra libre seulement en mode camera ; sinon clic droit / milieu
            acceptedButtons: root.tool === "camera"
                             ? (Qt.LeftButton | Qt.RightButton | Qt.MiddleButton)
                             : (Qt.RightButton | Qt.MiddleButton)
        }

        Node {
            id: sceneRoot

            Model {
                source: "#Rectangle"
                scale: Qt.vector3d(root.roofW * 4, root.roofD * 4, 1)
                eulerRotation: Qt.vector3d(-90, 0, 0)
                y: -0.04
                pickable: false
                materials: PrincipledMaterial {
                    baseColor: "#7f9a86"
                    roughness: 1
                }
            }

            // Plan de pick (toiture)
            Model {
                id: roofPick
                objectName: "roof"
                source: "#Rectangle"
                scale: Qt.vector3d(root.roofW, root.roofD, 1)
                eulerRotation: Qt.vector3d(-90, 0, 0)
                y: 0.02
                pickable: true
                materials: PrincipledMaterial {
                    baseColor: "#c4b0a0"
                    roughness: 0.9
                    metalness: 0.05
                }
            }

            // Volume toiture (visuel)
            Model {
                source: "#Cube"
                scale: Qt.vector3d(root.roofW, 0.06, root.roofD)
                y: -0.01
                pickable: false
                materials: PrincipledMaterial {
                    baseColor: "#a89080"
                    roughness: 0.88
                }
            }

            DirectionalLight {
                color: Qt.rgba(1, 0.96, 0.88, 1)
                ambientColor: Qt.rgba(0.32, 0.36, 0.38, 1)
                brightness: Math.max(0.2, root.sunElev / 90 * 1.35)
                eulerRotation: Qt.vector3d(root.sunEuler.x, root.sunEuler.y, root.sunEuler.z)
                castsShadow: root.showShadows && root.sunElev > 2
                shadowMapQuality: Light.ShadowMapQualityHigh
                shadowFactor: 75
                shadowBias: 0.01
            }

            Model {
                visible: root.sunElev > 0
                source: "#Sphere"
                scale: Qt.vector3d(0.4, 0.4, 0.4)
                pickable: false
                position: {
                    const d = Layout3D.sunDirection(root.sunAz, root.sunElev)
                    const r = Math.max(root.roofW, root.roofD) * 1.45
                    return Qt.vector3d(d.x * r, d.y * r + 0.5, d.z * r)
                }
                materials: PrincipledMaterial {
                    baseColor: "#f5a623"
                    emissiveFactor: Qt.vector3d(1.3, 0.85, 0.2)
                    lighting: PrincipledMaterial.NoLighting
                }
            }

            Repeater3D {
                model: root.panels
                delegate: Model {
                    id: panelModel
                    required property var modelData
                    required property int index
                    property int panelIndex: index
                    source: "#Cube"
                    property real pw: modelData.w || root.panelW
                    property real ph: modelData.h || root.panelH
                    scale: Qt.vector3d(pw, 0.045, ph * Math.cos((modelData.tilt || root.tilt) * Math.PI / 180))
                    position: Qt.vector3d(modelData.x || 0, modelData.y || root.panelY(), modelData.z || 0)
                    eulerRotation: Qt.vector3d(-(modelData.tilt || root.tilt), modelData.yaw || root.azimuth, 0)
                    castsShadows: true
                    receivesShadows: true
                    pickable: true
                    materials: PrincipledMaterial {
                        baseColor: index === root.selectedIndex ? "#2d9e5c" : "#1a4a7a"
                        roughness: 0.32
                        metalness: 0.25
                        emissiveFactor: index === root.selectedIndex
                                        ? Qt.vector3d(0.08, 0.2, 0.1)
                                        : Qt.vector3d(0, 0, 0)
                    }
                }
            }

            Repeater3D {
                model: root.obstacles
                delegate: Model {
                    required property var modelData
                    property real dist: modelData.dist || Math.max(root.roofW, root.roofD) * 1.25
                    property real elevRad: (modelData.elev || 0) * Math.PI / 180
                    property real azRad: (modelData.az || 0) * Math.PI / 180
                    property real oh: Math.tan(Math.max(0.01, elevRad)) * dist
                    source: "#Cube"
                    pickable: false
                    scale: Qt.vector3d(modelData.width || 2.5, Math.max(0.3, oh), 0.4)
                    position: Qt.vector3d(Math.sin(azRad) * dist, Math.max(0.3, oh) / 2, -Math.cos(azRad) * dist)
                    eulerRotation: Qt.vector3d(0, modelData.az || 0, 0)
                    castsShadows: true
                    materials: PrincipledMaterial {
                        baseColor: "#5a4a3a"
                        roughness: 0.92
                    }
                }
            }
        }
    }

    // Interaction édition (sélection / placement / drag)
    MouseArea {
        id: editArea
        anchors.fill: parent
        enabled: root.tool === "select" || root.tool === "place"
        acceptedButtons: Qt.LeftButton
        hoverEnabled: true
        preventStealing: true
        cursorShape: root.tool === "place" ? Qt.CrossCursor
                     : (_dragging ? Qt.ClosedHandCursor : Qt.PointingHandCursor)

        onPressed: function (mouse) {
            root.setAncestorFlickableBlocked(true)
            if (root.tool === "place") {
                const xz = root.pickRoofXZ(mouse.x, mouse.y)
                if (xz)
                    root.addPanelAt(xz.x, xz.z)
                return
            }
            // select
            const idx = root.pickPanelIndex(mouse.x, mouse.y)
            root.selectIndex(idx)
            if (idx >= 0) {
                _dragging = true
                _dragIndex = idx
            }
        }
        onPositionChanged: function (mouse) {
            if (!_dragging || _dragIndex < 0)
                return
            const xz = root.pickRoofXZ(mouse.x, mouse.y)
            if (xz)
                root.updatePanelAt(_dragIndex, xz.x, xz.z)
        }
        onReleased: function () {
            _dragging = false
            _dragIndex = -1
            root.setAncestorFlickableBlocked(false)
        }
        onCanceled: {
            _dragging = false
            _dragIndex = -1
            root.setAncestorFlickableBlocked(false)
        }
    }

    // Quand mode caméra : bloquer le flick parent pendant l’orbite
    MouseArea {
        anchors.fill: parent
        enabled: root.tool === "camera"
        acceptedButtons: Qt.NoButton
        hoverEnabled: false
        propagateComposedEvents: true
        onPressed: function (mouse) {
            root.setAncestorFlickableBlocked(true)
            mouse.accepted = false
        }
        onReleased: {
            root.setAncestorFlickableBlocked(false)
        }
    }

    Rectangle {
        anchors.left: parent.left
        anchors.top: parent.top
        anchors.margins: 8
        width: hintCol.implicitWidth + 16
        height: hintCol.implicitHeight + 12
        radius: 4
        color: "#e8f0ebcc"
        border.color: Theme.outline
        Column {
            id: hintCol
            anchors.centerIn: parent
            spacing: 2
            Label {
                text: root.tool === "camera" ? "Caméra — glisser pour orbiter · molette zoom"
                    : root.tool === "place" ? "Placer — clic sur la toiture"
                    : "Sélection — clic / glisser un panneau"
                font.pixelSize: 11
                color: Theme.text
            }
            Label {
                visible: root.selectedIndex >= 0
                text: "Sélectionné #" + (root.selectedIndex + 1)
                font.pixelSize: 11
                font.weight: Font.DemiBold
                color: Theme.primary
            }
        }
    }

    Component.onDestruction: setAncestorFlickableBlocked(false)
}
