# Plan maître — Validation & port Qt Open Solar Energy

**Version app web** : 1.8.6  
**Objectif** : zéro perte fonctionnelle, même style visuel (`#1a6b3c` / `#f5a623`), Linux desktop + Android.

---

## Passes de validation (agents)

| Passe | Agent | Statut | Rapport |
|-------|-------|--------|---------|
| Math | Audit formules solar_math, sizing, offgrid, finance | ✅ | Bugs P0 identifiés |
| UI | Cohérence visuelle, responsive, a11y | ✅ | Score 6,5/10 |
| UX | Toasts, modales, loading states | ✅ | Corrections P1 listées |
| Parcours | 10 flux utilisateur end-to-end | ✅ | Import Enedis P0 |
| Qt | Architecture hybride (WebView + bridge) | ✅ | Phases 0→4 |

---

## Boucle de validation continue

```bash
# Une passe complète (math + smoke HTTP + checklist)
./scripts/validate-app.sh

# Boucle toutes les 10 minutes (local IDE)
./scripts/validation-loop.sh 600
```

La boucle exécute `validate-app.sh`, écrit `validation/last-run.json`, et échoue si une régression est détectée.

### Critères de succès par passe

1. **Math** : `node tests/run_math_tests.js` — 0 échec
2. **Build web** : serveur HTTP répond 200 sur `/index.html`
3. **Console** : pas d'erreur `ReferenceError` au chargement (scripts ordonnés)
4. **Enedis** : parser 30 min branché dans ZIP
5. **Qt desktop** (si toolchain) : `cmake --build build-qt` OK

---

## Bugs corrigés (cette session)

| Priorité | Bug | Fichier |
|----------|-----|---------|
| P0 | Import Enedis ZIP 30 min — `parsePuissances30min` non branché | `enedis_import.js` |
| P0 | `offgridSystem()` production ~1000× sous-estimée | `solar_math.js` |
| P0 | `calcStringing()` minSeries trop élevé | `inverter_sizing.js` |
| P1 | PVGIS sans statut loading sidebar | `pvgis_import.js` |
| P1 | Optimiseur silencieux sans météo | `renderers/grid.js` |
| P1 | Import Enedis erreur sans toast | `renderers/bindings.js` |

---

## Port Qt — phases

### Phase 0 — Shell Qt + web embarqué (en cours)

- `CMakeLists.txt` + `src/app/main.cpp`
- `WebBridge` : même API que `electronAPI` (preload.js)
- `WebContainer.qml` : WebEngine (desktop) / WebView (Android)
- `Theme` clair aligné sur `css/main.css`
- `scripts/build-android.sh` calqué sur open_bingo

### Phase 1 — Chrome natif QML

- Header + barre projet en QML (`Colo*` components)
- Modals démarrage / projets natives

### Phase 2 — Persistance & git natifs

- SQLite (`ProjectStore`) remplace localStorage
- libgit2 remplace `execSync('git')` — **obligatoire Android**

### Phase 3 — Carte & graphiques natifs

- Qt Location (Leaflet) + Qt Charts (Chart.js)
- Retrait progressif du bundle web

### Phase 4 — Core C++

- Port `solar_math.js` → `src/core/solar_math.cpp`
- Tests Qt Test (`tests/tst_solar_math.cpp`)

---

## Checklist parcours utilisateur

Voir rapport agent « Parcours » — scripts manuels dans `docs/PLAN-VALIDATION-QT.md` section ci-dessous.

### Parcours 1 — Nouveau projet réseau
1. Vider localStorage → recharger → modal visible
2. Nouveau → Type réseau → formulaire → Créer
3. Dimensionner → KPI visibles → Ctrl+S

### Parcours 3 — Enedis
1. Import ZIP Enedis → statut vert + champs `sz-kwh-*` remplis
2. `AppState.monthlyKwh` : 12 valeurs > 0

### Parcours 7 — Git (Electron / Qt)
1. Sauvegarder → Historique → commits listés
2. Qt : via `WebBridge.gitSave` (desktop shell git)

---

## Références projets Qt voisins

- `/data/leo/open_bingo` — Android, CMake, Colo*, build-android.sh
- `/data/leo/Colo_Taches` — pattern CMake minimal

---

*Dernière mise à jour : 2026-08-24*
