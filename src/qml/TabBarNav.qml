import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

Rectangle {
    id: root
    property string installType: "grid"
    height: 48
    color: Theme.surfaceHigh

    readonly property var primaryTabs: {
        if (installType === "offgrid")
            return [
                { id: "location", label: "Lieu" },
                { id: "offgrid", label: "Hors réseau" },
                { id: "site", label: "Site" },
                { id: "daily", label: "Analyse" },
                { id: "layout", label: "Implantation" },
                { id: "cables", label: "Câbles" },
                { id: "quote", label: "Devis" }
            ]
        return [
            { id: "location", label: "Lieu" },
            { id: "sizing", label: "Dim." },
            { id: "site", label: "Site" },
            { id: "grid", label: "PV" },
            { id: "daily", label: "Analyse" },
            { id: "layout", label: "Implantation" },
            { id: "cables", label: "Câbles" },
            { id: "quote", label: "Devis" }
        ]
    }

    RowLayout {
        anchors.fill: parent
        anchors.leftMargin: 8
        anchors.rightMargin: 8
        spacing: 4

        Repeater {
            model: root.primaryTabs
            delegate: Button {
                flat: true
                text: modelData.label
                font.pixelSize: 12
                font.weight: AppController.currentTab === modelData.id ? Font.DemiBold : Font.Normal
                Material.foreground: AppController.currentTab === modelData.id ? Theme.primary : Theme.textDim
                onClicked: AppController.currentTab = modelData.id
                background: Rectangle {
                    color: parent.hovered ? "#00000008" : "transparent"
                    radius: 4
                    Rectangle {
                        anchors.bottom: parent.bottom
                        width: parent.width
                        height: 2
                        color: Theme.primary
                        visible: AppController.currentTab === modelData.id
                    }
                }
            }
        }

        Item { Layout.fillWidth: true }

        ToolButton {
            text: "Plus"
            onClicked: moreMenu.open()
            Menu {
                id: moreMenu
                MenuItem { text: "Météo mensuelle"; onTriggered: AppController.currentTab = "irradiation" }
                MenuItem { text: "Optimisation"; onTriggered: AppController.currentTab = "optimizer" }
                MenuItem { text: "Suiveur PV"; onTriggered: AppController.currentTab = "tracker" }
            }
        }
    }
}
