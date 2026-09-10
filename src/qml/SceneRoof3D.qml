import QtQuick

/** Compat mono-toiture — enveloppe autour de SolarScene3D (sans boucle de sync). */
SolarScene3D {
    id: root

    property real roofW: 10
    property real roofD: 6
    property real tilt: 30
    property real azimuth: 0
    property real panelW: 1.134
    property real panelH: 1.722
    property var panels: []
    property var legacyObstacles: []
    property bool _syncing: false

    property alias selectedIndex: root.selectedPanelIndex

    signal panelsEdited()
    signal selectionChanged(int index)

    editPanels: true
    editObstacles: false
    showPanels: true
    showObstacles: true
    mode: "layout"
    tool: "select"

    function syncFromLegacy() {
        if (_syncing)
            return
        _syncing = true
        const id = (activeRoofId && activeRoofId.length) ? activeRoofId : "roof-1"
        roofs = [{
            id: id,
            name: "Toiture",
            roofW: roofW,
            roofD: roofD,
            tilt: tilt,
            azimuth: azimuth,
            panelW: panelW,
            panelH: panelH,
            positions: panels,
            nPanels: panels ? panels.length : 0
        }]
        activeRoofId = id
        obstacles = legacyObstacles || []
        _syncing = false
    }

    onRoofWChanged: syncFromLegacy()
    onRoofDChanged: syncFromLegacy()
    onTiltChanged: syncFromLegacy()
    onAzimuthChanged: syncFromLegacy()
    onPanelWChanged: syncFromLegacy()
    onPanelHChanged: syncFromLegacy()
    onPanelsChanged: syncFromLegacy()
    onLegacyObstaclesChanged: syncFromLegacy()

    Component.onCompleted: syncFromLegacy()

    function removeSelected() { removeSelectedPanel() }
    function nudgeSelected(dx, dz) { nudgeSelectedPanel(dx, dz) }
    function syncPanelGeometry() { syncFromLegacy() }

    Connections {
        target: root
        function onPanelsEdited(roofId, list) {
            if (root._syncing)
                return
            root._syncing = true
            root.panels = list
            root._syncing = false
            root.panelsEdited()
        }
        function onSelectionChanged() {
            root.selectionChanged(root.selectedPanelIndex)
        }
    }
}
