import QtQuick
import QtQuick3D

/**
 * Obstacles sur un pan. #Cube = 100 u → scale = m × 0.01.
 */
Node {
    id: root

    property var allObstacles: []
    property real roofW: 8
    property real roofD: 6
    property int selectedGlobalIndex: -1
    property string roofId: ""
    property bool editable: true
    property bool showHorizonStubs: false
    property var horizonObstacles: []
    readonly property real u: 0.01

    property var _filtered: []

    function rebuildFiltered() {
        const src = allObstacles || []
        let out = []
        for (let i = 0; i < src.length; ++i) {
            const o = src[i]
            if (!o)
                continue
            if (!o.roofId || o.roofId === root.roofId)
                out.push(Object.assign({ _gi: i }, o))
        }
        _filtered = out
    }

    onAllObstaclesChanged: rebuildFiltered()
    onRoofIdChanged: rebuildFiltered()
    Component.onCompleted: rebuildFiltered()

    Repeater3D {
        model: root._filtered.length
        delegate: Node {
            required property int index
            property var modelData: root._filtered[index]
            property int obstacleIndex: index
            property int globalIndex: modelData && modelData._gi !== undefined ? modelData._gi : index
            property string roofId: root.roofId
            property bool isObstacle: true

            property real lx: ((modelData && modelData.x) || 0) + ((modelData && modelData.w) || 0.5) / 2 - root.roofW / 2
            property real lz: ((modelData && modelData.y) || 0) + ((modelData && modelData.d) || 0.5) / 2 - root.roofD / 2
            property real ow: Math.max(0.1, (modelData && modelData.w) || 0.5)
            property real od: Math.max(0.1, (modelData && modelData.d) || 0.5)
            property real oh: Math.max(0.1, (modelData && modelData.h) || 1)
            property bool isTree: ((modelData && modelData.type) || "box") === "tree"

            x: lx
            z: lz

            Model {
                source: "#Cube"
                scale: Qt.vector3d(ow * root.u, (isTree ? oh * 0.55 : oh) * root.u, od * root.u)
                y: (isTree ? oh * 0.55 : oh) / 2
                pickable: root.editable
                property int obstacleIndex: index
                property int globalIndex: parent.globalIndex
                property string roofId: root.roofId
                property bool isObstacle: true
                castsShadows: true
                materials: PrincipledMaterial {
                    baseColor: globalIndex === root.selectedGlobalIndex ? "#e07020"
                               : (isTree ? "#3d6b3a" : "#5a4a3a")
                    roughness: 0.9
                    emissiveFactor: globalIndex === root.selectedGlobalIndex
                                    ? Qt.vector3d(0.2, 0.08, 0.02)
                                    : Qt.vector3d(0, 0, 0)
                }
            }

            Model {
                visible: isTree
                source: "#Sphere"
                scale: Qt.vector3d(ow * 1.4 * root.u, oh * 0.5 * root.u, od * 1.4 * root.u)
                y: oh * 0.7
                pickable: false
                castsShadows: true
                materials: PrincipledMaterial {
                    baseColor: "#2f7a32"
                    roughness: 0.95
                }
            }
        }
    }

    Repeater3D {
        model: root.showHorizonStubs ? (root.horizonObstacles ? root.horizonObstacles.length : 0) : 0
        delegate: Model {
            required property int index
            property var modelData: root.horizonObstacles[index]
            property real dist: (modelData && modelData.dist) || Math.max(root.roofW, root.roofD) * 1.25
            property real elevRad: ((modelData && modelData.elev) || 0) * Math.PI / 180
            property real azRad: ((modelData && modelData.az) || 0) * Math.PI / 180
            property real oh: Math.tan(Math.max(0.01, elevRad)) * dist
            source: "#Cube"
            pickable: false
            scale: Qt.vector3d(((modelData && modelData.width) || 2.5) * root.u,
                               Math.max(0.3, oh) * root.u,
                               0.4 * root.u)
            position: Qt.vector3d(Math.sin(azRad) * dist, Math.max(0.3, oh) / 2, Math.cos(azRad) * dist)
            eulerRotation: Qt.vector3d(0, (modelData && modelData.az) || 0, 0)
            castsShadows: true
            materials: PrincipledMaterial {
                baseColor: "#6a5a4a"
                roughness: 0.95
                opacity: 0.55
            }
        }
    }
}
