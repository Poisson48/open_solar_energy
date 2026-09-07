import QtQuick
import QtQuick.Layouts

GridLayout {
    id: root
    columns: width > 780 ? 2 : 1
    columnSpacing: 16
    rowSpacing: 12
    Layout.fillWidth: true

    default property alias form: formCol.data
    property alias results: resultsCol.data

    ColumnLayout {
        id: formCol
        Layout.fillWidth: true
        Layout.preferredWidth: 1
        Layout.alignment: Qt.AlignTop
        spacing: 12
    }

    ColumnLayout {
        id: resultsCol
        Layout.fillWidth: true
        Layout.preferredWidth: 1
        Layout.alignment: Qt.AlignTop
        spacing: 12
    }
}
