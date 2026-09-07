import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

Flickable {
    contentHeight: col.implicitHeight + 24
    clip: true

    ColumnLayout {
        id: col
        width: parent.width
        x: 16; y: 16
        spacing: 12

        Label { text: "Suiveur PV"; font.pixelSize: 20; font.weight: Font.DemiBold }
        Label {
            Layout.fillWidth: true
            wrapMode: Text.WordWrap
            color: Theme.textDim
            text: "Comparaison fixe / 1 axe / 2 axes (approximation via heatmaps d’irradiation)."
        }

        property var comparison: {
            let weather = Projects.currentProject.weatherData || []
            if (!weather.length) return []
            const loc = Projects.currentProject.location || {}
            const lat = loc.lat || 43.6
            const fixed = SolarMath.optimalTilt(lat, weather, true)
            // 1-axe approx: meilleur tilt, azimut balayé → +15 %
            // 2-axes approx: +25 % vs fixe optimal
            return [
                { name: "Fixe optimal", yield: Math.round(fixed.total), note: fixed.tilt + "° / " + fixed.azimuth + "°" },
                { name: "1 axe (azimut)", yield: Math.round(fixed.total * 1.15), note: "+15 % typique" },
                { name: "2 axes", yield: Math.round(fixed.total * 1.25), note: "+25 % typique" }
            ]
        }

        Repeater {
            model: col.comparison
            delegate: Rectangle {
                Layout.fillWidth: true
                height: 64
                radius: Theme.radius
                color: Theme.surfaceHigh
                RowLayout {
                    anchors.fill: parent
                    anchors.margins: 12
                    ColumnLayout {
                        Layout.fillWidth: true
                        Label { text: modelData.name; font.weight: Font.DemiBold }
                        Label { text: modelData.note; color: Theme.textDim; font.pixelSize: 12 }
                    }
                    Label {
                        text: modelData.yield + " kWh/m²"
                        color: Theme.primary
                        font.pixelSize: 16
                        font.weight: Font.DemiBold
                    }
                }
            }
        }

        Button {
            text: "Charger météo démo si vide"
            flat: true
            onClicked: {
                if (!(Projects.currentProject.weatherData || []).length) {
                    Weather.loadDemo()
                    Projects.updateCurrent({ weatherData: Weather.weatherData })
                }
            }
        }
    }
}
