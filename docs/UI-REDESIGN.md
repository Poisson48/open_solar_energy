# Refonte UI — Open Solar Energy (audit Claude Opus → exécution agent rapide)

> **Règle d’équipe** : le modèle qui *critique / conçoit* l’UI n’est pas celui qui *code* l’UI.
> Audit : Claude Opus · Exécution : Composer fast (ou équivalent).

Source : audit agent `3227bff2-9440-4a67-a94e-a6c8a849bccc` (2026-09-07).

---

## Verdict

L’app n’a pas de design system : couleurs partielles, cinq styles de champs, boutons hétérogènes, chrome empilée (~200 px), Hub bridé à 720 px, carte Lieu non utilisable (marqueur au centre du widget ≠ coordonnées, pan par sauts de tuile). Le vert `#1a6b3c` reste le pivot ; le reste est à reconstruire. Perte de saisie réelle au changement d’onglet (Loader + littéraux non liés à `formState`).

---

## P0 bloquants

1. **Carte Lieu** — marqueur non projeté, pan inutilisable, tuiles rognées → reconstruire pan/drag + projection fractionnaire (ou QtLocation).
2. **Perte de saisie** — lier tous les champs à `formState` / projet.
3. **CTA accent** — blanc sur `#f5a623` ~2:1 → CTA en `primary`.
4. **Double « suivant »** — TabBarNav flèche + Continuer bas → une seule barre d’actions.
5. **Chrome** — ≤ 96 px (supprimer barre titre verte + `QML`, MAJ discrète).
6. **Sauvegarde** — autosave + indicateur unique (pas 3 boutons concurrents).

## P1 forts (résumé)

Champs unifiés · boutons gouvernés · Hub actions · rail d’étapes · split Form/Results vs écrans « objet » · alertes non permanentes · KPI formatés · ProjectBar · Devis tableau · météo segmentée · a11y.

---

## Design system (cible)

Voir audit complet dans le transcript agent. Tokens clés :
- primary `#1a6b3c`, neutrals, sémantiques success/warning/danger/info dérivés du vert
- typo échelle fermée, spacing ×4, radius 4/6/8, densité desktop 28–36
- primitives : OseButton, OseField, OseCard, OseAlert, OseKpi, OseTable, StepRail, ResultsPanel

## Sprints

| Sprint | Contenu |
|--------|---------|
| **0** | Carte Lieu utilisable (immédiat) |
| **1** | Tokens + composants + persistance formState + chrome + CTA |
| **2** | Shell 3 zones + rail + Hub + Devis table + Lieu recomposé |
| **3** | Site/3D objets principaux + fr-FR + a11y + états vides |

## Critères carte (acceptation)

- [ ] Marqueur = lat/lon affichées (ex. Toulouse 43.6045 / 1.4440) à z 4–18
- [ ] Pan continu (drag), pas saut de tuile
- [ ] Zoom molette, pas de zone morte
- [ ] Carte remplit le conteneur
- [ ] Attribution OSM visible

---

## État d’exécution

- [x] Audit UI (Claude Opus)
- [x] Sprint 0 carte (`OsmMapView` + projection fractionnaire + pan drag)
- [x] Sprint 1 — tokens Theme (`theme.h`)
- [x] Sprint 1 — CTA contraste (OseBtn accent outline, OseTabPage primary, TabBarNav sans flèche)
- [x] Sprint 1 — chrome Main.qml (barre titre supprimée, bandeau MAJ sans checking seul)
- [x] Sprint 1 — persistance formState TabSizing (+ TabSite inputs, TabLayout panels partiel)
- [x] Sprint 1 — indicateur « Enregistré » ProjectBar
- [ ] Sprint 2 shell + rail + Hub + Devis
- [ ] Sprint 3 finition
