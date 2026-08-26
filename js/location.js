/**
 * location.js - Gestion de la carte et de la localisation
 * Extrait de main.js v1.4
 */

const MAP_TILES_KEY = 'ose_map_tiles_v1';

/** Fonds de carte (OSM + variantes gratuites, satellite pour placer le point). */
const MAP_TILE_LAYERS = {
  osm: {
    label: 'OSM Standard',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    maxZoom: 19,
    attribution: '© OpenStreetMap',
  },
  osmfr: {
    label: 'OSM France',
    url: 'https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png',
    maxZoom: 20,
    attribution: '© OpenStreetMap France',
  },
  hot: {
    label: 'OSM Humanitaire',
    url: 'https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png',
    maxZoom: 19,
    attribution: '© OpenStreetMap, HOT',
  },
  topo: {
    label: 'OpenTopoMap',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    maxZoom: 17,
    attribution: '© OpenStreetMap, SRTM | © OpenTopoMap',
  },
  cyclosm: {
    label: 'CyclOSM',
    url: 'https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png',
    maxZoom: 20,
    attribution: '© OpenStreetMap | CyclOSM',
  },
  sat: {
    label: 'Satellite (Esri)',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    maxZoom: 19,
    attribution: 'Tiles © Esri',
    subdomains: null,
  },
};

// ── Chargement données météo démo ────────────────────────────
async function loadDemoData() {
  try {
    const r = await fetch('./data/demo_weather.json');
    AppState.demoData = await r.json();
    setLocation('paris');
  } catch (e) {
    console.warn('Impossible de charger les données météo démo', e);
  }
}

// Édition du lieu : uniquement en mode « Modifier le lieu » (étape localisation).
// Par défaut verrouillé pour éviter de déplacer le point par accident.
AppState.mapEditEnabled = false;
AppState.mapFullscreen = false;
AppState.mapTileLayer = null;
AppState.mapTileKey = 'osm';

function _syncMapEditUI() {
  const unlocked = !!AppState.mapEditEnabled;
  const hint = document.getElementById('map-edit-hint');
  const btnEdit = document.getElementById('btn-map-edit');
  const btnOk = document.getElementById('btn-map-lock');
  const badge = document.getElementById('map-lock-badge');
  if (hint) {
    hint.textContent = unlocked
      ? 'Mode édition : cliquez la carte ou glissez le marqueur, puis validez.'
      : 'Lieu verrouillé — cliquez « Modifier le lieu » pour déplacer le point.';
  }
  if (btnEdit) btnEdit.style.display = unlocked ? 'none' : '';
  if (btnOk) btnOk.style.display = unlocked ? '' : 'none';
  if (badge) {
    badge.textContent = unlocked ? '✏️ Édition lieu' : '🔒 Lieu verrouillé';
    badge.classList.toggle('map-lock-open', unlocked);
  }
  document.querySelectorAll('[data-loc-edit]').forEach(el => {
    if ('disabled' in el) el.disabled = !unlocked;
  });
  const mapEl = document.getElementById('map');
  if (mapEl) mapEl.classList.toggle('map-editing', unlocked);

  // Miroir des boutons en barre plein écran
  const fsEdit = document.getElementById('btn-map-fs-edit');
  const fsLock = document.getElementById('btn-map-fs-lock');
  const fsHint = document.getElementById('map-fs-hint');
  if (fsEdit) fsEdit.style.display = unlocked ? 'none' : '';
  if (fsLock) fsLock.style.display = unlocked ? '' : 'none';
  if (fsHint) {
    fsHint.textContent = unlocked
      ? 'Cliquez ou glissez le marqueur · ✕ ou Retour pour quitter'
      : '⛶ Plein écran — « Modifier le lieu » pour placer le point';
  }
}

function setMapEditEnabled(on) {
  AppState.mapEditEnabled = !!on;
  if (AppState.marker) {
    if (AppState.marker.dragging) {
      if (on) AppState.marker.dragging.enable();
      else AppState.marker.dragging.disable();
    }
    try { AppState.marker.options.draggable = !!on; } catch (_) {}
  }
  _syncMapEditUI();
  if (AppState.map) setTimeout(() => AppState.map.invalidateSize(), 50);
}

function toggleMapEdit(force) {
  const next = (typeof force === 'boolean') ? force : !AppState.mapEditEnabled;
  setMapEditEnabled(next);
  if (next && typeof showToast === 'function')
    showToast('Déplacez le point sur la carte, puis validez le lieu.', 'ok');
  if (!next && typeof showToast === 'function')
    showToast('Lieu verrouillé.', 'ok');
}

function _savedTileKey() {
  try {
    const k = localStorage.getItem(MAP_TILES_KEY);
    if (k && MAP_TILE_LAYERS[k]) return k;
  } catch (_) {}
  return 'osm';
}

