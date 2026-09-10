import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import OpenSolarEnergy

Button {
    id: root
    property string kind: "primary" // primary | accent | outline | flat
    flat: kind === "flat" || kind === "outline" || kind === "accent"
    font.pixelSize: Theme.fontSizeBody
    font.weight: Font.DemiBold
    implicitHeight: Qt.platform.os === "android" ? Theme.touchTarget : Theme.controlHeightMd
    padding: Ui.isPhone ? 10 : 12
    leftPadding: Ui.isPhone ? 12 : 16
    rightPadding: Ui.isPhone ? 12 : 16

    contentItem: Text {
        text: root.text
        font: root.font
        opacity: root.enabled ? 1 : 0.45
        color: {
            if (root.kind === "accent")
                return Theme.accent
            if (root.kind === "outline" || root.kind === "flat")
                return Theme.primary
            return "#ffffff"
        }
        horizontalAlignment: Text.AlignHCenter
        verticalAlignment: Text.AlignVCenter
    }

    background: Rectangle {
        implicitHeight: root.implicitHeight
        radius: Theme.radiusControl
        border.width: (root.kind === "outline" || root.kind === "accent") ? 1 : 0
        border.color: root.kind === "accent" ? Theme.accent : Theme.primary
        color: {
            if (!root.enabled) return Theme.surfaceHigh
            if (root.kind === "flat") return root.hovered ? "#00000008" : "transparent"
            if (root.kind === "outline") return root.hovered ? Theme.primarySubtle : Theme.surface
            if (root.kind === "accent") return root.hovered ? Theme.warningBg : Theme.surface
            if (root.down) return Theme.primaryActive
            return root.hovered ? Theme.primaryHover : Theme.primary
        }
    }
}
