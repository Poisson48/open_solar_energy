# Cahier des Charges — Open Solar Energy
**Version** : 0.1  
**Date** : 2026-04-11  
**Auteur** : Leo Haize Etancelin  
**Référence inspiratrice** : PVGIS (JRC European Commission)

---

## 1. Contexte et objectifs

### 1.1 Contexte
Open Solar Energy est un outil web open-source permettant à tout utilisateur (particulier, artisan, bureau d'études) d'évaluer le potentiel solaire photovoltaïque d'un site, de simuler une installation PV et d'obtenir des estimations de production d'énergie.

### 1.2 Objectifs
- Offrir une alternative libre et autonome à PVGIS, utilisable sans connexion à un serveur externe
- Fonctionner entièrement en HTML/CSS/JavaScript (pas de backend obligatoire)
- Permettre l'import de données météo locales (CSV, JSON) pour fonctionner hors-ligne
- Produire des résultats exploitables : graphiques, exports CSV/JSON, rapport PDF

### 1.3 Ce que le logiciel n'est PAS
- Un logiciel de conception électrique (pas de schémas de câblage)
- Un outil de gestion de parc PV en temps réel
- Un remplacement de logiciels professionnels comme PVsyst

---

## 2. Périmètre fonctionnel

### 2.1 Module 1 — Localisation et données météo

**Entrées utilisateur :**
- Saisie manuelle de latitude / longitude (décimales)
- Saisie d'une adresse avec géocodage (API OpenStreetMap/Nominatim, optionnel)
- Affichage sur carte interactive (Leaflet.js)
- Altitude du site (auto ou manuelle)

**Données météo :**
- Import d'un fichier CSV/JSON de données d'irradiation (format défini)
- Jeu de données de démonstration embarqué (Europe, France métropolitaine)
- Paramètres météo affichés : irradiation globale horizontale (GHI), irradiation diffuse (DHI), normale directe (DNI), température ambiante mensuelle

---

### 2.2 Module 2 — Système PV connecté au réseau

**Paramètres d'entrée :**
| Paramètre | Unité | Valeur par défaut |
|---|---|---|
| Puissance crête | kWc | 3 |
| Technologie PV | — | Silicium monocristallin |
| Inclinaison panneau | ° | 30 |
| Azimut | ° (0=Sud) | 0 |
| Pertes système | % | 14 |
| Prix du système | €/kWc | 1200 |
| Prix du kWh revendu | €/kWh | 0.13 |

**Calculs effectués :**
- Production mensuelle estimée (kWh/mois)
- Production annuelle (kWh/an)
- Performance Ratio (PR)
- Facteur de capacité (CF)
- Estimation du retour sur investissement (années)
- CO₂ évité (kg/an, basé sur mix électrique paramétrable)

**Sorties :**
- Graphique barres : production mensuelle
- Graphique ligne : irradiation vs production
- Tableau récapitulatif mensuel
- Export CSV et JSON

---

### 2.3 Module 3 — Système hors réseau (autonome)

**Paramètres d'entrée :**
| Paramètre | Unité |
|---|---|
| Puissance panneau | Wc |
| Capacité batterie | Wh |
| Profondeur de décharge max | % |
| Consommation journalière | Wh/j |
| Inclinaison / Azimut | ° |

**Calculs effectués :**
- Autonomie estimée par mois (jours sans soleil couverts)
- Taux de couverture solaire mensuel (%)
- Déficit énergétique (mois critiques)
- Recommandation de dimensionnement (panneau + batterie minimums)

**Sorties :**
- Graphique : couverture solaire mensuelle vs consommation
- Indicateur visuel mois par mois (vert / orange / rouge)
- Tableau récapitulatif

---

### 2.4 Module 4 — Données d'irradiation mensuelles

**Affichage :**
- Irradiation globale horizontale (GHI) par mois
- Irradiation sur plan incliné optimal
- Température moyenne mensuelle
- Ratio diffus/global

**Sorties :**
- Graphique combiné (barres + courbe température)
- Export CSV

---

### 2.5 Module 5 — Optimisation d'angle

**Fonctionnalité :**
- Calcul de l'inclinaison et de l'azimut optimaux pour maximiser la production annuelle
- Affichage d'une carte de chaleur production (inclinaison × azimut)
- Comparaison plan fixe vs suivi 1 axe (estimation simplifiée +15%)

---

## 3. Interface utilisateur

### 3.1 Structure générale
- Application **single-page** (SPA) en HTML/CSS/JS pur
- Navigation par onglets : un onglet par module
- Responsive (desktop prioritaire, mobile secondaire)
- Pas de framework lourd : vanilla JS ou bibliothèque légère (Alpine.js acceptable)

### 3.2 Composants UI obligatoires
- Carte interactive (Leaflet.js) pour sélection du site
- Graphiques interactifs (Chart.js)
- Formulaires de saisie avec validation en temps réel
- Bouton "Calculer" — résultats affichés sans rechargement de page
- Bouton "Exporter CSV" et "Exporter JSON" sur chaque module
- Bouton "Générer rapport PDF" (via window.print() ou jsPDF)

### 3.3 Design
- Thème clair, couleurs neutres avec accent solaire (jaune/orange)
- Icônes SVG inline (pas de dépendance FontAwesome)
- Pas de cookies, pas de tracking, pas d'appels réseau obligatoires

---

## 4. Architecture technique

### 4.1 Stack technique
| Couche | Technologie |
|---|---|
| Structure | HTML5 |
| Style | CSS3 (variables CSS, flexbox/grid) |
| Logique | JavaScript ES6+ (modules) |
| Cartographie | Leaflet.js (CDN ou local) |
| Graphiques | Chart.js (CDN ou local) |
| PDF | window.print() CSS @media print (v1), jsPDF (v2) |
| Calcul solaire | Algorithme SPA (Solar Position Algorithm) — implémentation JS |

### 4.2 Structure des fichiers
```
open_solar_energy/
├── index.html                  Point d'entrée unique
├── css/
│   ├── main.css                Styles globaux
│   └── components.css          Styles composants (cartes, formulaires)
├── js/
│   ├── main.js                 Init + routing onglets
│   ├── location.js             Gestion carte et géolocalisation
│   ├── solar_math.js           Algorithmes solaires (SPA, irradiation)
│   ├── grid_system.js          Module PV réseau
│   ├── offgrid_system.js       Module hors réseau
│   ├── irradiation.js          Module données météo
│   ├── optimizer.js            Module optimisation angles
│   ├── charts.js               Wrappers Chart.js
│   └── export.js               Export CSV, JSON, PDF
├── data/
│   └── demo_weather.json       Données météo de démonstration
└── assets/
    └── icons/                  Icônes SVG
```

### 4.3 Format des données météo (import)
```json
{
  "location": { "lat": 43.6, "lon": 1.44, "alt": 150 },
  "year": 2023,
  "monthly": [
    {
      "month": 1,
      "GHI": 52.3,
      "DHI": 28.1,
      "DNI": 85.4,
      "T_avg": 6.2
    }
  ]
}
```

---

## 5. Algorithmes et modèles de calcul

### 5.1 Position solaire
- Algorithme SPA (Solar Position Algorithm, NREL) implémenté en JS
- Calcul de l'angle zénithal, azimut solaire, heure de lever/coucher

### 5.2 Irradiation sur plan incliné
- Modèle de transposition : **Perez** (v2) ou **Liu & Jordan** (v1, plus simple)
- Prise en compte de l'albédo du sol (défaut : 0.2)

### 5.3 Production PV
```
E = H_incliné × P_crête × (1 - pertes/100) × PR_température
```
- Coefficient de température : -0.4%/°C au-dessus de 25°C (silicium standard)
- PR température calculé à partir de T_avg mensuelle

### 5.4 Retour sur investissement
```
ROI (ans) = Coût_total / (Production_annuelle × Prix_kWh_revendu)
```

### 5.5 CO₂ évité
```
CO2_évité (kg/an) = Production_annuelle × Facteur_émission
```
Facteur d'émission paramétrable (défaut France : 0.052 kgCO₂/kWh)

---

## 6. Contraintes et exigences non fonctionnelles

| Contrainte | Exigence |
|---|---|
| **Compatibilité** | Chrome, Firefox, Edge (2 dernières versions) |
| **Performance** | Calculs < 500 ms pour un site, affichage immédiat |
| **Hors-ligne** | Fonctionnel sans internet si dépendances servies localement |
| **Accessibilité** | Contraste WCAG AA minimum |
| **Licences** | Tout le code : licence MIT ou compatible |
| **Taille** | Bundle total < 2 Mo (hors données météo) |
| **Langue** | Interface en français (v1), i18n préparé pour EN (v2) |

---

## 7. Phases de développement

### Phase 1 — Socle (MVP)
- [ ] Structure HTML/CSS de l'application (onglets, layout)
- [ ] Module localisation (carte Leaflet, saisie coordonnées)
- [ ] Import et parsing des données météo JSON
- [ ] Module PV réseau (calcul + graphique Chart.js)
- [ ] Export CSV

### Phase 2 — Modules complémentaires
- [ ] Module hors réseau
- [ ] Module données irradiation mensuelle
- [ ] Module optimisation d'angle (heatmap)
- [ ] Export JSON + rapport PDF

### Phase 3 — Qualité et enrichissement
- [ ] Jeu de données météo de démonstration complet (plusieurs villes françaises)
- [ ] Géocodage via Nominatim (optionnel, avec fallback)
- [ ] Mode sombre
- [ ] Internationalisation (EN)
- [ ] Tests unitaires (algorithmes solaires)

---

## 8. Points ouverts / décisions à prendre

| # | Question | Options |
|---|---|---|
| 1 | Source des données météo par défaut | PVGIS API (online) vs fichier embarqué (offline) |
| 2 | Modèle de transposition | Liu & Jordan (simple) vs Perez (précis) |
| 3 | Dépendances locales ou CDN | CDN (simple) vs tout local (offline garanti) |
| 4 | Générateur PDF | window.print() vs jsPDF |
| 5 | Suivi solaire 1 axe | Estimation forfaitaire vs calcul complet |
