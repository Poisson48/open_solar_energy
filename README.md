# Open Solar Energy

**Alternative open-source à PVGIS** — dimensionnement et simulation de systèmes photovoltaïques, 100 % navigateur, sans serveur, sans inscription.

> Inspiré de [PVGIS (JRC / Commission Européenne)](https://re.jrc.ec.europa.eu/pvg_tools/fr/)

---

## Fonctionnalités

### Calcul solaire
- Transposition Liu & Jordan (GHI → irradiation sur plan incliné)
- Corrélation d'Erbs pour estimer DHI depuis GHI
- Production PV mensuelle avec correction thermique NOCT (IEC 61215)
- Optimisation automatique inclinaison + azimut (brute-force 91×13 combinaisons)
- Températures de cellule, Performance Ratio, facteur de capacité

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
- Import direct de la consommation depuis l'onglet EDF (conversion kWh/mois → Wh/j)
- Recherche optimale sur grille Ppeak × C_batterie (1 183 combinaisons)
- Simulation journalière SOC (State of Charge) sur 365 jours
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

### Données météo
- **Import Open-Meteo** : API gratuite, CORS natif, moyenne 2020–2023
- **Import PVGIS** : via proxy CORS ou fichier JSON manuel
- Jeu de démo embarqué : Paris, Toulouse, Nice, Bordeaux
- Carte Leaflet interactive (clic ou glissé pour placer le site)

### Gestion de projets
- Sauvegarde locale (localStorage), pas de serveur requis
- Capture de 60+ champs de formulaire + localisation + météo
- Clonage pour comparer plusieurs scénarios (orientation, technologie batterie, surface…)
- Export / import JSON (partage entre machines)
- Raccourci `Ctrl+S` pour sauvegarder

---

## Démarrage rapide

```bash
git clone https://github.com/Poisson48/open_solar_energy.git
cd open_solar_energy
```

Ouvrir `index.html` dans un navigateur, **ou** servir localement :

```bash
python3 -m http.server 8080
# → http://localhost:8080
```

> Aucune dépendance à installer. Leaflet et Chart.js sont chargés depuis CDN.  
> Pour une utilisation hors-ligne, télécharger les CDN et adapter les chemins dans `index.html`.

---

## Architecture

```
open_solar_energy/
├── index.html                 Point d'entrée unique (SPA)
├── css/
│   └── main.css               Styles (variables CSS, flexbox/grid, responsive)
├── js/
│   ├── solar_math.js          Algorithmes solaires (transposition, NOCT, optimisation)
│   ├── sizing.js              Moteur dimensionnement réseau (depuis facture EDF)
│   ├── offgrid_sizing.js      Moteur dimensionnement hors réseau (PV + batterie)
│   ├── enedis_import.js       Parser CSV export Enedis (multi-format)
│   ├── project_manager.js     CRUD projets localStorage + export/import JSON
│   ├── charts.js              Wrappers Chart.js (10+ types de graphiques)
│   ├── export.js              Export CSV / JSON / impression PDF
│   ├── pvgis_import.js        Import Open-Meteo et PVGIS (avec fallback proxy)
│   └── main.js                Initialisation, état global AppState, UI
└── data/
    └── demo_weather.json      Données météo de 4 villes françaises
```

### Modèles de calcul

| Étape | Modèle |
|---|---|
| Irradiation inclinée | Liu & Jordan (isotrope) |
| Fraction diffuse | Corrélation d'Erbs 1982 |
| Température cellule | NOCT IEC 61215 : `Tc = Tamb + (NOCT-20) × G/800` |
| Production mensuelle | `E = H_tilt × Ppeak × PR_système × PR_température` |
| PR température | `1 + γ × max(0, Tc-25)` avec γ = -0,45 %/°C (Si cristallin) |
| ROI | `Coût / (Économies_annuelles + Revenus_injection)` |

---

## Utilisation

### 1 — Choisir le lieu
Cliquer sur la carte ou utiliser les presets (Paris, Toulouse, Nice, Bordeaux).  
Pour un site réel, importer les données météo via **"Importer météo (Open-Meteo)"**.

### 2a — Dimensionnement réseau
1. Onglet **Dimensionnement**
2. Saisir les kWh mensuels **ou** cliquer **📂 Importer CSV Enedis**
3. Renseigner les paramètres toiture (inclinaison, azimut — bouton ⚡ Auto disponible)
4. Choisir la stratégie (ROI optimal, autoconsommation max, couverture %)
5. Cliquer **Dimensionner** → résultats + graphiques + tableau mensuel

### 2b — Dimensionnement hors réseau
1. Onglet **Hors réseau**
2. Cliquer **↓ Importer depuis la facture EDF** (si étape 2a déjà faite) **ou** saisir la conso journalière
3. Choisir la technologie batterie
4. Cliquer **Dimensionner hors réseau** → système optimal + heatmap PV × batterie

### 3 — Sauvegarder / Cloner
- `Ctrl+S` ou bouton **💾 Sauvegarder** dans le header
- **📁 Projets** → liste des projets, Charger / Cloner / Exporter

---

## Historique des versions

| Version | Changements |
|---|---|
| **1.3.1** | UX projets : toast de confirmation, bouton coloré, badge stable, favicon |
| **1.3.0** | Gestion de projets : save/load/clone/export/import JSON (localStorage) |
| **1.2.0** | Import CSV Enedis multi-format, optimisation tilt+azimut automatique |
| **1.1.0** | Lien EDF→offgrid, prix HT pro, batteries DIY VE (CATL/EVE, Leaf, Zoé, Tesla) |
| **1.0.0** | Base : carte, onglets, calcul PV réseau, dimensionnement EDF et hors réseau |

---

## Feuille de route

- [ ] Mode sombre
- [ ] Suivi solaire 1 axe / 2 axes (tracker)
- [ ] Rapport PDF (jsPDF)
- [ ] Données météo typiques (TMY) via Open-Meteo
- [ ] Internationalisation EN
- [ ] Géocodage Nominatim (recherche par adresse)
- [ ] Tests unitaires algorithmes solaires

---

## Licence

MIT — libre d'utilisation, modification et redistribution.

---

*Développé avec [Claude Code](https://claude.ai/code) — Anthropic*
