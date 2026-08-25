# Open Solar Energy

**Alternative open-source à PVGIS** — dimensionnement et simulation de systèmes photovoltaïques, 100 % local, sans serveur, sans inscription.

## [poisson48.github.io/open_solar_energy](https://poisson48.github.io/open_solar_energy/)

> Inspiré de [PVGIS (JRC / Commission Européenne)](https://re.jrc.ec.europa.eu/pvg_tools/fr/)

[![Dernière release](https://img.shields.io/github/v/release/Poisson48/open_solar_energy?label=version&color=f59e0b)](https://github.com/Poisson48/open_solar_energy/releases/latest)
[![CI](https://github.com/Poisson48/open_solar_energy/actions/workflows/ci.yml/badge.svg)](https://github.com/Poisson48/open_solar_energy/actions/workflows/ci.yml)
[![Téléchargements](https://img.shields.io/github/downloads/Poisson48/open_solar_energy/total?color=10b981)](https://github.com/Poisson48/open_solar_energy/releases/latest)
[![Licence MIT](https://img.shields.io/badge/licence-MIT-blue)](LICENSE)
[![Site web](https://img.shields.io/badge/site-GitHub%20Pages-0f172a)](https://poisson48.github.io/open_solar_energy/)

---

## Téléchargement

Téléchargez la dernière version — **[⬇️ Releases](https://github.com/Poisson48/open_solar_energy/releases/latest)** :

| Plateforme | Fichier | Installation |
|---|---|---|
| **PC / Linux** (x86-64) | `OpenSolarEnergy-*-x86_64.AppImage` | `chmod +x OpenSolarEnergy-*.AppImage && ./OpenSolarEnergy-*.AppImage` |
| **Android** (arm64) | `opensolarenergy-*-arm64.apk` | Ouvrir l’APK sur le téléphone (autoriser l’installation), ou `adb install -r opensolarenergy-*-arm64.apk` |

L’AppImage embarque Qt et l’interface web : un fichier, aucune dépendance système à installer.
L’APK est signé avec la clé de publication du projet — les versions suivantes s’installent **par-dessus**, et l’app vous les propose d’elle-même (comme Colo Course).

| Autre | Fichier | Notes |
|---|---|---|
| Navigateur (sans install) | — | `./serve.sh` ou site GitHub Pages |
| Linux Electron (v1.x) | `Open-Solar-Energy-*.AppImage` | Anciennes releases — conservé pour compatibilité |

**Mises à jour**
- **Android** : détection → téléchargement APK → installation in-app.
- **PC / Linux** : détection d’une version plus récente → ouverture de la page GitHub Release.

> **Sans installation** : cloner le dépôt et lancer `./serve.sh` (Linux/macOS) ou `serve.bat` (Windows), ou ouvrir le [site web](https://poisson48.github.io/open_solar_energy/).

---

## Fonctionnalités

### Calcul solaire
- Transposition **HDKR** anisotrope (Hay-Davies-Klucher-Reindl 1990) — GHI → irradiation sur plan incliné
- Intégration numérique Rb (Braun & Mitchell) valide pour tout azimut
- Corrélation d’Erbs pour estimer DHI depuis GHI
- Production PV mensuelle avec correction thermique NOCT (IEC 61215) et durée d’ensoleillement réelle
- Optimisation automatique inclinaison + azimut (brute-force 91×13 combinaisons)
- Températures de cellule, Performance Ratio, facteur de capacité
- Payback actualisé (+3 %/an hausse électricité, dégradation 0,5 %/an), VAN 25 ans, LCOE

### Dimensionnement réseau (depuis facture EDF)
- Saisie des 12 kWh mensuels ou **import CSV / ZIP Enedis** (export espace client)
- Formats supportés : journalier Wh, mensuel kWh, HP/HC, données 30 min
- Détection automatique du séparateur, de l’encodage (UTF-8/ISO-8859-1) et de l’unité
- Balayage discret 0,1 kWc → recommandation selon 3 stratégies :
  - Retour sur investissement optimal
  - Autoconsommation maximale
  - Couverture cible (% de la facture)
- Calcul des économies sur facture (tarif Base ou HP/HC), du surplus injecté, du ROI
- Courbes ROI, flux énergétiques mensuels, bilan annuel

### Dimensionnement hors réseau (autonomie batterie)
- **Import Enedis direct** depuis l’onglet Hors réseau (ZIP ou CSV, même format que réseau)
- Simulation **horaire** (24 h) si données Enedis 30 min disponibles, journalière sinon
- SOC porté d’un mois à l’autre sur 12 mois (bilan annuel réaliste)
- Recommandation : moins cher satisfaisant à la fois le taux de couverture cible **et** le budget jours-déficit (≤ 10 % des jours/an)
- Recherche optimale sur grille Ppeak × C_batterie (jusqu’à 450 combinaisons)
- **6 technologies batterie** (prix HT pro) :

| Technologie | DoD | η | Cycles | Coût |
|---|---|---|---|---|
| LFP standard (neuf) | 80 % | 97 % | 3 000 | 400 €/kWh |
| LFP DIY CATL/EVE 280Ah | 90 % | 97 % | 3 000 | 100 €/kWh + BMS 200 € |
| AGM plomb carbone | 50 % | 85 % | 600 | 120 €/kWh |
| NMC recondit. Nissan Leaf | 80 % | 96 % | 800 | 45 €/kWh + BMS 150 € |
| NMC recondit. Renault Zoé | 80 % | 96 % | 900 | 50 €/kWh + BMS 150 € |
| NMC recondit. Tesla | 85 % | 97 % | 1 000 | 65 €/kWh + BMS 200 € |

- Matrice de couverture (heatmap PV × batterie), jours de déficit, surplus mensuel

### Devis professionnel
- Onglet **Devis** dédié avec formulaire complet
- Informations **installateur** (société, SIRET, RGE, adresse) sauvegardées en localStorage
- Informations **client** (nom, société, adresse, téléphone, email)
- Descriptif **chantier** (adresse, type de toiture, surface, inclinaison, azimut)
- Import automatique des résultats du dimensionnement (puissance, production, CO₂)
- **7 lignes de coût éditables** : panneaux, onduleur, fixations, câblage, main d’œuvre, démarches admin, divers
- **3 taux de TVA** : 5,5 % (amélioration énergétique), 10 % (rénovation résidentielle), 20 % (neuf/pro)
- Remise en pourcentage, validité en jours, notes libres
- Aperçu instantané dans la page + **impression / export PDF** (mise en page A4)
- Numéro de devis auto-généré, bloc signature client

### Données météo
- **Import Open-Meteo** : API gratuite, CORS natif, moyenne 2020–2023
- **Import PVGIS** : via proxy CORS ou fichier JSON manuel
- Jeu de démo embarqué : Paris, Toulouse, Nice, Bordeaux
- Carte Leaflet interactive (clic ou glissé pour placer le site)

### Gestion de projets
- **Modal démarrage** : nouveau projet ou chargement d’un projet existant à chaque démarrage
- **Infos client** saisies à la création (nom, adresse, téléphone, email) — pré-remplies dans le devis
- **Export fichier** : chaque projet exportable en `.json` local
- Sauvegarde locale (localStorage), pas de serveur requis
- Capture de 60+ champs de formulaire + localisation + météo
- Clonage pour comparer plusieurs scénarios (orientation, technologie batterie, surface…)
- Export / import JSON (partage entre machines)
- Raccourci `Ctrl+S` pour sauvegarder

### Analyse horaire
- Profil consommation heure par heure sur une journée typique
- Source : données Enedis 30 min importées, ou profil synthétique résidentiel
- Simulation batterie avec SoC, taux d’autoconsommation, couverture
- Graphiques : production PV vs consommation, SoC batterie, tableau horaire

### Recommandation onduleurs
- Catalogue simplifié de 13 modèles (Fronius, SMA, Huawei, Solis, Growatt, GoodWe, Victron, Enphase, APsystems)
- Types : string monophasé/triphasé, hybride (avec batterie), micro-onduleurs
- Filtrage par ratio PV/onduleur, compatibilité batterie, nombre de phases
- Calcul câblage optimal (chaînes MPPT) en fonction de Voc/Isc des panneaux

---

## Démarrage rapide

### Option A — AppImage Linux (recommandé, v2.0+)

1. Télécharger `OpenSolarEnergy-*-x86_64.AppImage` depuis les [releases](https://github.com/Poisson48/open_solar_energy/releases/latest)
2. Lancer :

```bash
chmod +x OpenSolarEnergy-*.AppImage
./OpenSolarEnergy-*.AppImage
```

### Option B — Android

Installer `opensolarenergy-*-arm64.apk` depuis la [release](https://github.com/Poisson48/open_solar_energy/releases/latest).
Les mises à jour suivantes sont proposées **dans l’app**.

### Option C — Navigateur (sans installation)

```bash
git clone https://github.com/Poisson48/open_solar_energy.git
cd open_solar_energy
```

| OS | Commande |
|---|---|
| Linux / macOS | `./serve.sh` |
| Windows | double-clic sur `serve.bat` |
| Tout OS | `python3 -m http.server 8080` → http://localhost:8080 |

> Aucune dépendance à installer pour le mode navigateur. Leaflet et Chart.js sont chargés depuis CDN.

---

## Build & publication

### Prérequis desktop (Qt 6.8)

- Qt 6.8+ avec modules **WebEngine** (ou WebView), Quick, QuickControls2, Network
- CMake ≥ 3.24, Ninja, compilateur C++20

```bash
cmake -S . -B build -G Ninja -DCMAKE_PREFIX_PATH="$HOME/Qt/6.8.2/gcc_64"
cmake --build build --target opensolarenergy
# Binaire : build/src/opensolarenergy

# AppImage local
VERSION_NAME=2.0.0 QT_ROOT="$HOME/Qt/6.8.2/gcc_64" bash scripts/build-appimage.sh
```

### Android (arm64)

```bash
# Une fois : SDK/NDK + Qt Android (voir scripts/)
VERSION_NAME=2.0.0 VERSION_CODE=200 bash scripts/build-android.sh
# → opensolarenergy-arm64.apk (signé debug, ou release si ANDROID_KEYSTORE_B64 est défini)
```

### Publier une version

```bash
git tag -a v2.0.1 -m "Notes affichées dans l’app avant MAJ" && git push origin v2.0.1
```

Le workflow **Release** construit l’APK Android **et** l’AppImage Linux Qt, puis les publie sur GitHub Releases.
Le message du tag (partie avant `---`) devient le changelog affiché dans l’app.

Clé de signature Android (une fois) : `bash scripts/make-release-key.sh` puis secrets GitHub
`ANDROID_KEYSTORE_B64`, `ANDROID_KEY_ALIAS`, `ANDROID_KEYSTORE_PASS`.

### Tests

```bash
node tests/run_math_tests.js
bash scripts/validate-app.sh
```

---

## Architecture

À partir de **v2.0**, l’app native (Linux / Android) est un **shell Qt** qui embarque l’UI web existante (WebEngine / WebView) via un bridge `electronAPI`-compatible. Le mode navigateur et Electron v1.x restent disponibles.

```
open_solar_energy/
├── index.html                 Squelette HTML
├── css/main.css               Styles
├── js/                        Logique métier (math, dimensionnement, UI)
│   ├── app_state.js           État global + APP_VERSION
│   ├── solar_math.js          Algorithmes solaires (HDKR, NOCT, optimisation)
│   ├── sizing.js / offgrid_sizing.js
│   ├── enedis_import.js       Parser CSV/ZIP Enedis
│   ├── …                      charts, devis, onduleurs, projets, onglets
├── data/demo_weather.json     Météo démo (4 villes)
├── src/                       Shell Qt (C++ / QML)
│   ├── app/                   WebHost, WebBridge, Updater, Platform
│   └── qml/                   Main, WebContainer, ChangelogDialog
├── android/                   Manifest + Platform.java (install APK)
├── scripts/                   build-android, build-appimage, validate-app
├── tests/run_math_tests.js    Tests unitaires math
└── .github/workflows/         CI + Release (APK + AppImage)
```

### Modèles de calcul

| Étape | Modèle |
|---|---|
| Irradiation inclinée | HDKR anisotrope (Hay-Davies-Klucher-Reindl 1990) |
| Fraction diffuse | Corrélation d’Erbs 1982 |
| Température cellule | NOCT IEC 61215 : `Tc = Tamb + (NOCT-20) × G/800` |
| Production mensuelle | `E = H_tilt × Ppeak × PR_système × PR_température` |
| PR température | `1 + γ × max(0, Tc-25)` avec γ = −0,45 %/°C (Si cristallin) |
| ROI | `Coût / (Économies_annuelles + Revenus_injection)` |

---

## Utilisation

### 1 — Choisir le lieu
Cliquer sur la carte ou utiliser les presets (Paris, Toulouse, Nice, Bordeaux).
Pour un site réel, importer les données météo via **« Importer météo (Open-Meteo) »**.

### 2a — Dimensionnement réseau
1. Onglet **Dimensionnement**
2. Saisir les kWh mensuels **ou** importer CSV / ZIP Enedis
3. Renseigner les paramètres toiture (inclinaison, azimut — auto disponible)
4. Choisir la stratégie (ROI optimal, autoconsommation max, couverture %)
5. **Dimensionner** → résultats + graphiques + tableau mensuel

### 2b — Dimensionnement hors réseau
1. Onglet **Hors réseau**
2. Importer Enedis (ZIP/CSV) **ou** saisir la conso journalière
3. Choisir la technologie batterie et le taux de couverture
4. **Dimensionner** → système optimal (PV + batterie, coût, jours de déficit)

### 3 — Sauvegarder / Cloner
- `Ctrl+S` ou bouton **Sauvegarder** dans le header
- **Projets** → Charger / Cloner / Exporter

---

## Historique des versions

| Version | Changements |
|---|---|
| **2.0.1** | Logo Android/PC, projet démo complet (Enedis 30 min synthétique cohérent HP/HC, devis, panneaux) |
| **2.0.0** | Port Qt natif (Linux AppImage + Android APK), mises à jour auto via GitHub Releases (comme Colo Course), corrections P0 (import Enedis ZIP 30 min, production hors-réseau, câblage onduleur), tests math unitaires |
| **1.8.x** | Releases Electron AppImage (auto-update electron-updater) |
| **1.7.0** | Repasse physique et financière : Rb numérique (Braun & Mitchell), HDKR anisotrope, NOCT avec durée réelle, hourlyIrradiance exact, payback actualisé, VAN 25 ans, LCOE |
| **1.6.1** | Script `serve.sh` (Python, port libre, ouverture navigateur) |
| **1.6.0** | Hors-réseau : import Enedis, simulation horaire 30 min, SOC mensuel, recommandation coût+jours-déficit |
| **1.5.0** | Refactoring multi-fichiers, modal démarrage, analyse horaire, recommandation onduleurs |
| **1.4.0** | Module devis professionnel |
| **1.3.0** | Gestion de projets (save/load/clone/export/import JSON) |
| **1.2.0** | Import CSV Enedis multi-format, optimisation tilt+azimut |
| **1.1.0** | Lien EDF→offgrid, batteries DIY VE |
| **1.0.0** | Base : carte, onglets, calcul PV réseau / hors réseau |

---

## Feuille de route

Voir [TODO.md](TODO.md) pour le détail.

- [ ] Rapport PDF complet (jsPDF)
- [ ] Mode sombre
- [ ] TMY Open-Meteo (année météo typique)
- [ ] Tracker solaire 1/2 axes
- [ ] Internationalisation EN
- [ ] Binaire Windows natif (Qt)
- [x] Shell Qt + APK Android + AppImage Linux
- [x] Mises à jour in-app (Android) / lien Release (desktop)
- [x] Tests unitaires algorithmes solaires

---

## Licence

MIT — libre d’utilisation, modification et redistribution.

Basé sur Qt 6 (LGPL) pour les binaires natifs v2+.
