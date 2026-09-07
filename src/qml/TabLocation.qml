import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

Flickable {
    contentHeight: col.implicitHeight + 24
    clip: true
    ScrollBar.vertical: ScrollBar {}

    property int zoom: 13
    property real mapLat: Number(latField.text) || 43.6045
    property real mapLon: Number(lonField.text) || 1.444
    property var tile: AppController.latLonToTile(mapLat, mapLon, zoom)

    ColumnLayout {
        id: col
        width: parent.width
        x: 16; y: 16
        spacing: 12

        Label { text: "Lieu & météo"; font.pixelSize: 20; font.weight: Font.DemiBold }

        RowLayout {
            Layout.fillWidth: true
            TextField {
                id: searchField
                Layout.fillWidth: true
                placeholderText: "Adresse (Nominatim)…"
                onAccepted: Geocode.search(text)
            }
            Button {
                text: "Chercher"
                enabled: !Geocode.busy
                onClicked: Geocode.search(searchField.text)
            }
        }

        Repeater {
            model: Geocode.results
            delegate: Button {
                Layout.fillWidth: true
                text: modelData.name
                flat: true
                onClicked: {
                    latField.text = String(modelData.lat)
                    lonField.text = String(modelData.lon)
                    placeName.text = modelData.name.split(",")[0]
                    mapLat = modelData.lat
                    mapLon = modelData.lon
                }
            }
        }

        // Carte OSM 3×3 tuiles autour du point
        Item {
            Layout.fillWidth: true
            Layout.preferredHeight: 280
            clip: true

            Grid {
                id: tileGrid
                anchors.centerIn: parent
                columns: 3
                rows: 3
                property int cx: tile.x
                property int cy: tile.y
                Repeater {
                    model: 9
                    Image {
                        width: 128; height: 128
                        fillMode: Image.PreserveAspectCrop
                        asynchronous: true
                        source: {
                            const dx = index % 3 - 1
                            const dy = Math.floor(index / 3) - 1
                            return "image://osm/" + zoom + "/" + (tileGrid.cx + dx) + "/" + (tileGrid.cy + dy)
                        }
                    }
                }
            }

            Rectangle {
                anchors.centerIn: parent
                width: 14; height: 14; radius: 7
                color: Theme.accent
                border.color: "#fff"
                border.width: 2
            }

            MouseArea {
                anchors.fill: parent
                onClicked: (mouse) => {
                    // Approximate pan: click left/right/up/down of center shifts tile
                    const dx = mouse.x < width / 3 ? -1 : (mouse.x > 2 * width / 3 ? 1 : 0)
                    const dy = mouse.y < height / 3 ? -1 : (mouse.y > 2 * height / 3 ? 1 : 0)
                    if (dx === 0 && dy === 0) return
                    const ll = AppController.tileToLatLon(tile.x + dx, tile.y + dy, zoom)
                    mapLat = ll.lat
                    mapLon = ll.lon
                    latField.text = ll.lat.toFixed(5)
                    lonField.text = ll.lon.toFixed(5)
                    Geocode.reverse(ll.lat, ll.lon)
                }
            }

            Row {
                anchors.right: parent.right
                anchors.top: parent.top
                anchors.margins: 8
                spacing: 4
                Button { text: "+"; onClicked: zoom = Math.min(18, zoom + 1) }
                Button { text: "−"; onClicked: zoom = Math.max(4, zoom - 1) }
            }
        }

        GridLayout {
            columns: 2
            Layout.fillWidth: true
            columnSpacing: 12
            rowSpacing: 8
            Label { text: "Nom" }
            TextField { id: placeName; Layout.fillWidth: true; text: (Projects.currentProject.location || {}).name || "" }
            Label { text: "Latitude" }
            TextField {
                id: latField
                Layout.fillWidth: true
                text: (Projects.currentProject.location || {}).lat !== undefined
                      ? String((Projects.currentProject.location || {}).lat) : "43.6045"
                onEditingFinished: mapLat = Number(text)
            }
            Label { text: "Longitude" }
            TextField {
                id: lonField
                Layout.fillWidth: true
                text: (Projects.currentProject.location || {}).lon !== undefined
                      ? String((Projects.currentProject.location || {}).lon) : "1.444"
                onEditingFinished: mapLon = Number(text)
            }
        }

        RowLayout {
            Button {
                text: "Enregistrer"
                Material.background: Theme.primary
                Material.foreground: "#fff"
                onClicked: Projects.updateCurrent({
                    location: { name: placeName.text, lat: Number(latField.text), lon: Number(lonField.text) }
                })
            }
            Button {
                text: "Météo démo"
                onClicked: {
                    Weather.loadDemo()
                    Projects.updateCurrent({ weatherData: Weather.weatherData, weatherMeta: Weather.meta })
                }
            }
            Button {
                text: "Open-Meteo"
                enabled: !Weather.busy
                onClicked: Weather.fetchOpenMeteo(Number(latField.text), Number(lonField.text))
            }
            Button {
                text: "PVGIS"
                enabled: !Pvgis.busy
                onClicked: Pvgis.fetch(Number(latField.text), Number(lonField.text))
            }
        }

        Connections {
            target: Weather
            function onFinished(ok) {
                if (ok) Projects.updateCurrent({ weatherData: Weather.weatherData, weatherMeta: Weather.meta })
            }
        }
        Connections {
            target: Pvgis
            function onFinished(ok) {
                if (ok) Projects.updateCurrent({ weatherData: Pvgis.weatherData, weatherMeta: { source: "pvgis" } })
            }
        }
        Connections {
            target: Geocode
            function onFinished(ok) {
                if (ok && Geocode.results.length > 0 && placeName.text.length === 0)
                    placeName.text = Geocode.results[0].name.split(",")[0]
            }
        }

        Label { text: Weather.status || Pvgis.status; color: Theme.textDim }

        SimpleBarChart {
            Layout.fillWidth: true
            Layout.preferredHeight: 100
            values: {
                const w = Projects.currentProject.weatherData || Weather.weatherData || []
                let out = []
                for (let i = 0; i < w.length; ++i) out.push(w[i].GHI || 0)
                return out
            }
        }
    }
}
