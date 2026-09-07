import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import "controls"

OseTabPage {
    id: root
    title: "Lieu et météo"
    subtitle: "Carte, adresse, météo Open-Meteo / PVGIS. Les données alimentent tous les calculs."
    nextTabId: AppController.nextPrimaryTab()
    nextTabLabel: AppController.tabLabel(AppController.nextPrimaryTab())

    property real zoom: 13
    property real mapLat: Number(latField.text) || 43.6045
    property real mapLon: Number(lonField.text) || 1.444
    property bool locked: false
    property bool syncingFields: false

    /** ~200 m — au-delà, météo / pente DEM ne sont plus valables pour ce lieu. */
    readonly property real placeCoordTol: 0.002

    readonly property var projectWeather: Projects.currentProject.weatherData || []
    readonly property var projectWeatherMeta: Projects.currentProject.weatherMeta || {}
    readonly property var projectTerrain: Projects.currentProject.terrain || {}
    readonly property bool hasWeather: projectWeather.length >= 12
    readonly property bool hasTerrain: projectTerrain.ok === true
            || projectTerrain.tilt !== undefined
    readonly property bool weatherMatchesPlace: {
        if (!hasWeather) return false
        const meta = projectWeatherMeta
        if (meta.lat === undefined || meta.lon === undefined) return true
        const lat = Number(latField.text)
        const lon = Number(lonField.text)
        return Math.abs(lat - Number(meta.lat)) <= placeCoordTol
               && Math.abs(lon - Number(meta.lon)) <= placeCoordTol
    }
    readonly property bool terrainMatchesPlace: {
        if (!hasTerrain) return false
        const t = projectTerrain
        if (t.lat === undefined || t.lon === undefined) return true
        const lat = Number(latField.text)
        const lon = Number(lonField.text)
        return Math.abs(lat - Number(t.lat)) <= placeCoordTol
               && Math.abs(lon - Number(t.lon)) <= placeCoordTol
    }
    readonly property string weatherStatusText: {
        if (Weather.busy || Pvgis.busy)
            return Weather.status || Pvgis.status
        if (hasWeather && weatherMatchesPlace) {
            const src = projectWeatherMeta.source || "?"
            return "Météo " + src + " enregistrée dans le projet"
        }
        if (hasWeather && !weatherMatchesPlace)
            return "Lieu modifié — réimportez Open-Meteo ou PVGIS"
        if (Weather.status || Pvgis.status)
            return Weather.status || Pvgis.status
        return "Aucune météo — importez Open-Meteo ou PVGIS"
    }
    readonly property string terrainStatusText: {
        if (Terrain.busy)
            return Terrain.status || "Relief…"
        if (hasTerrain && terrainMatchesPlace) {
            const t = projectTerrain
            return "Pente enregistrée : " + (t.tilt !== undefined ? t.tilt : "?")
                   + "° · az " + (t.azimuth !== undefined ? t.azimuth : "?") + "°"
                   + (t.elevation !== undefined ? (" · alt " + Math.round(t.elevation) + " m") : "")
        }
        if (hasTerrain && !terrainMatchesPlace)
            return "Lieu modifié — réestimez la pente (DEM)"
        if (Terrain.status)
            return Terrain.status
        return "Estimez la pente terrain (Open-Meteo elevation)"
    }

    function loadFromProject() {
        locked = !!(Projects.currentProject.location
                    && Projects.currentProject.location.locked)
        const form = Projects.currentProject.formState || {}
        const loc = Projects.currentProject.location || {}
        syncingFields = true
        if (loc.name !== undefined)
            placeName.text = loc.name || ""
        if (loc.lat !== undefined)
            latField.text = String(loc.lat)
        if (loc.lon !== undefined)
            lonField.text = String(loc.lon)
        mapLat = Number(latField.text) || mapLat
        mapLon = Number(lonField.text) || mapLon
        terrainTilt.text = String(form.tilt !== undefined ? form.tilt : 30)
        terrainAz.text = String(form.azimuth !== undefined ? form.azimuth : 0)
        syncingFields = false
    }

    function coordsMoved(lat, lon, refLat, refLon) {
        if (refLat === undefined || refLon === undefined) return false
        return Math.abs(lat - Number(refLat)) > placeCoordTol
               || Math.abs(lon - Number(refLon)) > placeCoordTol
    }

    function weatherStaleFor(lat, lon) {
        if (!hasWeather) return false
        const meta = projectWeatherMeta
        if (meta.lat === undefined || meta.lon === undefined) return false
        return coordsMoved(lat, lon, meta.lat, meta.lon)
    }

    function terrainStaleFor(lat, lon) {
        if (!hasTerrain) return false
        const t = projectTerrain
        if (t.lat === undefined || t.lon === undefined) return false
        return coordsMoved(lat, lon, t.lat, t.lon)
    }

    function saveLocation() {
        const lat = Number(latField.text)
        const lon = Number(lonField.text)
        const patch = {
            location: {
                name: placeName.text,
                lat: lat,
                lon: lon,
                locked: root.locked
            }
        }
        const meta = projectWeatherMeta
        if (hasWeather && (meta.lat === undefined || meta.lon === undefined)) {
            patch.weatherMeta = Object.assign({}, meta, {
                lat: lat,
                lon: lon,
                source: meta.source || "imported"
            })
        } else if (weatherStaleFor(lat, lon)) {
            patch.weatherData = []
            patch.weatherMeta = {}
        }
        const terr = projectTerrain
        if (hasTerrain && (terr.lat === undefined || terr.lon === undefined)) {
            patch.terrain = Object.assign({}, terr, {
                lat: lat,
                lon: lon,
                ok: true,
                source: terr.source || "open-meteo-dem"
            })
        } else if (terrainStaleFor(lat, lon)) {
            patch.terrain = {}
        }
        Projects.updateCurrent(patch)
    }

    function setValidated(v) {
        root.locked = !!v
        saveLocation()
        AppController.toast(root.locked ? "Lieu validé" : "Modification du lieu")
    }

    Component.onCompleted: loadFromProject()
    Connections {
        target: Projects
        function onCurrentChanged() { root.loadFromProject() }
    }

    readonly property var ghiValues: {
        const w = projectWeather
        let out = []
        for (let i = 0; i < w.length; ++i) out.push(w[i].GHI || 0)
        return out
    }
    readonly property var dhiValues: {
        const w = projectWeather
        let out = []
        for (let i = 0; i < w.length; ++i) out.push(w[i].DHI || 0)
        return out
    }
    readonly property var tempValues: {
        const w = projectWeather
        let out = []
        for (let i = 0; i < w.length; ++i) out.push(w[i].T_avg || 0)
        return out
    }
    readonly property real ghiAnnual: {
        let s = 0
        for (let i = 0; i < ghiValues.length; ++i) s += Number(ghiValues[i]) || 0
        return Math.round(s)
    }
    readonly property real tempAvg: {
        if (!tempValues.length) return 0
        let s = 0
        for (let i = 0; i < tempValues.length; ++i) s += Number(tempValues[i]) || 0
        return Math.round((s / tempValues.length) * 10) / 10
    }

    function applyMapToFields(lat, lon) {
        syncingFields = true
        mapLat = lat
        mapLon = lon
        latField.text = lat.toFixed(5)
        lonField.text = lon.toFixed(5)
        syncingFields = false
        saveLocation()
    }

    OseFormResults {
        Layout.fillWidth: true

        OseCard {
            title: "Recherche"
            RowLayout {
                Layout.fillWidth: true
                TextField {
                    id: searchField
                    Layout.fillWidth: true
                    placeholderText: "Adresse (Nominatim)…"
                    enabled: !root.locked
                    onAccepted: { if (!root.locked) Geocode.search(text) }
                }
                OseBtn {
                    text: Geocode.busy ? "…" : "Chercher"
                    enabled: !Geocode.busy && !root.locked
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
                        if (root.locked) return
                        placeName.text = modelData.name.split(",")[0]
                        root.applyMapToFields(modelData.lat, modelData.lon)
                        osmMap.setLocation(modelData.lat, modelData.lon, true)
                    }
                }
            }
        }

        OsmMapView {
            id: osmMap
            Layout.fillWidth: true
            Layout.preferredHeight: 420
            interactive: !root.locked
            onLocationChanged: (lat, lon) => root.applyMapToFields(lat, lon)
            onZoomChangedByUser: (z) => { root.zoom = z }
            Component.onCompleted: {
                setLocation(root.mapLat, root.mapLon, true)
                zoom = root.zoom
            }
        }
        GridLayout {
            columns: 2
            Layout.fillWidth: true
            columnSpacing: 12; rowSpacing: 8
            Label { text: "Nom" }
            TextField {
                id: placeName; Layout.fillWidth: true; enabled: !root.locked
                text: (Projects.currentProject.location || {}).name || ""
                onEditingFinished: root.saveLocation()
            }
            Label { text: "Latitude" }
            TextField {
                id: latField; Layout.fillWidth: true; enabled: !root.locked
                text: (Projects.currentProject.location || {}).lat !== undefined
                      ? String((Projects.currentProject.location || {}).lat) : "43.6045"
                onEditingFinished: {
                    if (root.syncingFields) return
                    mapLat = Number(text)
                    osmMap.setLocation(mapLat, Number(lonField.text), true)
                }
            }
            Label { text: "Longitude" }
            TextField {
                id: lonField; Layout.fillWidth: true; enabled: !root.locked
                text: (Projects.currentProject.location || {}).lon !== undefined
                      ? String((Projects.currentProject.location || {}).lon) : "1.444"
                onEditingFinished: {
                    if (root.syncingFields) return
                    mapLon = Number(text)
                    osmMap.setLocation(Number(latField.text), mapLon, true)
                }
            }
            Label { text: "Tilt toiture" }
            OseInputUnit {
                id: terrainTilt
                text: "30"
                unit: "°"; Layout.fillWidth: true
                onEditingFinished: {
                    if (root.syncingFields) return
                    const form = Projects.currentProject.formState || {}
                    Projects.updateCurrent({ formState: Object.assign({}, form, { tilt: Number(text) }) })
                }
            }
            Label { text: "Azimut" }
            OseInputUnit {
                id: terrainAz
                text: "0"
                unit: "°"; Layout.fillWidth: true
                onEditingFinished: {
                    if (root.syncingFields) return
                    const form = Projects.currentProject.formState || {}
                    Projects.updateCurrent({ formState: Object.assign({}, form, { azimuth: Number(text) }) })
                }
            }
        }

        RowLayout {
            OseBtn {
                text: Terrain.busy ? "Relief…"
                      : (root.terrainMatchesPlace ? "Réestimer pente" : "Estimer pente (DEM)")
                kind: "outline"
                enabled: !Terrain.busy
                onClicked: {
                    root.saveLocation()
                    Terrain.estimate(Number(latField.text), Number(lonField.text))
                }
            }
            Label {
                Layout.fillWidth: true
                wrapMode: Text.WordWrap
                color: root.terrainMatchesPlace ? Theme.textDim : Theme.warning
                font.pixelSize: 12
                text: root.terrainStatusText
            }
        }
        Connections {
            target: Terrain
            function onFinished(ok) {
                if (!ok) return
                const r = Terrain.result || {}
                const lat = Number(latField.text)
                const lon = Number(lonField.text)
                if (r.tilt !== undefined) terrainTilt.text = String(r.tilt)
                if (r.azimuth !== undefined) terrainAz.text = String(r.azimuth)
                const form = Projects.currentProject.formState || {}
                const terrain = Object.assign({}, r, {
                    lat: lat,
                    lon: lon,
                    ok: true,
                    source: "open-meteo-dem"
                })
                Projects.updateCurrent({
                    formState: Object.assign({}, form, {
                        tilt: r.tilt,
                        azimuth: r.azimuth,
                        terrainElev: r.elevation
                    }),
                    terrain: terrain
                })
                AppController.toast("Pente enregistrée : " + r.tilt + "°")
            }
        }

        RowLayout {
            OseBtn {
                text: root.locked ? "Modifier" : "Valider le lieu"
                kind: root.locked ? "outline" : "primary"
                onClicked: root.setValidated(!root.locked)
            }
            OseBtn {
                text: Weather.busy ? "…" : (root.weatherMatchesPlace ? "Réimporter Open-Meteo" : "Open-Meteo")
                enabled: !Weather.busy
                onClicked: {
                    root.saveLocation()
                    Weather.fetchOpenMeteo(Number(latField.text), Number(lonField.text))
                }
            }
            OseBtn {
                text: Pvgis.busy ? "…" : (root.weatherMatchesPlace ? "Réimporter PVGIS" : "PVGIS")
                kind: "outline"
                enabled: !Pvgis.busy
                onClicked: {
                    root.saveLocation()
                    Pvgis.fetch(Number(latField.text), Number(lonField.text),
                                Number(terrainTilt.text), Number(terrainAz.text))
                }
            }
        }

        Connections {
            target: Weather
            function onFinished(ok) {
                if (!ok) return
                const lat = Number(latField.text)
                const lon = Number(lonField.text)
                const meta = Object.assign({}, Weather.meta || {}, {
                    source: (Weather.meta && Weather.meta.source) || "open-meteo",
                    lat: lat,
                    lon: lon
                })
                Projects.updateCurrent({ weatherData: Weather.weatherData, weatherMeta: meta })
                AppController.toast("Météo Open-Meteo enregistrée")
            }
        }
        Connections {
            target: Pvgis
            function onFinished(ok) {
                if (!ok) return
                Projects.updateCurrent({
                    weatherData: Pvgis.weatherData,
                    weatherMeta: {
                        source: "pvgis",
                        lat: Number(latField.text),
                        lon: Number(lonField.text)
                    }
                })
                AppController.toast("Météo PVGIS enregistrée")
            }
        }
        Connections {
            target: Geocode
            function onFinished(ok) {
                if (ok && Geocode.results.length > 0 && placeName.text.length === 0)
                    placeName.text = Geocode.results[0].name.split(",")[0]
            }
        }

        Label {
            Layout.fillWidth: true
            wrapMode: Text.WordWrap
            text: root.weatherStatusText
            color: root.weatherMatchesPlace ? Theme.textDim : Theme.warning
        }

        results: ColumnLayout {
            spacing: 10

            Flow {
                Layout.fillWidth: true
                spacing: 8
                visible: root.hasWeather && root.weatherMatchesPlace
                KpiCard {
                    title: "GHI annuel"
                    value: root.ghiAnnual + " kWh/m²"
                    subtitle: (projectWeatherMeta.source || "météo")
                }
                KpiCard {
                    title: "T° moyenne"
                    value: root.tempAvg + " °C"
                }
                KpiCard {
                    title: "Pente DEM"
                    value: root.terrainMatchesPlace && projectTerrain.tilt !== undefined
                           ? (projectTerrain.tilt + " °") : "—"
                    subtitle: root.terrainMatchesPlace && projectTerrain.elevation !== undefined
                              ? (Math.round(projectTerrain.elevation) + " m")
                              : "à estimer"
                }
                KpiCard {
                    title: "Azimut terrain"
                    value: root.terrainMatchesPlace && projectTerrain.azimuth !== undefined
                           ? (projectTerrain.azimuth + " °") : "—"
                }
            }

            OseCard {
                title: "Irradiation globale (GHI)"
                visible: root.hasWeather && root.weatherMatchesPlace
                SimpleBarChart {
                    Layout.fillWidth: true
                    Layout.preferredHeight: 170
                    unit: "kWh/m²"
                    decimals: 0
                    values: root.ghiValues
                }
            }
            OseCard {
                title: "Irradiation diffuse (DHI)"
                visible: root.hasWeather && root.weatherMatchesPlace
                SimpleBarChart {
                    Layout.fillWidth: true
                    Layout.preferredHeight: 160
                    unit: "kWh/m²"
                    decimals: 0
                    barColor: Theme.accent
                    values: root.dhiValues
                }
            }
            OseCard {
                title: "Température moyenne"
                visible: root.hasWeather && root.weatherMatchesPlace
                SimpleBarChart {
                    Layout.fillWidth: true
                    Layout.preferredHeight: 160
                    unit: "°C"
                    decimals: 1
                    barColor: Theme.warning
                    values: root.tempValues
                }
            }
            OseCard {
                title: "Relief du site"
                visible: root.terrainMatchesPlace
                hint: "Estimé via Open-Meteo elevation, lié au lieu validé."
                GridLayout {
                    columns: 2
                    Layout.fillWidth: true
                    columnSpacing: 12
                    rowSpacing: 6
                    Label { text: "Pente"; color: Theme.textDim }
                    Label {
                        text: (projectTerrain.tilt !== undefined ? projectTerrain.tilt : "—") + " °"
                        font.weight: Font.DemiBold
                        color: Theme.text
                    }
                    Label { text: "Azimut pente"; color: Theme.textDim }
                    Label {
                        text: (projectTerrain.azimuth !== undefined ? projectTerrain.azimuth : "—") + " °"
                        font.weight: Font.DemiBold
                        color: Theme.text
                    }
                    Label { text: "Altitude"; color: Theme.textDim }
                    Label {
                        text: projectTerrain.elevation !== undefined
                              ? (Math.round(projectTerrain.elevation) + " m") : "—"
                        font.weight: Font.DemiBold
                        color: Theme.text
                    }
                }
            }
            OseAlert {
                visible: !root.weatherMatchesPlace
                kind: "warning"
                text: root.hasWeather
                      ? "Lieu modifié — réimportez Open-Meteo ou PVGIS."
                      : "Aucune météo — importez Open-Meteo ou PVGIS pour afficher les graphiques."
            }
            OseAlert {
                visible: root.weatherMatchesPlace && !root.terrainMatchesPlace
                kind: "warning"
                text: "Estimez la pente (DEM) pour compléter le profil du site."
            }
        }
    }
}
