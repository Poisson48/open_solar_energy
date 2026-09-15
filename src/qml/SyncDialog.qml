import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import OpenSolarEnergy
import "controls"

OseDialog {
    id: root
    title: "Synchronisation"
    width: Math.min((Overlay.overlay ? Overlay.overlay.width : 560) - 24, 560)
    acceptEnabled: !AppController.syncBusy && (root.mode === "send"
                   ? (!root.isPhone || root.hasSelection)
                   : (root.hasSelection && root.mode.length > 0))
    acceptText: root.mode === "send"
                ? (root.isPhone ? "Envoyer au PC" : "Héberger (LAN + Bluetooth)")
                : (root.mode === "receive" ? "Importer la sélection" : "Appliquer le fichier")
    showAccept: true

    property string mode: ""
    property string pendingFile: ""
    property bool selectAll: false
    property bool remoteLoaded: false
    property var groupList: []
    property var projectChecks: ({})
    property bool catalogsPanels: false
    property bool catalogsInverters: false
    property var projectModel: []

    readonly property bool isPhone: AppController.isPhoneDevice
    readonly property string peerLabel: isPhone ? "PC" : "téléphone"
    readonly property bool hasSelection: {
        if (catalogsPanels || catalogsInverters)
            return true
        for (let i = 0; i < projectModel.length; ++i) {
            const e = projectModel[i]
            if (!e.enabled)
                continue
            if (e.history)
                return true
            if ((e.groupIds || []).length)
                return true
        }
        return false
    }

    function rebuildProjectModel() {
        const ids = Object.keys(projectChecks)
        const out = []
        for (let i = 0; i < ids.length; ++i) {
            const id = ids[i]
            const e = projectChecks[id]
            const groupIds = []
            const g = e.groups || {}
            for (const k in g) {
                if (g[k])
                    groupIds.push(k)
            }
            out.push({
                id: id,
                name: e.name || id,
                enabled: !!e.enabled,
                history: !!e.history,
                groupIds: groupIds,
                groups: g,
                localExists: !!e.localExists,
                updatedAt: e.updatedAt || ""
            })
        }
        // Nouveaux d’abord, puis alpha
        out.sort(function (a, b) {
            if (!!a.localExists !== !!b.localExists)
                return a.localExists ? 1 : -1
            return String(a.name).localeCompare(String(b.name))
        })
        projectModel = out
    }

    function localIdSet() {
        const tree = SyncEngine.localSelectionTree()
        const set = {}
        const projects = tree.projects || []
        for (let i = 0; i < projects.length; ++i)
            set[projects[i].id] = true
        return set
    }

    function openSend() {
        mode = "send"
        pendingFile = ""
        remoteLoaded = false
        if (isPhone) {
            // Android pousse vers le PC : sélection locale
            bootstrapLocal()
            selectAllGroups(true)
        } else {
            projectChecks = {}
            projectModel = []
            catalogsPanels = false
            catalogsInverters = false
        }
        open()
    }

    function openReceive() {
        mode = "receive"
        pendingFile = ""
        remoteLoaded = false
        projectChecks = {}
        projectModel = []
        catalogsPanels = false
        catalogsInverters = false
        groupList = SyncEngine.groupCatalog()
        open()
    }

    function openApplyPath(path) {
        mode = "applyFile"
        pendingFile = path || ""
        acceptText = "Appliquer le fichier"
        bootstrapLocal()
        selectAllGroups(true)
        open()
    }

    function bootstrapLocal() {
        const tree = SyncEngine.localSelectionTree()
        applyTree(tree, false)
    }

    function applyTree(tree, fromRemote) {
        groupList = tree.groups || SyncEngine.groupCatalog() || []
        catalogsPanels = false
        catalogsInverters = false
        const localIds = localIdSet()
        const next = {}
        const projects = tree.projects || []
        for (let i = 0; i < projects.length; ++i) {
            const p = projects[i]
            const groups = {}
            for (let j = 0; j < groupList.length; ++j) {
                if (groupList[j].id === "history")
                    continue
                groups[groupList[j].id] = false
            }
            const exists = !!localIds[p.id]
            next[p.id] = {
                name: p.name || p.id,
                enabled: false,
                groups: groups,
                history: false,
                localExists: exists,
                updatedAt: p.updatedAt || ""
            }
        }
        projectChecks = next
        selectAll = false
        remoteLoaded = fromRemote
        rebuildProjectModel()
        // Catalogues distants disponibles ?
        if (fromRemote) {
            // flags informatifs : tree.catalogsPanels = bool présence côté distant
            root._remoteHasPanels = !!tree.catalogsPanels
            root._remoteHasInverters = !!tree.catalogsInverters
        }
    }

    property bool _remoteHasPanels: false
    property bool _remoteHasInverters: false

    function loadRemoteCatalog() {
        AppController.requestRemoteCatalog()
    }

    Connections {
        target: AppController
        function onRemoteCatalogReady(tree) {
            if (!tree || Object.keys(tree).length === 0)
                return
            root.applyTree(tree, true)
            root.selectAllGroups(true)
        }
        function onSyncFinished(ok, message) {
            if (ok && (root.mode === "receive" || (root.mode === "send" && root.isPhone)))
                root.close()
        }
    }

    function selectAllGroups(on) {
        selectAll = on
        catalogsPanels = on && (mode !== "receive" || _remoteHasPanels || !remoteLoaded)
        catalogsInverters = on && (mode !== "receive" || _remoteHasInverters || !remoteLoaded)
        if (mode === "receive" && remoteLoaded) {
            catalogsPanels = on && _remoteHasPanels
            catalogsInverters = on && _remoteHasInverters
        }
        const next = Object.assign({}, projectChecks)
        const ids = Object.keys(next)
        for (let i = 0; i < ids.length; ++i) {
            const e = Object.assign({}, next[ids[i]])
            e.enabled = on
            const g = Object.assign({}, e.groups)
            for (const k in g)
                g[k] = on
            e.groups = g
            e.history = false
            next[ids[i]] = e
        }
        projectChecks = next
        rebuildProjectModel()
    }

    function buildSelection() {
        const projects = {}
        const ids = Object.keys(projectChecks)
        for (let i = 0; i < ids.length; ++i) {
            const e = projectChecks[ids[i]]
            if (!e || !e.enabled)
                continue
            const groups = []
            for (const g in (e.groups || {})) {
                if (e.groups[g])
                    groups.push(g)
            }
            if (e.history)
                groups.push("history")
            if (groups.length === 0)
                continue
            projects[ids[i]] = { groups: groups, history: !!e.history }
        }
        return {
            catalogsPanels: catalogsPanels,
            catalogsInverters: catalogsInverters,
            projects: projects
        }
    }

    function setProjectEnabled(id, on) {
        const next = Object.assign({}, projectChecks)
        const e = Object.assign({}, next[id] || {})
        e.enabled = on
        if (on) {
            const g = Object.assign({}, e.groups)
            for (const k in g) {
                if (k !== "results")
                    g[k] = true
            }
            e.groups = g
        }
        next[id] = e
        projectChecks = next
        rebuildProjectModel()
    }

    function setGroup(id, gid, on) {
        const next = Object.assign({}, projectChecks)
        const e = Object.assign({}, next[id] || {})
        const g = Object.assign({}, e.groups || {})
        g[gid] = on
        e.groups = g
        e.enabled = e.enabled || on
        next[id] = e
        projectChecks = next
        rebuildProjectModel()
    }

    function setHistory(id, on) {
        const next = Object.assign({}, projectChecks)
        const e = Object.assign({}, next[id] || {})
        e.history = on
        e.enabled = e.enabled || on
        next[id] = e
        projectChecks = next
        rebuildProjectModel()
    }

    onAccepted: {
        if (mode === "send") {
            AppController.requestSyncSend(isPhone ? buildSelection() : {})
            return
        }
        const sel = buildSelection()
        if (mode === "receive")
            AppController.requestSyncReceive(sel)
        else if (mode === "applyFile" && pendingFile)
            AppController.syncApplyFile(pendingFile, sel)
    }

    onRejected: {
        if (SyncBluetooth.hosting)
            SyncBluetooth.stopHosting()
        if (SyncLan.hosting)
            SyncLan.stopHosting()
    }

    ColumnLayout {
        Layout.fillWidth: true
        spacing: 10

        Label {
            Layout.fillWidth: true
            wrapMode: Text.WordWrap
            color: Theme.textDim
            text: mode === "send"
                  ? (isPhone
                     ? ("1) Sur le PC : Envoyer / Héberger (restez sur cet écran).\n"
                        + "2) Ici : Envoyer — LAN (même Wi‑Fi / USB partage) d’abord, sinon Bluetooth.")
                     : ("Confirmer = ce PC écoute en LAN + Bluetooth.\n"
                        + "Sur le téléphone : Récupérer ou Envoyer (même réseau ou BT)."))
                  : mode === "receive"
                    ? ("1) Sur le " + peerLabel + " : Envoyer / Héberger.\n"
                       + "2) Ici : charger la liste (LAN prioritaire, Bluetooth en secours).")
                    : "Applique un fichier .osebundle."
        }

        Rectangle {
            Layout.fillWidth: true
            visible: SyncBluetooth.hosting || SyncBluetooth.scanning || SyncBluetooth.status.length > 0
                     || SyncLan.hosting || SyncLan.scanning || SyncLan.status.length > 0
            radius: Theme.radius
            color: Theme.surfaceHigh
            implicitHeight: hostCol.implicitHeight + 16
            ColumnLayout {
                id: hostCol
                anchors.left: parent.left
                anchors.right: parent.right
                anchors.margins: 8
                anchors.verticalCenter: parent.verticalCenter
                spacing: 4
                Label {
                    Layout.fillWidth: true
                    wrapMode: Text.WordWrap
                    font.weight: Font.DemiBold
                    text: {
                        if (SyncLan.status.length > 0)
                            return SyncLan.status
                        if (SyncBluetooth.status.length > 0)
                            return SyncBluetooth.status
                        if (SyncLan.hosting || SyncBluetooth.hosting)
                            return "En attente du " + peerLabel + "…"
                        if (SyncLan.scanning || SyncBluetooth.scanning)
                            return "Recherche…"
                        return ""
                    }
                }
                OseBtn {
                    visible: SyncLan.hosting || SyncBluetooth.hosting
                    text: "Arrêter"
                    kind: "flat"
                    onClicked: {
                        if (SyncLan.hosting)
                            SyncLan.stopHosting()
                        if (SyncBluetooth.hosting)
                            SyncBluetooth.stopHosting()
                    }
                }
            }
        }

        RowLayout {
            Layout.fillWidth: true
            spacing: 8
            OseBtn {
                text: isPhone ? "Envoyer → PC" : "Envoyer → téléphone"
                kind: mode === "send" ? "primary" : "outline"
                onClicked: root.openSend()
            }
            OseBtn {
                text: isPhone ? "Récupérer ← PC" : "Récupérer ← téléphone"
                kind: mode === "receive" ? "primary" : "outline"
                onClicked: root.openReceive()
            }
        }

        RowLayout {
            Layout.fillWidth: true
            visible: mode === "receive"
            OseBtn {
                text: remoteLoaded
                      ? ("Recharger la liste du " + peerLabel)
                      : ("Chercher et appairer le " + peerLabel)
                kind: "primary"
                enabled: !SyncBluetooth.busy && !SyncBluetooth.scanning && !SyncBluetooth.pairing
                         && !SyncLan.busy && !SyncLan.scanning && !AppController.syncBusy
                onClicked: root.loadRemoteCatalog()
            }
            Item { Layout.fillWidth: true }
        }

        // Appareils trouvés — sélection + statut d’appairage
        Rectangle {
            Layout.fillWidth: true
            visible: (mode === "receive" || (mode === "send" && isPhone))
                     && SyncBluetooth.peers.length > 0
            radius: Theme.radius
            color: Theme.surfaceHigh
            implicitHeight: peerCol.implicitHeight + 16
            ColumnLayout {
                id: peerCol
                anchors.left: parent.left
                anchors.right: parent.right
                anchors.margins: 8
                anchors.verticalCenter: parent.verticalCenter
                spacing: 4
                Label {
                    text: "Appareils à proximité"
                    font.weight: Font.DemiBold
                }
                Repeater {
                    model: SyncBluetooth.peers
                    delegate: RadioButton {
                        required property var modelData
                        required property int index
                        Layout.fillWidth: true
                        checked: SyncBluetooth.selectedPeerIndex === index
                        text: (modelData.name || modelData.address)
                              + (modelData.paired ? "  · appairé" : "  · à appairer")
                        onClicked: SyncBluetooth.selectedPeerIndex = index
                    }
                }
                Label {
                    Layout.fillWidth: true
                    wrapMode: Text.WordWrap
                    color: Theme.textDim
                    font.pixelSize: 12
                    visible: SyncBluetooth.pairing
                    text: "Appairage en cours — validez la demande sur les deux appareils…"
                }
            }
        }

        RowLayout {
            Layout.fillWidth: true
            visible: mode === "receive" || mode === "applyFile" || (mode === "send" && isPhone)
            CheckBox {
                text: "Tout"
                checked: root.selectAll
                enabled: root.projectModel.length > 0 || mode === "applyFile"
                onToggled: root.selectAllGroups(checked)
            }
            Item { Layout.fillWidth: true }
            OseBtn {
                text: "Fichier…"
                kind: "flat"
                onClicked: {
                    const path = AppController.openFileDialog(
                        "OSE Bundle (*.osebundle *.zip);;Tous (*.*)")
                    if (path)
                        root.openApplyPath(path)
                }
            }
        }

        Label {
            Layout.fillWidth: true
            visible: mode === "receive" || mode === "applyFile" || (mode === "send" && isPhone)
            wrapMode: Text.WordWrap
            color: "#b71c1c"
            font.pixelSize: 12
            text: "Les éléments cochés écraseront les données locales. « Nouveau » = création du projet ici."
        }

        Label {
            Layout.fillWidth: true
            visible: mode === "receive" && !remoteLoaded
            wrapMode: Text.WordWrap
            color: Theme.textDim
            text: "Aucun catalogue distant chargé."
        }

        CheckBox {
            visible: mode === "receive" || mode === "applyFile" || (mode === "send" && isPhone)
            text: "Catalogue panneaux perso"
                + (mode === "receive" && remoteLoaded && !_remoteHasPanels ? " (absent chez le " + peerLabel + ")" : "")
            enabled: mode !== "receive" || !remoteLoaded || _remoteHasPanels
            checked: root.catalogsPanels
            onToggled: root.catalogsPanels = checked
        }
        CheckBox {
            visible: mode === "receive" || mode === "applyFile" || (mode === "send" && isPhone)
            text: "Catalogue onduleurs perso"
                + (mode === "receive" && remoteLoaded && !_remoteHasInverters ? " (absent chez le " + peerLabel + ")" : "")
            enabled: mode !== "receive" || !remoteLoaded || _remoteHasInverters
            checked: root.catalogsInverters
            onToggled: root.catalogsInverters = checked
        }

        ScrollView {
            Layout.fillWidth: true
            Layout.preferredHeight: 240
            visible: mode === "receive" || mode === "applyFile" || (mode === "send" && isPhone)
            clip: true
            ColumnLayout {
                width: Math.max(parent.width, 280)
                spacing: 10
                Repeater {
                    model: root.projectModel
                    delegate: ColumnLayout {
                        id: projRow
                        required property var modelData
                        property string projectId: modelData.id
                        property var groupMap: modelData.groups || ({})
                        Layout.fillWidth: true
                        spacing: 2
                        CheckBox {
                            text: projRow.modelData.name
                                  + (projRow.modelData.localExists ? "" : "  · nouveau")
                            checked: projRow.modelData.enabled
                            font.weight: Font.DemiBold
                            onToggled: root.setProjectEnabled(projRow.projectId, checked)
                        }
                        Label {
                            Layout.fillWidth: true
                            Layout.leftMargin: 20
                            visible: !projRow.modelData.localExists
                            color: Theme.accent
                            font.pixelSize: 11
                            text: "Absent ici — sera créé à l’import"
                        }
                        Flow {
                            Layout.fillWidth: true
                            Layout.leftMargin: 20
                            spacing: 4
                            visible: projRow.modelData.enabled
                            Repeater {
                                model: root.groupList.filter(function (g) { return g.id !== "history" })
                                delegate: CheckBox {
                                    required property var modelData
                                    text: modelData.label
                                    checked: !!projRow.groupMap[modelData.id]
                                    onToggled: root.setGroup(projRow.projectId, modelData.id, checked)
                                }
                            }
                            CheckBox {
                                text: "Historique Git"
                                checked: !!projRow.modelData.history
                                onToggled: root.setHistory(projRow.projectId, checked)
                            }
                        }
                    }
                }
            }
        }
    }
}
