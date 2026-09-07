import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import "controls"

OseTabPage {
    id: root
    title: "Météo mensuelle"
    subtitle: "Irradiation et température du projet — base de tous les calculs de productible."
    nextTabId: AppController.nextPrimaryTab()
    nextTabLabel: AppController.tabLabel(AppController.nextPrimaryTab())

    readonly property var weather: Projects.currentProject.weatherData || []
    readonly property var weatherMeta: Projects.currentProject.weatherMeta || ({})
    readonly property var location: Projects.currentProject.location || ({})

    readonly property var monthNames: [
        "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
        "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"
    ]

    readonly property real sumGhi: {
        let s = 0
        for (let i = 0; i < weather.length; ++i)
            s += Number(weather[i].GHI) || 0
        return s
    }
    readonly property real sumDhi: {
        let s = 0
        for (let i = 0; i < weather.length; ++i)
            s += Number(weather[i].DHI) || 0
        return s
    }
    readonly property real avgTemp: {
        if (!weather.length) return 0
        let s = 0, n = 0
        for (let i = 0; i < weather.length; ++i) {
            const t = weather[i].T_avg !== undefined ? weather[i].T_avg : weather[i].temp
            if (t !== undefined && t !== null && t !== "") {
                s += Number(t) || 0
                n++
            }
        }
        return n ? s / n : 0
    }
    readonly property var ghiValues: {
        let out = []
        for (let i = 0; i < weather.length; ++i)
            out.push(Number(weather[i].GHI) || 0)
        return out
    }
    readonly property var dhiValues: {
        let out = []
        for (let i = 0; i < weather.length; ++i)
            out.push(Number(weather[i].DHI) || 0)
        return out
    }
    readonly property var tempValues: {
        let out = []
        for (let i = 0; i < weather.length; ++i) {
            const t = weather[i].T_avg !== undefined ? weather[i].T_avg : weather[i].temp
            out.push(Number(t) || 0)
        }
        return out
    }

    OseFormResults {
        Layout.fillWidth: true

        OseStep {
            step: 1
            title: "Source & lieu"
            hint: "Les séries viennent de l’onglet Lieu (Open-Meteo, PVGIS ou démo)."
            OseAlert {
                visible: weather.length < 12
                kind: "warning"
                text: "Aucune météo complète — chargez 12 mois dans Lieu avant de dimensionner."
            }
            Label {
                Layout.fillWidth: true
                wrapMode: Text.WordWrap
                font.pixelSize: Theme.fontSizeBody
                color: Theme.text
                text: {
                    const loc = location.name || "Lieu non défini"
                    const src = weatherMeta.source || "—"
                    const lat = location.lat !== undefined ? Number(location.lat).toFixed(4) : "?"
                    const lon = location.lon !== undefined ? Number(location.lon).toFixed(4) : "?"
                    return loc + " (" + lat + "°, " + lon + "°) · Source : " + src
                }
            }
            RowLayout {
                Layout.fillWidth: true
                OseBtn {
                    text: "Aller à Lieu"
                    kind: "outline"
                    onClicked: AppController.currentTab = "location"
                }
                OseBtn {
                    text: "Export CSV"
                    kind: "outline"
                    enabled: weather.length > 0
                    onClicked: {
                        let csv = "mois,nom,GHI_kWh_m2,DHI_kWh_m2,T_avg_C\n"
                        for (let i = 0; i < weather.length; ++i) {
                            const w = weather[i]
                            const t = w.T_avg !== undefined ? w.T_avg : (w.temp || 0)
                            csv += (i + 1) + ","
                                  + (w.name || root.monthNames[i] || ("M" + (i + 1))) + ","
                                  + (w.GHI || 0) + "," + (w.DHI || 0) + "," + t + "\n"
                        }
                        if (AppController.saveTextFile("irradiation.csv", csv)) {
                            AppController.toast("CSV irradiation enregistré")
                            AppController.autoSave("Export CSV irradiation")
                        }
                    }
                }
            }
        }

        OseStep {
            step: 2
            title: "Synthèse annuelle"
            visible: weather.length > 0
            Flow {
                Layout.fillWidth: true
                spacing: 8
                KpiCard {
                    title: "GHI annuel"
                    value: Math.round(root.sumGhi) + ""
                    subtitle: "kWh/m²"
                    Layout.preferredWidth: 150
                }
                KpiCard {
                    title: "DHI annuel"
                    value: Math.round(root.sumDhi) + ""
                    subtitle: "kWh/m²"
                    Layout.preferredWidth: 150
                }
                KpiCard {
                    title: "T° moyenne"
                    value: root.avgTemp.toFixed(1) + " °C"
                    subtitle: "12 mois"
                    Layout.preferredWidth: 150
                }
                KpiCard {
                    title: "Mois"
                    value: String(weather.length)
                    subtitle: weather.length >= 12 ? "complet" : "incomplet"
                    Layout.preferredWidth: 120
                }
            }
        }

        OseCard {
            title: "Irradiation horizontale (GHI)"
            hint: "Énergie solaire globale horizontale — entrée principale du productible."
            visible: weather.length > 0
            SimpleBarChart {
                Layout.fillWidth: true
                Layout.preferredHeight: 200
                unit: "kWh/m²"
                decimals: 0
                values: root.ghiValues
                barColor: Theme.accent
            }
        }

        OseCard {
            title: "Température moyenne"
            visible: weather.length > 0
            SimpleBarChart {
                Layout.fillWidth: true
                Layout.preferredHeight: 160
                unit: "°C"
                decimals: 1
                values: root.tempValues
                barColor: Theme.primary
            }
        }

        OseCard {
            title: "Tableau mensuel"
            visible: weather.length > 0
            Rectangle {
                Layout.fillWidth: true
                height: 28
                color: Theme.primarySubtle
                radius: Theme.radiusControl
                RowLayout {
                    anchors.fill: parent
                    anchors.leftMargin: 10
                    anchors.rightMargin: 10
                    Label {
                        text: "Mois"
                        font.pixelSize: 11
                        font.weight: Font.DemiBold
                        color: Theme.primary
                        Layout.preferredWidth: 100
                    }
                    Label {
                        text: "GHI"
                        font.pixelSize: 11
                        font.weight: Font.DemiBold
                        color: Theme.primary
                        Layout.fillWidth: true
                        horizontalAlignment: Text.AlignRight
                    }
                    Label {
                        text: "DHI"
                        font.pixelSize: 11
                        font.weight: Font.DemiBold
                        color: Theme.primary
                        Layout.fillWidth: true
                        horizontalAlignment: Text.AlignRight
                    }
                    Label {
                        text: "T°"
                        font.pixelSize: 11
                        font.weight: Font.DemiBold
                        color: Theme.primary
                        Layout.preferredWidth: 56
                        horizontalAlignment: Text.AlignRight
                    }
                }
            }
            Repeater {
                model: weather
                delegate: Rectangle {
                    Layout.fillWidth: true
                    height: 34
                    radius: Theme.radiusControl
                    color: index % 2 ? Theme.surfaceHigh : "transparent"
                    RowLayout {
                        anchors.fill: parent
                        anchors.leftMargin: 10
                        anchors.rightMargin: 10
                        Label {
                            text: modelData.name || root.monthNames[index] || ("M" + (index + 1))
                            Layout.preferredWidth: 100
                            font.pixelSize: Theme.fontSizeBody
                            font.weight: Font.DemiBold
                            color: Theme.text
                        }
                        Label {
                            text: Number(modelData.GHI || 0).toFixed(1)
                            Layout.fillWidth: true
                            horizontalAlignment: Text.AlignRight
                            color: Theme.textDim
                            font.pixelSize: 12
                        }
                        Label {
                            text: Number(modelData.DHI || 0).toFixed(1)
                            Layout.fillWidth: true
                            horizontalAlignment: Text.AlignRight
                            color: Theme.textDim
                            font.pixelSize: 12
                        }
                        Label {
                            text: {
                                const t = modelData.T_avg !== undefined ? modelData.T_avg : modelData.temp
                                return (Number(t) || 0).toFixed(1) + "°"
                            }
                            Layout.preferredWidth: 56
                            horizontalAlignment: Text.AlignRight
                            color: Theme.textDim
                            font.pixelSize: 12
                        }
                    }
                }
            }
        }
    }
}
