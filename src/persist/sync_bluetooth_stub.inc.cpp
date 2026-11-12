// Inclus depuis sync_bluetooth.cpp quand Qt Bluetooth n'est pas dispo (CI Android sans qtconnectivity).

QString SyncBluetooth::serviceUuidString()
{
    return QStringLiteral("6ba7b810-9dad-11d1-80b4-00c04fd430c8");
}

SyncBluetooth::SyncBluetooth(QObject* parent) : QObject(parent)
{
    m_status = QStringLiteral("Bluetooth non disponible sur cette build");
}

SyncBluetooth::~SyncBluetooth() = default;

void SyncBluetooth::setSyncEngine(SyncEngine* engine) { m_engine = engine; }

bool SyncBluetooth::available() const { return false; }

void SyncBluetooth::setSelectedPeerIndex(int idx)
{
    if (m_selectedPeerIndex == idx)
        return;
    m_selectedPeerIndex = idx;
    emit selectedPeerIndexChanged();
}

bool SyncBluetooth::ensureBluetoothReady()
{
    m_lastError = QStringLiteral("Bluetooth indisponible");
    emit lastErrorChanged();
    return false;
}

bool SyncBluetooth::makeDiscoverable() { return ensureBluetoothReady(); }

bool SyncBluetooth::prepareVisibility() { return ensureBluetoothReady(); }

bool SyncBluetooth::pairPeer(int) { return ensureBluetoothReady(); }

bool SyncBluetooth::startHosting(const QByteArray&) { return ensureBluetoothReady(); }

bool SyncBluetooth::startInteractiveHosting() { return ensureBluetoothReady(); }

void SyncBluetooth::stopHosting()
{
    if (!m_hosting)
        return;
    m_hosting = false;
    emit hostingChanged();
}

void SyncBluetooth::startScan(int)
{
    m_scanning = true;
    emit scanningChanged();
    m_peers.clear();
    emit peersChanged();
    m_scanning = false;
    emit scanningChanged();
    emit scanFinished();
}

void SyncBluetooth::stopScan()
{
    if (!m_scanning)
        return;
    m_scanning = false;
    emit scanningChanged();
}

QVariantMap SyncBluetooth::fetchCatalogFromPeer(int)
{
    return {};
}

QByteArray SyncBluetooth::fetchBundleFromPeer(int, const QVariantMap&)
{
    return {};
}

bool SyncBluetooth::pushBundleToPeer(int, const QByteArray&)
{
    return false;
}

QByteArray SyncBluetooth::fetchFromPeer(int)
{
    return {};
}
