pragma Singleton
import QtQuick

/**
 * Métriques UI responsive — lier Ui.windowWidth depuis Main.
 * isPhone ≈ téléphone portrait ; isCompact ≈ tablette étroite / split.
 */
QtObject {
    id: root

    property real windowWidth: 1400
    property real windowHeight: 900

    readonly property bool isPhone: windowWidth < 520
    readonly property bool isCompact: windowWidth < 720
    readonly property bool isAndroid: Qt.platform.os === "android"

    readonly property int pageMargin: isPhone ? 10 : 16
    readonly property int formColumns: isPhone ? 1 : 2
    readonly property int formResultsBreakpoint: 600

    /** Hauteurs médias (carte / soleil / scène 3D). */
    readonly property real mapHeight: {
        if (isPhone)
            return Math.min(200, Math.max(160, windowWidth * 0.48))
        if (isCompact)
            return 280
        return 360
    }
    readonly property real locationMapHeight: {
        if (isPhone)
            return Math.min(220, Math.max(170, windowWidth * 0.52))
        return 420
    }
    readonly property real sunDiagramHeight: isPhone ? 240 : (isAndroid ? 320 : 280)
    readonly property real sceneHeight: {
        if (isPhone)
            return Math.min(280, Math.max(220, windowHeight * 0.32))
        if (isCompact)
            return 320
        return 420
    }
    readonly property real chartHeight: isPhone ? 160 : 220
    readonly property real kpiMinWidth: isPhone ? 100 : 140
}
