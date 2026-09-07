import QtQuick
import QtQuick.Controls

/**
 * Graphique barre style « xkcd » : traits un peu tremblés, hachures,
 * axes croqués — lisible et stable (wobble déterministe par index).
 */
Item {
    id: root
    property var values: []
    property var labels: []
    property color barColor: Theme.primary
    property string unit: ""
    property int decimals: 0
    property bool showValues: true
    property bool showYAxis: true
    property int valueEvery: 0
    property int labelEvery: 0
    property real minScale: 0
    /** Intensité du tremblement (0.35–0.55 = léger xkcd) */
    property real sketchScale: 0.45

    property real maxValue: {
        let m = root.minScale
        for (let i = 0; i < values.length; ++i)
            m = Math.max(m, Number(values[i]) || 0)
        if (m <= 0)
            return 1
        const mag = Math.pow(10, Math.floor(Math.log10(m)))
        const n = m / mag
        let nice = 1
        if (n > 5) nice = 10
        else if (n > 2) nice = 5
        else if (n > 1) nice = 2
        return nice * mag
    }

    readonly property int _valueEvery: {
        if (valueEvery > 0) return valueEvery
        const n = values.length
        if (n > 24) return 4
        if (n > 16) return 2
        return 1
    }
    readonly property int _labelEvery: {
        if (labelEvery > 0) return labelEvery
        const n = values.length
        if (n > 24) return 4
        if (n === 24) return 3
        if (n > 14) return 2
        return 1
    }

    function fmt(v) {
        const n = Number(v) || 0
        if (root.decimals <= 0) {
            if (Math.abs(n) >= 100)
                return String(Math.round(n))
            if (Math.abs(n) >= 10)
                return String(Math.round(n * 10) / 10).replace(/\.0$/, "")
            return String(Math.round(n * 10) / 10)
        }
        return n.toFixed(root.decimals)
    }

    function labelAt(i) {
        if (labels && labels.length > i && labels[i] !== undefined && String(labels[i]).length)
            return String(labels[i])
        const months = ["Jan", "Fév", "Mar", "Avr", "Mai", "Jun",
                        "Jul", "Aoû", "Sep", "Oct", "Nov", "Déc"]
        if (values.length === 12 && i < 12)
            return months[i]
        if (values.length === 24)
            return String(i) + "h"
        return String(i + 1)
    }

    function showValueAt(i) {
        if (!showValues) return false
        if (i === 0 || i === values.length - 1) return true
        return (i % _valueEvery) === 0
    }

    function showLabelAt(i) {
        if (i === 0 || i === values.length - 1) return true
        return (i % _labelEvery) === 0
    }

    function toColor(c) {
        if (c && typeof c === "object" && c.r !== undefined)
            return c
        return Qt.color(c)
    }

    function hash01(n) {
        let x = Math.sin(n * 127.1 + 311.7) * 43758.5453
        return x - Math.floor(x)
    }

    function wob(seed, amp) {
        return (hash01(seed) - 0.5) * 2 * amp * root.sketchScale
    }

    function sketchLine(ctx, x0, y0, x1, y1, seed, amp) {
        const dx = x1 - x0
        const dy = y1 - y0
        const len = Math.hypot(dx, dy)
        if (len < 1) {
            ctx.moveTo(x0, y0)
            ctx.lineTo(x1, y1)
            return
        }
        const steps = Math.max(2, Math.ceil(len / 12))
        const nx = -dy / len
        const ny = dx / len
        ctx.moveTo(x0 + wob(seed, amp * 0.4), y0 + wob(seed + 1, amp * 0.4))
        for (let i = 1; i <= steps; ++i) {
            const t = i / steps
            const px = x0 + dx * t
            const py = y0 + dy * t
            const off = wob(seed + i * 3, amp)
            // Légère variation longitudinale
            const along = wob(seed + i * 5 + 9, amp * 0.25)
            ctx.lineTo(px + nx * off + (dx / len) * along,
                       py + ny * off + (dy / len) * along)
        }
    }

    function sketchRect(ctx, x, y, w, h, seed) {
        const a = 0.7
        const x0 = x + wob(seed, a)
        const y0 = y + wob(seed + 1, a)
        const x1 = x + w + wob(seed + 2, a)
        const y1 = y + wob(seed + 3, a)
        const x2 = x + w + wob(seed + 4, a)
        const y2 = y + h + wob(seed + 5, a)
        const x3 = x + wob(seed + 6, a)
        const y3 = y + h + wob(seed + 7, a)
        ctx.beginPath()
        sketchLine(ctx, x0, y0, x1, y1, seed + 10, a)
        sketchLine(ctx, x1, y1, x2, y2, seed + 20, a)
        sketchLine(ctx, x2, y2, x3, y3, seed + 30, a)
        sketchLine(ctx, x3, y3, x0, y0, seed + 40, a)
        ctx.closePath()
    }

    function hatchBar(ctx, x, y, w, h, seed, colorIn) {
        if (h < 2 || w < 2) return
        const color = root.toColor(colorIn)
        ctx.save()
        sketchRect(ctx, x, y, w, h, seed)
        ctx.fillStyle = Qt.rgba(color.r, color.g, color.b, 0.28)
        ctx.fill()
        ctx.strokeStyle = color
        ctx.lineWidth = 1.5
        ctx.lineJoin = "round"
        ctx.lineCap = "round"
        ctx.stroke()

        // Hachures : clip dans la barre, traits diagonaux complets (pas de clamp cassé)
        ctx.beginPath()
        ctx.rect(x + 0.5, y + 0.5, Math.max(0, w - 1), Math.max(0, h - 1))
        ctx.clip()

        ctx.beginPath()
        ctx.strokeStyle = Qt.rgba(color.r, color.g, color.b, 0.5)
        ctx.lineWidth = 1.05
        const step = Math.max(5, Math.min(9, 5 + w * 0.25))
        let k = 0
        // Diagonales ↗ : (x+t, y+h) → (x+t+h, y)
        for (let t = -h - step; t < w + step; t += step) {
            const ox = wob(seed + 100 + k, 0.4)
            const oy = wob(seed + 200 + k, 0.4)
            sketchLine(ctx,
                       x + t + ox, y + h + oy,
                       x + t + h + ox, y + oy,
                       seed + 500 + k, 0.35)
            k++
        }
        ctx.stroke()
        ctx.restore()
    }

    Canvas {
        id: canvas
        anchors.fill: parent
        renderStrategy: Canvas.Cooperative

        onPaint: {
            const ctx = getContext("2d")
            const W = width
            const H = height
            ctx.reset()
            ctx.clearRect(0, 0, W, H)

            if (!root.values || root.values.length === 0) {
                ctx.fillStyle = Theme.textDim
                ctx.font = "italic 13px 'Comic Sans MS', 'Chalkboard', 'Segoe Print', sans-serif"
                ctx.fillText("Aucune donnée… encore", W * 0.5 - 70, H * 0.5)
                return
            }

            const padL = root.showYAxis ? 40 : 12
            const padR = 12
            const padT = root.unit.length ? 22 : 14
            const padB = 28
            const plotX = padL
            const plotY = padT
            const plotW = W - padL - padR
            const plotH = H - padT - padB
            const n = root.values.length
            const gap = n > 16 ? 3 : (n > 8 ? 5 : 8)
            const barW = Math.max(6, (plotW - gap * (n - 1)) / n)
            const ink = root.toColor(Theme.text)
            const dim = root.toColor(Theme.textDim)

            ctx.lineCap = "round"
            ctx.lineJoin = "round"

            // Fond papier très léger
            ctx.fillStyle = Theme.surfaceSunken
            ctx.beginPath()
            sketchRect(ctx, plotX - 4, plotY - 4, plotW + 8, plotH + 8, 7)
            ctx.fillStyle = Theme.surfaceSunken
            ctx.fill()

            // Grille Y croquée
            ctx.strokeStyle = Qt.rgba(dim.r, dim.g, dim.b, 0.35)
            ctx.lineWidth = 1
            for (let g = 0; g <= 4; ++g) {
                const yy = plotY + plotH * (g / 4)
                ctx.beginPath()
                sketchLine(ctx, plotX, yy, plotX + plotW, yy, 40 + g * 11, 0.8)
                ctx.stroke()
            }

            // Axes
            ctx.strokeStyle = ink
            ctx.lineWidth = 2.1
            ctx.beginPath()
            sketchLine(ctx, plotX, plotY, plotX, plotY + plotH, 1, 0.75)
            sketchLine(ctx, plotX, plotY + plotH, plotX + plotW, plotY + plotH, 2, 0.75)
            ctx.stroke()

            // Petites flèches d’axes
            ctx.beginPath()
            sketchLine(ctx, plotX, plotY, plotX - 4, plotY + 8, 3, 0.35)
            sketchLine(ctx, plotX, plotY, plotX + 4, plotY + 8, 4, 0.35)
            sketchLine(ctx, plotX + plotW, plotY + plotH, plotX + plotW - 8, plotY + plotH - 4, 5, 0.35)
            sketchLine(ctx, plotX + plotW, plotY + plotH, plotX + plotW - 8, plotY + plotH + 4, 6, 0.35)
            ctx.stroke()

            // Unité
            if (root.unit.length) {
                ctx.fillStyle = dim
                ctx.font = "italic 11px 'Comic Sans MS', 'Chalkboard', 'Segoe Print', cursive"
                ctx.fillText(root.unit, plotX + 2, plotY - 6)
            }

            // Graduations Y
            if (root.showYAxis) {
                ctx.fillStyle = dim
                ctx.font = "11px 'Comic Sans MS', 'Chalkboard', 'Segoe Print', cursive"
                ctx.textAlign = "right"
                for (let t = 0; t <= 4; ++t) {
                    const v = root.maxValue * (1 - t / 4)
                    const yy = plotY + plotH * (t / 4) + 3
                    ctx.fillText(root.fmt(v), plotX - 6, yy)
                }
                ctx.textAlign = "left"
            }

            // Barres
            for (let i = 0; i < n; ++i) {
                const v = Number(root.values[i]) || 0
                const bh = Math.max(v > 0 ? 4 : 0, plotH * (v / root.maxValue))
                const bx = plotX + i * (barW + gap)
                const by = plotY + plotH - bh
                hatchBar(ctx, bx, by, barW * 0.88, bh, 1000 + i * 17, root.barColor)

                if (root.showValueAt(i) && v > 0) {
                    ctx.fillStyle = ink
                    ctx.font = "bold 10px 'Comic Sans MS', 'Chalkboard', 'Segoe Print', cursive"
                    ctx.textAlign = "center"
                    const tx = bx + barW * 0.44 + root.wob(2000 + i, 0.35)
                    const ty = by - 4 + root.wob(2100 + i, 0.35)
                    ctx.fillText(root.fmt(v), tx, ty)
                }

                if (root.showLabelAt(i)) {
                    ctx.fillStyle = dim
                    ctx.font = "11px 'Comic Sans MS', 'Chalkboard', 'Segoe Print', cursive"
                    ctx.textAlign = "center"
                    ctx.fillText(root.labelAt(i),
                                 bx + barW * 0.44 + root.wob(2200 + i, 0.3),
                                 plotY + plotH + 16 + root.wob(2300 + i, 0.25))
                }
            }
            ctx.textAlign = "left"
        }

        onWidthChanged: requestPaint()
        onHeightChanged: requestPaint()
    }

    onValuesChanged: canvas.requestPaint()
    onLabelsChanged: canvas.requestPaint()
    onBarColorChanged: canvas.requestPaint()
    onMaxValueChanged: canvas.requestPaint()
    onUnitChanged: canvas.requestPaint()
    onShowValuesChanged: canvas.requestPaint()
    onShowYAxisChanged: canvas.requestPaint()
    onMinScaleChanged: canvas.requestPaint()
    onSketchScaleChanged: canvas.requestPaint()

    // Tooltip discret
    MouseArea {
        anchors.fill: parent
        hoverEnabled: true
        acceptedButtons: Qt.NoButton
        property int hoverIndex: -1
        onPositionChanged: (mouse) => {
            if (!root.values.length) { hoverIndex = -1; return }
            const padL = root.showYAxis ? 40 : 12
            const padR = 12
            const plotW = width - padL - padR
            const n = root.values.length
            const gap = n > 16 ? 3 : (n > 8 ? 5 : 8)
            const barW = Math.max(6, (plotW - gap * (n - 1)) / n)
            const i = Math.floor((mouse.x - padL) / (barW + gap))
            hoverIndex = (i >= 0 && i < n) ? i : -1
        }
        ToolTip.visible: hoverIndex >= 0
        ToolTip.delay: 120
        ToolTip.text: hoverIndex >= 0
            ? (root.labelAt(hoverIndex) + " : " + root.fmt(root.values[hoverIndex])
               + (root.unit.length ? (" " + root.unit) : ""))
            : ""
    }
}
