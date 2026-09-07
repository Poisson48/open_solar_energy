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

        Rectangle {
            Layout.fillWidth: true
            Layout.preferredHeight: visible ? staleCol.implicitHeight + 16 : 0
            visible: root.stale && !!(project.sizingResult || project.offgridResult || project.gridResult)
            color: Theme.warningBg
            border.color: "#ffcc80"
            border.width: 0

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

        Loader {
            id: tabLoader
            Layout.fillWidth: true
            Layout.fillHeight: true
            sourceComponent: {
                switch (AppController.currentTab) {
                case "site": return siteComp
                case "sizing": return sizingComp
                case "offgrid": return offgridComp
                case "grid": return gridComp
                case "daily": return dailyComp
                case "layout": return layoutComp
                case "cables": return cablesComp
                case "quote": return quoteComp
                case "irradiation": return irrComp
                case "optimizer": return optComp
                case "tracker": return trackComp
                default: return locComp
                }
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
