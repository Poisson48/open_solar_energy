import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import "controls"

OseTabPage {
    id: root
    title: "Devis"
    subtitle: "Installateur, client, lignes éditables, TVA / remise, PDF."

    PdfPreviewDialog { id: pdfPreviewDialog }

    property var lines: []
    property var meta: ({})
    property real tvaRate: 0.10
    property real remisePct: 0

    function refresh() {
        lines = Pipeline.buildQuoteLines(Projects.currentProject).slice()
        // Lignes manuelles du projet
        const extra = Projects.currentProject.quoteExtraLines || []
        for (let i = 0; i < extra.length; ++i)
            lines.push(extra[i])
        meta = Pipeline.buildQuoteMeta(Projects.currentProject)
        const q = Projects.currentProject.quoteMeta || {}
        if (q.tva !== undefined) tvaField.text = String(Number(q.tva) * 100)
        if (q.remise !== undefined) remiseField.text = String(q.remise)
        if (q.installer) {
            instName.text = q.installer.name || ""
            instSiret.text = q.installer.siret || ""
            instRge.text = q.installer.rge || ""
        }
        const c = Projects.clientObject()
        clientName.text = c.name || meta.client || ""
        clientEmail.text = c.email || ""
        clientPhone.text = c.phone || ""
        clientAddr.text = [c.address, c.zip, c.city].filter(Boolean).join(", ")
    }

    function htTotal() {
        let s = 0
        for (let i = 0; i < lines.length; ++i) {
            if (lines[i].note) continue
            s += Number(lines[i].amount) || 0
        }
        const rem = Number(remiseField.text) || 0
        return s * (1 - rem / 100)
    }

    function persistQuote() {
        Projects.updateCurrent({
            quoteLines: lines,
            quoteExtraLines: lines.filter(function (l) { return l.manual }),
            quoteMeta: {
                tva: (Number(tvaField.text) || 10) / 100,
                remise: Number(remiseField.text) || 0,
                installer: {
                    name: instName.text,
                    siret: instSiret.text,
                    rge: instRge.text
                }
            }
        })
        Projects.setClientObject({
            name: clientName.text,
            email: clientEmail.text,
            phone: clientPhone.text,
            address: clientAddr.text
        })
    }

    ColumnLayout {
        Layout.fillWidth: true
        spacing: 12

        OseAlert {
            visible: meta.stale === true
            kind: "warning"
            text: {
                const d = Pipeline.staleDiagnosis(Projects.currentProject)
                return d.summary || "Résultats périmés — mettez-les à jour avant d’envoyer le devis."
            }
        }
        RowLayout {
            visible: meta.stale === true
            Layout.fillWidth: true
            spacing: 8
            OseBtn {
                text: "Mettre à jour les résultats"
                kind: "primary"
                onClicked: {
                    const r = AppController.refreshStaleResults()
                    if (r && r.ok)
                        root.refresh()
                }
            }
            OseBtn {
                text: "Aller au dimensionnement"
                kind: "outline"
                onClicked: AppController.currentTab = "sizing"
            }
        }

        OseCard {
            title: "Installateur"
            GridLayout {
                columns: 2
                Layout.fillWidth: true
                Label { text: "Raison sociale" }
                TextField { id: instName; Layout.fillWidth: true; placeholderText: "Entreprise" }
                Label { text: "SIRET" }
                TextField { id: instSiret; Layout.fillWidth: true; placeholderText: "14 chiffres" }
                Label { text: "RGE" }
                TextField { id: instRge; Layout.fillWidth: true; placeholderText: "N° qualification" }
            }
        }

        OseCard {
            title: "Client"
            GridLayout {
                columns: 2
                Layout.fillWidth: true
                Label { text: "Nom" }
                TextField { id: clientName; Layout.fillWidth: true }
                Label { text: "E-mail" }
                TextField { id: clientEmail; Layout.fillWidth: true }
                Label { text: "Tél." }
                TextField { id: clientPhone; Layout.fillWidth: true }
                Label { text: "Adresse" }
                TextField { id: clientAddr; Layout.fillWidth: true }
            }
        }

        OseCard {
            title: "Chantier"
            Label {
                Layout.fillWidth: true
                wrapMode: Text.WordWrap
                font.pixelSize: 12
                color: Theme.textDim
                text: (meta.location || "Lieu —")
                      + " · " + (meta.Ppeak || 0) + " kWc"
                      + " · tilt " + (meta.tilt || 0) + "° / az " + (meta.azimuth || 0) + "°"
                      + " · " + (meta.installType || "grid")
            }
        }

        Flow {
            Layout.fillWidth: true
            spacing: 8
            OseBtn { text: "Synchroniser projet"; kind: "outline"; onClicked: root.refresh() }
            OseBtn {
                text: "+ Ligne"
                kind: "flat"
                onClicked: {
                    lines = lines.concat([{ label: "Prestation", amount: 0, manual: true }])
                }
            }
        }

        Repeater {
            model: root.lines
            delegate: RowLayout {
                Layout.fillWidth: true
                TextField {
                    Layout.fillWidth: true
                    text: modelData.label || ""
                    readOnly: !!modelData.note && !modelData.manual
                    onEditingFinished: {
                        const copy = root.lines.slice()
                        copy[index] = Object.assign({}, copy[index], { label: text, manual: true })
                        root.lines = copy
                    }
                }
                TextField {
                    Layout.preferredWidth: 100
                    text: String(modelData.amount || 0)
                    visible: !modelData.note || Number(modelData.amount) > 0 || modelData.manual
                    inputMethodHints: Qt.ImhFormattedNumbersOnly
                    onEditingFinished: {
                        const copy = root.lines.slice()
                        copy[index] = Object.assign({}, copy[index], { amount: Number(text), manual: true })
                        root.lines = copy
                    }
                }
                Label { text: "€"; color: Theme.textDim }
                ToolButton {
                    text: "✕"
                    visible: !!modelData.manual
                    onClicked: {
                        const copy = root.lines.slice()
                        copy.splice(index, 1)
                        root.lines = copy
                    }
                }
            }
        }

        GridLayout {
            columns: Ui.isPhone ? 1 : 2
            Layout.fillWidth: true
            columnSpacing: 8
            rowSpacing: 6
            RowLayout {
                Layout.fillWidth: true
                Label { text: "Remise"; Layout.preferredWidth: 64 }
                OseInputUnit { id: remiseField; text: "0"; unit: "%"; Layout.fillWidth: true }
            }
            RowLayout {
                Layout.fillWidth: true
                Label { text: "TVA"; Layout.preferredWidth: 64 }
                OseInputUnit { id: tvaField; text: "10"; unit: "%"; Layout.fillWidth: true }
            }
        }

        Label {
            text: {
                const ht = root.htTotal()
                const tva = (Number(tvaField.text) || 10) / 100
                return "Total HT : " + ht.toFixed(2) + " €  ·  TTC : " + (ht * (1 + tva)).toFixed(2) + " €"
            }
            font.weight: Font.DemiBold
            color: Theme.primary
        }

        Flow {
            Layout.fillWidth: true
            spacing: 8
            OseBtn {
                text: Ui.isPhone ? "Aperçu PDF" : "Aperçu devis PDF"
                kind: "outline"
                onClicked: {
                    root.persistQuote()
                    const tva = (Number(tvaField.text) || 10) / 100
                    const path = PdfExport.exportProfessionalQuote(Projects.currentProject, {
                        lines: root.lines,
                        tvaRate: tva,
                        remisePct: Number(remiseField.text) || 0,
                        validityDays: 30,
                        installer: {
                            name: instName.text,
                            siret: instSiret.text,
                            rge: instRge.text
                        },
                        clientName: clientName.text
                    })
                    if (!path) {
                        AppController.toast("Échec génération devis", 3500)
                        return
                    }
                    Projects.updateCurrent({ quotePdf: path })
                    AppController.autoSave("Devis PDF " + path.split("/").pop())
                    pdfPreviewDialog.openPath(path, "Aperçu — Devis")
                }
            }
            OseBtn {
                text: "Exporter devis"
                onClicked: {
                    root.persistQuote()
                    const tva = (Number(tvaField.text) || 10) / 100
                    const path = PdfExport.exportProfessionalQuote(Projects.currentProject, {
                        lines: root.lines,
                        tvaRate: tva,
                        remisePct: Number(remiseField.text) || 0,
                        validityDays: 30,
                        installer: {
                            name: instName.text,
                            siret: instSiret.text,
                            rge: instRge.text
                        },
                        clientName: clientName.text
                    })
                    if (path) {
                        Projects.updateCurrent({ quotePdf: path })
                        PdfExport.openPdf(path)
                        AppController.autoSave("Devis PDF exporté")
                        AppController.toast("Devis PDF créé")
                    }
                }
            }
            OseBtn {
                text: Ui.isPhone ? "Rapport" : "Rapport simulation"
                kind: "outline"
                onClicked: {
                    root.persistQuote()
                    const path = PdfExport.exportSimulationReport(Projects.currentProject)
                    if (!path) {
                        AppController.toast("Échec rapport — lancez d’abord un calcul", 4000)
                        return
                    }
                    Projects.updateCurrent({ reportPdf: path })
                    AppController.autoSave("Rapport simulation PDF")
                    pdfPreviewDialog.openPath(path, "Aperçu — Rapport type étude")
                }
            }
            OseBtn {
                text: "Export JSON"
                kind: "flat"
                onClicked: {
                    root.persistQuote()
                    AppController.saveTextFile(
                        (Projects.currentProject.name || "projet") + ".json",
                        Projects.exportCurrentJson())
                }
            }
        }

        Label {
            Layout.fillWidth: true
            wrapMode: Text.WordWrap
            font.pixelSize: 11
            color: Theme.textDim
            text: "Le devis reprend SIRET/RGE, client, chantier, lignes HT, TVA et signature. "
                  + "Le rapport de simulation détaille site, météo, système, bilan mensuel et finances (approche type PVsyst)."
        }
    }

    Component.onCompleted: refresh()
}
