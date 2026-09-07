import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

Item {
    id: root
    signal requestHistory()
    signal requestClose()
    signal requestMateriel()
    signal requestShare()

    readonly property var project: Projects.currentProject
    readonly property string installType: project.installType || "grid"

    ColumnLayout {
        anchors.fill: parent
        spacing: 0

        ProjectBar {
            Layout.fillWidth: true
            onRequestHistory: root.requestHistory()
            onRequestClose: root.requestClose()
            onRequestMateriel: root.requestMateriel()
            onRequestShare: root.requestShare()
        }

        TabBarNav {
            Layout.fillWidth: true
            installType: root.installType
        }

        StackLayout {
            Layout.fillWidth: true
            Layout.fillHeight: true
            currentIndex: {
                const tabs = ["location","site","sizing","offgrid","grid","daily","layout","cables","quote","irradiation","optimizer","tracker"]
                const i = tabs.indexOf(AppController.currentTab)
                return i >= 0 ? i : 0
            }

            TabLocation {}
            TabSite {}
            TabSizing {}
            TabOffgrid {}
            TabGrid {}
            TabDaily {}
            TabLayout {}
            TabCables {}
            TabQuote {}
            TabIrradiation {}
            TabOptimizer {}
            TabTracker {}
        }
    }
}
