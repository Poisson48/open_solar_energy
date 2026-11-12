import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import OpenSolarEnergy
import "controls"

/** Catalogue batteries EVShop embarqué — lecture seule, recherche + détail. */
Dialog {
    id: root
    parent: Overlay.overlay
    anchors.centerIn: parent
    modal: true
    focus: true
    padding: 0
    closePolicy: Popup.CloseOnEscape | Popup.CloseOnPressOutside
    width: Math.min((parent ? parent.width : 1100) - (Ui.isPhone ? 16 : 48), 1120)
    height: Math.min((parent ? parent.height : 760) - (Ui.isPhone ? 24 : 48), 780)

    property string search: ""
    property string selectedId: ""

    readonly property var results: Catalog.searchBatteries(search)
    readonly property var selected: selectedId.length > 0 ? Catalog.getBattery(selectedId) : ({})

    function ensureSelection() {
        if (results.length === 0) {
            selectedId = ""
            return
        }
        for (let i = 0; i < results.length; ++i) {
            if (results[i].id === selectedId)
                return
        }
        selectedId = results[0].id
    }

    function notesText(item) {
        const n = item && item.notes ? item.notes : []
        if (!n || n.length === 0)
            return "—"
        return "• " + n.join("\n• ")
    }

    function sections(item) {
        if (!item || !item.id)
            return []
        return [
            { title: "Chargeur", text: item.charger || "—" },
            { title: "Onduleur / chargeur", text: item.inverter || "—" },
            { title: "BMS", text: item.bms_recommendation || "—" },
            { title: "Protection", text: item.protection || "—" },
            { title: "Verdict", text: item.verdict || "—" },
            { title: "Battery-Emulator", text: item.battery_emulator || "—" }
        ]
    }

    onOpened: {
        search = ""
        searchField.text = ""
        ensureSelection()
    }
    onResultsChanged: ensureSelection()

    background: Rectangle {
        color: Theme.surface
        radius: Theme.radius * 2
        border.color: Theme.outline
    }

    header: null
    footer: null

    contentItem: ColumnLayout {
        spacing: 0
        width: root.availableWidth
        height: root.availableHeight

        RowLayout {
            Layout.fillWidth: true
            Layout.leftMargin: Theme.spaceLg
            Layout.rightMargin: Theme.spaceMd
            Layout.topMargin: Theme.spaceLg
            Layout.bottomMargin: Theme.spaceSm
            spacing: Theme.spaceSm

            Label {
                Layout.fillWidth: true
                text: "Catalogue batteries EVShop"
                color: Theme.text
                font.pixelSize: 18
                font.weight: Font.DemiBold
            }
            Label {
                text: Catalog.catalogBatteryCount + " références"
                color: Theme.textDim
                font.pixelSize: Theme.fontSizeCaption
            }
            OseBtn {
                text: "Fermer"
                kind: "flat"
                implicitHeight: Theme.controlHeightMd
                onClicked: root.close()
            }
        }

        Label {
            Layout.fillWidth: true
            Layout.leftMargin: Theme.spaceLg
            Layout.rightMargin: Theme.spaceLg
            Layout.bottomMargin: Theme.spaceSm
            text: "Prix TTC et stock indicatifs. Vérifier la tension et la configuration sur l'étiquette du pack avant achat."
            color: Theme.textDim
            font.pixelSize: Theme.fontSizeCaption
            wrapMode: Text.WordWrap
        }

        OseTextField {
            id: searchField
            Layout.fillWidth: true
            Layout.leftMargin: Theme.spaceLg
            Layout.rightMargin: Theme.spaceLg
            Layout.bottomMargin: Theme.spaceSm
            hint: "Rechercher (marque, 48 V, 36S, X1, 10 kWh…)"
            onTextChanged: root.search = text
        }

        RowLayout {
            Layout.fillWidth: true
            Layout.fillHeight: true
            Layout.leftMargin: Theme.spaceLg
            Layout.rightMargin: Theme.spaceLg
            Layout.bottomMargin: Theme.spaceLg
            spacing: Theme.spaceMd

            Rectangle {
                Layout.fillHeight: true
                Layout.preferredWidth: Ui.isPhone ? Math.max(132, root.width * 0.38) : Math.max(280, root.width * 0.34)
                color: Theme.surface
                radius: Theme.radius
                border.color: Theme.outline

                ColumnLayout {
                    anchors.fill: parent
                    anchors.margins: 1
                    spacing: 0

                    ListView {
                        id: list
                        Layout.fillWidth: true
                        Layout.fillHeight: true
                        clip: true
                        model: root.results
                        spacing: 0
                        ScrollBar.vertical: ScrollBar { policy: ScrollBar.AsNeeded }

                        delegate: Item {
                            width: ListView.view.width
                            height: 70

                            Rectangle {
                                anchors.fill: parent
                                color: root.selectedId === modelData.id ? Theme.primarySubtle : "transparent"
                            }
                            Rectangle {
                                anchors.left: parent.left
                                anchors.right: parent.right
                                anchors.bottom: parent.bottom
                                height: 1
                                color: Theme.outline
                            }

                            ColumnLayout {
                                anchors.fill: parent
                                anchors.leftMargin: Theme.spaceSm
                                anchors.rightMargin: Theme.spaceSm
                                anchors.topMargin: 6
                                anchors.bottomMargin: 6
                                spacing: 1

                                Label {
                                    Layout.fillWidth: true
                                    text: modelData.name || ""
                                    color: Theme.text
                                    font.pixelSize: Theme.fontSizeBody
                                    font.weight: Font.DemiBold
                                    elide: Text.ElideRight
                                    maximumLineCount: 2
                                    wrapMode: Text.WordWrap
                                }
                                Label {
                                    Layout.fillWidth: true
                                    text: (modelData.family || "") + " · "
                                          + (modelData.energy_kwh || "?") + " kWh · "
                                          + (modelData.voltage_nominal_v || "?") + " V"
                                    color: Theme.textDim
                                    font.pixelSize: Theme.fontSizeCaption
                                    elide: Text.ElideRight
                                }
                                Label {
                                    Layout.fillWidth: true
                                    text: (modelData.price_eur || "?") + " € · "
                                          + (modelData.eur_per_kwh || "?") + " €/kWh · "
                                          + (modelData.stock_status || "")
                                    color: Theme.textDim
                                    font.pixelSize: Theme.fontSizeCaption
                                    elide: Text.ElideRight
                                }
                            }

                            MouseArea {
                                anchors.fill: parent
                                onClicked: root.selectedId = modelData.id
                            }
                        }

                        Label {
                            anchors.centerIn: parent
                            visible: list.count === 0
                            text: "Aucun résultat."
                            color: Theme.textDim
                        }
                    }
                }
            }

            Rectangle {
                Layout.fillWidth: true
                Layout.fillHeight: true
                color: Theme.surface
                radius: Theme.radius
                border.color: Theme.outline

                Flickable {
                    anchors.fill: parent
                    anchors.margins: Theme.spaceMd
                    clip: true
                    contentWidth: width
                    contentHeight: detail.implicitHeight
                    ScrollBar.vertical: ScrollBar { policy: ScrollBar.AsNeeded }

                    Column {
                        id: detail
                        width: parent.width
                        spacing: Theme.spaceSm

                        Label {
                            width: parent.width
                            visible: !root.selected || !root.selected.id
                            text: "Sélectionnez une batterie."
                            color: Theme.textDim
                            font.pixelSize: Theme.fontSizeBody
                            wrapMode: Text.WordWrap
                        }

                        Label {
                            width: parent.width
                            visible: root.selected && !!root.selected.id
                            text: root.selected.name || ""
                            color: Theme.text
                            font.pixelSize: Theme.fontSizeCardTitle
                            font.weight: Font.DemiBold
                            wrapMode: Text.WordWrap
                        }

                        Label {
                            width: parent.width
                            visible: root.selected && !!root.selected.id
                            text: (root.selected.brand || "") + " · "
                                  + (root.selected.family || "") + " · "
                                  + (root.selected.form || "")
                            color: Theme.textDim
                            font.pixelSize: Theme.fontSizeCaption
                            wrapMode: Text.WordWrap
                        }

                        Label {
                            width: parent.width
                            visible: root.selected && !!root.selected.id
                            text: (root.selected.price_eur || "?") + " € · "
                                  + (root.selected.energy_kwh || "?") + " kWh · "
                                  + (root.selected.eur_per_kwh || "?") + " €/kWh · "
                                  + (root.selected.stock_status || "")
                            color: Theme.primary
                            font.pixelSize: Theme.fontSizeBody
                            font.weight: Font.DemiBold
                            wrapMode: Text.WordWrap
                        }

                        GridLayout {
                            width: parent.width
                            visible: root.selected && !!root.selected.id
                            columns: 2
                            columnSpacing: Theme.spaceSm
                            rowSpacing: 4

                            Label { text: "Tension"; color: Theme.textDim; font.pixelSize: Theme.fontSizeCaption }
                            Label {
                                Layout.fillWidth: true
                                text: (root.selected.voltage_nominal_v || "—") + " V"
                                      + (root.selected.voltage_min_v && root.selected.voltage_max_v
                                         ? " (" + root.selected.voltage_min_v + "–" + root.selected.voltage_max_v + " V)"
                                         : "")
                                color: Theme.text
                                font.pixelSize: Theme.fontSizeCaption
                                wrapMode: Text.WordWrap
                            }
                            Label { text: "Configuration"; color: Theme.textDim; font.pixelSize: Theme.fontSizeCaption }
                            Label {
                                Layout.fillWidth: true
                                text: root.selected.configuration || "—"
                                color: Theme.text
                                font.pixelSize: Theme.fontSizeCaption
                                wrapMode: Text.WordWrap
                            }
                            Label { text: "Capacité"; color: Theme.textDim; font.pixelSize: Theme.fontSizeCaption }
                            Label {
                                Layout.fillWidth: true
                                text: (root.selected.capacity_ah || "—") + " Ah"
                                color: Theme.text
                                font.pixelSize: Theme.fontSizeCaption
                            }
                            Label { text: "Masse"; color: Theme.textDim; font.pixelSize: Theme.fontSizeCaption }
                            Label {
                                Layout.fillWidth: true
                                text: (root.selected.mass_kg || "—") + " kg"
                                color: Theme.text
                                font.pixelSize: Theme.fontSizeCaption
                            }
                            Label { text: "Chimie"; color: Theme.textDim; font.pixelSize: Theme.fontSizeCaption }
                            Label {
                                Layout.fillWidth: true
                                text: root.selected.chemistry || "—"
                                color: Theme.text
                                font.pixelSize: Theme.fontSizeCaption
                            }
                            Label { text: "Démontable"; color: Theme.textDim; font.pixelSize: Theme.fontSizeCaption }
                            Label {
                                Layout.fillWidth: true
                                text: root.selected.removable || "—"
                                color: Theme.text
                                font.pixelSize: Theme.fontSizeCaption
                            }
                        }

                        Repeater {
                            model: root.sections(root.selected)
                            delegate: Column {
                                width: detail.width
                                spacing: 2
                                Label {
                                    text: modelData.title
                                    color: Theme.text
                                    font.pixelSize: Theme.fontSizeBody
                                    font.weight: Font.DemiBold
                                }
                                Label {
                                    width: parent.width
                                    text: modelData.text
                                    color: Theme.textDim
                                    font.pixelSize: Theme.fontSizeCaption
                                    wrapMode: Text.WordWrap
                                }
                            }
                        }

                        Column {
                            width: parent.width
                            spacing: 2
                            visible: root.selected && !!root.selected.id
                            Label {
                                text: "Notes"
                                color: Theme.text
                                font.pixelSize: Theme.fontSizeBody
                                font.weight: Font.DemiBold
                            }
                            Label {
                                width: parent.width
                                text: root.notesText(root.selected)
                                color: Theme.textDim
                                font.pixelSize: Theme.fontSizeCaption
                                wrapMode: Text.WordWrap
                            }
                        }

                        OseBtn {
                            visible: root.selected && !!root.selected.url
                            text: "Ouvrir la fiche EVShop"
                            kind: "outline"
                            onClicked: Qt.openUrlExternally(root.selected.url)
                        }
                    }
                }
            }
        }
    }
}
