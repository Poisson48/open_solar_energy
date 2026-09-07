import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import OpenSolarEnergy
import "controls"

Dialog {
    id: root
    parent: Overlay.overlay
    anchors.centerIn: parent
    modal: true
    focus: true
    padding: 0
    width: Math.min(Overlay.overlay ? Overlay.overlay.width - 32 : 720, 720)
    height: Math.min(Overlay.overlay ? Overlay.overlay.height - 40 : 860, 860)
    closePolicy: Popup.CloseOnEscape | Popup.CloseOnPressOutside

    property string pdfPath: ""
    property var pages: []
    property string titleText: "Aperçu PDF"

    background: Rectangle {
        color: Theme.surface
        radius: Theme.radius * 2
        border.color: Theme.outline
    }

    function openPath(path, title) {
        pdfPath = path || ""
        titleText = title || "Aperçu PDF"
        pages = path ? PdfExport.previewPages(path, 12) : []
        open()
    }

    header: null
    footer: null

    contentItem: ColumnLayout {
        spacing: 0
        width: root.availableWidth
        height: root.availableHeight

        RowLayout {
            Layout.fillWidth: true
            Layout.margins: Theme.spaceMd
            Label {
                Layout.fillWidth: true
                text: root.titleText
                font.pixelSize: 18
                font.weight: Font.DemiBold
                color: Theme.text
            }
            OseBtn {
                text: "Ouvrir le fichier"
                kind: "outline"
                enabled: root.pdfPath.length > 0
                onClicked: PdfExport.openPdf(root.pdfPath)
            }
            OseBtn {
                text: "Fermer"
                kind: "flat"
                onClicked: root.close()
            }
        }

        Label {
            Layout.fillWidth: true
            Layout.leftMargin: Theme.spaceMd
            Layout.rightMargin: Theme.spaceMd
            visible: root.pages.length === 0
            wrapMode: Text.WordWrap
            color: Theme.textDim
            text: root.pdfPath.length
                  ? "Aperçu indisponible (Qt Pdf). Utilisez « Ouvrir le fichier »."
                  : "Aucun PDF à prévisualiser."
        }

        Flickable {
            Layout.fillWidth: true
            Layout.fillHeight: true
            Layout.leftMargin: Theme.spaceMd
            Layout.rightMargin: Theme.spaceMd
            Layout.bottomMargin: Theme.spaceMd
            clip: true
            contentWidth: width
            contentHeight: pagesCol.implicitHeight
            ScrollBar.vertical: ScrollBar { policy: ScrollBar.AsNeeded }

            ColumnLayout {
                id: pagesCol
                width: parent.width
                spacing: Theme.spaceMd

                Repeater {
                    model: root.pages
                    delegate: ColumnLayout {
                        Layout.fillWidth: true
                        spacing: 4
                        required property var modelData
                        Label {
                            text: "Page " + (modelData.page || "")
                            font.pixelSize: Theme.fontSizeCaption
                            color: Theme.textDim
                        }
                        Rectangle {
                            Layout.fillWidth: true
                            Layout.preferredHeight: Math.min(640, (modelData.height || 800)
                                                             * (width / Math.max(1, modelData.width || 1)))
                            color: Theme.surfaceHigh
                            border.color: Theme.outline
                            radius: Theme.radius
                            Image {
                                anchors.fill: parent
                                anchors.margins: 4
                                source: modelData.url || ("file://" + modelData.path)
                                fillMode: Image.PreserveAspectFit
                                asynchronous: true
                            }
                        }
                    }
                }
            }
        }
    }
}
