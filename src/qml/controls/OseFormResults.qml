import QtQuick
import QtQuick.Layouts
import OpenSolarEnergy

GridLayout {
    id: root
    columns: width > Ui.formResultsBreakpoint ? 2 : 1
    columnSpacing: Ui.isPhone ? 10 : 16
    rowSpacing: Ui.isPhone ? 10 : 12
    Layout.fillWidth: true

    default property alias form: formCol.data
    property alias results: resultsCol.data

    ColumnLayout {
        id: formCol
        Layout.fillWidth: true
        Layout.preferredWidth: 1
        Layout.alignment: Qt.AlignTop
        spacing: Ui.isPhone ? 10 : 12
    }

    ColumnLayout {
        id: resultsCol
        Layout.fillWidth: true
        Layout.preferredWidth: 1
        Layout.alignment: Qt.AlignTop
        spacing: Ui.isPhone ? 10 : 12
    }
}
