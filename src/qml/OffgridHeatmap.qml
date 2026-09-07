import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

/**
 * Matrice couverture Ppeak × batterie — style legacy web (échelles + cases cliquables).
 * Vert ≥95 %, orange ≥80 %, rouge &lt;80 %. ★ = recommandation, ✓ = sélection courante.
 */
Item {
    id: root
    property var candidates: []
    property var recommended: ({})
    property var selected: ({})

    signal cellClicked(var candidate)

    readonly property var ppeaks: {
        const c = candidates || []
        const seen = {}
        let out = []
        for (let i = 0; i < c.length; ++i) {
            const p = Number(c[i].Ppeak)
            if (!seen[p]) {
                seen[p] = true
                out.push(p)
            }
        }
        out.sort(function (a, b) { return a - b })
        return out
    }
    readonly property var batts: {
        const c = candidates || []
        const seen = {}
        let out = []
        for (let i = 0; i < c.length; ++i) {
            const b = Number(c[i].battKwh)
            if (!seen[b]) {
                seen[b] = true
                out.push(b)
            }
        }
        out.sort(function (a, b) { return a - b })
        return out
    }

    function lookup(p, b) {
        const c = candidates || []
        for (let i = 0; i < c.length; ++i) {
            if (Number(c[i].Ppeak) === p && Number(c[i].battKwh) === b)
                return c[i]
        }
        return null
    }

    function cellColor(pct) {
        if (pct >= 95) return "#1a6b3c"
        if (pct >= 80) return "#f5a623"
        if (pct >= 60) return "#e67700"
        return "#c62828"
    }

    implicitHeight: col.implicitHeight
    Layout.fillWidth: true

    ColumnLayout {
        id: col
        anchors.left: parent.left
        anchors.right: parent.right
        spacing: 6

        Flickable {
            id: flick
            Layout.fillWidth: true
            Layout.preferredHeight: Math.min(420, gridCol.implicitHeight)
            contentWidth: Math.max(width, gridCol.implicitWidth)
            contentHeight: gridCol.implicitHeight
            clip: true
            boundsBehavior: Flickable.StopAtBounds
            interactive: contentWidth > width || contentHeight > height

            Column {
                id: gridCol
                spacing: 0

                Row {
                    spacing: 0
                    Rectangle {
                        width: 56
                        height: 28
                        color: Theme.surfaceHigh
                        border.color: Theme.outline
                        border.width: 1
                        Label {
                            anchors.centerIn: parent
                            text: "PV \\ Batt"
                            font.pixelSize: 10
                            font.weight: Font.DemiBold
                            color: Theme.textDim
                        }
                    }
                    Repeater {
                        model: root.batts
                        Rectangle {
                            width: 44
                            height: 28
                            color: Theme.surfaceHigh
                            border.color: Theme.outline
                            border.width: 1
                            Label {
                                anchors.centerIn: parent
                                text: modelData + " kWh"
                                font.pixelSize: 9
                                font.weight: Font.DemiBold
                                color: Theme.text
                            }
                        }
                    }
                }

                Repeater {
                    model: root.ppeaks
                    Row {
                        id: pRow
                        property real ppeak: modelData
                        spacing: 0

                        Rectangle {
                            width: 56
                            height: 28
                            color: Theme.surfaceHigh
                            border.color: Theme.outline
                            border.width: 1
                            Label {
                                anchors.centerIn: parent
                                text: pRow.ppeak + " kWc"
                                font.pixelSize: 10
                                font.weight: Font.DemiBold
                                color: Theme.text
                            }
                        }

                        Repeater {
                            model: root.batts
                            Rectangle {
                                id: cell
                                width: 44
                                height: 28
                                property real batt: modelData
                                property var cand: root.lookup(pRow.ppeak, batt)
                                property real pct: cand ? Number(cand.coverage) : -1
                                property bool isRec: {
                                    if (!cand || !recommended) return false
                                    return Number(recommended.Ppeak) === Number(cand.Ppeak)
                                        && Number(recommended.battKwh) === Number(cand.battKwh)
                                }
                                property bool isSel: {
                                    if (!cand || !selected) return false
                                    return Number(selected.Ppeak) === Number(cand.Ppeak)
                                        && Number(selected.battKwh) === Number(cand.battKwh)
                                }

                                color: cand ? root.cellColor(pct) : Theme.surfaceSunken
                                border.color: isSel ? "#ffffff"
                                                    : (isRec ? Theme.accent : "#ffffff66")
                                border.width: (isSel || isRec) ? 2 : 1

                                // Contour recommandé pointillé simulé (double bordure)
                                Rectangle {
                                    anchors.fill: parent
                                    anchors.margins: 2
                                    visible: cell.isRec && cell.isSel
                                    color: "transparent"
                                    border.color: Theme.accent
                                    border.width: 2
                                }

                                Label {
                                    anchors.centerIn: parent
                                    visible: !!cand
                                    text: Math.round(cell.pct) + "%"
                                          + (cell.isRec ? " ★" : (cell.isSel ? " ✓" : ""))
                                    font.pixelSize: 10
                                    font.weight: Font.DemiBold
                                    color: "#ffffff"
                                }

                                MouseArea {
                                    anchors.fill: parent
                                    enabled: !!cand
                                    cursorShape: Qt.PointingHandCursor
                                    onClicked: root.cellClicked(cand)
                                }
                            }
                        }
                    }
                }
            }
        }

        Flow {
            Layout.fillWidth: true
            spacing: 10
            Repeater {
                model: [
                    { c: "#1a6b3c", t: "≥95 %" },
                    { c: "#f5a623", t: "≥80 %" },
                    { c: "#e67700", t: "≥60 %" },
                    { c: "#c62828", t: "<60 %" }
                ]
                Row {
                    spacing: 4
                    Rectangle {
                        width: 12; height: 12; radius: 2
                        color: modelData.c
                        anchors.verticalCenter: parent.verticalCenter
                    }
                    Label {
                        text: modelData.t
                        font.pixelSize: 11
                        color: Theme.textDim
                        anchors.verticalCenter: parent.verticalCenter
                    }
                }
            }
        }
        Label {
            Layout.fillWidth: true
            wrapMode: Text.WordWrap
            font.pixelSize: 11
            color: Theme.textDim
            text: "Cliquez une case pour sélectionner. ★ = recommandation, ✓ = sélection courante."
        }
    }
}
