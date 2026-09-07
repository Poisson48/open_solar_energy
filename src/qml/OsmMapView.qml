import QtQuick
import QtQuick.Controls

/**
 * Carte OSM / satellite — zoom continu, pan indépendant du pin.
 */
Item {
    id: root

    property real latitude: 43.6045
    property real longitude: 1.444
    property real viewLat: latitude
    property real viewLon: longitude
    property real zoom: 13
    property bool interactive: true
    property real tileSize: 256
    /** "map" (OSM) ou "sat" (Esri imagerie) */
    property string mapLayer: "map"
    /**
     * "pan" : comportement lieu (défaut).
     * "line" : tracer une ligne toiture (A→B = sens de la pente / face panneaux).
     */
    property string interactionMode: "pan"
    property bool hasLine: false
    property real lineLat1: 0
    property real lineLon1: 0
    property real lineLat2: 0
    property real lineLon2: 0
    property bool showPin: true

    signal locationChanged(real lat, real lon)
    signal zoomChangedByUser(real z)
    signal roofLineChanged(real lat1, real lon1, real lat2, real lon2)

    readonly property int tileZoom: Math.max(0, Math.min(19, Math.floor(zoom)))
    readonly property real zoomScale: Math.pow(2, zoom - tileZoom)

    readonly property var viewTile: AppController.latLonToTileF(viewLat, viewLon, tileZoom)
    readonly property real viewTx: Number(viewTile.x) || 0
    readonly property real viewTy: Number(viewTile.y) || 0
    readonly property var pinTile: AppController.latLonToTileF(latitude, longitude, zoom)
    readonly property var viewTileC: AppController.latLonToTileF(viewLat, viewLon, zoom)
    readonly property real pinTx: Number(pinTile.x) || 0
    readonly property real pinTy: Number(pinTile.y) || 0
    readonly property real viewTxC: Number(viewTileC.x) || 0
    readonly property real viewTyC: Number(viewTileC.y) || 0

    // Grille avant scale : zone visible = size / zoomScale
    property int cols: Math.max(4, Math.ceil((width / Math.max(0.5, zoomScale)) / tileSize) + 3)
    property int rows: Math.max(4, Math.ceil((height / Math.max(0.5, zoomScale)) / tileSize) + 3)
    property int originTx: Math.floor(viewTx - cols / 2)
    property int originTy: Math.floor(viewTy - rows / 2)
    property real offsetX: width / 2 - (viewTx - originTx) * tileSize
    property real offsetY: height / 2 - (viewTy - originTy) * tileSize

    readonly property real markerX: width / 2 + (pinTx - viewTxC) * tileSize
    readonly property real markerY: height / 2 + (pinTy - viewTyC) * tileSize

    property var _blockedFlickable: null
    property bool _savedWheel: true
    property bool _savedInteractive: true

    function recenter() {
        viewLat = latitude
        viewLon = longitude
    }

    function setLocation(lat, lon, alsoRecenter) {
        latitude = lat
        longitude = lon
        if (alsoRecenter !== false)
            recenter()
        locationChanged(lat, lon)
    }

    function screenToLatLon(sx, sy) {
        const wx = viewTxC + (sx - width / 2) / tileSize
        const wy = viewTyC + (sy - height / 2) / tileSize
        return AppController.tileFToLatLon(wx, wy, zoom)
    }

    function latLonToScreen(lat, lon) {
        const t = AppController.latLonToTileF(lat, lon, zoom)
        return {
            x: width / 2 + (Number(t.x) - viewTxC) * tileSize,
            y: height / 2 + (Number(t.y) - viewTyC) * tileSize
        }
    }

    function clearRoofLine() {
        hasLine = false
        lineLat1 = lineLon1 = lineLat2 = lineLon2 = 0
        lineOverlay.requestPaint()
    }

    function setRoofLine(lat1, lon1, lat2, lon2) {
        lineLat1 = lat1; lineLon1 = lon1
        lineLat2 = lat2; lineLon2 = lon2
        hasLine = true
        lineOverlay.requestPaint()
        roofLineChanged(lat1, lon1, lat2, lon2)
    }

    function panView(dx, dy) {
        const ll = AppController.panByPixels(viewLat, viewLon, zoom, dx, dy, tileSize)
        viewLat = ll.lat
        viewLon = ll.lon
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

    function setZoomAround(newZ, anchorX, anchorY) {
        const z = Math.max(3, Math.min(19.5, newZ))
        if (Math.abs(z - zoom) < 0.0001)
            return
        const ax = (anchorX !== undefined && anchorX !== null) ? anchorX : width / 2
        const ay = (anchorY !== undefined && anchorY !== null) ? anchorY : height / 2
        const t = AppController.latLonToTileF(viewLat, viewLon, zoom)
        const worldX = t.x + (ax - width / 2) / tileSize
        const worldY = t.y + (ay - height / 2) / tileSize
        const factor = Math.pow(2, z - zoom)
        const ll = AppController.tileFToLatLon(
            worldX * factor - (ax - width / 2) / tileSize,
            worldY * factor - (ay - height / 2) / tileSize,
            z)
        zoom = z
        viewLat = ll.lat
        viewLon = ll.lon
        zoomChangedByUser(z)
    }

    function zoomBy(delta, anchorX, anchorY) {
        setZoomAround(zoom + delta, anchorX, anchorY)
    }

    function nearPin(sx, sy) {
        return Math.hypot(sx - markerX, sy - (markerY - 10)) < 22
    }

    Rectangle {
        anchors.fill: parent
        radius: 6
        color: root.mapLayer === "sat" ? "#1a1a1a" : "#dfe6e2"
        border.color: Theme.outline
        clip: true

        // Couche tuiles avec scale fluide entre niveaux entiers
        Item {
            id: scaledPane
            anchors.fill: parent
            transform: Scale {
                origin.x: scaledPane.width / 2
                origin.y: scaledPane.height / 2
                xScale: root.zoomScale
                yScale: root.zoomScale
            }

            Item {
                x: root.offsetX
                y: root.offsetY
                width: root.cols * root.tileSize
                height: root.rows * root.tileSize

                Repeater {
                    model: root.cols * root.rows
                    Image {
                        required property int index
                        readonly property int col: index % root.cols
                        readonly property int row: Math.floor(index / root.cols)
                        x: col * root.tileSize
                        y: row * root.tileSize
                        width: root.tileSize
                        height: root.tileSize
                        asynchronous: true
                        cache: true
                        smooth: true
                        mipmap: true
                        source: {
                            const z = root.tileZoom
                            const n = 1 << z
                            let tx = root.originTx + col
                            let ty = root.originTy + row
                            tx = ((tx % n) + n) % n
                            ty = Math.max(0, Math.min(n - 1, ty))
                            return "image://osm/" + root.mapLayer + "/" + z + "/" + tx + "/" + ty
                        }
                    }
                }
            }
        }

        MouseArea {
            id: mapDrag
            anchors.fill: parent
            enabled: root.interactive
            acceptedButtons: Qt.LeftButton
            hoverEnabled: true
            preventStealing: true
            cursorShape: {
                if (root.interactionMode === "line")
                    return pressed ? Qt.CrossCursor : Qt.CrossCursor
                return pressed ? Qt.ClosedHandCursor
                       : (root.nearPin(mouseX, mouseY) ? Qt.PointingHandCursor : Qt.OpenHandCursor)
            }
            property string mode: "pan"
            property real lastX: 0
            property real lastY: 0
            property real pressX: 0
            property real pressY: 0
            property bool moved: false
            property bool drawing: false

            onEntered: root.setAncestorFlickableBlocked(true)
            onExited: { if (!pressed) root.setAncestorFlickableBlocked(false) }
            onPressed: (mouse) => {
                root.setAncestorFlickableBlocked(true)
                lastX = mouse.x; lastY = mouse.y
                pressX = mouse.x; pressY = mouse.y
                moved = false
                drawing = false
                if (root.interactionMode === "line") {
                    mode = "line"
                    drawing = true
                    const ll = root.screenToLatLon(mouse.x, mouse.y)
                    root.lineLat1 = ll.lat
                    root.lineLon1 = ll.lon
                    root.lineLat2 = ll.lat
                    root.lineLon2 = ll.lon
                    root.hasLine = true
                    lineOverlay.requestPaint()
                } else {
                    mode = root.nearPin(mouse.x, mouse.y) ? "pin" : "pan"
                }
            }
            onReleased: (mouse) => {
                if (mode === "line" && drawing) {
                    const ll = root.screenToLatLon(mouse.x, mouse.y)
                    root.lineLat2 = ll.lat
                    root.lineLon2 = ll.lon
                    const dist = Math.hypot(mouse.x - pressX, mouse.y - pressY)
                    if (dist < 12) {
                        root.hasLine = false
                        lineOverlay.requestPaint()
                    } else {
                        root.hasLine = true
                        root.roofLineChanged(root.lineLat1, root.lineLon1,
                                             root.lineLat2, root.lineLon2)
                        lineOverlay.requestPaint()
                    }
                    drawing = false
                }
                if (!containsMouse) root.setAncestorFlickableBlocked(false)
            }
            onCanceled: {
                drawing = false
                root.setAncestorFlickableBlocked(false)
            }
            onPositionChanged: (mouse) => {
                if (!pressed) return
                const dx = mouse.x - lastX
                const dy = mouse.y - lastY
                if (Math.abs(mouse.x - pressX) + Math.abs(mouse.y - pressY) > 5)
                    moved = true
                lastX = mouse.x; lastY = mouse.y
                if (mode === "line") {
                    const ll = root.screenToLatLon(mouse.x, mouse.y)
                    root.lineLat2 = ll.lat
                    root.lineLon2 = ll.lon
                    root.hasLine = true
                    lineOverlay.requestPaint()
                    // recalcul live (azimut / distance) pendant le glisser
                    root.roofLineChanged(root.lineLat1, root.lineLon1,
                                         root.lineLat2, root.lineLon2)
                } else if (mode === "pan") {
                    root.panView(dx, dy)
                } else {
                    const ll = root.screenToLatLon(mouse.x, mouse.y)
                    root.latitude = ll.lat
                    root.longitude = ll.lon
                    root.locationChanged(ll.lat, ll.lon)
                }
            }
            onClicked: (mouse) => {
                if (root.interactionMode === "line") return
                if (moved || mode === "pin") return
                const ll = root.screenToLatLon(mouse.x, mouse.y)
                root.setLocation(ll.lat, ll.lon, false)
            }
        }

        Canvas {
            id: lineOverlay
            anchors.fill: parent
            z: 4
            visible: root.hasLine
            onPaint: {
                const ctx = getContext("2d")
                ctx.reset()
                if (!root.hasLine) return
                const a = root.latLonToScreen(root.lineLat1, root.lineLon1)
                const b = root.latLonToScreen(root.lineLat2, root.lineLon2)
                ctx.strokeStyle = Theme.accent ? String(Theme.accent) : "#f5a623"
                ctx.fillStyle = ctx.strokeStyle
                ctx.lineWidth = 3
                ctx.beginPath()
                ctx.moveTo(a.x, a.y)
                ctx.lineTo(b.x, b.y)
                ctx.stroke()
                // flèche au bout B (sens de la pente / face)
                const ang = Math.atan2(b.y - a.y, b.x - a.x)
                const ah = 14
                ctx.beginPath()
                ctx.moveTo(b.x, b.y)
                ctx.lineTo(b.x - ah * Math.cos(ang - 0.4), b.y - ah * Math.sin(ang - 0.4))
                ctx.lineTo(b.x - ah * Math.cos(ang + 0.4), b.y - ah * Math.sin(ang + 0.4))
                ctx.closePath()
                ctx.fill()
                ctx.beginPath()
                ctx.arc(a.x, a.y, 5, 0, Math.PI * 2)
                ctx.fill()
            }
            Connections {
                target: root
                function onViewLatChanged() { lineOverlay.requestPaint() }
                function onViewLonChanged() { lineOverlay.requestPaint() }
                function onZoomChanged() { lineOverlay.requestPaint() }
                function onWidthChanged() { lineOverlay.requestPaint() }
                function onHeightChanged() { lineOverlay.requestPaint() }
            }
        }

        Item {
            visible: root.showPin && root.interactionMode !== "line"
                     && root.markerX > -30 && root.markerX < root.width + 30
                     && root.markerY > -30 && root.markerY < root.height + 30
            x: root.markerX - 10
            y: root.markerY - 28
            width: 20
            height: 28
            z: 5
            enabled: false
            Canvas {
                anchors.fill: parent
                onPaint: {
                    const ctx = getContext("2d")
                    ctx.reset()
                    ctx.fillStyle = String(Theme.primary)
                    ctx.strokeStyle = "#ffffff"
                    ctx.lineWidth = 2
                    ctx.beginPath()
                    ctx.arc(10, 9, 8, Math.PI * 0.85, Math.PI * 2.15, false)
                    ctx.lineTo(10, 26)
                    ctx.closePath()
                    ctx.fill()
                    ctx.stroke()
                    ctx.fillStyle = "#ffffff"
                    ctx.beginPath()
                    ctx.arc(10, 9, 3.2, 0, Math.PI * 2)
                    ctx.fill()
                }
                Component.onCompleted: requestPaint()
            }
        }

        HoverHandler {
            onHoveredChanged: root.setAncestorFlickableBlocked(hovered || mapDrag.pressed)
        }

        WheelHandler {
            enabled: root.interactive
            acceptedDevices: PointerDevice.Mouse | PointerDevice.TouchPad
            grabPermissions: PointerHandler.CanTakeOverFromAnything
                             | PointerHandler.ApprovesTakeOverByAnything
            onWheel: (event) => {
                event.accepted = true
                root.setAncestorFlickableBlocked(true)
                let dz = 0
                if (event.pixelDelta && (event.pixelDelta.y !== 0 || event.pixelDelta.x !== 0))
                    dz = -event.pixelDelta.y / 180
                else
                    dz = event.angleDelta.y / 400
                // Limite un cran trop violent
                dz = Math.max(-0.35, Math.min(0.35, dz))
                root.setZoomAround(root.zoom + dz, event.x, event.y)
            }
        }

        Component.onDestruction: { _blockedFlickable = null }

        // Contrôles
        Column {
            anchors.right: parent.right
            anchors.top: parent.top
            anchors.margins: 8
            spacing: 4
            z: 6

            Repeater {
                model: [
                    { t: "+", d: 0.6 },
                    { t: "−", d: -0.6 },
                    { t: "◉", d: 0, rec: true }
                ]
                delegate: Rectangle {
                    width: 36; height: 36; radius: 4
                    color: ma.pressed ? "#e9f3ed" : "#ffffff"
                    border.color: "#1a6b3c"
                    border.width: 1.5
                    Text {
                        anchors.centerIn: parent
                        text: modelData.t
                        color: "#1a6b3c"
                        font.pixelSize: modelData.rec ? 14 : 22
                        font.bold: !modelData.rec
                    }
                    MouseArea {
                        id: ma
                        anchors.fill: parent
                        cursorShape: Qt.PointingHandCursor
                        hoverEnabled: true
                        onClicked: {
                            if (modelData.rec) root.recenter()
                            else root.zoomBy(modelData.d)
                        }
                    }
                    ToolTip.visible: !!modelData.rec && ma.containsMouse
                    ToolTip.text: "Recentrer sur le lieu"
                }
            }
        }

        // Plan / Satellite
        Row {
            anchors.left: parent.left
            anchors.top: parent.top
            anchors.margins: 8
            spacing: 4
            z: 6
            Rectangle {
                width: mapLab.implicitWidth + 16
                height: 32
                radius: 4
                color: root.mapLayer === "map" ? "#1a6b3c" : "#ffffff"
                border.color: "#1a6b3c"
                Text {
                    id: mapLab
                    anchors.centerIn: parent
                    text: "Plan"
                    color: root.mapLayer === "map" ? "#ffffff" : "#1a6b3c"
                    font.pixelSize: 12
                    font.weight: Font.DemiBold
                }
                MouseArea {
                    anchors.fill: parent
                    cursorShape: Qt.PointingHandCursor
                    onClicked: root.mapLayer = "map"
                }
            }
            Rectangle {
                width: satLab.implicitWidth + 16
                height: 32
                radius: 4
                color: root.mapLayer === "sat" ? "#1a6b3c" : "#ffffff"
                border.color: "#1a6b3c"
                Text {
                    id: satLab
                    anchors.centerIn: parent
                    text: "Satellite"
                    color: root.mapLayer === "sat" ? "#ffffff" : "#1a6b3c"
                    font.pixelSize: 12
                    font.weight: Font.DemiBold
                }
                MouseArea {
                    anchors.fill: parent
                    cursorShape: Qt.PointingHandCursor
                    onClicked: root.mapLayer = "sat"
                }
            }
        }

        Label {
            anchors.left: parent.left
            anchors.bottom: parent.bottom
            anchors.margins: 8
            z: 6
            text: {
                if (root.interactionMode === "line")
                    return "Tracer A→B = sens de la pente (face panneaux) · Satellite recommandé · z"
                           + root.zoom.toFixed(1)
                return (root.interactive ? "Glisser = carte · Clic = lieu · " : "Lieu validé · ")
                       + "z" + root.zoom.toFixed(1)
            }
            color: root.mapLayer === "sat" ? "#ffffff" : "#16211c"
            font.pixelSize: 11
            padding: 5
            background: Rectangle {
                color: root.mapLayer === "sat" ? "#00000099" : "#fffffff2"
                radius: 3
            }
        }

        Label {
            anchors.right: parent.right
            anchors.bottom: parent.bottom
            anchors.margins: 8
            z: 6
            text: root.mapLayer === "sat" ? "© Esri" : "© OpenStreetMap"
            color: root.mapLayer === "sat" ? "#dddddd" : "#4d5f56"
            font.pixelSize: 10
            padding: 3
            background: Rectangle {
                color: root.mapLayer === "sat" ? "#00000088" : "#ffffffee"
                radius: 2
            }
        }
    }
}
