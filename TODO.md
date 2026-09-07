# TODO - Open Solar Energy

## Bugs connus

- [x] **Simulation horaire - variation jour à jour** : `simulateMonthHourly` applique maintenant un facteur nuageux déterministe par jour (v2.0.74+).
- [ ] **Données météo démo limitées** : seulement 4 villes. Améliorer l'import Open-Meteo automatique à la sélection du lieu.
- [x] **`sz-kwh-*` non rechargés depuis Enedis au chargement** : `restoreEnedisToSizingFields()` au loadProject.

## Améliorations algorithme

- [x] **Deux recommandations hors-réseau** : Autonome + Économique avec bouton « Appliquer config économique ».
- [x] **Heatmap Ppeak × batterie** : déjà présente ; badge Enedis 30 min ajouté.
- [ ] **Coût cycle batterie** : afficher le coût total sur durée de vie (renouvellement AGM/NMC).

## Nouvelles fonctionnalités

- [x] **Rapport PDF enrichi** : dual reco hors-réseau, hybrid, export menu mobile.
- [x] **Mode sombre** : toggle header + `prefers-color-scheme` + persistance localStorage.
- [ ] **TMY Open-Meteo** : année météo typique.
- [x] **Tracker solaire 1 axe** : calculateur réel basé météo projet (onglet avancé).
- [ ] **Internationalisation EN**.
- [ ] **Tests unitaires PVGIS reference** : valeurs de référence tiltedIrradiation.

## UX / UI

- [x] **Profil consommation mensuel hors-réseau** : graphique barres après import Enedis.
- [x] **Badge Enedis 30 min** dans onglet hors-réseau.
- [x] **Hub projets** : cartes `.ose-project-card` cliquables + `data-project-id`.
- [x] **Onboarding nouveau projet** : redirection Lieu + toast guide.
- [x] **Modal Enedis** : ne se ferme qu'après succès import.
- [x] **switchToTab** : sync install sur tous les changements d'onglet.
- [x] **applySizingToGrid** : parcours Site/Ombrage (pas grid).
