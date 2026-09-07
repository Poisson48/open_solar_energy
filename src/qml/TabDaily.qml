import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

Flickable {
    contentHeight: col.implicitHeight + 24
    clip: true
    ScrollBar.vertical: ScrollBar {}
    property var result: ({})
    property int month: 6

    ColumnLayout {
        id: col
        width: parent.width
        x: 16; y: 16
        spacing: 12

        Label { text: "Analyse horaire"; font.pixelSize: 20; font.weight: Font.DemiBold }

        GridLayout {
            columns: 2
            Layout.fillWidth: true
            Label { text: "Mois" }
            SpinBox { id: monthBox; from: 1; to: 12; value: 6; onValueChanged: month = value }
            Label { text: "Ppeak (kWc)" }
            TextField { id: pField; text: "3"; Layout.fillWidth: true }
            Label { text: "Conso journalière (kWh)" }
            TextField { id: loadField; text: "12"; Layout.fillWidth: true }
            Label { text: "Batterie (kWh)" }
            TextField { id: battField; text: "0"; Layout.fillWidth: true }
            Label { text: "DoD (%)" }
            TextField { id: dodField; text: "80"; Layout.fillWidth: true }
        }

        Button {
            text: "Simuler la journée type"
            Material.background: Theme.primary
            Material.foreground: "#fff"
            onClicked: {
                let weather = Projects.currentProject.weatherData || []
                if (!weather.length) { Weather.loadDemo(); weather = Weather.weatherData }
                const w = weather[month - 1] || weather[0]
                const loc = Projects.currentProject.location || {}
                const form = Projects.currentProject.formState || {}
                const site = Projects.currentProject.siteSurvey || {}
                result = Hourly.analyzeMonth({
                    lat: loc.lat || 43.6,
                    month: month,
                    GHI: w.GHI, DHI: w.DHI, T_avg: w.T_avg || 15,
                    Ppeak: Number(pField.text),
                    tilt: form.tilt || 30,
                    azimuth: form.azimuth || 0,
                    losses: 14,
                    dailyKwh: Number(loadField.text),
                    battKwh: Number(battField.text),
                    dod: Number(dodField.text),
                    halfHourlyKeep: site.halfHourlyKeep || []
                })
            }
        }

        RowLayout {
            visible: result.pvTotal !== undefined
            spacing: 8
            KpiCard { title: "PV"; value: (result.pvTotal || 0) + " kWh" }
            KpiCard { title: "Charge"; value: (result.loadTotal || 0) + " kWh" }
            KpiCard { title: "Autoconso"; value: (result.autoconsoRate || 0) + " %" }
            KpiCard { title: "Surplus"; value: (result.surplus || 0) + " kWh" }
        }

        Label { text: "Production PV"; font.pixelSize: 12; color: Theme.textDim }
        SimpleBarChart {
            Layout.fillWidth: true
            Layout.preferredHeight: 100
            values: {
                const h = result.hours || []
                let out = []
                for (let i = 0; i < h.length; ++i) out.push(h[i].pv || 0)
                return out
            }
        }
        Label { text: "Consommation"; font.pixelSize: 12; color: Theme.textDim }
        SimpleBarChart {
            Layout.fillWidth: true
            Layout.preferredHeight: 100
            barColor: Theme.accent
            values: {
                const h = result.hours || []
                let out = []
                for (let i = 0; i < h.length; ++i) out.push(h[i].conso || 0)
                return out
            }
        }
        Label { text: "SOC batterie"; font.pixelSize: 12; color: Theme.textDim; visible: Number(battField.text) > 0 }
        SimpleBarChart {
            Layout.fillWidth: true
            Layout.preferredHeight: 80
            visible: Number(battField.text) > 0
            barColor: Theme.primaryLight
            values: {
                const h = result.hours || []
                let out = []
                for (let i = 0; i < h.length; ++i) out.push(h[i].soc || 0)
                return out
            }
        }
    }
}
