import QtQuick
import QtQuick3D

/**
 * Panneaux en grille (mètres).
 * #Cube = arête 100 → scale = m × 0.01.
 * Tilt = rotation Euler X (degrés), pivot au centre du panneau.
 */
Node {
    id: root

    property var panels: []
    property real panelW: 1.13
    property real panelH: 1.76
    property real tilt: 30
    property real azimuth: 0
    /** Dégagement bord bas panneau / sol (m). */
    property real mountHeight: 0.08
    property int selectedIndex: -1
    property string roofId: ""
    property bool editable: true
    property bool activeRoof: true

    readonly property real u: 0.01
    readonly property int panelCount: panels && panels.length ? panels.length : 0

    function panelAt(i) {
        if (!panels || i < 0 || i >= panels.length)
            return null
        return panels[i]
    }

    function panelTilt(i) {
        const p = panelAt(i)
        if (p && p.tilt !== undefined && p.tilt !== null && !isNaN(Number(p.tilt)))
            return Number(p.tilt)
        return Number(root.tilt) || 0
    }

    Repeater3D {
        model: root.panelCount
        delegate: Node {
            id: panelNode
            required property int index

            property var _p: root.panelAt(index)
            property real tw: _p && _p.w !== undefined ? Number(_p.w) : root.panelW
            property real th: _p && _p.h !== undefined ? Number(_p.h) : root.panelH
            property real tt: root.panelTilt(index)
            property real px: _p ? Number(_p.x) || 0 : 0
            property real py: {
                if (_p && _p.y !== undefined && !isNaN(Number(_p.y)))
                    return Number(_p.y)
                const t = tt * Math.PI / 180
                const sinT = Math.sin(t)
                const cosT = Math.cos(t)
                let along = _p && _p.along !== undefined ? Number(_p.along) : NaN
                if (isNaN(along)) {
                    if (Math.abs(cosT) >= 1e-6)
                        along = (Number(pz) || 0) / cosT
                    else
                        along = 0
                }
                return along * sinT + th * sinT / 2 + root.mountHeight
            }
            property real pz: _p ? Number(_p.z) || 0 : 0
            property bool selected: root.activeRoof && index === root.selectedIndex

            position: Qt.vector3d(px, py, pz)
            // Inclinaison : face du panneau (plan XZ) bascule autour de X
            eulerRotation: Qt.vector3d(-tt, 0, 0)

            Model {
                source: "#Cube"
                scale: Qt.vector3d((tw + 0.05) * root.u, 0.05 * root.u, (th + 0.05) * root.u)
                y: -0.02
                pickable: false
                castsShadows: false
                materials: PrincipledMaterial {
                    baseColor: selected ? "#3cb371" : "#cfd6dc"
                    roughness: 0.55
                }
            }
            Model {
                property int panelIndex: index
                property string roofId: root.roofId
                property bool isPanel: true
                source: "#Cube"
                // w × épaisseur × h  (h = dimension dans le sens de la pente)
                scale: Qt.vector3d(tw * root.u, 0.07 * root.u, th * root.u)
                pickable: root.editable
                castsShadows: true
                receivesShadows: true
                materials: PrincipledMaterial {
                    baseColor: selected ? "#2d9e5c" : "#1a4a7a"
                    roughness: 0.28
                    metalness: 0.15
                    emissiveFactor: selected ? Qt.vector3d(0.06, 0.16, 0.08)
                                             : Qt.vector3d(0, 0, 0)
                }
            }
        }
    }
}
