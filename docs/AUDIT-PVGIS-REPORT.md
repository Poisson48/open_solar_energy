# Audit : rapport type PVGIS vs rapport OSE

*Référence récupérée le 2026-09-10 : API JRC `PVcalc` v5.2 + doc [Grid-connected PV](https://joint-research-centre.ec.europa.eu/photovoltaic-geographical-information-system-pvgis/using-pvgis-5/pvgis-5-tools/grid-connected-pv_en) + manuel PVGIS 5.*

**Fixture réelle** : [`fixtures/pvgis-pvcalc-toulouse-3kwc.json`](fixtures/pvgis-pvcalc-toulouse-3kwc.json)  
Toulouse 43.6045 / 1.444 — 3 kWc — tilt 30° — azimut Sud — pertes 14 %  
→ **E_y = 3885,6 kWh/an** · **H(i)_y = 1645 kWh/m²** · **SD_y = 123 kWh** · **l_total = −21,3 %**

Le « PDF PVGIS » web = **restitution de ces mêmes blocs** (inputs + tableau mensuel + totaux + pertes l_aoi / l_spec / l_tg + graphiques). Ce n’est pas un dossier PVsyst commercial ; c’est un **compte rendu de productible standardisé**.

---

## 1. Ce que contient un compte rendu PVGIS (PVcalc)

### 1.1 En-tête / inputs (toujours présents)

| Bloc | Champs | OSE rapport PDF | Données OSE dispo ? |
|------|--------|-----------------|---------------------|
| Lieu | lat, lon, **elevation** | lat/lon ; altitude souvent « — » | PARTIEL (terrain DEM → `form.terrainElev` / `terrain`, pas toujours `location.alt`) |
| Météo | `radiation_db` (SARAH2…), `meteo_db` (ERA5), **year_min/max**, horizon DEM | source Open-Meteo/PVGIS vague | PARTIEL (`weatherMeta.source` ; pas période SARAH ni elevation JRC) |
| Montage | slope, azimuth, **optimal?** , type free / building | tilt, azimut | PARTIEL (pas flag « optimal », pas type montage PDF) |
| Module | technology (c-Si…), peak_power, **system_loss** | Ppeak, pertes %, lossTree | OK / PARTIEL |
| Économie | system_cost, interest, lifetime → **LCOE** | coût, payback, LCOE si sizing | PARTIEL (pas LCOE PVGIS `pvprice=1`) |

### 1.2 Tableau mensuel (cœur du PDF)

Pour chaque mois 1–12 + ligne année :

| Champ PVGIS | Unité | Sens | OSE PDF |
|-------------|-------|------|---------|
| **E_d** | kWh/j | Prod moyenne journalière | MANQUE (on a prod mensuelle / an) |
| **E_m** | kWh/mois | Prod mensuelle | PARTIEL (colonne Prod si sizing/grid) |
| **H(i)_d** | kWh/m²/j | Irradiation plan incliné | MANQUE |
| **H(i)_m** | kWh/m²/mois | Irradiation plan incliné | MANQUE (on a GHI horizontal, pas H(i)) |
| **SD_m** | kWh | Écart-type interannuel mensuel | MANQUE |

Totaux année : **E_y**, **H(i)_y**, **SD_y**, E_d / H(i)_d moyens.

### 1.3 Pertes « physiques » PVGIS (différentes du lossTree OSE)

| Code | Signification | OSE |
|------|---------------|-----|
| **l_aoi** | IAM / angle d’incidence | Approximé dans lossTree `iam` (forfait), pas calculé comme PVGIS |
| **l_spec** | Spectral (peut être un *gain*) | MANQUE |
| **l_tg** | Température + bas flux | PARTIEL (NOCT / U dans YearPv, pas exposé en % rapport) |
| **l_total** | Combiné + pertes système utilisateur | PARTIEL (lossTree ou 14 % ; pas aligné sur décomposition PVGIS) |

> PVGIS sépare clairement : **pertes climatiques calculées** (AOI, spectral, T) **+** pertes système utilisateur. OSE mélange souvent les deux dans un arbre éditable.

### 1.4 Graphiques PDF web PVGIS

- Courbe / barres **E_m** mensuel  
- Barres **H(i)_m**  
- Parfois comparaison optimal vs choisi  

OSE : **pas de graphiques dans le PDF** (tables texte seulement).

### 1.5 Hors PVcalc mais utiles pour un dossier « aussi détaillé »

| Outil PVGIS | Contenu | OSE |
|-------------|---------|-----|
| MRcalc | GHI / DHI / T mensuels | OK (Open-Meteo / PVGIS météo) |
| TMY | 8760 h GHI, DHI, T, vent, RH… | PARTIEL (TMY Open-Meteo GHI/DHI/T ; pas vent/RH/IR dans le rapport) |
| Horizon | profil DEM | OK site + 3D ; PDF = % annuel + nb points |
| Tracking | 1 / 2 axes | PARTIEL (onglet Tracker indicatif, hors PDF) |

---

## 2. Ce que le rapport OSE a en plus (hors scope PVGIS)

PVGIS grid-connected **ne fait pas** :

- Autoconso / surplus / couverture charge  
- Batterie / offgrid / horizon 30 ans  
- Ombrage proche 3D / keep électrique  
- Devis / câbles / stringing  

OSE les a déjà (sections 5–7 PDF). À **conserver** : un rapport « style PVGIS » doit être une **annexe productible**, pas remplacer le bilan énergie-client.

---

## 3. Écart critique pour égaler le détail PVGIS

### P0 — Bloquant pour un PDF « look PVGIS »

1. **Table mensuelle E_d / E_m / H(i)_d / H(i)_m** (OSE + éventuellement colonne PVcalc en parallèle)  
2. **Persister le JSON PVcalc complet** dans le projet (`pvgisPvcalc`) : aujourd’hui `Pvgis.lastPvcalc` ignore `E_d`, `SD_*`, `l_aoi`, `l_spec`, `l_tg`, `elevation`, `radiation_db`, `year_min/max`  
3. **Section PDF « Référence PVGIS »** : E_y, H(i)_y, l_*, SD_y + tableau mensuel + écart % vs OSE  
4. **Altitude** : écrire `location.alt` depuis Terrain / réponse PVcalc  

### P1 — Crédibilité étude

5. **H(i) OSE** : pour chaque mois, irradiation plan incliné (déjà calculable via `SolarMath` / YearPv) exposée dans sizingResult + PDF  
6. **Productible spécifique** E_y / Ppeak (OSE le fait si E_annual) + **PR** ≈ E_y / (Ppeak × H(i)_y)  
7. **Graphiques PDF** : barres E_m et H(i)_m (QPainter)  
8. **Métadonnées météo** : DB, période, horizon on/off, type montage (free / building), tech module  

### P2 — Parité pertes PVGIS

9. Calculer et publier **l_aoi, l_tg** (et l_spec stub ou import PVGIS)  
10. Afficher **deux arbres** : pertes climatiques (calculées) vs pertes système (lossTree)  
11. Option API `pvprice=1` → LCOE PVGIS dans le PDF  

### P3 — Nice-to-have

12. Variabilité **SD_m / SD_y** (uniquement via PVGIS multi-années ; OSE TMY 1 an ne peut pas inventer SD)  
13. Inclure CSV / JSON annexes au ZIP export  
14. Optimal tilt/azimut (Optimizer) marqué dans le PDF  
15. Tracking dans le rapport si projet Tracker  

---

## 4. Checklist d’implémentation (ordre recommandé)

```
[ ] 1. Enrichir PvgisClient::fetchPvcalc → stocker inputs + totals complets + monthly E_d/H(i)/SD
[ ] 2. Projects.updateCurrent({ pvgisPvcalc: ... }) depuis TabLocation
[ ] 3. PDF § « Référence JRC PVGIS » (fixture Toulouse comme test golden)
[ ] 4. Calculer monthly H(i)_m côté OSE (fast + study) → sizingResult.monthlyPoa
[ ] 5. PDF tableau productible OSE : mois | E_m | E_d | H(i)_m | H(i)_d | kWh/kWc
[ ] 6. PR annuel + écart OSE vs PVcalc (déjà toast Lieu → formaliser PDF)
[ ] 7. Barres mensuelles QPainter dans pdf_export
[ ] 8. Altitude + meta météo (SARAH / Open-Meteo year / horizon)
[ ] 9. Exposer l_tg / IAM depuis YearPv (ou coller valeurs PVGIS si import)
[ ] 10. Doc utilisateur : « Rapport productible ≈ PVGIS » vs « Rapport projet OSE »
```

---

## 5. Données déjà là vs à produire

| Besoin PDF | Source actuelle | Action |
|------------|-----------------|--------|
| E_y OSE | sizing / grid / YearPv study | OK |
| E_m OSE | monthly sizing | OK si recalc récent |
| H(i)_* OSE | calculable, non stocké | **produire** |
| E_y / H(i) / l_* / SD PVGIS | API (partiel dans lastPvcalc) | **enrichir + persister** |
| lossTree | formState | OK PDF |
| Ombrage | siteSurvey | OK sommaire |
| Graphiques | — | **à coder** |
| SD interannuel OSE | impossible sans multi-années | **citer PVGIS uniquement** |

---

## 6. Verdict

Pour un document **aussi détaillé qu’un PDF PVGIS PVcalc**, il ne manque pas un « moteur magique » : il manque surtout de **matérialiser dans le PDF** ce que PVGIS publie déjà (et qu’OSE calcule ou peut importer) :

1. **Irradiation sur plan incliné mensuelle** (pas seulement GHI)  
2. **Bloc référence PVGIS complet** (pertes l_aoi / l_spec / l_tg, SD_y, elevation, DB)  
3. **Mise en page type fiche** (tableau dense + 2 graphiques)  

OSE peut même **surpasser** PVGIS sur autoconso / ombrage 3D / batterie — à condition de garder une section « productible standard » clairement séparée, comparable 1:1 au JSON ci-dessus (fixture Toulouse : **~3886 kWh/an** pour 3 kWc).

---

## Sources

- https://re.jrc.ec.europa.eu/api/v5_2/PVcalc (JSON Toulouse 3 kWc)  
- https://joint-research-centre.ec.europa.eu/.../grid-connected-pv_en  
- https://joint-research-centre.ec.europa.eu/.../pvgis-5-user-manual_en  
- Code OSE : `src/persist/pdf_export.cpp` (`exportSimulationReport`), `src/net/pvgis_client.cpp`  
