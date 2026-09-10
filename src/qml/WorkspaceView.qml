import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import "controls"

Item {
    id: root
    signal requestHistory()
    signal requestClose()
    signal requestMateriel()
    signal requestShare()
    signal requestEditClient()

    readonly property var project: Projects.currentProject
    readonly property string installType: (project && project.installType) ? project.installType : "grid"
    readonly property bool stale: Projects.currentId.length > 0 && Pipeline.isStale(project)
    readonly property var diagnosis: (stale && Projects.currentId.length)
                                     ? Pipeline.staleDiagnosis(project)
                                     : ({ stale: false, summary: "", actions: [], canRefresh: false })

    readonly property string tab: AppController.currentTab
    readonly property bool onSite: tab === "site"
    readonly property bool onLayout: tab === "layout"
    readonly property bool onHeavy3d: onSite || onLayout

    property bool siteVisited: false
    property bool layoutVisited: false

    onOnSiteChanged: if (onSite) siteVisited = true
    onOnLayoutChanged: if (onLayout) layoutVisited = true
    Component.onCompleted: {
        if (onSite) siteVisited = true
        if (onLayout) layoutVisited = true
    }

    ColumnLayout {
        anchors.fill: parent
        spacing: 0

        ProjectBar {
            Layout.fillWidth: true
            onRequestHistory: root.requestHistory()
            onRequestClose: root.requestClose()
            onRequestMateriel: root.requestMateriel()
            onRequestShare: root.requestShare()
            onRequestEditClient: root.requestEditClient()
            onRequestGotoLocation: AppController.currentTab = "location"
        }

        // Barre globale : TMY / météo / ombrage long
        Rectangle {
            id: globalBusyBar
            Layout.fillWidth: true
            Layout.preferredHeight: visible ? busyCol.implicitHeight + 10 : 0
            visible: Weather.busy || Pvgis.busy || ShadingEngine.computing
            color: Theme.surface
            clip: true

            ColumnLayout {
                id: busyCol
                anchors.left: parent.left
                anchors.right: parent.right
                anchors.top: parent.top
                anchors.margins: 6
                spacing: 4

                ProgressBar {
                    Layout.fillWidth: true
                    from: 0
                    to: 100
                    value: {
                        if (Weather.busy)
                            return Weather.progressPct
                        if (ShadingEngine.computing)
                            return ShadingEngine.computePercent
                        return 0
                    }
                    indeterminate: {
                        if (Weather.busy)
                            return Weather.progressPct <= 0
                        if (ShadingEngine.computing)
                            return ShadingEngine.computePercent <= 0
                        return Pvgis.busy
                    }
                }
                Label {
                    Layout.fillWidth: true
                    wrapMode: Text.WordWrap
                    font.pixelSize: Theme.fontSizeCaption
                    color: Theme.textDim
                    text: {
                        if (Weather.busy)
                            return (Weather.status || "Météo…")
                                   + (Weather.progressPct > 0 ? (" — " + Weather.progressPct + " %") : "")
                        if (ShadingEngine.computing)
                            return (ShadingEngine.computeStatus || "Ombrage…")
                                   + " — " + ShadingEngine.computePercent + " %"
                        if (Pvgis.busy)
                            return Pvgis.status || "PVGIS…"
                        return ""
                    }
                }
            }
        }

        Rectangle {
            Layout.fillWidth: true
            Layout.preferredHeight: visible ? staleCol.implicitHeight + 16 : 0
            visible: root.stale && !!(project.sizingResult || project.offgridResult || project.gridResult)
            color: Theme.warningBg

            ColumnLayout {
                id: staleCol
                anchors.left: parent.left
                anchors.right: parent.right
                anchors.top: parent.top
                anchors.margins: 8
                spacing: 6

                Label {
                    Layout.fillWidth: true
                    wrapMode: Text.WordWrap
                    font.pixelSize: Theme.fontSizeBody
                    font.weight: Font.DemiBold
                    color: Theme.text
                    text: "Résultats périmés"
                }
                Label {
                    Layout.fillWidth: true
                    wrapMode: Text.WordWrap
                    font.pixelSize: Theme.fontSizeCaption
                    color: Theme.text
                    text: root.diagnosis.summary
                          || "Les paramètres ont changé depuis le dernier calcul."
                }
                Flow {
                    Layout.fillWidth: true
                    spacing: 6
                    Repeater {
                        model: root.diagnosis.actions || []
                        OseBtn {
                            required property var modelData
                            text: "Aller à " + (modelData.label || "")
                            kind: "outline"
                            implicitHeight: 28
                            font.pixelSize: Theme.fontSizeCaption
                            leftPadding: 10
                            rightPadding: 10
                            onClicked: AppController.currentTab = modelData.tab
                        }
                    }
                    OseBtn {
                        text: "Mettre à jour les résultats"
                        kind: "primary"
                        implicitHeight: 28
                        font.pixelSize: Theme.fontSizeCaption
                        leftPadding: 12
                        rightPadding: 12
                        enabled: root.diagnosis.canRefresh !== false
                        onClicked: AppController.refreshStaleResults()
                    }
                }
            }
        }

        TabBarNav {
            Layout.fillWidth: true
            installType: root.installType
        }

        Item {
            Layout.fillWidth: true
            Layout.fillHeight: true

            // Onglets légers : un seul à la fois
            Loader {
                anchors.fill: parent
                active: !root.onHeavy3d
                visible: active
                sourceComponent: {
                    switch (root.tab) {
                    case "sizing": return sizingComp
                    case "offgrid": return offgridComp
                    case "grid": return gridComp
                    case "daily": return dailyComp
                    case "cables": return cablesComp
                    case "quote": return quoteComp
                    case "irradiation": return irrComp
                    case "optimizer": return optComp
                    case "tracker": return trackComp
                    default: return locComp
                    }
                }
            }

            // Site / Layout : créés à la première visite, puis gardés (View3D)
            Loader {
                anchors.fill: parent
                active: root.siteVisited
                visible: root.onSite
                sourceComponent: siteComp
            }
            Loader {
                anchors.fill: parent
                active: root.layoutVisited
                visible: root.onLayout
                sourceComponent: layoutComp
            }
        }
    }

    Component { id: locComp; TabLocation {} }
    Component { id: siteComp; TabSite {} }
    Component { id: sizingComp; TabSizing {} }
    Component { id: offgridComp; TabOffgrid {} }
    Component { id: gridComp; TabGrid {} }
    Component { id: dailyComp; TabDaily {} }
    Component { id: layoutComp; TabLayout {} }
    Component { id: cablesComp; TabCables {} }
    Component { id: quoteComp; TabQuote {} }
    Component { id: irrComp; TabIrradiation {} }
    Component { id: optComp; TabOptimizer {} }
    Component { id: trackComp; TabTracker {} }
}
