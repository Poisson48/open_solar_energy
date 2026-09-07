import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

Flickable {
    contentHeight: col.implicitHeight + 24
    clip: true
    ScrollBar.vertical: ScrollBar {}
    property var lastResult: ({})

    ColumnLayout {
        id: col
        width: parent.width
        x: 16; y: 16
        spacing: 12

        Label {
            text: "Hors réseau"
            font.pixelSize: 20
            font.weight: Font.DemiBold
        }

        GridLayout {
            columns: 2
            columnSpacing: 12
            rowSpacing: 8
            Layout.fillWidth: true
            Label { text: "Conso journalière (Wh)" }
            TextField { id: dailyField; text: "8000"; Layout.fillWidth: true }
            Label { text: "DoD batterie (%)" }
            TextField { id: dodField; text: "80"; Layout.fillWidth: true }
            Label { text: "Couverture cible (%)" }
            TextField { id: covField; text: "95"; Layout.fillWidth: true }
        }

        Button {
            text: "Optimiser Ppeak × batterie"
            Material.background: Theme.primary
            Material.foreground: "#fff"
            onClicked: {
                let weather = Projects.currentProject.weatherData || []
                if (!weather.length) {
                    Weather.loadDemo()
                    weather = Weather.weatherData
                }
                const loc = Projects.currentProject.location || {}
                lastResult = Offgrid.run({
                    lat: loc.lat || 43.6,
                    weatherData: weather,
                    dailyConsumptionWh: Number(dailyField.text),
                    dod: Number(dodField.text),
                    coverageTarget: Number(covField.text)
                })
                Projects.updateCurrent({ offgridResult: lastResult })
            }
        }

        RowLayout {
            visible: lastResult.best !== undefined && lastResult.best !== null
            spacing: 10
            KpiCard { title: "PV"; value: ((lastResult.best && lastResult.best.Ppeak) || 0) + " kWc" }
            KpiCard { title: "Batterie"; value: ((lastResult.best && lastResult.best.battKwh) || 0) + " kWh" }
            KpiCard { title: "Couverture"; value: Math.round((lastResult.best && lastResult.best.coverage) || 0) + " %" }
            KpiCard { title: "Coût"; value: ((lastResult.best && lastResult.best.cost) || 0) + " €" }
        }

        SimpleBarChart {
            Layout.fillWidth: true
            Layout.preferredHeight: 120
            visible: !!(lastResult.best && lastResult.best.monthly)
            values: {
                const m = (lastResult.best && lastResult.best.monthly) || []
                let out = []
                for (let i = 0; i < m.length; ++i)
                    out.push(m[i].coverageRatio || 0)
                return out
            }
        }
    }
}
