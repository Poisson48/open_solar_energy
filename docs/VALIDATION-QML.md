# Validation QML — niveau supérieur au legacy web

Date : **2026-09-07** · Binaire : `build-qml` Debug

## Preuves automatiques

| Suite | Résultat | Détail |
|-------|----------|--------|
| `ctest` (unitaires) | **PASS** | solar_math, cable, finance, shade, hourly, sizing, offgrid, enedis, inverter, pipeline, shade→E↓, hybrid, offgrid shade→Ppeak↑ |
| `./opensolarenergy --self-test` | **PASS** | Parcours fonctionnel complet |
| `scripts/smoke-qml.sh` | **PASS** | build + ctest + self-test |
| GUI `DISPLAY=:0` | **PASS** | Alive, log sans erreur QML |

### Self-test (valeurs mesurées)

| Assertion | Valeur |
|-----------|--------|
| Ombrage annualLossPct | 37.5 % |
| E_annual clear → shaded | 5682 → 2502 kWh |
| Offgrid Ppeak clear → shaded | 3.5 → 12 kWc |
| Hybrid sizing Ppeak | 15 kWc, 38 panneaux |
| Analyse horaire PV | 73.52 kWh/j type |
| Devis HT / lignes | 24400 € / 8 lignes + annexes |
| PDF | écrit sous Documents/OpenSolarEnergy |
| Stale fingerprint | détecte changement tilt |

## Supériorité vs legacy web

| Capacité | Legacy web | QML natif (actuel) |
|----------|------------|---------------------|
| Ombrage → dimensionnement | oui (JS) | **oui (C++)** + flag `shadeApplied` |
| Hybride batterie dans Dim. | oui | **oui** (SOC jour/nuit mensuel) |
| Invalidation résultats stale | oui | **oui** (`Pipeline` + bannière workspace) |
| Devis sync projet + annexes ombrage/prod | partiel | **oui** (`buildQuoteLines`) |
| Parcours onglet unique monté | multi-DOM | **Loader** (bindings frais) |
| Tests unitaires moteurs | absents | **ctest étendu** |
| Smoke parcours headless | absent | **`--self-test`** |
| Autoconso strategy | taux | **kWh absolus** (évite Ppeak→0) |
| Offgrid mode éco / autonomie | oui | **oui** |
| Import JSON hub | oui | **oui** |
| Stringing onduleur natif | JS | **C++ + UI** |

## Parcours utilisateur cohérent

```
Lieu (météo) → Site (horizon → monthlyLoss + halfHourlyKeep)
  → Dim.|Offgrid (consomme shade + formState)
  → Système PV (Ppeak/catalogue → fingerprint)
  → Analyse (shade 30 min + batterie)
  → Implantation (Depuis Ppeak)
  → Câbles (stringing)
  → Devis (Pipeline sync + stale warning)
```

Continuer → suit `primaryTabFlow()` selon Réseau / Hybride / Autonome.

## Implantation 3D (Qt Quick 3D)

| Check | Résultat |
|-------|----------|
| Scène multi-toitures inclinées + panneaux + soleil (az 0°=Nord via SiteShade) | **pass** |
| DirectionalLight = `Layout3D.sunLightEuler` (même soleil que le raycast) | **pass** |
| Obstacles Site (cheminée/arbre/mur) visibles en Implantation ; édition L×l×H + dist. panneau | **pass** |
| `buildWorldShadeMesh` + `ShadingEngine.samplePrecise` / `computeFull(precise)` | **pass** (ctest) |
| Ombrage 3D raycast → `siteSurvey` (`source: shading3d`, mode `3d_raycast`) / Dim. | **pass** |
| KPI live Implantation = raycast (mois/heure) ; apply au relâché / timer 700 ms | **pass** |
| Changement dims/azimut toiture → `scheduleShadeApply` (pas de profil stale) | **pass** |
| Ombres GPU DirectionalLight (aperçu) alignées sur le même soleil | **pass** |
| Switch Site ↔ Layout sans tear-down RHI (StackLayout) | **pass** |

```bash
# Dépendance desktop
sudo apt install qt6-quick3d-dev
# Tests ombre 3D
./build-qml/tests/tst_core layout3d_world_raycast_shade
```
