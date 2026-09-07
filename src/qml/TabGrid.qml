import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

Flickable {
    contentHeight: col.implicitHeight + 24
    clip: true
    ScrollBar.vertical: ScrollBar {}
    property var result: ({})

    ColumnLayout {
        id: col
        width: parent.width
        x: 16; y: 16
        spacing: 12

        Label { text: "Système PV réseau"; font.pixelSize: 20; font.weight: Font.DemiBold }

        GridLayout {
            columns: 2
            columnSpacing: 12
            rowSpacing: 8
            Layout.fillWidth: true
            Label { text: "Puissance (kWc)" }
            TextField { id: pField; text: "3"; Layout.fillWidth: true }
            Label { text: "Inclinaison (°)" }
            TextField { id: tiltField; text: "30"; Layout.fillWidth: true }
            Label { text: "Azimut (°)" }
            TextField { id: azField; text: "0"; Layout.fillWidth: true }
            Label { text: "Pertes (%)" }
            TextField { id: lossField; text: "14"; Layout.fillWidth: true }
            Label { text: "Coût système (€)" }
            TextField { id: costField; text: "3600"; Layout.fillWidth: true }
        }

        Button {
            text: "Calculer"
            Material.background: Theme.primary
            Material.foreground: "#fff"
            onClicked: {
                let weather = Projects.currentProject.weatherData || []
                if (!weather.length) { Weather.loadDemo(); weather = Weather.weatherData }
                const loc = Projects.currentProject.location || {}
                result = SolarMath.gridSystemAnnual({
                    lat: loc.lat || 43.6,
                    weatherData: weather,
                    Ppeak: Number(pField.text),
                    losses: Number(lossField.text),
                    tilt: Number(tiltField.text),
                    azimuth: Number(azField.text),
                    systemCost: Number(costField.text),
                    kwhPrice: 0.25
                })
            }
        }

        RowLayout {
            visible: !!result.E_annual
            spacing: 10
            KpiCard { title: "Production"; value: result.E_annual + " kWh" }
            KpiCard { title: "PR"; value: String(result.PR) }
            KpiCard { title: "LCOE"; value: (result.LCOE || 0).toFixed(3) + " €" }
            KpiCard { title: "Rendement"; value: result.specificYield + " kWh/kWc" }
        }

        SimpleBarChart {
            Layout.fillWidth: true
            Layout.preferredHeight: 140
            visible: !!(result.monthly && result.monthly.length)
            values: {
                const m = result.monthly || []
                let out = []
                for (let i = 0; i < m.length; ++i) out.push(m[i].E_month || 0)
                return out
            }
        }
    }
}
