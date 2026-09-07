import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

Flickable {
    contentHeight: col.implicitHeight + 24
    clip: true
    property var heat: []

    ColumnLayout {
        id: col
        width: parent.width
        x: 16; y: 16
        spacing: 12
        Label { text: "Optimisation tilt / azimut"; font.pixelSize: 20; font.weight: Font.DemiBold }

        Button {
            text: "Calculer heatmap"
            Material.background: Theme.primary
            Material.foreground: "#fff"
            onClicked: {
                let weather = Projects.currentProject.weatherData || []
                if (!weather.length) { Weather.loadDemo(); weather = Weather.weatherData }
                const loc = Projects.currentProject.location || {}
                heat = SolarMath.tiltAzimuthHeatmap(loc.lat || 43.6, weather)
                const best = SolarMath.optimalTilt(loc.lat || 43.6, weather, true)
                bestLabel.text = "Optimal : tilt " + best.tilt + "° · azimut " + best.azimuth
                                + "° · " + Math.round(best.total) + " kWh/m²"
            }
        }

        Label { id: bestLabel; color: Theme.primary; font.weight: Font.DemiBold }

        Grid {
            columns: 13
            spacing: 2
            Layout.fillWidth: true
            Repeater {
                model: heat
                delegate: Rectangle {
                    width: 22
                    height: 18
                    color: Qt.rgba(0.1, 0.42, 0.24, 0.15 + (modelData.pct || 0) / 100 * 0.85)
                    ToolTip.visible: ma.containsMouse
                    ToolTip.text: modelData.tilt + "° / " + modelData.az + "° → " + modelData.value
                    MouseArea { id: ma; anchors.fill: parent; hoverEnabled: true }
                }
            }
        }
    }
}
