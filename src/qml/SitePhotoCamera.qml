import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import QtMultimedia
import OpenSolarEnergy
import "controls"

/**
 * Mode photo Site : viseur + mire + points horizon en live.
 * Le recalcul d’ombrage est laissé au parent (après Stop).
 */
Item {
    id: root
    visible: active

    property bool active: false
    property var points: []
    property real compassOffset: 0
    property real hFov: 62
    property real vFov: 48
    // Force le recalcul de projection des points à chaque tick capteurs
    property int attitudeTick: 0

    readonly property real liveHeading: {
        void attitudeTick
        if (!DeviceAttitude.hasHeading)
            return NaN
        let h = DeviceAttitude.heading + compassOffset
        while (h < 0) h += 360
        while (h >= 360) h -= 360
        return h
    }
    readonly property real liveElev: {
        void attitudeTick
        return DeviceAttitude.hasElevation ? DeviceAttitude.elevation : NaN
    }

    signal placeRequested(real az, real elev)
    signal stopRequested()

    function syncScreenAngle() {
        // Aligne le repère overlay sur le viseur, quelle que soit l’orientation
        let ang = 0
        try {
            ang = Screen.angleBetween(Qt.PrimaryOrientation, Screen.orientation)
        } catch (e) {
            ang = 0
        }
        DeviceAttitude.screenAngle = ang
    }

    Connections {
        target: DeviceAttitude
        function onAttitudeChanged() { root.attitudeTick++ }
    }

    Connections {
        target: Screen
        function onOrientationChanged() { root.syncScreenAngle() }
    }

    function start() {
        active = true
        syncScreenAngle()
        DeviceAttitude.active = true
        ensureCamera()
        AppController.requestCameraPermission()
        camPoll.start()
    }

    function stop() {
        camPoll.stop()
        camera.active = false
        DeviceAttitude.active = false
        active = false
        stopRequested()
    }

    function ensureCamera() {
        const cams = mediaDevices.videoInputs
        let back = null
        for (let i = 0; i < cams.length; ++i) {
            const d = cams[i]
            const pos = d.position
            // CameraDevice.BackFace === 2 in Qt Multimedia
            if (pos === CameraDevice.BackFace || String(d.description).toLowerCase().indexOf("back") >= 0
                || String(d.description).toLowerCase().indexOf("rear") >= 0
                || String(d.description).toLowerCase().indexOf("arrière") >= 0) {
                back = d
                break
            }
        }
        camera.cameraDevice = back || mediaDevices.defaultVideoInput
        camera.active = true
    }

    function pointScreen(p) {
        void attitudeTick
        if (!DeviceAttitude.hasBasis)
            return null
        let az = Number(p.az) || 0
        // Offset boussole utilisateur = rotation du nord de référence
        az += compassOffset
        while (az < 0) az += 360
        while (az >= 360) az -= 360
        const pt = DeviceAttitude.projectToScreen(az, Number(p.elev) || 0,
                                                  width, height, hFov, vFov)
        if (!pt || pt.x < 0 || pt.y < 0)
            return null
        return pt
    }

    MediaDevices { id: mediaDevices }

    CaptureSession {
        camera: camera
        videoOutput: viewfinder
    }

    Camera {
        id: camera
        active: false
    }

    VideoOutput {
        id: viewfinder
        anchors.fill: parent
        fillMode: VideoOutput.PreserveAspectCrop
    }

    Rectangle {
        anchors.fill: parent
        color: "#000"
        visible: !camera.active
        Label {
            anchors.centerIn: parent
            color: "#ccc"
            text: "Caméra…"
            horizontalAlignment: Text.AlignHCenter
        }
    }

    // Points déjà posés (projection live)
    Repeater {
        model: root.points
        delegate: Item {
            required property var modelData
            required property int index
            readonly property var scr: root.pointScreen(modelData)
            visible: !!scr
            x: scr ? scr.x - 10 : 0
            y: scr ? scr.y - 10 : 0
            width: 20
            height: 20
            Rectangle {
                anchors.centerIn: parent
                width: 14
                height: 14
                radius: 7
                color: (modelData.source === "photo") ? "#66bb6a" : "#42a5f5"
                border.color: "#fff"
                border.width: 2
            }
            Label {
                anchors.horizontalCenter: parent.horizontalCenter
                anchors.top: parent.bottom
                text: "#" + (modelData.id !== undefined ? modelData.id : (index + 1))
                color: "#fff"
                font.pixelSize: 11
                font.bold: true
                style: Text.Outline
                styleColor: "#000"
            }
        }
    }

    // Mire centrale
    Item {
        anchors.centerIn: parent
        width: 44
        height: 44
        Rectangle {
            anchors.fill: parent
            radius: width / 2
            color: "transparent"
            border.color: "#f5a623"
            border.width: 2
        }
        Rectangle {
            anchors.centerIn: parent
            width: 6
            height: 6
            radius: 3
            color: "#f5a623"
        }
        Rectangle {
            anchors.horizontalCenter: parent.horizontalCenter
            anchors.verticalCenter: parent.top
            width: 2
            height: 10
            color: "#f5a623"
        }
        Rectangle {
            anchors.horizontalCenter: parent.horizontalCenter
            anchors.verticalCenter: parent.bottom
            width: 2
            height: 10
            color: "#f5a623"
        }
        Rectangle {
            anchors.verticalCenter: parent.verticalCenter
            anchors.horizontalCenter: parent.left
            width: 10
            height: 2
            color: "#f5a623"
        }
        Rectangle {
            anchors.verticalCenter: parent.verticalCenter
            anchors.horizontalCenter: parent.right
            width: 10
            height: 2
            color: "#f5a623"
        }
    }

    // HUD
    Rectangle {
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.top: parent.top
        anchors.margins: 8
        height: hudCol.implicitHeight + 16
        radius: 8
        color: "#a0000000"
        Column {
            id: hudCol
            anchors.left: parent.left
            anchors.right: parent.right
            anchors.verticalCenter: parent.verticalCenter
            anchors.margins: 10
            spacing: 2
            Label {
                width: parent.width
                horizontalAlignment: Text.AlignHCenter
                color: "#fff"
                font.bold: true
                font.pixelSize: 14
                text: {
                    const h = isNaN(root.liveHeading) ? "—" : (Math.round(root.liveHeading) + "°")
                    const e = isNaN(root.liveElev) ? "—" : (Math.round(root.liveElev) + "°")
                    return "Cap " + h + "  ·  Élév " + e
                }
            }
            Label {
                width: parent.width
                horizontalAlignment: Text.AlignHCenter
                color: "#ccc"
                font.pixelSize: 11
                wrapMode: Text.WordWrap
                text: DeviceAttitude.status || "Visez un obstacle, puis placez le point."
            }
        }
    }

    // Contrôles bas
    Rectangle {
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.bottom: parent.bottom
        height: ctrl.implicitHeight + 20
        color: "#c0000000"
        ColumnLayout {
            id: ctrl
            anchors.left: parent.left
            anchors.right: parent.right
            anchors.verticalCenter: parent.verticalCenter
            anchors.margins: 10
            spacing: 8
            RowLayout {
                Layout.fillWidth: true
                spacing: 8
                Label {
                    text: "Élév. forcée"
                    color: "#ddd"
                    font.pixelSize: 11
                }
                TextField {
                    id: elevOverride
                    Layout.preferredWidth: 72
                    placeholderText: "auto"
                    inputMethodHints: Qt.ImhFormattedNumbersOnly
                    color: "#fff"
                    background: Rectangle { color: "#333"; radius: 4 }
                }
                Item { Layout.fillWidth: true }
            }
            RowLayout {
                Layout.fillWidth: true
                spacing: 8
                OseBtn {
                    Layout.fillWidth: true
                    text: "➕ Placer le point"
                    kind: "primary"
                    onClicked: {
                        let az = root.liveHeading
                        let elev = root.liveElev
                        const ov = elevOverride.text.trim()
                        if (ov !== "" && !isNaN(Number(ov)))
                            elev = Number(ov)
                        if (isNaN(az)) {
                            AppController.toast("Cap indisponible — éloignez le métal / attendez le magnéto.", 4500)
                            return
                        }
                        if (isNaN(elev)) {
                            elev = 0
                            AppController.toast("Élévation indisponible → 0° (horizon). Forcez-la si besoin.", 3500)
                        }
                        root.placeRequested(az, elev)
                        AppController.toast("Point az " + Math.round(az) + "° · élév " + Math.round(elev) + "°", 2500)
                    }
                }
                OseBtn {
                    text: "Stop photo"
                    kind: "outline"
                    onClicked: root.stop()
                }
            }
        }
    }

    Timer {
        id: camPoll
        interval: 400
        repeat: true
        onTriggered: {
            const st = AppController.pollCameraPermission()
            if (st === "granted" || AppController.hasCameraPermission()) {
                if (!camera.active)
                    root.ensureCamera()
            } else if (st === "denied") {
                AppController.toast("Caméra refusée — autorisez-la dans Paramètres → Apps.", 5000)
                camPoll.stop()
            }
        }
    }
}
