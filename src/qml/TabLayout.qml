import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

Flickable {
    contentHeight: col.implicitHeight + 24
    clip: true
    ColumnLayout {
        id: col
        width: parent.width
        x: 16; y: 16
        spacing: 12
        Label { text: "Implantation"; font.pixelSize: 20; font.weight: Font.DemiBold }

        GridLayout {
            columns: 2
            Layout.fillWidth: true
            columnSpacing: 12
            rowSpacing: 8
            Label { text: "Toiture L (m)" }
            TextField { id: roofLen; text: "10"; Layout.fillWidth: true }
            Label { text: "Toiture l (m)" }
            TextField { id: roofWid; text: "6"; Layout.fillWidth: true }
            Label { text: "Panneaux" }
            TextField { id: nPanel; text: "8"; Layout.fillWidth: true }
        }

        Canvas {
            id: layoutCanvas
            Layout.fillWidth: true
            Layout.preferredHeight: 260
            property int cols: Math.max(1, Math.ceil(Math.sqrt(Number(nPanel.text) || 1)))
            property int rows: Math.max(1, Math.ceil((Number(nPanel.text) || 1) / cols))
            onPaint: {
                const ctx = getContext("2d")
                ctx.reset()
                ctx.fillStyle = "#d8e4dc"
                ctx.fillRect(0, 0, width, height)
                const ox = width * 0.15, oy = height * 0.55
                const s = Math.min(width, height) * 0.08
                ctx.fillStyle = Theme.primary
                let n = 0
                const total = Number(nPanel.text) || 0
                for (let r = 0; r < rows; ++r) {
                    for (let c = 0; c < cols; ++c) {
                        if (n >= total) break
                        const x = ox + (c - r) * s * 1.4
                        const y = oy + (c + r) * s * 0.7
                        ctx.beginPath()
                        ctx.moveTo(x, y)
                        ctx.lineTo(x + s, y - s * 0.4)
                        ctx.lineTo(x + s * 0.2, y - s * 0.9)
                        ctx.lineTo(x - s * 0.8, y - s * 0.5)
                        ctx.closePath()
                        ctx.fill()
                        ctx.strokeStyle = "#0f3d24"
                        ctx.stroke()
                        ++n
                    }
                }
            }
            Component.onCompleted: requestPaint()
            Connections {
                target: nPanel
                function onTextChanged() { layoutCanvas.requestPaint() }
            }
        }
    }
}
