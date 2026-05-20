# Open Solar Energy

**Alternative open-source à PVGIS** - dimensionnement et simulation de systèmes photovoltaïques, 100 % local, sans serveur, sans inscription.

> Inspiré de [PVGIS (JRC / Commission Européenne)](https://re.jrc.ec.europa.eu/pvg_tools/fr/)

[![Dernière release](https://img.shields.io/github/v/release/Poisson48/open_solar_energy?label=version&color=f59e0b)](https://github.com/Poisson48/open_solar_energy/releases/latest)
[![Téléchargements](https://img.shields.io/github/downloads/Poisson48/open_solar_energy/total?color=10b981)](https://github.com/Poisson48/open_solar_energy/releases/latest)
[![Licence MIT](https://img.shields.io/badge/licence-MIT-blue)](LICENSE)
[![Site web](https://img.shields.io/badge/site-GitHub%20Pages-0f172a)](https://poisson48.github.io/open_solar_energy/)

> **Site web & téléchargement** → [poisson48.github.io/open_solar_energy](https://poisson48.github.io/open_solar_energy/)

---

## Téléchargement

| Plateforme | Fichier | Notes |
|---|---|---|
| **Linux x64** | `Open-Solar-Energy-*.AppImage` | [→ Dernière release](https://github.com/Poisson48/open_solar_energy/releases/latest) |
| Windows *(bientôt)* | `Open-Solar-Energy-*-Setup.exe` | - |

**Linux - installation rapide :**
```bash
chmod +x Open-Solar-Energy-*.AppImage
./Open-Solar-Energy-*.AppImage
```

Les mises à jour sont automatiques : l'application vérifie et installe les nouvelles versions au démarrage.

> **Utilisation sans installation** : cloner le dépôt et lancer `./serve.sh` (Linux/macOS) ou `serve.bat` (Windows).

---

## Fonctionnalités

### Calcul solaire
- Transposition **HDKR** anisotrope (Hay-Davies-Klucher-Reindl 1990) - GHI → irradiation sur plan incliné
- Intégration numérique Rb (Braun & Mitchell) valide pour tout azimut
- Corrélation d'Erbs pour estimer DHI depuis GHI
- Production PV mensuelle avec correction thermique NOCT (IEC 61215) et durée d'ensoleillement réelle
- Optimisation automatique inclinaison + azimut (brute-force 91×13 combinaisons)
- Températures de cellule, Performance Ratio, facteur de capacité
- Payback actualisé (+3 %/an hausse électricité, dégradation 0,5 %/an), VAN 25 ans, LCOE

### Dimensionnement réseau (depuis facture EDF)
- Saisie des 12 kWh mensuels ou **import CSV Enedis** (export espace client)
- Formats CSV supportés : journalier Wh, mensuel kWh, HP/HC, données 30 min
- Détection automatique du séparateur, de l'encodage (UTF-8/ISO-8859-1) et de l'unité
- Balayage discret 0,1 kWc → recommandation selon 3 stratégies :
  - Retour sur investissement optimal
  - Autoconsommation maximale
  - Couverture cible (% de la facture)
- Calcul des économies sur facture (tarif Base ou HP/HC), du surplus injecté, du ROI
- Courbes ROI, flux énergétiques mensuels, bilan annuel

### Dimensionnement hors réseau (autonomie batterie)
- **Import Enedis direct** depuis l'onglet Hors réseau (ZIP ou CSV, même format que réseau)
- Simulation **horaire** (24h) si données Enedis 30min disponibles, journalière sinon
- SOC porté d'un mois à l'autre sur 12 mois (bilan annuel réaliste)
- Recommandation : moins cher satisfaisant à la fois le taux de couverture cible **et** le budget jours-déficit (≤ 10 % des jours/an)
- Recherche optimale sur grille Ppeak × C_batterie (jusqu'à 450 combinaisons)
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
- **7 lignes de coût éditables** : panneaux, onduleur, fixations, câblage, main d'œuvre, démarches admin, divers
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
- **Modal démarrage** : nouveau projet ou chargement d'un projet existant à chaque démarrage
- **Infos client** saisies à la création (nom, adresse, téléphone, email) - pré-remplies dans le devis
- **Export fichier** : chaque projet exportable en `.json` local (bouton 📤 dans la barre et la liste)
- Sauvegarde locale (localStorage), pas de serveur requis
- Capture de 60+ champs de formulaire + localisation + météo
- Clonage pour comparer plusieurs scénarios (orientation, technologie batterie, surface…)
- Export / import JSON (partage entre machines)
- Raccourci `Ctrl+S` pour sauvegarder

### Analyse horaire (onglet 5)
- Profil consommation heure par heure sur une journée typique
- Source : données Enedis 30min importées, ou profil synthétique résidentiel
- Simulation batterie avec SoC (State of Charge), taux d'autoconsommation, couverture
- Graphiques : production PV vs consommation, SoC batterie, tableau horaire

### Recommandation onduleurs
- Catalogue simplifié de 13 modèles (Fronius, SMA, Huawei, Solis, Growatt, GoodWe, Victron, Enphase, APsystems)
- Types : string monophasé/triphasé, hybride (avec batterie), micro-onduleurs
- Filtrage par ratio PV/onduleur, compatibilité batterie, nombre de phases
- Calcul câblage optimal (chaînes MPPT) en fonction de Voc/Isc des panneaux

---

## Démarrage rapide

### Option A - AppImage Linux (recommandé)

1. Télécharger `Open-Solar-Energy-*.AppImage` depuis les [releases](https://github.com/Poisson48/open_solar_energy/releases/latest)
2. Rendre exécutable et lancer :

```bash
chmod +x Open-Solar-Energy-*.AppImage
./Open-Solar-Energy-*.AppImage
```

Les mises à jour sont automatiques au démarrage.

### Option B - Sans installation (navigateur)

```bash
git clone https://github.com/Poisson48/open_solar_energy.git
cd open_solar_energy
```

| OS | Commande |
|---|---|
| Linux / macOS | `./serve.sh` |
| Windows | double-clic sur `serve.bat` |
| Tout OS | `python3 -m http.server 8080` → http://localhost:8080 |

> Aucune dépendance à installer. Leaflet et Chart.js sont chargés depuis CDN.

---

## Architecture

```
open_solar_energy/
├── index.html                 Squelette HTML (modal + layout + balises script)
├── css/
│   └── main.css               Styles (variables CSS, flexbox/grid, responsive)
├── js/
│   ├── app_state.js           État global AppState + PROJECT_FIELDS + APP_VERSION
│   ├── solar_math.js          Algorithmes solaires (transposition, NOCT, optimisation, horaire)
│   ├── sizing.js              Moteur dimensionnement réseau (depuis facture EDF)
│   ├── offgrid_sizing.js      Moteur dimensionnement hors réseau (PV + batterie)
│   ├── enedis_import.js       Parser CSV export Enedis (multi-format)
│   ├── project_manager.js     CRUD projets localStorage + export/import JSON
│   ├── charts.js              Wrappers Chart.js (10+ types dont profils horaires)
│   ├── export.js              Export CSV / JSON / impression PDF
│   ├── quote_generator.js     Générateur de devis professionnel (HTML → impression)
│   ├── pvgis_import.js        Import Open-Meteo et PVGIS (avec fallback proxy)
│   ├── hourly_module.js       Analyse horaire : profil conso, PV, simulation batterie
│   ├── inverter_sizing.js     Recommandation onduleurs + calcul câblage MPPT
│   ├── location.js            Carte Leaflet + géocodage + chargement météo démo
│   ├── project_ui.js          Modal démarrage, CRUD projets UI, infos client
│   ├── renderers.js           Fonctions d'affichage de tous les onglets
│   ├── main.js                Point d'entrée : initialisation + assemblage
│   └── tabs/
│       ├── tab_sizing.js      HTML onglet Dimensionnement
│       ├── tab_grid.js        HTML onglet Système PV réseau
│       ├── tab_tracker.js     HTML onglet Suiveur PV
│       ├── tab_offgrid.js     HTML onglet Hors réseau
│       ├── tab_irradiation.js HTML onglet Données mensuelles
│       ├── tab_daily.js       HTML onglet Données horaires
│       ├── tab_optimizer.js   HTML onglet Optimisation
│       └── tab_quote.js       HTML onglet Devis
└── data/
    └── demo_weather.json      Données météo de 4 villes françaises
```

### Modèles de calcul

| Étape | Modèle |
|---|---|
| Irradiation inclinée | HDKR anisotrope (Hay-Davies-Klucher-Reindl 1990) |
| Fraction diffuse | Corrélation d'Erbs 1982 |
| Température cellule | NOCT IEC 61215 : `Tc = Tamb + (NOCT-20) × G/800` |
| Production mensuelle | `E = H_tilt × Ppeak × PR_système × PR_température` |
| PR température | `1 + γ × max(0, Tc-25)` avec γ = -0,45 %/°C (Si cristallin) |
| ROI | `Coût / (Économies_annuelles + Revenus_injection)` |

---

## Utilisation

### 1 - Choisir le lieu
Cliquer sur la carte ou utiliser les presets (Paris, Toulouse, Nice, Bordeaux).  
Pour un site réel, importer les données météo via **"Importer météo (Open-Meteo)"**.

### 2a - Dimensionnement réseau
1. Onglet **Dimensionnement**
2. Saisir les kWh mensuels **ou** cliquer **📂 Importer CSV Enedis**
3. Renseigner les paramètres toiture (inclinaison, azimut - bouton ⚡ Auto disponible)
4. Choisir la stratégie (ROI optimal, autoconsommation max, couverture %)
5. Cliquer **Dimensionner** → résultats + graphiques + tableau mensuel

### 2b - Dimensionnement hors réseau
1. Onglet **Hors réseau**
2. Cliquer **📂 Importer fichier Enedis (ZIP/CSV)** directement dans l'onglet **ou** saisir la conso journalière manuellement
3. Choisir la technologie batterie et le taux de couverture visé
4. Cliquer **Dimensionner** → système optimal (PV + batterie, coût, jours de déficit)

### 3 - Sauvegarder / Cloner
- `Ctrl+S` ou bouton **💾 Sauvegarder** dans le header
- **📁 Projets** → liste des projets, Charger / Cloner / Exporter

---

## Historique des versions

| Version | Changements |
|---|---|
| **1.7.0** | Repasse physique et financière complète : (1) Rb par intégration numérique (Braun & Mitchell) valide pour tout azimut - remplace la correction ad hoc `azCorr` ; (2) Modèle de transposition HDKR (Hay-Davies-Klucher-Reindl 1990) anisotrope remplace Liu & Jordan isotrope (+5-15 % précision diffuse) ; (3) Correction thermique NOCT avec durée d'ensoleillement réelle au lieu de 6 h fixe ; (4) `hourlyIrradiance` avec cos(θ) exact et HDKR horaire (Rb variait plus selon azimut) ; (5) Payback actualisé +3 %/an hausse électricité, dégradation 0,5 %/an ; (6) VAN 25 ans (NPV) à 4 % et LCOE avec dégradation |
| **1.6.1** | Script de lancement Linux `serve.sh` : détection Python, vérification port libre, ouverture navigateur auto (`xdg-open`), nettoyage propre sur Ctrl+C |
| **1.6.0** | Hors-réseau : import Enedis direct, simulation horaire avec données 30min réelles, SOC mensuel porté, recommandation coût+jours-déficit, correction battCeil depuis conso réelle. Bugs corrigés : clé `halfHourly` (données Enedis perdues au save/load), azimut `tiltedIrradiation` (azR inutilisé → azimut⚡Auto toujours -90°), nom de lieu écrasé après géocodage, auto-inclinaison non restaurée au chargement de projet, météo rechargée depuis la ville démo la plus proche pour les anciens projets |
| **1.5.1** | Serveur de développement local (`python -m http.server 8080`) via `.claude/launch.json` |
| **1.5.0** | Refactoring multi-fichiers (index.html 230 lignes, main.js 90 lignes), modal démarrage avec infos client, export projet fichier local, module analyse horaire, recommandation onduleurs (catalogue 13 modèles + câblage MPPT) |
| **1.4.0** | Module devis professionnel : client/installateur/chantier, lignes coût éditables, TVA, impression PDF |
| **1.3.2** | Barre projet sortie du header, badge version en script inline |
| **1.3.1** | UX projets : toast de confirmation, bouton coloré, badge stable, favicon |
| **1.3.0** | Gestion de projets : save/load/clone/export/import JSON (localStorage) |
| **1.2.0** | Import CSV Enedis multi-format, optimisation tilt+azimut automatique |
| **1.1.0** | Lien EDF→offgrid, prix HT pro, batteries DIY VE (CATL/EVE, Leaf, Zoé, Tesla) |
| **1.0.0** | Base : carte, onglets, calcul PV réseau, dimensionnement EDF et hors réseau |

---

## Feuille de route

Voir [TODO.md](TODO.md) pour le détail.

- [ ] Rapport PDF complet (jsPDF)
- [ ] Mode sombre
- [ ] TMY Open-Meteo (année météo typique)
- [ ] Tracker solaire 1/2 axes
- [ ] Internationalisation EN
- [ ] Tests unitaires algorithmes solaires

---

## Licence

MIT - libre d'utilisation, modification et redistribution.

---

*Développé avec [Claude Code](https://claude.ai/code) - Anthropic*
