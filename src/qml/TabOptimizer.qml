import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import "controls"

OseTabPage {
    id: root
    title: "Optimisation tilt × azimut"
    subtitle: "Carte de productible relatif — trouvez l’orientation optimale pour ce site."
    nextTabId: AppController.nextPrimaryTab()
    nextTabLabel: AppController.tabLabel(AppController.nextPrimaryTab())

    property var heat: []
    property var best: ({})
    property bool computed: false

    readonly property var form: Projects.currentProject.formState || ({})
    readonly property real currentTilt: form.tilt !== undefined ? Number(form.tilt) : 30
    readonly property real currentAz: form.azimuth !== undefined ? Number(form.azimuth) : 0

    function run() {
        const weather = Projects.currentProject.weatherData || []
        if (weather.length < 12) {
            AppController.toast("Chargez une météo complète dans Lieu", 3500)
            AppController.currentTab = "location"
            return
        }
        const loc = Projects.currentProject.location || {}
        heat = SolarMath.tiltAzimuthHeatmap(loc.lat || 43.6, weather)
        let b = null
        for (let i = 0; i < heat.length; ++i) {
            const e = Number(heat[i].value !== undefined ? heat[i].value : heat[i].E) || 0
            if (!b || e > (Number(b.value !== undefined ? b.value : b.E) || 0))
                b = heat[i]
        }
        best = b || {}
        computed = heat.length > 0
        heatCanvas.requestPaint()
        if (computed)
            AppController.autoSave("Optimisation tilt/azimut — meilleur "
                                   + (best.tilt || "?") + "° / "
                                   + (best.az !== undefined ? best.az : best.azimuth) + "°")
    }

    function applyBest() {
        if (best.tilt === undefined && best.az === undefined && best.azimuth === undefined)
            return
        const form = Projects.currentProject.formState || {}
        const az = best.az !== undefined ? best.az : best.azimuth
        Projects.updateCurrent({
            formState: Object.assign({}, form, {
                tilt: best.tilt,
                azimuth: az
            })
        })
        AppController.toast("Orientation appliquée : " + best.tilt + "° / az " + az + "°")
        AppController.autoSave("Orientation optimale appliquée "
                               + best.tilt + "° / " + az + "°")
    }

    OseFormResults {
        Layout.fillWidth: true

        OseStep {
            step: 1
            title: "Calcul"
            hint: "Grille tilt 0–90° × azimut −90° (Est) à +90° (Ouest), Sud = 0°."
            OseAlert {
                visible: !(Projects.currentProject.weatherData || []).length
                kind: "warning"
                text: "Météo manquante — chargez Open-Meteo ou PVGIS dans Lieu."
            }
            Label {
                Layout.fillWidth: true
                wrapMode: Text.WordWrap
                font.pixelSize: Theme.fontSizeCaption
                color: Theme.textDim
                text: "Orientation actuelle du projet : tilt "
                      + root.currentTilt + "° · azimut " + root.currentAz + "°"
            }
            RowLayout {
                Layout.fillWidth: true
                OseBtn {
                    text: computed ? "Recalculer" : "Calculer l’optimum"
                    onClicked: root.run()
                }
                OseBtn {
                    text: "Appliquer au projet"
                    kind: "outline"
                    visible: computed && best.tilt !== undefined
                    onClicked: root.applyBest()
                }
            }
        }

        OseCard {
            title: "Meilleure orientation"
            visible: computed && best.tilt !== undefined
            Flow {
                Layout.fillWidth: true
                spacing: 8
                KpiCard {
                    title: "Tilt optimal"
                    value: (best.tilt || 0) + " °"
                    Layout.preferredWidth: 140
                }
                KpiCard {
                    title: "Azimut"
                    value: ((best.az !== undefined ? best.az : best.azimuth) || 0) + " °"
                    subtitle: "0 = Sud"
                    Layout.preferredWidth: 140
                }
                KpiCard {
                    title: "Indice"
                    value: (best.pct || 100) + " %"
                    subtitle: "relatif max"
                    Layout.preferredWidth: 140
                }
                KpiCard {
                    title: "H tilt"
                    value: Math.round(Number(best.value !== undefined ? best.value : best.E) || 0) + ""
                    subtitle: "kWh/m²·an"
                    Layout.preferredWidth: 150
                }
            }
        }

        OseCard {
            title: "Carte de chaleur"
            hint: "Vert clair = meilleur productible. Axes : azimut horizontal, tilt vertical."
            visible: true
            Item {
                Layout.fillWidth: true
                Layout.preferredHeight: 300

                Canvas {
                    id: heatCanvas
                    anchors.fill: parent
                    anchors.leftMargin: 36
                    anchors.bottomMargin: 28
                    anchors.topMargin: 8
                    anchors.rightMargin: 8
                    onPaint: {
                        const ctx = getContext("2d")
                        ctx.reset()
                        ctx.fillStyle = Theme.surfaceHigh.toString()
                        ctx.fillRect(0, 0, width, height)
                        if (!heat.length) {
                            ctx.fillStyle = Theme.textDim.toString()
                            ctx.font = "13px sans-serif"
                            ctx.fillText("Lancez le calcul pour afficher la heatmap", 16, height / 2)
                            return
                        }
                        let minE = 1e99, maxE = 0
                        for (let i = 0; i < heat.length; ++i) {
                            const e = Number(heat[i].value !== undefined ? heat[i].value : heat[i].E) || 0
                            minE = Math.min(minE, e)
                            maxE = Math.max(maxE, e)
                        }
                        const cellW = Math.max(6, (width - 4) / 14)
                        const cellH = Math.max(6, (height - 4) / 11)
                        for (let i = 0; i < heat.length; ++i) {
                            const t = Number(heat[i].tilt) || 0
                            const a = Number(heat[i].az !== undefined ? heat[i].az : heat[i].azimuth) || 0
                            const e = Number(heat[i].value !== undefined ? heat[i].value : heat[i].E) || 0
                            const x = ((a + 90) / 180) * (width - cellW)
                            const y = height - cellH - (t / 90) * (height - cellH)
                            const n = maxE > minE ? (e - minE) / (maxE - minE) : 0.5
                            // primary green scale
                            const r = Math.round(26 + (1 - n) * 180)
                            const g = Math.round(107 + n * 80)
                            const b = Math.round(60 + (1 - n) * 80)
                            ctx.fillStyle = "rgb(" + r + "," + g + "," + b + ")"
                            ctx.fillRect(x, y, cellW - 1, cellH - 1)
                            // mark best
                            if (best && t === best.tilt
                                && a === (best.az !== undefined ? best.az : best.azimuth)) {
                                ctx.strokeStyle = Theme.accent.toString()
                                ctx.lineWidth = 2
                                ctx.strokeRect(x, y, cellW - 1, cellH - 1)
                            }
                        }
                    }
                }

                // Axis labels
                Label {
                    anchors.left: parent.left
                    anchors.verticalCenter: parent.verticalCenter
                    rotation: -90
                    text: "Tilt →"
                    font.pixelSize: 11
                    color: Theme.textDim
                }
                Label {
                    anchors.bottom: parent.bottom
                    anchors.horizontalCenter: parent.horizontalCenter
                    text: "Est (−90°) ← Azimut → Ouest (+90°)   ·  Sud = 0°"
                    font.pixelSize: 11
                    color: Theme.textDim
                }
            }
            RowLayout {
                Layout.fillWidth: true
                Label {
                    text: "Faible"
                    font.pixelSize: 11
                    color: Theme.textDim
                }
                Rectangle {
                    Layout.fillWidth: true
                    Layout.preferredHeight: 10
                    radius: 4
                    gradient: Gradient {
                        orientation: Gradient.Horizontal
                        GradientStop { position: 0; color: "#b8c4bc" }
                        GradientStop { position: 1; color: Theme.primary }
                    }
                }
                Label {
                    text: "Optimal"
                    font.pixelSize: 11
                    color: Theme.textDim
                }
            }
        }

        OseAlert {
            visible: computed
            kind: "info"
            text: "Appliquer met à jour tilt / azimut du projet (Dim., Hors réseau, Implantation, Devis)."
        }
    }

    Component.onCompleted: {
        // Auto-run if weather ready
        if ((Projects.currentProject.weatherData || []).length >= 12)
            Qt.callLater(root.run)
    }
}
