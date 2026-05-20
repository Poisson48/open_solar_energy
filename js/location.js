/**
 * location.js - Gestion de la carte et de la localisation
 * Extrait de main.js v1.4
 */

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

// ── Initialisation carte Leaflet ─────────────────────────────
function initMap() {
  AppState.map = L.map('map', { zoomControl: true, attributionControl: false }).setView(
    [AppState.location.lat, AppState.location.lon], 6
  );

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19
  }).addTo(AppState.map);

  L.control.attribution({ prefix: '© OpenStreetMap' }).addTo(AppState.map);

  const icon = L.divIcon({
    html: `<div style="width:20px;height:20px;background:var(--color-accent);border:3px solid #fff;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.4)"></div>`,
    className: '',
    iconSize: [20, 20],
    iconAnchor: [10, 10]
  });

  AppState.marker = L.marker([AppState.location.lat, AppState.location.lon], { icon, draggable: true })
    .addTo(AppState.map);

  AppState.marker.on('dragend', e => {
    const { lat, lng } = e.target.getLatLng();
    setLocationCoords(lat, lng);
  });

  AppState.map.on('click', e => {
    setLocationCoords(e.latlng.lat, e.latlng.lng);
  });
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

  if (AppState.demoData) {
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
  const cleanName = (AppState.location.name || '').replace(/ \(Open-Meteo\)| \(PVGIS\)| \(approx\.\)/g, '').trim();
  setEl('inp-lat', AppState.location.lat.toFixed(4));
  setEl('inp-lon', AppState.location.lon.toFixed(4));
  setEl('inp-alt', AppState.location.alt);
  setEl('inp-address', cleanName);
  setTxt('loc-name', AppState.location.name);
  setTxt('coord-lat', AppState.location.lat.toFixed(4) + '°');
  setTxt('coord-lon', AppState.location.lon.toFixed(4) + '°');
  setTxt('coord-alt', AppState.location.alt + ' m');
}

// ── Bind coordonnées manuelles ───────────────────────────────
function initLocationInputs() {
  document.getElementById('btn-go-coords')?.addEventListener('click', () => {
    const lat = parseFloat(document.getElementById('inp-lat').value);
    const lon = parseFloat(document.getElementById('inp-lon').value);
    if (isNaN(lat) || isNaN(lon)) return;
    setLocationCoords(lat, lon);
  });

  document.getElementById('inp-address')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') geocodeAddress();
  });

  document.getElementById('btn-geocode')?.addEventListener('click', geocodeAddress);

  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => setLocation(btn.dataset.loc));
  });
}

// ── Géocodage Nominatim ──────────────────────────────────────
async function geocodeAddress() {
  const address = document.getElementById('inp-address').value.trim();
  if (!address) return;
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`;
    const r = await fetch(url, { headers: { 'Accept-Language': 'fr' } });
    const data = await r.json();
    if (data.length > 0) {
      const { lat, lon, display_name } = data[0];
      const geocodedName = display_name.split(',').slice(0, 2).join(',');
      setLocationCoords(parseFloat(lat), parseFloat(lon));
      AppState.map.setView([lat, lon], 10);
      // Restore geocoded name (setLocationCoords snaps to nearest demo city)
      AppState.location.name = geocodedName;
      updateLocationUI();
    }
  } catch (e) {
    console.warn('Géocodage échoué', e);
  }
}
