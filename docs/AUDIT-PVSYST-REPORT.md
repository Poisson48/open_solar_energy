# Audit : rapport type PVsyst vs rapport OSE

*Références récupérées le 2026-09-10 :*
- Tutoriel officiel [PVsyst 7 — Grid-connected](https://www.pvsyst.com/pdf/pdf-tutorials/pvsyst-7/pvsyst-tutorial-v7-grid-connected-1-en.pdf) (structure du rapport 6–8+ pages)
- Aide [Loss diagram](https://www.pvsyst.com/help/project-design/results/loss-diagram.html), [Normalised performance index](https://www.pvsyst.com/help/project-design/results/normalised-performance-index.html) (IEC 61724)
- **PDF échantillon public** : [`fixtures/pvsyst-sample-grid-7kwc-kolkata.pdf`](fixtures/pvsyst-sample-grid-7kwc-kolkata.pdf)  
  PVsyst 7.3.1 — grid 7,04 kWp — Taliganja (IN) — **9583 kWh/an** — **1361 kWh/kWp** — **PR 82,13 %**

Objectif OSE : un document **aussi dense et lisible** (pas un clone commercial .PAN/.OND / Meteonorm payant).

---

## 1. Structure canonique d’un rapport PVsyst (grid)

| Page | Contenu | OSE PDF aujourd’hui |
|------|---------|---------------------|
| **1** Couverture | Projet, variante, version soft, type système, Pnom, lieu | PARTIEL (couverture projet/client, pas « variante » ni version moteur) |
| **2** Summary + TOC | Site (lat/lon/alt/TZ), météo (Meteonorm…), orientation, shadings, **Results summary** (E_y, kWh/kWp, PR), table des matières | PARTIEL (pas TOC, pas PR en une ligne summary) |
| **3** General parameters | Transposition Perez, albedo, horizon, **PV Array Characteristics** (marque/modèle, strings × series, Ummpp/Impp, aire modules), **Inverters** (Pnom AC, Pnom ratio DC/AC), **Array losses** (Uc/Uv, mismatch %, wiring Ω, IAM bo, quality) | PARTIEL (modules génériques, stringing ailleurs, Uc partiel study, pas page technique stringing) |
| **4** Main results | E_y, specific prod, **PR** ; graphiques **Yr/Ya/Yf/Lc/Ls** ; table mensuelle **GlobHor, DiffHor, T_Amb, GlobInc, GlobEff, EArray, E_Grid, PR** | PARTIEL (E_y, kWh/kWp si dispo ; table Prod/Conso/Autoconso — **pas** GlobInc/GlobEff/EArray/PR mensuel) |
| **5** Loss diagram | Flèche énergétique GlobHor → … → E_Grid avec % séquentiels | PARTIEL (lossTree forfaitaire listé ; **pas** diagramme fléché ni énergies intermédiaires kWh) |
| **6** Predef. graphs | Daily Input/Output ; distribution puissance injectée | MANQUE |
| **7** Single-line | Schéma unifilaire strings / onduleurs | MANQUE |
| **(+)** Horizon / Near shadings | Sun path + points horizon ; iso-shadings 3D | PARTIEL (site a les données ; PDF = % annuel + nb points) |
| **(+)** Stand-alone | LOL, SolFrac, passage batterie, aging | PARTIEL (section offgrid sommaire) |
| **(+)** Aging / Eco | Dégradation année N ; feuille économique | PARTIEL (finance sizing ; pas aging year #N sur loss diagram) |

Avec horizon + near shadings, le tutoriel indique **~8 pages** (pages dédiées ombrage).

---

## 2. Table « Balances and main results » (cœur page 4)

Exemple extrait du PDF Kolkata (année) :

| Variable | Unité | Sens PVsyst | OSE |
|----------|-------|-------------|-----|
| **GlobHor** | kWh/m² | GHI | OK (météo mensuelle) |
| **DiffHor** | kWh/m² | DHI | OK si stocké (souvent oui) |
| **T_Amb** | °C | Température ambiante | OK (`T_avg`) |
| **GlobInc** | kWh/m² | Irradiation plan collecteur (après transposition) | **MANQUE** en résultat persisté / PDF |
| **GlobEff** | kWh/m² | GlobInc corrigé IAM + ombrage (+ soiling optique) | **MANQUE** |
| **EArray** | kWh | Énergie sortie champ (avant / au MPP array) | **MANQUE** (on a E AC-ish global) |
| **E_Grid** | kWh | Énergie injectée / utile | PARTIEL (`E_annual`) |
| **PR** | — | Yf / Yr = E_Grid / (GlobInc × Pnom) | **MANQUE** (calculable si GlobInc) |

Sans **GlobInc** + **E_Grid** cohérents, impossible d’afficher un **PR** crédible façon PVsyst / IEC 61724.

---

## 3. Indices normalisés IEC 61724 (graphiques page 4)

| Indice | Définition | OSE |
|--------|------------|-----|
| **Yr** | Yield de référence ≈ GlobInc [kWh/kWp/j] | MANQUE |
| **Ya** | Yield array = EArray / Pnom | MANQUE |
| **Yf** | Yield final = E_Grid / Pnom | PARTIEL (kWh/kWp/an seulement) |
| **Lc** | Collection loss = Yr − Ya | MANQUE |
| **Ls** | System loss = Ya − Yf | MANQUE |
| **PR** | Yf / Yr | MANQUE |
| **Lu** | Unused (stand-alone / saturation) | PARTIEL (surplus / clipping study) |

---

## 4. Loss diagram (page 5) — chaîne d’énergie

Ordre typique (grid). Chaque % est **relatif à l’étape précédente** (non additif).

```
GlobHor
  → (+/−) GlobInc          transposition
  → (−) Far shadings       horizon
  → (−) Near shadings      ombrage proche (irradiance)
  → (−) Soiling
  → (−) IAM
  → GlobEff × Area
  → EArrNom                conversion STC (η module × GlobEff × Area)
  → (−) Irradiance level   bas flux
  → (−) Temperature        Uc / Uv / vent
  → (±) Module quality
  → (−) LID
  → (−) Mismatch (+ shade electrical)
  → (−) Ohmic DC
  → EArrMPP
  → (−) Inverter η / overload / thresholds / night
  → EOutInv
  → (−) AC wiring / transformer / unavailability
  → E_Grid
```

### Mapping OSE actuel

| Étape PVsyst | OSE moteur | OSE PDF |
|--------------|------------|---------|
| GlobHor / DiffHor | weatherData | table GHI/DHI |
| GlobInc | `transposeHourlyReal` / mensuel | non exposé |
| Far / near shade | halfHourlyKeep (+ electrical study) | % annuel seulement |
| Soiling / IAM / mismatch / ohm / LID / dispo | **lossTree** forfait | liste % (pas kWh intermédiaires) |
| Temp / bas flux | NOCT ou U study | pas flèche dédiée |
| EArrNom / EArrMPP | non séparés | — |
| Inverter η + clip | YearPv `acFromDc` study | KPI clip toast ; pas PDF |
| AC ohm / unavail | lossTree ohmicAc / availability | dans arbre forfait |
| E_Grid | E_annual | OK sommaire |

**Écart clé** : OSE a un **arbre de facteurs utilisateur** ; PVsyst a un **bilan énergétique simulé pas-à-pas** (kWh à chaque nœud). Pour un document « aussi détaillé », il faut stocker un objet `lossDiagram: [{label, energyKwh, deltaPct}, …]` produit par le moteur study (idéalement) ou reconstruit a posteriori.

---

## 5. Page paramètres array / onduleur (page 3)

| Élément PVsyst | OSE |
|----------------|-----|
| Fiche module (.PAN) : Voc, Vmpp, Impp, η STC, aire | Catalogue partiel ; PDF = n × Wc |
| Strings × modules série ; U/I @ 50 °C | `Inverter.calcStringing` existe, **hors rapport** |
| Onduleur Pnom AC, plage V, **Pnom ratio** DC/AC | Catalogue ; ratio non mis en avant PDF |
| Uc [W/m²K], Uv vent | `mountU` / thermal study | PARTIEL |
| IAM ASHRAE bo | forfait lossTree | MANQUE modèle bo |
| Résistance câble array (mΩ) → ohmic | câble onglet séparé | PARTIEL |

---

## 6. Graphiques & annexes

| Élément | OSE |
|---------|-----|
| Normalized productions (barres Yr/Ya/Yf) | MANQUE |
| Courbe PR mensuelle | MANQUE |
| Daily Input/Output (scatter GlobInc vs E_Grid) | MANQUE (Analyse a des profils jour, pas PDF) |
| Histogramme puissance injectée (heures @ P) | MANQUE |
| Single-line diagram | MANQUE |
| Horizon sun-path + table az/elev | Données site ; **pas** dans PDF |
| Iso-shadings / facteur ombrage 3D | ShadingEngine ; **pas** image PDF |

---

## 7. Ce qu’OSE a déjà en plus (à garder)

PVsyst grid « standard » ne met pas autant l’accent sur :

- Autoconso / surplus / couverture charge client  
- Devis commercial + TVA  
- Offgrid LOL / heatmap / horizon 30 ans batterie  
- Comparaison PVcalc JRC  

→ Stratégie : **Rapport « Étude productible (style PVsyst) »** + **Rapport projet client** (actuel), ou sections clairement séparées dans le même PDF.

---

## 8. Checklist pour atteindre le niveau de détail PVsyst

### P0 — Fondations (sans ça, pas de PR / pas de diagramme)

1. Persister **GlobInc / GlobEff / EArray / E_Grid mensuels + annuels** (mode study prioritaire ; fast OK en approximation)  
2. Calculer **PR**, **Yr, Ya, Yf, Lc, Ls** (an + mensuel)  
3. Construire **`lossDiagram[]`** avec énergies kWh et % séquentiels  
4. PDF page **Main results** : 3 KPI (E_y, kWh/kWp, PR) + table balances 8 colonnes  
5. PDF page **Loss diagram** : rendu fléché (même sommaire en liste indentée + barres)

### P1 — Parité page paramètres

6. Bloc **PV Array** : fabricant, modèle, Wp, n, strings×série, aire, η STC  
7. Bloc **Inverter** : modèle, Pnom AC, Pnom ratio, stringing résumé  
8. **Uc / Uv**, IAM bo (ou Martin–Ruiz), mismatch / quality / LID déjà dans lossTree → les brancher **dans** le diagramme (pas seulement en forfait global)  
9. Altitude, albedo, modèle transposition (nommer Hay/Perez/… ce qu’OSE utilise vraiment)

### P2 — Graphiques & ombrage

10. Barres Yr/Ya/Yf + PR mensuel (QPainter)  
11. Page horizon (sun path simplifié + table points)  
12. Snapshot ombrage 3D (PNG scène → PDF) si disponible  
13. Histogramme clipping / puissance AC (study + useInverterModel)

### P3 — Stand-alone / aging / SLD

14. Loss diagram offgrid : fraction via batterie, Lu, SolFrac  
15. Aging année N (dégradation) sur diagramme  
16. Schéma unifilaire simple (strings → onduleur → injection)  
17. Variante / fingerprint moteur + version OSE sur couverture

---

## 9. Données à produire côté moteur (schéma proposé)

```json
{
  "balancesMonthly": [
    {
      "month": 1,
      "GlobHor": 112.6, "DiffHor": 61.1, "T_Amb": 17.3,
      "GlobInc": 137.2, "GlobEff": 133.8,
      "EArray": 853, "E_Grid": 828, "PR": 0.857
    }
  ],
  "kpi": {
    "E_Grid_y": 9583,
    "specificYield": 1361,
    "PR": 0.821,
    "Yr_d": 4.54, "Ya_d": 3.85, "Yf_d": 3.73,
    "Lc_d": 0.69, "Ls_d": 0.12
  },
  "lossDiagram": [
    { "id": "GlobHor", "energy": 1574, "unit": "kWh/m2" },
    { "id": "GlobInc", "energy": 1657, "unit": "kWh/m2", "deltaPct": 5.3 },
    { "id": "IAM", "deltaPct": -2.64 },
    { "id": "GlobEff", "energy": 1614, "unit": "kWh/m2" },
    { "id": "EArrNom", "energy": 11367, "unit": "kWh" },
    { "id": "TempLoss", "deltaPct": -10.21 },
    { "id": "EArrMPP", "energy": 9903, "unit": "kWh" },
    { "id": "InvLoss", "deltaPct": -2.93 },
    { "id": "E_Grid", "energy": 9583, "unit": "kWh" }
  ]
}
```

Source naturelle : étendre `YearPv::analyzeStudyYear` / pipeline sizing pour remplir `project.pvsystLikeBalances` (nom indicatif), puis `PdfExport`.

---

## 10. Non-objectifs (honnêteté produit)

Ne pas promettre dans le PDF :

- Bases **.PAN / .OND** certifiées constructeur  
- Meteonorm / satellite propriétaire  
- Module Layout cellulaire exhaustif  
- Bifacial spectral complet  
- Comparaison de variantes PVsyst native  

Mentionner clairement : *« Diagramme de pertes et PR selon logique IEC 61724 / usage PVsyst ; modèles OSE open-source (Open-Meteo / transpose / lossTree / ombrage 3D). »*

---

## 11. Verdict

| Niveau | Contenu | Effort relatif |
|--------|---------|----------------|
| **Parité lecture PVsyst page 4–5** | Table GlobHor…PR + loss diagram kWh | **P0** — le plus rentable |
| **Parité page 3** | Array / onduleur / Uc / stringing | P1 |
| **Parité pages 6–7 + ombrage** | Graphs + SLD + sun path | P2–P3 |

Le rapport OSE actuel est un **dossier projet + productible sommaire**.  
Un rapport PVsyst est un **audit énergétique normalisé** (balances + flèches de pertes + PR).

La brique manquante n’est pas « plus de prose PDF » : c’est **instrumenter la simulation pour exposer GlobInc, GlobEff, EArray, E_Grid et le loss diagram**, puis les dessiner.

Voir aussi l’audit complémentaire PVGIS : [`AUDIT-PVGIS-REPORT.md`](AUDIT-PVGIS-REPORT.md) (référence JRC plus légère, utile en annexe de validation).

---

## Sources

- https://www.pvsyst.com/pdf/pdf-tutorials/pvsyst-7/pvsyst-tutorial-v7-grid-connected-1-en.pdf  
- https://www.pvsyst.com/help/project-design/results/loss-diagram.html  
- https://www.pvsyst.com/help/project-design/results/normalised-performance-index.html  
- Fixture : `docs/fixtures/pvsyst-sample-grid-7kwc-kolkata.pdf`  
- Code OSE : `src/persist/pdf_export.cpp`, `src/core/year_pv.cpp`, `src/core/shading_engine.cpp`  
