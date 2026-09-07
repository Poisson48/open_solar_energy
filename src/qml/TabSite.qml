import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

Flickable {
    id: root
    contentHeight: col.implicitHeight + 24
    clip: true
    ScrollBar.vertical: ScrollBar {}

    property var points: (Projects.currentProject.siteSurvey && Projects.currentProject.siteSurvey.points) || []
    property var shadeResult: ({})

    function persistAndCompute() {
        let weather = Projects.currentProject.weatherData || []
        if (!weather.length) { Weather.loadDemo(); weather = Weather.weatherData }
        const loc = Projects.currentProject.location || {}
        shadeResult = SiteShade.computeShading(loc.lat || 43.6, points, weather)
        Projects.updateCurrent({
            siteSurvey: {
                points: points,
                compassOffset: Number(compass.text),
                slope: Number(slope.text),
                monthlyLoss: shadeResult.monthly,
                halfHourlyKeep: shadeResult.halfHourlyKeep,
                annualLossPct: shadeResult.annualLossPct
            }
        })
        sunCanvas.requestPaint()
    }

    ColumnLayout {
        id: col
        width: parent.width
        x: 16; y: 16
        spacing: 12

        Label { text: "Site & ombrage"; font.pixelSize: 20; font.weight: Font.DemiBold }

        GridLayout {
            columns: 4
            Layout.fillWidth: true
            Label { text: "Azimut (°N)" }
            TextField { id: azIn; text: "180"; Layout.fillWidth: true }
            Label { text: "Élév. (°)" }
            TextField { id: elIn; text: "20"; Layout.fillWidth: true }
        }

        RowLayout {
            Button {
                text: "Ajouter point horizon"
                onClicked: {
                    let pts = root.points.slice()
                    pts.push({ az: Number(azIn.text), elev: Number(elIn.text), source: "manual" })
                    pts.sort(function (a, b) { return a.az - b.az })
                    root.points = pts
                    root.persistAndCompute()
                }
            }
            Button {
                text: "Effacer"
                flat: true
                onClicked: { root.points = []; root.shadeResult = {}; root.persistAndCompute() }
            }
            Button {
                text: "Recalculer"
                Material.background: Theme.primary
                Material.foreground: "#fff"
                onClicked: root.persistAndCompute()
            }
        }

        GridLayout {
            columns: 2
            Label { text: "Pente (°)" }
            TextField { id: slope; text: String((Projects.currentProject.siteSurvey || {}).slope || 0); Layout.fillWidth: true }
            Label { text: "Offset boussole (°)" }
            TextField { id: compass; text: String((Projects.currentProject.siteSurvey || {}).compassOffset || 0); Layout.fillWidth: true }
        }

        Canvas {
            id: sunCanvas
            Layout.fillWidth: true
            Layout.preferredHeight: 240
            onPaint: {
                const ctx = getContext("2d")
                ctx.reset()
                ctx.fillStyle = Theme.surfaceHigh
                ctx.fillRect(0, 0, width, height)
                ctx.strokeStyle = "#5a7265"
                ctx.beginPath()
                for (let i = 0; i < root.points.length; ++i) {
                    const x = (root.points[i].az / 360) * width
                    const y = height * 0.85 - (root.points[i].elev / 90) * height * 0.7
                    if (i === 0) ctx.moveTo(x, y)
                    else ctx.lineTo(x, y)
                }
                ctx.stroke()
                const loc = Projects.currentProject.location || {}
                const lat = loc.lat || 43.6
                ctx.strokeStyle = Theme.accent
                ctx.beginPath()
                let started = false
                for (let h = 4; h <= 20; h += 0.25) {
                    const s = SiteShade.sunPos(lat, 172, h)
                    if (s.elev <= 0) continue
                    const x = (s.az / 360) * width
                    const y = height * 0.85 - (s.elev / 90) * height * 0.7
                    if (!started) { ctx.moveTo(x, y); started = true }
                    else ctx.lineTo(x, y)
                }
                ctx.stroke()
            }
            Component.onCompleted: requestPaint()
        }

        Label {
            visible: root.shadeResult.annualLossPct !== undefined
            text: "Perte annuelle beam (ombrage) : " + (root.shadeResult.annualLossPct || 0) + " %"
            font.weight: Font.DemiBold
            color: Theme.primary
        }

        SimpleBarChart {
            Layout.fillWidth: true
            Layout.preferredHeight: 100
            visible: !!(root.shadeResult.monthly && root.shadeResult.monthly.length)
            values: {
                const m = root.shadeResult.monthly || []
                let out = []
                for (let i = 0; i < m.length; ++i) out.push((m[i] || 0) * 100)
                return out
            }
            barColor: "#c62828"
        }
    }
}
