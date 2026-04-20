# TODO — Open Solar Energy

## Bugs connus

- [ ] **Simulation horaire — variation jour à jour absente** : `simulateMonthHourly` répète le même profil moyen pour chaque jour du mois. Une séquence de jours nuageux en hiver vide la batterie sans possibilité de rattrapage, ce que le modèle actuel ne capture pas. Solution : ajouter un facteur aléatoire (ou une distribution nuageuse mensuelle basée sur l'irradiation réelle).
- [ ] **Données météo démo limitées** : seulement 4 villes. Pour les sites isolés (ex. Cévennes), la ville la plus proche peut avoir un GHI très différent. Améliorer l'import Open-Meteo automatique à la sélection du lieu.
- [ ] **`sz-kwh-*` non rechargés depuis Enedis au chargement de projet** : les champs du dimensionnement réseau sont restaurés via `formState`, mais si l'utilisateur n'a pas sauvegardé après l'import Enedis initial, ils sont vides. Même fix que `og2-day-*` (déjà fait) à appliquer.

## Améliorations algorithme

- [ ] **Afficher deux recommandations hors-réseau** : "Économique" (couverture ≥ cible, coût min) + "Autonome" (≤ 37 j/an de déficit + couverture ≥ cible, coût min). Actuellement seule la version "Autonome" est affichée.
- [ ] **Heatmap Ppeak × batterie** : afficher dans les résultats hors-réseau une heatmap du taux de couverture pour visualiser le plateau (au-delà d'un certain Ppeak, agrandir la batterie ne sert plus à grand chose).
- [ ] **Coût cycle batterie** : afficher le coût total sur durée de vie (renouvellement batterie AGM/NMC) pour comparaison équitable avec LFP.

## Nouvelles fonctionnalités

- [ ] **Rapport PDF complet** (jsPDF) : résumé dimensionnement + devis en un seul PDF
- [ ] **Mode sombre**
- [ ] **TMY Open-Meteo** : utiliser une année météo typique au lieu de la moyenne 2020-2023
- [ ] **Tracker solaire 1 axe / 2 axes** : gain irradiation ~15-25 %
- [ ] **Internationalisation EN** : libellés + unités impériales optionnelles
- [ ] **Tests unitaires** : vérifier `tiltedIrradiation`, `pvProduction`, `simulateYear` avec valeurs de référence PVGIS

## UX / UI

- [ ] **Afficher le profil de consommation mensuel** dans l'onglet hors-réseau après import Enedis (graphique barre des kWh/j par mois)
- [ ] **Indicateur visuel** quand les données Enedis 30min sont utilisées dans le dimensionnement hors-réseau (actuellement seul l'onglet Horaire affiche le statut)
- [ ] **Raccourci vers la recommandation** dans la heatmap (surligner la cellule recommandée)
