# Bugs - Open Solar Energy

> Tests effectués par Playwright (headless Chromium) le 2026-04-20.
> Serveur : `python3 -m http.server 8080`
> Fichier Enedis utilisé : `mes-donnees-elec-007025424890-30440.zip`

---

## ❌ BUG CRITIQUE

### 1. `bindSharedParamSync is not defined` - erreur JS au démarrage

**Fichier :** `js/main.js:169`
**Symptôme :** Erreur JavaScript non catchée à chaque chargement de page.
```
Uncaught ReferenceError: bindSharedParamSync is not defined
```
**Cause :** La fonction `bindSharedParamSync()` existait dans une version antérieure (commit `5d06834 fix: sync paramètres installation entre onglets`). Elle a été retirée du code lors d'une refactorisation qui a introduit `bindInstallSync()`, mais l'appel en ligne 169 de `main.js` a été oublié.

**Ce que faisait la fonction :** Synchronisation temps réel des champs partagés entre onglets (surface, Wc panneau, pertes, m²) sans devoir changer d'onglet. Désormais seul `bindInstallSync` est utilisé (sync via AppState au changement d'onglet).

**Impact :** La synchro inter-onglets en temps réel est cassée. L'erreur JS peut interrompre les initialisations suivantes si elles sont dans le même `try`.

**Correction :** Supprimer la ligne 169 dans `main.js` (l'appel orphelin) ou réimplémenter la fonction si la synchro directe DOM est souhaitée.

---

## ⚠️ BUGS MODÉRÉS

### 2. Bouton "Nouveau projet" saute l'étape de sélection du type d'installation

**Fichier :** `index.html:68`
**Symptôme :** Cliquer "Nouveau projet" dans le modal de démarrage ouvre directement le formulaire (nom du projet, client), sans passer par l'étape "Raccordée au réseau / Autonome".
**Cause :** Le `onclick` appelle `showNewProjectForm()` alors qu'il devrait appeler `showInstallationTypeStep()`.
```html
<!-- Actuel (bugué) -->
<button onclick="showNewProjectForm()" ...>
  ＋ Nouveau projet
</button>

<!-- Attendu -->
<button onclick="showInstallationTypeStep()" ...>
  ＋ Nouveau projet
</button>
```
**Impact :** Le projet est créé avec le type d'installation par défaut (réseau), sans que l'utilisateur n'ait pu choisir. Le bouton "←" dans le formulaire renvoie bien vers l'étape type, ce qui confirme que le flux attendu est step1 → type → formulaire.

---

### 3. Import fichier Enedis ZIP - données non chargées / statut silencieux

**Fichier :** `js/renderers.js:874` - `handleEnedisCSV()`
**Symptôme :** Après import du ZIP Enedis (30min) via le modal, `AppState.monthlyKwh` reste vide, les champs `sz-kwh-1..12` ne sont pas mis à jour, et aucun toast de confirmation n'est affiché.
**Comportement observé :**
- Le statut `sz-csv-status` reste invisible
- `AppState.monthlyKwh` = undefined / vide après 3 secondes
- Aucun message toast sur l'import
**Hypothèses :**
- Le fichier ZIP (`mes-donnees-elec-007025424890-30440.zip`) contient peut-être un format non géré par `EnedisImport.handleFile()`
- Ou `EnedisImport` n'est pas encore chargé (dépendance d'ordre de script)
- Ou une exception silencieuse dans le parser ZIP/CSV

**À vérifier :** Ouvrir la console navigateur lors d'un import manuel et regarder les erreurs ou logs d'`EnedisImport`.

---

### 4. PVGIS Import météo - statut invisible après clic

**Fichier :** `js/pvgis_import.js:228` - `doImportWeather()`
**Symptôme :** Après clic sur "Importer météo (MRcalc)", l'élément `#pvgis-import-status` reste invisible pendant et après l'appel API (testé avec 4 secondes de délai).
**Cause probable :** L'API Open-Meteo est appelée en réseau (`fetch`). En environnement headless sans accès internet garanti, l'appel peut timeout ou échouer avant que `setStatus()` ne soit appelé.
**Impact en production :** Probablement mineur si internet disponible - à vérifier avec réseau normal.
**À surveiller :** En cas d'erreur réseau, le message `✗ Open-Meteo inaccessible` devrait apparaître mais n'a pas été observé (possible timeout > 4s).

---

## ℹ️ NON-BUGS (comportements normaux)

### Onglet "Suiveur PV" - pas de bouton calculer
L'onglet est explicitement en développement (message affiché : "Le module Suiveur PV est en cours de développement"). C'est voulu.

### Onglet "Hors réseau" masqué en mode réseau
Comportement normal : `TABS_OFFGRID_ONLY = ['offgrid']` est caché quand `installationType === 'grid'`. De même, les onglets réseau (sizing, grid, tracker, optimizer) sont masqués en mode autonome.

### Bouton "Import Enedis" dans onglet Dimensionnement, pas Grid
Le bouton est dans `#tab-sizing` (onglet Dimensionnement), pas dans l'onglet Grid - c'est correct, les données mensuelles alimentent le dimensionnement.

---

## Récapitulatif

| # | Sévérité | Description | Fichier |
|---|----------|-------------|---------|
| 1 | ❌ Critique | `bindSharedParamSync is not defined` au démarrage | `main.js:169` |
| 2 | ⚠️ Modéré | Bouton "Nouveau projet" saute le choix du type | `index.html:68` |
| 3 | ⚠️ Modéré | Import Enedis ZIP sans feedback ni données chargées | `renderers.js:874` |
| 4 | ⚠️ Mineur | PVGIS import statut invisible (possible timeout réseau) | `pvgis_import.js:228` |
