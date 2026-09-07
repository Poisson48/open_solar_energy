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
            text: "Dimensionnement réseau"
            font.pixelSize: 20
            font.weight: Font.DemiBold
        }

        GridLayout {
            columns: 2
            columnSpacing: 12
            rowSpacing: 8
            Layout.fillWidth: true

            Label { text: "Conso annuelle (kWh)" }
            TextField {
                id: annualField
                text: "4500"
                Layout.fillWidth: true
                inputMethodHints: Qt.ImhFormattedNumbersOnly
            }
            Label { text: "Stratégie" }
            ComboBox {
                id: strategyBox
                Layout.fillWidth: true
                model: [
                    { label: "ROI optimal", value: "roi" },
                    { label: "Autoconsommation max", value: "autoconso" },
                    { label: "Couverture cible", value: "coverage" }
                ]
                textRole: "label"
                valueRole: "value"
            }
            Label { text: "Inclinaison (°)" }
            TextField { id: tiltField; text: "30"; Layout.fillWidth: true }
            Label { text: "Azimut (°)" }
            TextField { id: azField; text: "0"; Layout.fillWidth: true }
        }

        RowLayout {
            Button {
                text: "Importer Enedis…"
                onClicked: {
                    const path = AppController.openFileDialog("CSV/TXT (*.csv *.txt *.CSV);;Tous (*.*)")
                    if (!path) return
                    const r = Enedis.parseFile(path)
                    if (r.ok) {
                        annualField.text = String(r.annualKwh)
                        Projects.updateCurrent({ monthlyKwh: r.monthlyKwh })
                    } else {
                        statusLabel.text = r.error || "Import échoué"
                    }
                }
            }
            Button {
                text: "Dimensionner"
                Material.background: Theme.primary
                Material.foreground: "#fff"
                onClicked: {
                    let weather = Projects.currentProject.weatherData || []
                    if (!weather.length) {
                        Weather.loadDemo()
                        weather = Weather.weatherData
                    }
                    let monthly = Projects.currentProject.monthlyKwh || []
                    if (!monthly.length) {
                        const a = Number(annualField.text) || 4500
                        monthly = Array(12).fill(Math.round(a / 12))
                    }
                    const loc = Projects.currentProject.location || {}
                    lastResult = Sizing.run({
                        lat: loc.lat || 43.6,
                        weatherData: weather,
                        monthlyKwh: monthly,
                        tilt: Number(tiltField.text),
                        azimuth: Number(azField.text),
                        strategy: strategyBox.currentValue
                    })
                    Projects.updateCurrent({ sizingResult: lastResult, formState: {
                        tilt: Number(tiltField.text), azimuth: Number(azField.text)
                    }})
                }
            }
        }

        Label { id: statusLabel; color: Theme.textDim }

        RowLayout {
            spacing: 10
            visible: lastResult.best !== undefined && lastResult.best !== null
            KpiCard { title: "Puissance"; value: ((lastResult.best && lastResult.best.Ppeak) || 0) + " kWc" }
            KpiCard { title: "Production"; value: ((lastResult.best && lastResult.best.E_annual) || 0) + " kWh" }
            KpiCard { title: "Couverture"; value: ((lastResult.best && lastResult.best.coverage) || 0) + " %" }
            KpiCard { title: "Payback"; value: (lastResult.best && lastResult.best.payback) ? (lastResult.best.payback + " ans") : "—" }
            KpiCard { title: "Coût"; value: ((lastResult.best && lastResult.best.systemCost) || 0) + " €" }
        }

        SimpleBarChart {
            Layout.fillWidth: true
            Layout.preferredHeight: 140
            visible: !!(lastResult.candidates && lastResult.candidates.length)
            values: {
                const c = lastResult.candidates || []
                // sample every ~5
                let out = []
                for (let i = 0; i < c.length; i += 5)
                    out.push(c[i].savings || 0)
                return out
            }
            barColor: Theme.accent
        }
    }
}
