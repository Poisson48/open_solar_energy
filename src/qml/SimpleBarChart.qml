import QtQuick
import QtQuick.Controls

Item {
    id: root
    property var values: []
    property color barColor: Theme.primary
    property real maxValue: {
        let m = 1
        for (let i = 0; i < values.length; ++i)
            m = Math.max(m, Number(values[i]) || 0)
        return m
    }

    Row {
        anchors.fill: parent
        spacing: 3
        Repeater {
            model: root.values
            delegate: Rectangle {
                width: Math.max(4, (root.width - (root.values.length - 1) * 3) / Math.max(1, root.values.length))
                height: parent.height
                color: "transparent"
                Rectangle {
                    anchors.bottom: parent.bottom
                    width: parent.width
                    height: Math.max(2, parent.height * ((Number(modelData) || 0) / root.maxValue))
                    color: root.barColor
                    radius: 2
                }
            }
        }
    }
}
