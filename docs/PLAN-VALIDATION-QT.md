# Plan maître — Open Solar Energy (natif QML)

**Statut 2026-09** : réécriture **QML + C++** complète (plus de WebView/WebEngine).

## Livré

- UI QML : hub, barre projet, tous les onglets
- Core C++ : HDKR, sizing, offgrid, finance, câbles, Enedis, onduleur
- Carte OSM (`image://osm/`) + Nominatim + Open-Meteo + PVGIS
- Ombrage site (horizon → `halfHourlyKeep` 48 slots)
- Analyse horaire + simu batterie
- Catalogue Matériel (panneaux / onduleurs)
- Partage Nostr (AES-GCM + schnorr secp256k1) + invite locale
- PDF devis, historique snapshots, export JSON
- Archive web : `docs/legacy-web/`

## Validation

```bash
./scripts/validate-app.sh
cmake -S . -B build && cmake --build build && ctest --test-dir build --output-on-failure
sudo apt install libssl-dev libsecp256k1-dev   # deps partage Nostr
```
