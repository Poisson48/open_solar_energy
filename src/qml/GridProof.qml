import QtQuick
import QtQuick.Window
import QtQuick3D

/**
 * Mode --grid-proof : génère 2×4 panneaux, rend la scène, sauve /tmp/ose-grid-proof.png
 */
Window {
    id: win
    width: 1100
    height: 720
    visible: true
    title: "OSE grid proof"
    color: "#1a1a1a"

    property var layoutState: ({})

    Component.onCompleted: {
        layoutState = LayoutRoofs.generateGrid(LayoutRoofs.migrate({}), 2, 4, {
            roofW: 10,
            roofD: 6,
            panelW: 1.13,
            panelH: 1.76,
            gap: 0.03,
            gapX: 0.03,
            gapZ: 0.03,
            tilt: 30,
            azimuth: 0,
            name: "Preuve"
        }, "")
        scene.roofs = layoutState.roofs || []
        scene.activeRoofId = layoutState.activeId || ""
        scene.bumpPanelMesh()
        // Vue perspective pour voir le tilt (vue top le cache)
        scene.setView("perspective")
        scene.orbitYaw = 40
        scene.orbitPitch = 28
        scene.orbitDist = 14
        scene.applyOrbitCamera()
        const n = LayoutRoofs.totalPanels(layoutState)
        const r = LayoutRoofs.getActiveRoof(layoutState)
        const pos = (r && r.positions) ? r.positions : []
        let dx = 0
        if (pos.length >= 2)
            dx = Math.abs(Number(pos[1].x) - Number(pos[0].x))
        console.log("GRID_PROOF_DATA n=" + n + " dx=" + dx + " pw=" + (pos.length ? pos[0].w : "?"))
        grabTimer.start()
    }

    SolarScene3D {
        id: scene
        anchors.fill: parent
        anchors.margins: 8
        mode: "layout"
        tool: "camera"
        showPanels: true
        showObstacles: false
        editPanels: false
        sunElev: 55
        sunAz: 180
    }

    Timer {
        id: grabTimer
        interval: 900
        repeat: false
        onTriggered: {
            scene.grabToImage(function (img) {
                const path = "/tmp/ose-grid-proof.png"
                const ok = img.saveToFile(path)
                console.log(ok ? ("GRID_PROOF_OK " + path) : "GRID_PROOF_FAIL")
                Qt.callLater(Qt.quit)
            })
        }
    }
}