function setMapTiles(key) {
  const conf = MAP_TILE_LAYERS[key] || MAP_TILE_LAYERS.osm;
  const id = MAP_TILE_LAYERS[key] ? key : 'osm';
  AppState.mapTileKey = id;
  try { localStorage.setItem(MAP_TILES_KEY, id); } catch (_) {}

  const sel = document.getElementById('map-tiles-select');
  if (sel && sel.value !== id) sel.value = id;

  if (!AppState.map) return;

  if (AppState.mapTileLayer) {
    try { AppState.map.removeLayer(AppState.mapTileLayer); } catch (_) {}
  }
  const opts = {
    maxZoom: conf.maxZoom || 19,
    attribution: conf.attribution || '',
  };
  if (conf.subdomains !== null && conf.subdomains !== undefined)
    opts.subdomains = conf.subdomains;
  else if (conf.url.includes('{s}'))
    opts.subdomains = 'abc';

  AppState.mapTileLayer = L.tileLayer(conf.url, opts).addTo(AppState.map);
}

function setMapFullscreen(on) {
  const next = !!on;
  AppState.mapFullscreen = next;
  const panel = document.getElementById('map-panel');
  const bar = document.getElementById('map-fs-bar');
  const btn = document.getElementById('btn-map-fullscreen');
  document.body.classList.toggle('map-fs-active', next);
  if (panel) panel.classList.toggle('map-panel-fs', next);
  if (bar) bar.hidden = !next;
  if (btn) {
    btn.textContent = next ? '⛶ Réduire' : '⛶ Plein écran';
    btn.title = next ? 'Quitter le plein écran' : 'Carte en plein écran';
  }
  // En plein écran, proposer tout de suite l’édition pour placer le point
  if (next && !AppState.mapEditEnabled) setMapEditEnabled(true);
  _syncMapEditUI();
  setTimeout(() => {
    if (AppState.map) AppState.map.invalidateSize();
  }, 80);
  setTimeout(() => {
    if (AppState.map) AppState.map.invalidateSize();
  }, 320);
}

function toggleMapFullscreen(force) {
  const next = (typeof force === 'boolean') ? force : !AppState.mapFullscreen;
  setMapFullscreen(next);
}

/** Pour le bouton retour Android / Escape. */
function exitMapFullscreenIfNeeded() {
  if (!AppState.mapFullscreen) return false;
  setMapFullscreen(false);
  return true;
}

// ── Initialisation carte Leaflet ─────────────────────────────
function initMap() {
  AppState.map = L.map('map', { zoomControl: true, attributionControl: false }).setView(
    [AppState.location.lat, AppState.location.lon], 6
  );

  const initialTiles = _savedTileKey();
  setMapTiles(initialTiles);
  L.control.attribution({ prefix: false }).addTo(AppState.map);

  const icon = L.divIcon({
    html: `<div style="width:20px;height:20px;background:var(--color-accent);border:3px solid #fff;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.4)"></div>`,
    className: '',
    iconSize: [20, 20],
    iconAnchor: [10, 10]
  });

  AppState.marker = L.marker([AppState.location.lat, AppState.location.lon], {
    icon,
    draggable: false
  }).addTo(AppState.map);

  AppState.marker.on('dragend', e => {
    if (!AppState.mapEditEnabled) return;
    const { lat, lng } = e.target.getLatLng();
    setLocationCoords(lat, lng);
  });

  AppState.map.on('click', e => {
    if (!AppState.mapEditEnabled) {
      if (typeof showToast === 'function')
        showToast('Lieu verrouillé — utilisez « Modifier le lieu » dans Localisation.', 'warning');
      return;
    }
    setLocationCoords(e.latlng.lat, e.latlng.lng);
  });

  document.getElementById('btn-map-edit')?.addEventListener('click', () => toggleMapEdit(true));
  document.getElementById('btn-map-lock')?.addEventListener('click', () => toggleMapEdit(false));
  document.getElementById('btn-map-fs-edit')?.addEventListener('click', () => toggleMapEdit(true));
  document.getElementById('btn-map-fs-lock')?.addEventListener('click', () => toggleMapEdit(false));
  document.getElementById('btn-map-fullscreen')?.addEventListener('click', () => toggleMapFullscreen());
  document.getElementById('btn-map-fs-exit')?.addEventListener('click', () => setMapFullscreen(false));
  document.getElementById('map-tiles-select')?.addEventListener('change', e => {
    setMapTiles(e.target.value);
  });

  setMapEditEnabled(false);
}

// ── Définir localisation par preset ─────────────────────────
function setLocation(key) {
  if (!AppState.demoData) return;
  const loc = AppState.demoData.locations[key];
  if (!loc) return;
  AppState.location = { lat: loc.lat, lon: loc.lon, alt: loc.alt, name: loc.name };
  AppState.weatherData = loc.monthly;
  updateLocationUI();
  updateMapMarker();
  document.querySelectorAll('.preset-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.loc === key);
  });
}

