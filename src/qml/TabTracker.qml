import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import "controls"

OseTabPage {
    id: root
    title: "Suiveur PV"
    subtitle: "Comparaison indicative fixe vs. tracking — pas une simulation horaire de suiveur."
    nextTabId: AppController.nextPrimaryTab()
    nextTabLabel: AppController.tabLabel(AppController.nextPrimaryTab())

    readonly property real baseE: {
        const g = Projects.currentProject.gridResult || {}
        if (g.E_annual) return Number(g.E_annual)
        const s = (Projects.currentProject.sizingResult || {}).best || {}
        if (s.E_annual) return Number(s.E_annual)
        return 0
    }
    readonly property real baseCost: {
        const form = Projects.currentProject.formState || {}
        if (form.systemCost) return Number(form.systemCost)
        const s = (Projects.currentProject.sizingResult || {}).best || {}
        if (s.systemCost) return Number(s.systemCost)
        const p = form.Ppeak || s.Ppeak || 3
        return Number(p) * 1200
    }
    readonly property bool hasProd: baseE > 0

    readonly property var options: [
        {
            id: "fixed",
            name: "Plan fixe optimisé",
            gainMin: 0, gainMax: 0,
            costMin: 0, costMax: 0,
            complexity: "Faible",
            note: "Référence — orientation fixe (tilt / azimut projet)"
        },
        {
            id: "1axis_h",
            name: "Suiveur 1 axe horizontal",
            gainMin: 0.15, gainMax: 0.20,
            costMin: 0.25, costMax: 0.40,
            complexity: "Moyenne",
            note: "Suivi Est–Ouest sur axe N–S"
        },
        {
            id: "1axis_t",
            name: "Suiveur 1 axe incliné",
            gainMin: 0.18, gainMax: 0.25,
            costMin: 0.30, costMax: 0.50,
            complexity: "Moyenne",
            note: "Axe incliné, gain un peu supérieur"
        },
        {
            id: "2axis",
            name: "Suiveur 2 axes",
            gainMin: 0.25, gainMax: 0.40,
            costMin: 0.60, costMax: 1.00,
            complexity: "Élevée",
            note: "Suivi solaire complet — maintenance plus lourde"
        }
    ]

    property string selectedId: "fixed"

    function mid(a, b) { return (a + b) / 2 }

    function persistChoice() {
        const form = Projects.currentProject.formState || {}
        Projects.updateCurrent({
            formState: Object.assign({}, form, { trackerType: selectedId })
        })
        AppController.autoSave("Suiveur — variante " + selectedId)
        AppController.toast("Variante suiveur enregistrée (indicatif)")
    }

    Component.onCompleted: {
        const form = Projects.currentProject.formState || {}
        if (form.trackerType)
            selectedId = form.trackerType
    }

    OseFormResults {
        Layout.fillWidth: true

        OseAlert {
            kind: "warning"
            text: "Aperçu uniquement : pas de simulation heure-par-heure de tracking. "
                  + "Les gains (+15…+40 %) et surcoûts sont des ordres de grandeur bibliographiques, "
                  + "pas un calcul spécifique à votre toiture."
        }

        OseStep {
            step: 1
            title: "Base projet"
            hint: "Production et coût repris du dimensionnement / système PV si disponibles."
            Flow {
                Layout.fillWidth: true
                spacing: 8
                KpiCard {
                    title: "Prod. fixe (réf.)"
                    value: root.hasProd ? (Math.round(root.baseE) + "") : "—"
                    subtitle: root.hasProd ? "kWh/an" : "calculez Dim. / PV"
                    Layout.preferredWidth: 160
                }
                KpiCard {
                    title: "Coût réf."
                    value: root.baseCost > 0 ? (Math.round(root.baseCost) + " €") : "—"
                    subtitle: "investissement"
                    Layout.preferredWidth: 150
                }
            }
            OseBtn {
                visible: !root.hasProd
                text: "Aller au dimensionnement"
                kind: "outline"
                onClicked: AppController.currentTab = "sizing"
            }
        }

        OseStep {
            step: 2
            title: "Comparaison des configurations"
            Repeater {
                model: root.options
                delegate: Rectangle {
                    Layout.fillWidth: true
                    implicitHeight: col.implicitHeight + 20
                    radius: Theme.radius
                    color: root.selectedId === modelData.id ? Theme.primarySubtle : Theme.surface
                    border.color: root.selectedId === modelData.id ? Theme.primary : Theme.outline
                    border.width: root.selectedId === modelData.id ? 2 : 1

                    MouseArea {
                        anchors.fill: parent
                        cursorShape: Qt.PointingHandCursor
                        onClicked: root.selectedId = modelData.id
                    }

                    ColumnLayout {
                        id: col
                        anchors.left: parent.left
                        anchors.right: parent.right
                        anchors.top: parent.top
                        anchors.margins: 12
                        spacing: 6

                        RowLayout {
                            Layout.fillWidth: true
                            Label {
                                Layout.fillWidth: true
                                text: modelData.name
                                font.pixelSize: Theme.fontSizeBody
                                font.weight: Font.DemiBold
                                color: Theme.text
                            }
                            Label {
                                text: modelData.complexity
                                font.pixelSize: Theme.fontSizeCaption
                                color: Theme.textDim
                            }
                        }
                        Label {
                            Layout.fillWidth: true
                            text: modelData.note
                            wrapMode: Text.WordWrap
                            font.pixelSize: Theme.fontSizeCaption
                            color: Theme.textDim
                        }
                        GridLayout {
                            columns: 3
                            Layout.fillWidth: true
                            columnSpacing: 12
                            Label {
                                text: "Gain prod."
                                font.pixelSize: 11
                                color: Theme.textDim
                            }
                            Label {
                                text: "Surcoût"
                                font.pixelSize: 11
                                color: Theme.textDim
                            }
                            Label {
                                text: "Prod. estimée"
                                font.pixelSize: 11
                                color: Theme.textDim
                            }
                            Label {
                                text: modelData.gainMax <= 0
                                      ? "Référence (100 %)"
                                      : ("+" + Math.round(modelData.gainMin * 100)
                                         + " à +" + Math.round(modelData.gainMax * 100) + " %")
                                font.pixelSize: Theme.fontSizeBody
                                font.weight: Font.DemiBold
                                color: Theme.primary
                            }
                            Label {
                                text: modelData.costMax <= 0
                                      ? "—"
                                      : ("+" + Math.round(modelData.costMin * 100)
                                         + " à +" + Math.round(modelData.costMax * 100) + " %")
                                font.pixelSize: Theme.fontSizeBody
                                color: Theme.text
                            }
                            Label {
                                text: {
                                    if (!root.hasProd) return "—"
                                    const g = root.mid(modelData.gainMin, modelData.gainMax)
                                    return Math.round(root.baseE * (1 + g)) + " kWh"
                                }
                                font.pixelSize: Theme.fontSizeBody
                                font.weight: Font.DemiBold
                                color: Theme.text
                            }
                        }
                        Label {
                            visible: root.baseCost > 0 && modelData.costMax > 0
                            Layout.fillWidth: true
                            font.pixelSize: Theme.fontSizeCaption
                            color: Theme.textDim
                            text: {
                                const c = root.mid(modelData.costMin, modelData.costMax)
                                const cost = Math.round(root.baseCost * (1 + c))
                                return "Coût indicatif ~ " + cost + " € (réf. "
                                       + Math.round(root.baseCost) + " € + "
                                       + Math.round(c * 100) + " %)"
                            }
                        }
                    }
                }
            }

            OseBtn {
                text: "Enregistrer la variante sélectionnée"
                kind: "outline"
                onClicked: root.persistChoice()
            }
        }

        OseCard {
            title: "Limites"
            Label {
                Layout.fillWidth: true
                wrapMode: Text.WordWrap
                font.pixelSize: Theme.fontSizeCaption
                color: Theme.textDim
                text: "Une vraie étude de suiveur (PVsyst / SAM) calcule l’angle heure par heure, "
                      + "le backtracking, les ombrages entre rangées et le clipping onduleur. "
                      + "Ici, seuls des ratios bibliographiques sont appliqués à la production fixe du projet."
            }
        }
    }
}
