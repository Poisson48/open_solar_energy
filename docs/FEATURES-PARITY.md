# Parité fonctionnalités — Legacy web vs QML natif

Légende : **OK** = présent et branché · **PARTIEL** = incomplet · **MANQUE** = absent  
*Mis à jour 2026-09-09 — basé sur code + `ctest` / `--self-test`, pas sur intention.*

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
| Largeur hub utilisable | OK (max 1100) |

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
| Couche satellite (Esri) | OK |
| Plein écran carte | OK |
| Terrain DEM → tilt/az | OK (Open-Meteo elevation) |
| Météo horaire année | OK (`Weather.fetchOpenMeteoHourly` + `hourlyWeatherData`) |
| Mode énergie rapide / étude | OK (`formState.energyMode`) |
| Comparaison PVcalc | OK (`Pvgis.fetchPvcalc` + écart vs OSE) |

## Site
| Fonction | Statut |
|----------|--------|
| Horizon manuel, canvas, pertes, halfHourlyKeep | OK |
| Drag points | OK |
| Boussole device | PARTIEL (offset manuel) |
| Photo + caméra | PARTIEL (Android ; stub desktop) |
| Terrain depuis Site | OK |
| Obstacles 3D → ombrage | OK (`ShadingEngine` si panneaux/obstacles) |
| Recalc horizon n’écrase plus le 3D si panneaux/obstacles | OK |

## Dimensionnement
| Fonction | Statut |
|----------|--------|
| Wizard, Enedis, stratégies, hybride, shade, apply→PV | OK |
| HP/HC branché finance | OK (facture annuelle + prix moyen) |
| Modes Objectif / Toiture / Nb fixe | OK (libre / toiture / Ppeak fixe) |
| Optim tilt auto | OK |
| Catalogue panneau dans Dim. | OK |
| Arbre de pertes nommé + thermique U | OK (`lossTree`, `YearPv`) |
| Mode étude → yield horaire TMY | OK |
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
| Mode étude année TMY + horizon 30 ans | OK (`YearPv` / `Horizon`) |
| Onduleur η + clipping (étude) | OK |
| Table durée jour | OK |

## Mode étude vs rapide
| Aspect | Rapide (`energyMode: fast`) | Étude (`study`) |
|--------|----------------------------|-----------------|
| Météo | Mensuelle GHI/DHI | Horaire TMY Open-Meteo |
| Ombrage | Keep beam 30 min | Keep + heuristique électrique bypass |
| Pertes | `%` unique ou `lossTree` | `lossTree` nommé (PDF) |
| Thermique | NOCT | U / vent (`thermal.model=uValue`) |
| Onduleur | PR forfaitaire | η(P) + clipping optionnel |
| UI live | Défaut (sweeps, ombrage) | Async / toast durée |

*Écart typique study vs fast : météo réelle vs synthétique mensuelle + keep électrique ≤ keep beam — documenté dans toasts Analyse / PDF méthode.*

## Implantation 3D
| Fonction | Statut |
|----------|--------|
| Quick3D multi-toitures inclinées, soleil (0°N), panneaux | OK |
| Obstacles éditables (Site **et** Implantation) | OK |
| Ombrage auto → projet (debounce) + bouton manuel | OK |
| Export PNG (chemin temp portable) | OK |
| Push longueur → Câbles | OK |
| Caméra presets (3D / Sud / Dessus) + StackLayout keep-alive | OK |
| Helpers QML `RoofDeck3D` / `PanelArray3D` / `ObstacleLayer3D` | OK (branchés dans `SolarScene3D`) |

## Site 3D
| Fonction | Statut |
|----------|--------|
| Scène partagée `SolarScene3D` + presets cheminée/arbre/mur/velux | OK |
| Persistance `siteSurvey.obstacles` | OK |

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
| Preview PDF (pages) | OK |
| Rapport style PVsyst (balances, PR, loss diagram, PVGIS) | OK (`YearPv.buildBalancesReport` + PDF) |
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
| QR code | OK (générateur embarqué Nayuki ; fallback `qrencode`) |
| Git branches / variantes | OK (`SnapshotHistory`) |

## Catalogue
| Fonction | Statut |
|----------|--------|
| Panneaux / onduleurs locaux | OK |
| Rexel embarqué (~92 / ~271) | OK |
| Rexel remote / sync live | MANQUE |

## Plateformes
| Fonction | Statut |
|----------|--------|
| Linux AppImage | OK |
| Android APK | OK |
| Windows | MANQUE (volontairement reporté) |
| macOS | MANQUE |
