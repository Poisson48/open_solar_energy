import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import OpenSolarEnergy
import "controls"

Rectangle {
    id: root
    property string installType: "grid"
    implicitHeight: col.implicitHeight + (Ui.isPhone ? 4 : 8)
    height: implicitHeight
    color: Theme.surface

    Rectangle {
        anchors.bottom: parent.bottom
        width: parent.width
        height: 1
        color: Theme.outline
    }

    function shortLabel(id, full) {
        if (!Ui.isPhone)
            return full
        switch (id) {
        case "location": return "Lieu"
        case "site": return "Site"
        case "sizing": return "Dim."
        case "offgrid": return "Offgrid"
        case "grid": return "Système"
        case "daily": return "Analyse"
        case "layout": return "Impl."
        case "cables": return "Câbles"
        case "quote": return "Devis"
        case "irradiation": return "Météo"
        case "optimizer": return "Optim."
        case "tracker": return "Suiveur"
        default: return full
        }
    }

    readonly property var primaryTabs: {
        if (installType === "offgrid")
            return [
                { id: "location", label: "Lieu", n: 1 },
                { id: "site", label: "Site", n: 2 },
                { id: "offgrid", label: "Hors réseau", n: 3 },
                { id: "daily", label: "Analyse", n: 4 },
                { id: "layout", label: "Implantation", n: 5 },
                { id: "cables", label: "Câbles", n: 6 },
                { id: "quote", label: "Devis", n: 7 }
            ]
        return [
            { id: "location", label: "Lieu", n: 1 },
            { id: "site", label: "Site", n: 2 },
            { id: "sizing", label: "Dimensionnement", n: 3 },
            { id: "grid", label: "Système PV", n: 4 },
            { id: "daily", label: "Analyse", n: 5 },
            { id: "layout", label: "Implantation", n: 6 },
            { id: "cables", label: "Câbles", n: 7 },
            { id: "quote", label: "Devis", n: 8 }
        ]
    }
    readonly property var advancedTabs: [
        { id: "irradiation", label: "Météo mensuelle" },
        { id: "optimizer", label: "Optimisation" },
        { id: "tracker", label: "Suiveur PV" }
    ]

    ColumnLayout {
        id: col
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.top: parent.top
        anchors.margins: Ui.isPhone ? 2 : 4
        spacing: 2

        // Une seule rangée scrollable horizontalement
        ListView {
            id: primaryRail
            Layout.fillWidth: true
            Layout.preferredHeight: Ui.isPhone ? 40 : 36
            orientation: ListView.Horizontal
            spacing: 4
            clip: true
            boundsBehavior: Flickable.StopAtBounds
            model: root.primaryTabs
            delegate: Item {
                width: chip.implicitWidth
                height: primaryRail.height
                readonly property bool active: AppController.currentTab === modelData.id
                Rectangle {
                    id: chip
                    anchors.verticalCenter: parent.verticalCenter
                    height: Ui.isPhone ? 36 : 32
                    radius: height / 2
                    color: parent.active ? Theme.primary : "transparent"
                    border.color: parent.active ? Theme.primary : Theme.outline
                    border.width: 1
                    implicitWidth: row.implicitWidth + (Ui.isPhone ? 14 : 16)
                    Row {
                        id: row
                        anchors.centerIn: parent
                        spacing: 4
                        Rectangle {
                            width: 18; height: 18; radius: 9
                            anchors.verticalCenter: parent.verticalCenter
                            color: parent.parent.parent.active ? "#ffffff33" : Theme.primarySubtle
                            Label {
                                anchors.centerIn: parent
                                text: String(modelData.n)
                                font.pixelSize: 10
                                font.weight: Font.Bold
                                color: parent.parent.parent.parent.active ? "#fff" : Theme.primary
                            }
                        }
                        Label {
                            anchors.verticalCenter: parent.verticalCenter
                            text: root.shortLabel(modelData.id, modelData.label)
                            font.pixelSize: Ui.isPhone ? 12 : 12
                            font.weight: parent.parent.parent.active ? Font.DemiBold : Font.Normal
                            color: parent.parent.parent.active ? "#fff" : Theme.text
                        }
                    }
                    MouseArea {
                        anchors.fill: parent
                        onClicked: AppController.currentTab = modelData.id
                    }
                }
            }

            function ensureActiveVisible() {
                for (let i = 0; i < root.primaryTabs.length; ++i) {
                    if (root.primaryTabs[i].id === AppController.currentTab) {
                        primaryRail.positionViewAtIndex(i, ListView.Contain)
                        break
                    }
                }
            }
            Connections {
                target: AppController
                function onCurrentTabChanged() { primaryRail.ensureActiveVisible() }
            }
            Component.onCompleted: ensureActiveVisible()
        }

        ListView {
            Layout.fillWidth: true
            Layout.preferredHeight: 28
            orientation: ListView.Horizontal
            spacing: 2
            clip: true
            model: root.advancedTabs
            delegate: Button {
                flat: true
                height: 28
                implicitWidth: advLab.implicitWidth + 14
                onClicked: AppController.currentTab = modelData.id
                contentItem: Text {
                    id: advLab
                    text: root.shortLabel(modelData.id, modelData.label)
                    font.pixelSize: 11
                    color: AppController.currentTab === modelData.id ? Theme.primary : Theme.textDim
                    font.weight: AppController.currentTab === modelData.id ? Font.DemiBold : Font.Normal
                    horizontalAlignment: Text.AlignHCenter
                    verticalAlignment: Text.AlignVCenter
                }
                background: Rectangle {
                    color: "transparent"
                    Rectangle {
                        anchors.bottom: parent.bottom
                        anchors.left: parent.left
                        anchors.right: parent.right
                        height: 2
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
            const tabs = root.primaryTabs.concat(root.advancedTabs)
            for (let i = 0; i < tabs.length; ++i) {
                if (tabs[i].id === AppController.currentTab) { ok = true; break }
            }
            if (!ok && flow.length)
                AppController.currentTab = flow[0]
        }
    }
}
