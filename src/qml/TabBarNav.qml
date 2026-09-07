import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import "controls"

Rectangle {
    id: root
    property string installType: "grid"
    // Hauteur auto selon le wrap des onglets
    implicitHeight: tabsFlow.implicitHeight + 8
    height: implicitHeight
    color: Theme.surface

    Rectangle {
        anchors.bottom: parent.bottom
        width: parent.width
        height: 1
        color: Theme.outline
    }

    readonly property var allTabs: {
        const primary = installType === "offgrid"
            ? [
                { id: "location", label: "1 · Lieu et météo" },
                { id: "site", label: "2 · Site et ombrage" },
                { id: "offgrid", label: "3 · Hors réseau" },
                { id: "daily", label: "4 · Analyse horaire" },
                { id: "layout", label: "5 · Implantation" },
                { id: "cables", label: "6 · Câbles" },
                { id: "quote", label: "7 · Devis" }
              ]
            : [
                { id: "location", label: "1 · Lieu et météo" },
                { id: "site", label: "2 · Site et ombrage" },
                { id: "sizing", label: "3 · Dimensionnement" },
                { id: "grid", label: "4 · Système PV" },
                { id: "daily", label: "5 · Analyse horaire" },
                { id: "layout", label: "6 · Implantation" },
                { id: "cables", label: "7 · Câbles" },
                { id: "quote", label: "8 · Devis" }
              ]
        const advanced = [
            { id: "irradiation", label: "Météo mensuelle" },
            { id: "optimizer", label: "Optimisation" },
            { id: "tracker", label: "Suiveur PV" }
        ]
        return primary.concat(advanced)
    }

    Flow {
        id: tabsFlow
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.top: parent.top
        anchors.margins: 4
        spacing: 2

        Repeater {
            model: root.allTabs
            delegate: Button {
                flat: true
                height: 36
                // Largeur selon le texte — jamais tronqué
                implicitWidth: tabLabel.implicitWidth + 20
                onClicked: AppController.currentTab = modelData.id

                contentItem: Text {
                    id: tabLabel
                    text: modelData.label
                    font.pixelSize: 12
                    font.weight: AppController.currentTab === modelData.id ? Font.DemiBold : Font.Normal
                    color: AppController.currentTab === modelData.id ? Theme.primary : Theme.textDim
                    horizontalAlignment: Text.AlignHCenter
                    verticalAlignment: Text.AlignVCenter
                    elide: Text.ElideNone
                    wrapMode: Text.NoWrap
                }
                background: Rectangle {
                    color: parent.hovered ? "#00000008" : "transparent"
                    radius: 4
                    Rectangle {
                        anchors.bottom: parent.bottom
                        anchors.left: parent.left
                        anchors.right: parent.right
                        height: 3
                        radius: 1
                        color: Theme.primary
                        visible: AppController.currentTab === modelData.id
                    }
                }
            }
        }
    }

    Connections {
        target: Projects
        function onCurrentChanged() {
            const flow = AppController.primaryTabFlow()
            let ok = false
            const tabs = root.allTabs
            for (let i = 0; i < tabs.length; ++i) {
                if (tabs[i].id === AppController.currentTab) { ok = true; break }
            }
            if (!ok && flow.length)
                AppController.currentTab = flow[0]
        }
    }
}
