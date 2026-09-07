# Parité fonctionnalités — Legacy web vs QML natif

Légende : **OK** = présent · **PARTIEL** = incomplet · **MANQUE** = à porter

## Hub
| Fonction | Statut |
|----------|--------|
| Liste / ouvrir / cloner / supprimer | OK |
| Recherche projets | OK |
| Nouveau (type + nom + client) | OK |
| Rejoindre partage | OK |
| Matériel | OK |
| MAJ / news | OK |
| Import JSON | OK |
| Export tous les projets | OK |
| Export projet ZIP | OK (via `zip` CLI, fallback JSON) |
| Démos seedées grid + hybride | OK (seed si vide) |
| Confirmation suppression | OK |

## Barre projet
| Fonction | Statut |
|----------|--------|
| Nom, lieu→Lieu, type install, sauver, export, share, matériel, historique | OK |
| Édition client complète (tél, adresse, email) | OK |
| Ctrl+S sauver | OK |
| Toast feedback | OK |
| Menu overflow mobile | PARTIEL |

## Lieu
| Fonction | Statut |
|----------|--------|
| Nominatim, lat/lon, lock, OSM tiles, météo Open-Meteo / PVGIS | OK |
| Couches sat / fullscreen | MANQUE |
| Terrain DEM → tilt/az | OK (Open-Meteo elevation) |
| Météo horaire année | PARTIEL (mensuel + analyse 12 mois) |
| Comparaison PVcalc | MANQUE |

## Site
| Fonction | Statut |
|----------|--------|
| Horizon manuel, canvas, pertes, halfHourlyKeep | OK |
| Drag points | OK |
| Boussole device | PARTIEL (offset manuel) |
| Photo + caméra | PARTIEL (permission) |
| Terrain depuis Site | OK |

## Dimensionnement
| Fonction | Statut |
|----------|--------|
| Wizard, Enedis, stratégies, hybride, shade, apply→PV | OK |
| HP/HC branché finance | OK (facture annuelle + prix moyen) |
| Modes Objectif / Toiture / Nb fixe | OK (libre / toiture / Ppeak fixe) |
| Optim tilt auto | OK |
| Catalogue panneau dans Dim. | OK |
| Graphiques riches + PDF sizing | PARTIEL |
| Prime FR modes | PARTIEL (calculé dans KPIs grid) |

## Système PV
| Fonction | Statut |
|----------|--------|
| Prod annuelle, stringing, finance, catalogue | OK |
| Export CSV | OK |
| Apply → Dim | OK |
| Recommandation onduleur auto | OK |

## Hors réseau
| Fonction | Statut |
|----------|--------|
| Sweep, shade, modes, Enedis | OK |
| Tech batterie → moteur | OK (DoD + €/kWh) |
| Heatmap cliquable | OK |
| Profil 2h / mensuel Wh | PARTIEL |

## Analyse
| Fonction | Statut |
|----------|--------|
| Jour type, SOC, ombrage | OK |
| 12 mois auto + overlay | OK |
| Table durée jour | OK |

## Implantation 3D
| Fonction | Statut |
|----------|--------|
| Quick3D, soleil, obstacles, ombre→projet | OK |
| Export PNG | OK |
| Push longueur → Câbles | OK |

## Câbles
| Fonction | Statut |
|----------|--------|
| Section DC/AC, stringing | OK |
| Prefill I/U datasheet | OK |
| Envoi coût → devis | OK |

## Devis
| Fonction | Statut |
|----------|--------|
| Lignes pipeline, PDF, client, stale | OK |
| Installateur SIRET/RGE | OK |
| Client complet | OK |
| Site / système détaillés | OK |
| Lignes éditables, TVA, remise | OK |
| Preview HTML | MANQUE |

## Avancé
| Fonction | Statut |
|----------|--------|
| Irradiation, Optimizer, Tracker indicatif | OK |
| CSV irradiation | OK |

## Partage / historique
| Fonction | Statut |
|----------|--------|
| Nostr E2E, snapshots | OK |
| QR code | OK (`qrencode` si installé) |
| Git branches | MANQUE (snapshots OK) |

## Catalogue
| Fonction | Statut |
|----------|--------|
| Panneaux / onduleurs locaux | OK |
| Rexel remote + fiches | MANQUE |
