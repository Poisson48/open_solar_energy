import QtQuick
import QtQuick.Controls

/**
 * Courbes pertes journée × saison — même style xkcd léger que SimpleBarChart.
 */
Item {
    id: root
    property var summer: []
    property var equinox: []
    property var winter: []
    property string unit: "% perte"
    property real sketchScale: 0.45

    readonly property int nSlots: {
        let n = Math.max(summer.length, equinox.length, winter.length)
        return n > 0 ? n : 48
    }

    readonly property real maxValue: {
        let m = 10
        function scan(arr) {
            for (let i = 0; i < arr.length; ++i)
                m = Math.max(m, Number(arr[i]) || 0)
        }
        scan(summer); scan(equinox); scan(winter)
        if (m <= 10) return 10
        const mag = Math.pow(10, Math.floor(Math.log10(m)))
        const n = m / mag
        let nice = 1
        if (n > 5) nice = 10
        else if (n > 2) nice = 5
        else if (n > 1) nice = 2
        return nice * mag
    }

    function at(arr, i) {
        if (!arr || i >= arr.length) return 0
        return Number(arr[i]) || 0
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
            const along = wob(seed + i * 5 + 9, amp * 0.25)
            ctx.lineTo(px + nx * off + (dx / len) * along,
                       py + ny * off + (dy / len) * along)
        }
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

            const padL = 40
            const padR = 12
            const padT = 28
            const padB = 28
            const plotX = padL
            const plotY = padT
            const plotW = W - padL - padR
            const plotH = H - padT - padB
            const n = root.nSlots
            const ink = root.toColor(Theme.text)
            const dim = root.toColor(Theme.textDim)
            const font = "11px 'Comic Sans MS', 'Chalkboard', 'Segoe Print', cursive"

            if (n < 2) {
                ctx.fillStyle = dim
                ctx.font = "italic 13px 'Comic Sans MS', 'Chalkboard', cursive"
                ctx.fillText("Calculez l’ombrage pour afficher les courbes", plotX, H / 2)
                return
            }

            // Fond papier croqué
            ctx.beginPath()
            root.sketchLine(ctx, plotX - 4, plotY - 4, plotX + plotW + 4, plotY - 4, 7, 0.6)
            root.sketchLine(ctx, plotX + plotW + 4, plotY - 4, plotX + plotW + 4, plotY + plotH + 4, 8, 0.6)
            root.sketchLine(ctx, plotX + plotW + 4, plotY + plotH + 4, plotX - 4, plotY + plotH + 4, 9, 0.6)
            root.sketchLine(ctx, plotX - 4, plotY + plotH + 4, plotX - 4, plotY - 4, 10, 0.6)
            ctx.closePath()
            ctx.fillStyle = Theme.surfaceSunken
            ctx.fill()
            ctx.strokeStyle = Theme.outline
            ctx.lineWidth = 1.2
            ctx.stroke()

            // Grille
            ctx.lineCap = "round"
            ctx.lineJoin = "round"
            for (let g = 0; g <= 4; ++g) {
                const yy = plotY + plotH * (g / 4)
                ctx.beginPath()
                ctx.strokeStyle = Qt.rgba(dim.r, dim.g, dim.b, 0.28)
                ctx.lineWidth = 1
                root.sketchLine(ctx, plotX, yy, plotX + plotW, yy, 40 + g * 11, 0.55)
                ctx.stroke()
                ctx.fillStyle = dim
                ctx.font = font
                ctx.textAlign = "right"
                ctx.fillText(String(Math.round(root.maxValue * (1 - g / 4))), plotX - 6, yy + 3)
            }

            // Axes
            ctx.beginPath()
            ctx.strokeStyle = ink
            ctx.lineWidth = 2
            root.sketchLine(ctx, plotX, plotY, plotX, plotY + plotH, 1, 0.75)
            root.sketchLine(ctx, plotX, plotY + plotH, plotX + plotW, plotY + plotH, 2, 0.75)
            ctx.stroke()

            ctx.fillStyle = dim
            ctx.font = "italic 11px 'Comic Sans MS', 'Chalkboard', cursive"
            ctx.textAlign = "left"
            ctx.fillText(root.unit, plotX + 2, plotY - 8)

            // Heures
            ctx.textAlign = "center"
            const hourMarks = [6, 9, 12, 15, 18]
            for (let hi = 0; hi < hourMarks.length; ++hi) {
                const hour = hourMarks[hi]
                const slot = Math.min(n - 1, Math.round(hour * (n / 24)))
                const x = plotX + (slot / (n - 1)) * plotW
                ctx.beginPath()
                ctx.strokeStyle = Qt.rgba(dim.r, dim.g, dim.b, 0.2)
                ctx.lineWidth = 1
                root.sketchLine(ctx, x, plotY, x, plotY + plotH, 70 + hi, 0.45)
                ctx.stroke()
                ctx.fillStyle = dim
                ctx.font = font
                ctx.fillText(String(hour) + "h", x + root.wob(80 + hi, 0.3),
                             plotY + plotH + 16 + root.wob(90 + hi, 0.25))
            }

            function drawSeries(arr, color, width, seedBase) {
                if (!arr || arr.length < 2) return
                const c = root.toColor(color)
                // Fill croqué
                ctx.beginPath()
                for (let i = 0; i < n; ++i) {
                    const x = plotX + (i / (n - 1)) * plotW + root.wob(seedBase + i, 0.25)
                    const y = plotY + plotH * (1 - root.at(arr, i) / root.maxValue)
                              + root.wob(seedBase + 200 + i, 0.25)
                    if (i === 0) ctx.moveTo(x, y)
                    else ctx.lineTo(x, y)
                }
                ctx.lineTo(plotX + plotW, plotY + plotH)
                ctx.lineTo(plotX, plotY + plotH)
                ctx.closePath()
                ctx.fillStyle = Qt.rgba(c.r, c.g, c.b, 0.10)
                ctx.fill()

                // Trait xkcd segment par segment
                ctx.beginPath()
                ctx.strokeStyle = color
                ctx.lineWidth = width
                ctx.lineJoin = "round"
                ctx.lineCap = "round"
                for (let i = 0; i < n - 1; ++i) {
                    const x0 = plotX + (i / (n - 1)) * plotW
                    const y0 = plotY + plotH * (1 - root.at(arr, i) / root.maxValue)
                    const x1 = plotX + ((i + 1) / (n - 1)) * plotW
                    const y1 = plotY + plotH * (1 - root.at(arr, i + 1) / root.maxValue)
                    root.sketchLine(ctx, x0, y0, x1, y1, seedBase + 400 + i, 0.55)
                }
                ctx.stroke()
            }

            drawSeries(root.winter, "#7a5cff", 2.1, 1000)
            drawSeries(root.equinox, "#5b8def", 2.1, 2000)
            drawSeries(root.summer, "#e8a317", 2.4, 3000)

            // Légende croquée
            const legends = [
                { c: "#e8a317", t: "Été (juin)" },
                { c: "#5b8def", t: "Équinoxe (mars)" },
                { c: "#7a5cff", t: "Hiver (déc.)" }
            ]
            let lx = plotX + 8
            const ly = plotY + 14
            ctx.font = "bold 11px 'Comic Sans MS', 'Chalkboard', cursive"
            for (let i = 0; i < legends.length; ++i) {
                ctx.beginPath()
                ctx.strokeStyle = legends[i].c
                ctx.lineWidth = 2.5
                root.sketchLine(ctx, lx, ly, lx + 16, ly, 900 + i, 0.4)
                ctx.stroke()
                ctx.fillStyle = ink
                ctx.textAlign = "left"
                ctx.fillText(legends[i].t, lx + 20, ly + 3)
                lx += ctx.measureText(legends[i].t).width + 38
            }
        }

        onWidthChanged: requestPaint()
        onHeightChanged: requestPaint()
    }

    onSummerChanged: canvas.requestPaint()
    onEquinoxChanged: canvas.requestPaint()
    onWinterChanged: canvas.requestPaint()
    onMaxValueChanged: canvas.requestPaint()
    onSketchScaleChanged: canvas.requestPaint()
}
