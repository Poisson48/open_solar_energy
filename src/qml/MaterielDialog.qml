import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import OpenSolarEnergy
import "controls"

/** Bibliothèque matériel — structure web, chrome Theme / OseDialog. */
Dialog {
    id: root
    parent: Overlay.overlay
    anchors.centerIn: parent
    modal: true
    focus: true
    padding: 0
    margins: 16
    closePolicy: Popup.CloseOnEscape | Popup.CloseOnPressOutside
    width: Math.min(Overlay.overlay ? Overlay.overlay.width - 32 : 920, 920)
    height: Math.min(Overlay.overlay ? Overlay.overlay.height - 40 : 720, 720)

    property int tab: 0
    property string search: ""
    property string editingId: ""

    readonly property int totalPanels: Catalog.catalogPanelCount + Catalog.userPanelCount
    readonly property int totalInverters: Catalog.catalogInverterCount + Catalog.userInverterCount
    readonly property var filtered: tab === 0 ? Catalog.searchPanels(search)
                                              : Catalog.searchInverters(search)

    background: Rectangle {
        color: Theme.surface
        radius: Theme.radius * 2
        border.color: Theme.outline
    }

    header: null
    footer: null

    onOpened: {
        search = ""
        searchField.text = ""
        editingId = ""
        clearForm()
    }

    function clearForm() {
        editingId = ""
        if (tab === 0) {
            pModel.text = ""; pFab.text = ""; pWp.text = ""
            pL.text = ""; pH.text = ""; pM2.text = ""
            pVoc.text = ""; pIsc.text = ""; pVmp.text = ""; pImp.text = ""
            pBifacial.checked = false; pNotes.text = ""
            pTech.currentIndex = 0
        } else {
            iBrand.text = ""; iModel.text = ""; iPac.text = ""
            iMppt.text = "2"; iMaxV.text = ""; iMaxI.text = ""
            iType.currentIndex = 0; iPhase.currentIndex = 0
            iNotes.text = ""
        }
    }

    function loadForm(item) {
        if (!item || !item.id) {
            clearForm()
            return
        }
        editingId = item.id
        if (tab === 0) {
            pModel.text = item.model || ""
            pFab.text = item.fabricant || item.brand || ""
            pWp.text = item.wp ? String(item.wp) : ""
            pL.text = item.largeur ? String(item.largeur) : (item.widthM ? String(item.widthM) : "")
            pH.text = item.hauteur ? String(item.hauteur) : (item.lengthM ? String(item.lengthM) : "")
            pM2.text = item.m2 ? String(item.m2) : ""
            pVoc.text = item.voc ? String(item.voc) : ""
            pIsc.text = item.isc ? String(item.isc) : ""
            pVmp.text = item.vmp ? String(item.vmp) : ""
            pImp.text = item.imp ? String(item.imp) : ""
            pBifacial.checked = !!item.bifacial
            pNotes.text = item.notes || ""
            const tech = item.tech || (item.bifacial ? "bifacial" : "mono")
            for (let i = 0; i < pTech.model.length; ++i) {
                if (pTech.model[i].value === tech) { pTech.currentIndex = i; break }
            }
        } else {
            iBrand.text = item.brand || item.fabricant || ""
            iModel.text = item.model || ""
            iPac.text = (item.pac || item.pnom) ? String(item.pac || item.pnom) : ""
            iMppt.text = String(item.nMppt || item.mpptCount || 2)
            iMaxV.text = (item.maxInputV || item.maxVocInput) ? String(item.maxInputV || item.maxVocInput) : ""
            iMaxI.text = item.maxInputI ? String(item.maxInputI) : ""
            iNotes.text = item.notes || ""
            const t = item.type || "string"
            for (let i = 0; i < iType.model.length; ++i) {
                if (iType.model[i].value === t) { iType.currentIndex = i; break }
            }
            iPhase.currentIndex = (Number(item.phase) === 3) ? 1 : 0
        }
    }

    function applyToProject(item) {
        if (!item || !item.id) {
            AppController.toast("Sélectionnez un élément", 2500)
            return
        }
        const form = Projects.currentProject.formState || {}
        if (tab === 0) {
            const largeur = item.largeur || item.widthM || 1.134
            const hauteur = item.hauteur || item.lengthM || 1.722
            Projects.updateCurrent({
                formState: Object.assign({}, form, {
                    panelId: item.id,
                    panelWp: item.wp || item.pmax || 400,
                    panelModel: ((item.fabricant || item.brand || "") + " " + (item.model || "")).trim(),
                    panelArea: item.m2 || (largeur * hauteur),
                    panelVoc: item.voc,
                    panelIsc: item.isc,
                    panelVmp: item.vmp,
                    panelImp: item.imp,
                    panelW: largeur,
                    panelH: hauteur
                })
            })
            AppController.toast("Panneau appliqué au projet")
            AppController.autoSave("Panneau — "
                                   + (((item.fabricant || item.brand || "") + " " + (item.model || "")).trim()))
        } else {
            Projects.updateCurrent({
                formState: Object.assign({}, form, {
                    inverterId: item.id,
                    inverterModel: ((item.brand || item.fabricant || "") + " " + (item.model || "")).trim(),
                    inverterPac: item.pac || item.pnom,
                    inverterType: item.type
                })
            })
            AppController.toast("Onduleur appliqué au projet")
            AppController.autoSave("Onduleur — "
                                   + (((item.brand || item.fabricant || "") + " " + (item.model || "")).trim()))
        }
        root.close()
    }

    function saveForm() {
        if (tab === 0) {
            if (!pModel.text.trim() || !Number(pWp.text)) {
                AppController.toast("Modèle et Wc requis")
                return
            }
            const w = Number(pL.text) || 0
            const h = Number(pH.text) || 0
            const wasCatalog = editingId && Catalog.isCatalogId(editingId)
            const id = Catalog.savePanel({
                id: (editingId && !Catalog.isCatalogId(editingId)) ? editingId : "",
                model: pModel.text.trim(),
                fabricant: pFab.text.trim() || "Perso",
                brand: pFab.text.trim() || "Perso",
                tech: pTech.currentValue || "mono",
                wp: Number(pWp.text),
                largeur: w || null,
                hauteur: h || null,
                m2: Number(pM2.text) || (w && h ? w * h : null),
                voc: Number(pVoc.text) || null,
                isc: Number(pIsc.text) || null,
                vmp: Number(pVmp.text) || null,
                imp: Number(pImp.text) || null,
                bifacial: pBifacial.checked,
                notes: pNotes.text
            })
            editingId = id
            AppController.toast(wasCatalog ? "Copie enregistrée" : "Panneau enregistré")
        } else {
            if (!iModel.text.trim() || !iBrand.text.trim()) {
                AppController.toast("Marque et modèle requis")
                return
            }
            const id = Catalog.saveInverter({
                id: (editingId && !Catalog.isCatalogId(editingId)) ? editingId : "",
                brand: iBrand.text.trim(),
                model: iModel.text.trim(),
                type: iType.currentValue || "string",
                phase: iPhase.currentValue,
                pnom: Number(iPac.text),
                pac: Number(iPac.text),
                mpptCount: Number(iMppt.text) || 2,
                nMppt: Number(iMppt.text) || 2,
                maxInputV: Number(iMaxV.text) || null,
                maxVocInput: Number(iMaxV.text) || null,
                maxInputI: Number(iMaxI.text) || null,
                mpptMinV: 120,
                mpptMaxV: Number(iMaxV.text) ? Number(iMaxV.text) * 0.9 : 550,
                notes: iNotes.text
            })
            editingId = id
            AppController.toast("Onduleur enregistré")
        }
    }

    function autoDims() {
        const w = Number(pL.text)
        const h = Number(pH.text)
        if (w > 0 && h > 0)
            pM2.text = (w * h).toFixed(3)
    }

    contentItem: ColumnLayout {
        spacing: 0
        width: root.availableWidth
        height: root.availableHeight

        // Titre + fermer (style OseDialog)
        RowLayout {
            Layout.fillWidth: true
            Layout.leftMargin: Theme.spaceLg
            Layout.rightMargin: Theme.spaceMd
            Layout.topMargin: Theme.spaceLg
            Layout.bottomMargin: Theme.spaceSm
            Label {
                Layout.fillWidth: true
                text: "Bibliothèque matériel"
                color: Theme.text
                font.pixelSize: 18
                font.weight: Font.DemiBold
            }
            OseBtn {
                text: "Fermer"
                kind: "flat"
                implicitHeight: Theme.controlHeightMd
                onClicked: root.close()
            }
        }

        TabBar {
            id: tabBar
            Layout.fillWidth: true
            Layout.leftMargin: Theme.spaceLg
            Layout.rightMargin: Theme.spaceLg
            currentIndex: root.tab
            onCurrentIndexChanged: {
                if (root.tab !== currentIndex) {
                    root.tab = currentIndex
                    root.clearForm()
                }
            }
            background: Rectangle { color: "transparent" }
            TabButton {
                text: "Panneaux (" + root.totalPanels + ")"
                contentItem: Text {
                    text: parent.text
                    font.pixelSize: Theme.fontSizeBody
                    font.weight: tabBar.currentIndex === 0 ? Font.DemiBold : Font.Normal
                    color: tabBar.currentIndex === 0 ? Theme.primary : Theme.textDim
                    horizontalAlignment: Text.AlignHCenter
                    verticalAlignment: Text.AlignVCenter
                }
                background: Item {
                    Rectangle {
                        anchors.left: parent.left
                        anchors.right: parent.right
                        anchors.bottom: parent.bottom
                        height: 2
                        color: tabBar.currentIndex === 0 ? Theme.primary : "transparent"
                    }
                }
            }
            TabButton {
                text: "Onduleurs (" + root.totalInverters + ")"
                contentItem: Text {
                    text: parent.text
                    font.pixelSize: Theme.fontSizeBody
                    font.weight: tabBar.currentIndex === 1 ? Font.DemiBold : Font.Normal
                    color: tabBar.currentIndex === 1 ? Theme.primary : Theme.textDim
                    horizontalAlignment: Text.AlignHCenter
                    verticalAlignment: Text.AlignVCenter
                }
                background: Item {
                    Rectangle {
                        anchors.left: parent.left
                        anchors.right: parent.right
                        anchors.bottom: parent.bottom
                        height: 2
                        color: tabBar.currentIndex === 1 ? Theme.primary : "transparent"
                    }
                }
            }
        }

        Label {
            Layout.fillWidth: true
            Layout.leftMargin: Theme.spaceLg
            Layout.rightMargin: Theme.spaceLg
            Layout.topMargin: Theme.spaceSm
            wrapMode: Text.WordWrap
            font.pixelSize: Theme.fontSizeCaption
            color: Theme.textDim
            text: "Catalogue Rexel embarqué (" + Catalog.catalogPanelCount + " panneaux, "
                  + Catalog.catalogInverterCount + " onduleurs) + vos modèles perso."
        }

        // Corps liste | formulaire
        RowLayout {
            Layout.fillWidth: true
            Layout.fillHeight: true
            Layout.topMargin: Theme.spaceMd
            Layout.leftMargin: Theme.spaceLg
            Layout.rightMargin: Theme.spaceLg
            Layout.bottomMargin: Theme.spaceMd
            spacing: Theme.spaceMd

            // Panneau liste
            Rectangle {
                Layout.fillWidth: true
                Layout.fillHeight: true
                Layout.preferredWidth: 1
                color: Theme.surface
                radius: Theme.radius
                border.color: Theme.outline

                ColumnLayout {
                    anchors.fill: parent
                    anchors.margins: 1
                    spacing: 0

                    RowLayout {
                        Layout.fillWidth: true
                        Layout.margins: Theme.spaceSm
                        Label {
                            Layout.fillWidth: true
                            font.pixelSize: Theme.fontSizeCaption
                            font.weight: Font.DemiBold
                            color: Theme.textDim
                            text: {
                                const n = root.filtered.length
                                const tot = root.tab === 0 ? root.totalPanels : root.totalInverters
                                const cat = root.tab === 0 ? Catalog.catalogPanelCount : Catalog.catalogInverterCount
                                const user = root.tab === 0 ? Catalog.userPanelCount : Catalog.userInverterCount
                                let s = n + (root.search ? (" / " + tot) : "")
                                s += root.tab === 0 ? (tot > 1 ? " panneaux" : " panneau")
                                                    : (tot > 1 ? " onduleurs" : " onduleur")
                                if (cat) s += " · " + cat + " Rexel"
                                if (user) s += " · " + user + " perso"
                                return s
                            }
                        }
                        OseBtn {
                            text: "+ Nouveau"
                            kind: "outline"
                            implicitHeight: 28
                            font.pixelSize: Theme.fontSizeCaption
                            leftPadding: 10
                            rightPadding: 10
                            onClicked: root.clearForm()
                        }
                    }

                    OseTextField {
                        id: searchField
                        Layout.fillWidth: true
                        Layout.leftMargin: Theme.spaceSm
                        Layout.rightMargin: Theme.spaceSm
                        Layout.bottomMargin: Theme.spaceSm
                        hint: root.tab === 0
                            ? "Rechercher (marque, modèle, Wc, réf. Rexel…)"
                            : "Rechercher (marque, kW, hybride, réf. Rexel…)"
                        onTextChanged: root.search = text
                    }

                    Rectangle {
                        Layout.fillWidth: true
                        height: 1
                        color: Theme.outline
                    }

                    ListView {
                        id: list
                        Layout.fillWidth: true
                        Layout.fillHeight: true
                        clip: true
                        model: root.filtered
                        spacing: 0
                        ScrollBar.vertical: ScrollBar { policy: ScrollBar.AsNeeded }

                        delegate: Item {
                            width: ListView.view.width
                            height: 64

                            Rectangle {
                                anchors.fill: parent
                                color: (root.editingId === modelData.id)
                                       ? Theme.primarySubtle : "transparent"
                            }
                            Rectangle {
                                anchors.left: parent.left
                                anchors.right: parent.right
                                anchors.bottom: parent.bottom
                                height: 1
                                color: Theme.outline
                            }

                            RowLayout {
                                anchors.fill: parent
                                anchors.leftMargin: Theme.spaceSm
                                anchors.rightMargin: Theme.spaceSm
                                spacing: Theme.spaceXs

                                ColumnLayout {
                                    Layout.fillWidth: true
                                    spacing: 2
                                    Label {
                                        Layout.fillWidth: true
                                        elide: Text.ElideRight
                                        font.pixelSize: Theme.fontSizeBody
                                        font.weight: Font.DemiBold
                                        color: Theme.text
                                        text: root.tab === 0
                                              ? (modelData.model || "")
                                              : ((modelData.brand || "") + " " + (modelData.model || "")).trim()
                                    }
                                    Label {
                                        Layout.fillWidth: true
                                        elide: Text.ElideRight
                                        font.pixelSize: Theme.fontSizeCaption
                                        color: Theme.textDim
                                        text: {
                                            if (root.tab === 0) {
                                                let s = ""
                                                if (modelData.fabricant || modelData.brand)
                                                    s += (modelData.fabricant || modelData.brand) + " · "
                                                s += (modelData.wp || 0) + " Wc"
                                                if (modelData.largeur && modelData.hauteur)
                                                    s += " · " + modelData.largeur + "×" + modelData.hauteur + " m"
                                                if (modelData.bifacial) s += " · bifacial"
                                                const ref = modelData.sku || modelData.rexelPartNumber || ""
                                                if (ref) s += " · réf. " + ref
                                                else if ((modelData.id || "").indexOf("rexel_") === 0) s += " · Rexel"
                                                return s
                                            }
                                            const type = modelData.type || "string"
                                            const typeLbl = type === "hybrid" ? "Hybride"
                                                           : (type === "micro" ? "Micro" : "String")
                                            let s = typeLbl
                                            const p = modelData.pac || modelData.pnom
                                            if (p) s += " · " + p + " kW"
                                            const ref = modelData.sku || modelData.rexelPartNumber || ""
                                            if (ref) s += " · réf. " + ref
                                            else if ((modelData.id || "").indexOf("rexel_") === 0) s += " · Rexel"
                                            return s
                                        }
                                    }
                                }

                                OseBtn {
                                    text: "Utiliser"
                                    kind: "primary"
                                    implicitHeight: 28
                                    font.pixelSize: Theme.fontSizeCaption
                                    leftPadding: 10
                                    rightPadding: 10
                                    onClicked: root.applyToProject(modelData)
                                }
                                OseBtn {
                                    text: "Édit."
                                    kind: "outline"
                                    implicitHeight: 28
                                    implicitWidth: 48
                                    font.pixelSize: Theme.fontSizeCaption
                                    leftPadding: 6
                                    rightPadding: 6
                                    ToolTip.visible: hovered
                                    ToolTip.text: Catalog.isCatalogId(modelData.id || "")
                                                  ? "Copier / adapter" : "Modifier"
                                    onClicked: root.loadForm(modelData)
                                }
                                OseBtn {
                                    text: "Suppr."
                                    kind: "outline"
                                    implicitHeight: 28
                                    implicitWidth: 56
                                    font.pixelSize: Theme.fontSizeCaption
                                    leftPadding: 6
                                    rightPadding: 6
                                    visible: !Catalog.isCatalogId(modelData.id || "")
                                    onClicked: {
                                        if (root.tab === 0) Catalog.removePanel(modelData.id)
                                        else Catalog.removeInverter(modelData.id)
                                        if (root.editingId === modelData.id)
                                            root.clearForm()
                                    }
                                }
                            }
                        }

                        Label {
                            anchors.centerIn: parent
                            visible: list.count === 0
                            color: Theme.textDim
                            font.pixelSize: Theme.fontSizeBody
                            horizontalAlignment: Text.AlignHCenter
                            text: root.search
                                  ? "Aucun résultat pour cette recherche."
                                  : "Aucun élément.\nCliquez sur + Nouveau."
                        }
                    }
                }
            }

            // Panneau formulaire
            Rectangle {
                Layout.fillWidth: true
                Layout.fillHeight: true
                Layout.preferredWidth: 1
                color: Theme.surface
                radius: Theme.radius
                border.color: Theme.outline

                Flickable {
                    anchors.fill: parent
                    anchors.margins: Theme.spaceMd
                    clip: true
                    contentWidth: width
                    contentHeight: formCol.implicitHeight
                    ScrollBar.vertical: ScrollBar { policy: ScrollBar.AsNeeded }

                    ColumnLayout {
                        id: formCol
                        width: parent.width
                        spacing: Theme.spaceSm

                        Label {
                            Layout.fillWidth: true
                            font.pixelSize: Theme.fontSizeCardTitle
                            font.weight: Font.DemiBold
                            color: Theme.text
                            text: {
                                if (!root.editingId)
                                    return root.tab === 0 ? "Nouveau panneau" : "Nouvel onduleur"
                                if (Catalog.isCatalogId(root.editingId))
                                    return "Copier / adapter"
                                if (root.tab === 0)
                                    return "Modifier — " + (pModel.text || "panneau")
                                return "Modifier — " + ((iBrand.text + " " + iModel.text).trim() || "onduleur")
                            }
                        }

                        GridLayout {
                            visible: root.tab === 0
                            columns: 2
                            Layout.fillWidth: true
                            columnSpacing: Theme.spaceSm
                            rowSpacing: Theme.spaceSm

                            Label { text: "Modèle *"; font.pixelSize: Theme.fontSizeCaption; color: Theme.textDim; Layout.columnSpan: 2 }
                            OseTextField { id: pModel; Layout.fillWidth: true; Layout.columnSpan: 2; hint: "ex. JA Solar JAM60S20" }

                            Label { text: "Fabricant"; font.pixelSize: Theme.fontSizeCaption; color: Theme.textDim }
                            Label { text: "Technologie"; font.pixelSize: Theme.fontSizeCaption; color: Theme.textDim }
                            OseTextField { id: pFab; Layout.fillWidth: true; hint: "Longi, Jinko…" }
                            ComboBox {
                                id: pTech
                                Layout.fillWidth: true
                                textRole: "label"; valueRole: "value"
                                model: [
                                    { label: "Monocristallin", value: "mono" },
                                    { label: "Polycristallin", value: "poly" },
                                    { label: "Bifacial", value: "bifacial" },
                                    { label: "Half-cut", value: "half-cut" },
                                    { label: "Autre", value: "autre" }
                                ]
                            }

                            Label { text: "Puissance (Wc) *"; font.pixelSize: Theme.fontSizeCaption; color: Theme.textDim }
                            Label { text: "Surface (m²)"; font.pixelSize: Theme.fontSizeCaption; color: Theme.textDim }
                            OseTextField { id: pWp; Layout.fillWidth: true; hint: "400"; inputMethodHints: Qt.ImhFormattedNumbersOnly }
                            OseTextField { id: pM2; Layout.fillWidth: true; hint: "Auto si L×H"; inputMethodHints: Qt.ImhFormattedNumbersOnly }

                            Label { text: "Largeur (m)"; font.pixelSize: Theme.fontSizeCaption; color: Theme.textDim }
                            Label { text: "Hauteur (m)"; font.pixelSize: Theme.fontSizeCaption; color: Theme.textDim }
                            OseTextField { id: pL; Layout.fillWidth: true; hint: "1.134"; inputMethodHints: Qt.ImhFormattedNumbersOnly; onEditingFinished: root.autoDims() }
                            OseTextField { id: pH; Layout.fillWidth: true; hint: "1.722"; inputMethodHints: Qt.ImhFormattedNumbersOnly; onEditingFinished: root.autoDims() }

                            Label {
                                Layout.columnSpan: 2
                                Layout.topMargin: Theme.spaceXs
                                text: "Électrique STC"
                                font.pixelSize: Theme.fontSizeBody
                                font.weight: Font.DemiBold
                                color: Theme.text
                            }

                            Label { text: "Voc (V)"; font.pixelSize: Theme.fontSizeCaption; color: Theme.textDim }
                            Label { text: "Isc (A)"; font.pixelSize: Theme.fontSizeCaption; color: Theme.textDim }
                            OseTextField { id: pVoc; Layout.fillWidth: true; hint: "41.9"; inputMethodHints: Qt.ImhFormattedNumbersOnly }
                            OseTextField { id: pIsc; Layout.fillWidth: true; hint: "13.3"; inputMethodHints: Qt.ImhFormattedNumbersOnly }
                            Label { text: "Vmp (V)"; font.pixelSize: Theme.fontSizeCaption; color: Theme.textDim }
                            Label { text: "Imp (A)"; font.pixelSize: Theme.fontSizeCaption; color: Theme.textDim }
                            OseTextField { id: pVmp; Layout.fillWidth: true; hint: "34.9"; inputMethodHints: Qt.ImhFormattedNumbersOnly }
                            OseTextField { id: pImp; Layout.fillWidth: true; hint: "12.3"; inputMethodHints: Qt.ImhFormattedNumbersOnly }

                            CheckBox {
                                id: pBifacial
                                Layout.columnSpan: 2
                                text: "Panneau bifacial"
                                font.pixelSize: Theme.fontSizeBody
                            }

                            Label { text: "Notes"; font.pixelSize: Theme.fontSizeCaption; color: Theme.textDim; Layout.columnSpan: 2 }
                            ScrollView {
                                Layout.fillWidth: true
                                Layout.columnSpan: 2
                                Layout.preferredHeight: 64
                                TextArea {
                                    id: pNotes
                                    wrapMode: TextEdit.Wrap
                                    font.pixelSize: Theme.fontSizeBody
                                }
                            }
                        }

                        GridLayout {
                            visible: root.tab === 1
                            columns: 2
                            Layout.fillWidth: true
                            columnSpacing: Theme.spaceSm
                            rowSpacing: Theme.spaceSm

                            Label { text: "Marque *"; font.pixelSize: Theme.fontSizeCaption; color: Theme.textDim }
                            Label { text: "Modèle *"; font.pixelSize: Theme.fontSizeCaption; color: Theme.textDim }
                            OseTextField { id: iBrand; Layout.fillWidth: true; hint: "Fronius, SMA…" }
                            OseTextField { id: iModel; Layout.fillWidth: true; hint: "Primo 5.0" }

                            Label { text: "Type"; font.pixelSize: Theme.fontSizeCaption; color: Theme.textDim }
                            Label { text: "Phase"; font.pixelSize: Theme.fontSizeCaption; color: Theme.textDim }
                            ComboBox {
                                id: iType
                                Layout.fillWidth: true
                                textRole: "label"; valueRole: "value"
                                model: [
                                    { label: "String (réseau)", value: "string" },
                                    { label: "Hybride", value: "hybrid" },
                                    { label: "Micro-onduleur", value: "micro" }
                                ]
                            }
                            ComboBox {
                                id: iPhase
                                Layout.fillWidth: true
                                textRole: "label"; valueRole: "value"
                                model: [
                                    { label: "Monophasé", value: 1 },
                                    { label: "Triphasé", value: 3 }
                                ]
                            }

                            Label { text: "Puissance (kW)"; font.pixelSize: Theme.fontSizeCaption; color: Theme.textDim }
                            Label { text: "Nb. MPPT"; font.pixelSize: Theme.fontSizeCaption; color: Theme.textDim }
                            OseTextField { id: iPac; Layout.fillWidth: true; hint: "5.0"; inputMethodHints: Qt.ImhFormattedNumbersOnly }
                            OseTextField { id: iMppt; Layout.fillWidth: true; text: "2"; inputMethodHints: Qt.ImhFormattedNumbersOnly }

                            Label { text: "Vmax DC (V)"; font.pixelSize: Theme.fontSizeCaption; color: Theme.textDim }
                            Label { text: "Imax (A)"; font.pixelSize: Theme.fontSizeCaption; color: Theme.textDim }
                            OseTextField { id: iMaxV; Layout.fillWidth: true; hint: "600"; inputMethodHints: Qt.ImhFormattedNumbersOnly }
                            OseTextField { id: iMaxI; Layout.fillWidth: true; hint: "18"; inputMethodHints: Qt.ImhFormattedNumbersOnly }

                            Label { text: "Notes"; font.pixelSize: Theme.fontSizeCaption; color: Theme.textDim; Layout.columnSpan: 2 }
                            ScrollView {
                                Layout.fillWidth: true
                                Layout.columnSpan: 2
                                Layout.preferredHeight: 64
                                TextArea {
                                    id: iNotes
                                    wrapMode: TextEdit.Wrap
                                    font.pixelSize: Theme.fontSizeBody
                                }
                            }
                        }

                        RowLayout {
                            Layout.fillWidth: true
                            Layout.topMargin: Theme.spaceSm
                            spacing: Theme.spaceSm
                            OseBtn {
                                visible: !!root.editingId
                                text: "Annuler"
                                kind: "outline"
                                onClicked: root.clearForm()
                            }
                            Item { Layout.fillWidth: true }
                            OseBtn {
                                text: root.editingId
                                      ? (Catalog.isCatalogId(root.editingId)
                                         ? "Enregistrer une copie"
                                         : "Enregistrer")
                                      : (root.tab === 0 ? "Ajouter le panneau" : "Ajouter l’onduleur")
                                kind: "primary"
                                onClicked: root.saveForm()
                            }
                        }
                    }
                }
            }
        }
    }
}
