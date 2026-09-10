import QtQuick
import QtQuick3D

/**
 * Deck toiture horizontal (pick fiable) — le tilt est porté par les panneaux.
 * #Cube / #Rectangle = 100 u → scale = mètres × 0.01.
 */
Node {
    id: root

    property real roofW: 8
    property real roofD: 6
    property bool active: true
    property string roofId: ""
    property string roofName: ""
    property real sceneX: 0
    readonly property real u: 0.01

    x: sceneX

    Model {
        objectName: "roof"
        property string roofId: root.roofId
        source: "#Rectangle"
        scale: Qt.vector3d(root.roofW * root.u, root.roofD * root.u, 1)
        eulerRotation: Qt.vector3d(-90, 0, 0)
        y: 0.02
        pickable: true
        receivesShadows: true
        castsShadows: false
        materials: PrincipledMaterial {
            baseColor: root.active ? "#e0c8a8" : "#c4b09a"
            roughness: 0.92
            metalness: 0.0
        }
    }

    Model {
        source: "#Cube"
        scale: Qt.vector3d(root.roofW * root.u, 0.12 * root.u, root.roofD * root.u)
        y: -0.04
        pickable: false
        castsShadows: true
        materials: PrincipledMaterial {
            baseColor: root.active ? "#b8956e" : "#9a8068"
            roughness: 0.95
        }
    }

    // Contour actif (fin, au-dessus — ne masque pas les panneaux)
    Model {
        visible: root.active
        source: "#Cube"
        scale: Qt.vector3d((root.roofW + 0.08) * root.u, 0.02 * root.u, (root.roofD + 0.08) * root.u)
        y: 0.01
        pickable: false
        castsShadows: false
        materials: PrincipledMaterial {
            baseColor: "#f5a623"
            roughness: 0.5
            opacity: 0.35
            emissiveFactor: Qt.vector3d(0.2, 0.1, 0.02)
        }
    }
}