// ── Définir localisation par coordonnées ────────────────────
function setLocationCoords(lat, lon) {
  AppState.location.lat = Math.round(lat * 10000) / 10000;
  AppState.location.lon = Math.round(lon * 10000) / 10000;

  // Ne snapper sur une ville démo QUE si on n'a pas de données météo réelles
  const hasRealWeather = AppState.location.name &&
    (AppState.location.name.includes('PVGIS') || AppState.location.name.includes('Open-Meteo'));

  if (AppState.demoData && !hasRealWeather) {
    let minDist = Infinity;
    let bestKey = 'paris';
    Object.entries(AppState.demoData.locations).forEach(([key, loc]) => {
      const d = Math.hypot(loc.lat - lat, loc.lon - lon);
      if (d < minDist) { minDist = d; bestKey = key; }
    });
    const loc = AppState.demoData.locations[bestKey];
    AppState.weatherData = loc.monthly;
    AppState.location.alt = loc.alt;
    AppState.location.name = `${loc.name} (approx.)`;
    document.querySelectorAll('.preset-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.loc === bestKey);
    });
  } else {
    // Coordonnées mises à jour sans changer les données météo
    document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
  }
  updateLocationUI();
  updateMapMarker();
}

function updateMapMarker() {
  if (!AppState.map || !AppState.marker) return;
  AppState.marker.setLatLng([AppState.location.lat, AppState.location.lon]);
  AppState.map.setView([AppState.location.lat, AppState.location.lon], AppState.map.getZoom());
}

function updateLocationUI() {
  const setEl = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
  const setTxt = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  const rawName = AppState.location.name || '';
  // Ne pas afficher les suffixes techniques / démo dans le champ adresse
  const cleanName = rawName
    .replace(/ \(Open-Meteo\)| \(PVGIS[^)]*\)| \(approx\.\)/gi, '')
    .replace(/\s*\(démo[^)]*\)/gi, '')
    .replace(/\s*\(demo[^)]*\)/gi, '')
    .trim();
  // Préférer l’adresse chantier client si le libellé lieu est vide / démo
  const clientAddr = (AppState.currentClient?.adresse || '').trim();
  const addrForInput = cleanName || clientAddr;
  setEl('inp-lat', AppState.location.lat.toFixed(4));
  setEl('inp-lon', AppState.location.lon.toFixed(4));
  setEl('inp-alt', AppState.location.alt);
  setEl('inp-address', addrForInput);
  setTxt('loc-name', rawName || clientAddr || '—');
  setTxt('coord-lat', AppState.location.lat.toFixed(4) + '°');
  setTxt('coord-lon', AppState.location.lon.toFixed(4) + '°');
  setTxt('coord-alt', AppState.location.alt + ' m');
}

// ── Bind coordonnées manuelles ───────────────────────────────
function initLocationInputs() {
  const applyCoords = () => {
    if (!AppState.mapEditEnabled) {
      if (typeof showToast === 'function')
        showToast('Activez « Modifier le lieu » pour changer les coordonnées.', 'warning');
      return;
    }
    const lat = parseFloat(document.getElementById('inp-lat')?.value);
    const lon = parseFloat(document.getElementById('inp-lon')?.value);
    if (isNaN(lat) || isNaN(lon)) return;
    setLocationCoords(lat, lon);
  };

  document.getElementById('btn-go-coords')?.addEventListener('click', applyCoords);
  document.getElementById('inp-lat')?.addEventListener('keydown', e => { if (e.key === 'Enter') applyCoords(); });
  document.getElementById('inp-lon')?.addEventListener('keydown', e => { if (e.key === 'Enter') applyCoords(); });

  document.getElementById('inp-address')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      if (!AppState.mapEditEnabled) toggleMapEdit(true);
      geocodeAddress();
    }
  });

  document.getElementById('btn-geocode')?.addEventListener('click', () => {
    if (!AppState.mapEditEnabled) toggleMapEdit(true);
    geocodeAddress();
  });

  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!AppState.mapEditEnabled) toggleMapEdit(true);
      setLocation(btn.dataset.loc);
    });
  });

  _syncMapEditUI();
}

// ── Géocodage Nominatim ──────────────────────────────────────
async function geocodeAddress() {
  const address = document.getElementById('inp-address').value.trim();
  if (!address) return;
  const btn = document.getElementById('btn-geocode');
  if (btn) { btn.textContent = '⏳'; btn.disabled = true; }
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`;
    const r = await fetch(url, { headers: { 'Accept-Language': 'fr' } });
    const data = await r.json();
    if (data.length > 0) {
      const { lat, lon, display_name } = data[0];
      const flatLat = parseFloat(lat);
      const flatLon = parseFloat(lon);
      const geocodedName = display_name.split(',').slice(0, 2).join(',');
      setLocationCoords(flatLat, flatLon);
      AppState.map.setView([flatLat, flatLon], 10);
      AppState.location.name = geocodedName;
      updateLocationUI();
    } else {
      if (typeof showToast === 'function') showToast(`Lieu introuvable : "${address}"`, 'warning');
    }
  } catch (e) {
    console.warn('Géocodage échoué', e);
    if (typeof showToast === 'function') showToast('Géocodage indisponible (vérifiez la connexion)', 'error');
  } finally {
    if (btn) { btn.textContent = 'Aller !'; btn.disabled = false; }
  }
}
