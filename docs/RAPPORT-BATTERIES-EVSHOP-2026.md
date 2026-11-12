# Stockage batterie pour maison

## Sélection technique et économique dans le catalogue EVShop

**Date :** 4 novembre 2026
**Profil :** ingénieur électronicien, autoconstruction, écosystème Victron
**Besoin initial :** 4 à 6 kWh utiles pour une maison
**Extension :** plusieurs installations à partir d'un même achat, ou passage en haute tension

> **Catalogue complet des 80 références, avec choix du chargeur et de l'onduleur :** [CATALOGUE-BATTERIES-EVSHOP.md](CATALOGUE-BATTERIES-EVSHOP.md)

---

## 0. Synthèse

### 0.1 Le critère qui décide de tout

Ce n'est ni la chimie, ni le prix au kWh : c'est **la tension du module**. Elle détermine l'architecture, donc le travail, donc le coût réel.

- **Victron 48 V** : le MultiPlus-II accepte 38 à 66 V. Un module **12S NMC** (44,4 V nominal, 39,6–50,4 V) est natif. Un 16S NMC (67,2 V) est hors limite. Un 36S (151,5 V) est impossible.
- **Hybride haute tension** : un Solax X1-Hybrid G4 accepte 80 à 480 V. Un 36S (131,5 V) ou un 98S (356 V) y entrent directement, sans découpe.

### 0.2 Recommandation par cas

| Besoin | Architecture | Produit | Coût | €/kWh fini |
|---|---|---|---|---|
| **4–6 kWh, une maison, Victron** | 48 V, 1 string | **2 × Stellantis 6S2P** | 677 € | **124** |
| 4–6 kWh, un seul bloc | 48 V, 1 string | MEB 12S 6,85 kWh | 995 € | 145 |
| 15 kWh, une maison, Victron | 48 V, 3 strings | LGChem 36S découpé en 3×12S | 1 699 € | 112 |
| 9 sites de 5,5 kWh | 48 V | Pack Stellantis 50 kWh (18 modules) | 6 293 € | 128 |
| 15 kWh, haute tension | Hybride HV | LGChem 36S + Solax X1 G4 | 2 800 € | 185 |
| 60 kWh, haute tension | Hybride HV | Kona 64 kWh + Battery-Emulator | 6 300 € | 98 |
| Installation 24 V existante | 24 V | Tesla 6S74P | 735 € | 139 |

### 0.3 Cinq chiffres

| Indicateur | Valeur | Référence |
|---|---|---|
| Meilleur prix module | **67 €/kWh** | LGChem 36S 15,19 kWh à 1 014 € |
| Meilleur prix sans travail mécanique | **79 €/kWh** | Stellantis 6S2P à 216 € |
| Coût fini d'un site 5,48 kWh | **124 €/kWh** | 2 modules + BMS + fusible + coffret |
| Référence LFP certifiée | **208 €/kWh** | Pylontech US5000 4,8 kWh à 999 € |
| Meilleur pack complet | **70 €/kWh** | Kona 64 kWh à 4 500 € |

### 0.4 Verdict

Pour le besoin initial — 4 à 6 kWh, une maison, Victron 48 V — la réponse est **deux modules Stellantis 6S2P** : 5,48 kWh, 432 € de modules, une seule string 12S, aucun travail mécanique, 124 €/kWh fini.

Le LGChem 36S est moins cher au kWh (67 €) mais impose de couper deux busbars et de gérer trois BMS. Le MEB 12S est le plus simple (un bloc, faisceau VW disponible) mais 17 % plus cher au kWh fini. Le Kona 64 kWh est le meilleur achat du catalogue en valeur absolue, mais uniquement en haute tension, donc hors Victron.

---

## 1. Cadre, méthode et limites

### 1.1 Méthode

1. **Inventaire** des 80 références de la catégorie « Batteries » d'EVShop, prix TTC affichés au 4 novembre 2026.
2. **Filtrage par tension** : conservation des modules compatibles 12S (44,4 V) ou des packs exploitables en haute tension.
3. **Calcul du coût par kWh** au niveau module, puis au niveau site (module + BMS + protection + coffret + câblage).
4. **Vérification des fiches** produit une par une (tension, capacité, masse, dimensions, connectique).
5. **Recherche de documentation externe** : openinverter (MEB), Battery-Emulator (Kona/Niro), bms-ev (Leaf), forums DIYelectricCar, secondlifestorage.
6. **Analyse de démontabilité** : construction busbar boulonnée contre soudée, cellules prismatiques contre poches ou cylindriques.

### 1.2 Limites

- Les prix sont ceux du catalogue au 4 novembre 2026 et n'incluent pas le transport (ADR pour les packs).
- Aucun module n'a été testé physiquement : les SoH annoncés (93 % pour la série Mercedes EQ) ne sont pas vérifiés.
- Les coûts de BMS, coffret et câblage sont des estimations de marché, pas des devis.
- La démontabilité de certains modules (LGChem 36S, MEB) n'est pas documentée publiquement : elle est déduite de la construction et doit être confirmée par photo.
- Aucune garantie de conformité réglementaire : une batterie DIY n'est pas certifiée, ce qui a des conséquences d'assurance.

---

## 2. Le critère décisif : tension et topologie

### 2.1 Fenêtres des équipements

| Équipement | Plage DC | Conséquence |
|---|---|---|
| MultiPlus-II 48 V | 38–66 V | 12S NMC ✅, 16S NMC ❌ (67,2 V) |
| MPPT 150/35 | 12/24/48 V auto, absorption réglable | 12S ✅, réglage manuel conseillé |
| MultiPlus-II 24 V | 19–33 V | 6S NMC ✅ (19,8–25,2 V) |
| Solax X1-Hybrid G4 | **80–480 V** | 36S ✅, 98S ✅ |
| Deye HV | 160–800 V | 36S ❌ (131 V trop bas), 98S ✅ |

### 2.2 Configurations cellulaires utiles

| Configuration | Tension nominale | Plage | Usage |
|---|---|---|---|
| 6S NMC | 22,2 V | 19,8–25,2 V | 24 V natif |
| 12S NMC | 44,4 V | 39,6–50,4 V | 48 V natif |
| 16S NMC | 58,7 V | 44,8–67,2 V | inutilisable Victron 48 V |
| 36S NMC | 131,5 V | 100,8–151,5 V | hybride HV uniquement |

La règle est simple : **pour du 48 V, il faut des modules de 12S ou des paires de 6S**. Tout module de 19S, 20S, 24S ou 36S exige une reconfiguration, donc une découpe.

---

## 3. Analyse du catalogue

### 3.1 Packs complets : le prix au kWh s'effondre

| Pack | Prix | Énergie | €/kWh |
|---|---|---|---|
| Tesla Model S 75 kWh | 5 175 € | 75 | **69** |
| Kona 64 kWh | 4 500 € | 64 | **70** |
| Opel Mokka-e 54 kWh | 3 900 € | 54 | **72** |
| Tesla Model 3 LR 75 kWh | 5 500 € | 75 | 73 |
| Tesla Model 3 LFP 55 kWh | 4 140 € | 55 | 75 |
| Peugeot e-208 50 kWh | 3 900 € | 50 | 78 |
| MG ZS EV 44 kWh | 3 520 € | 44 | 80 |
| BYD Atto 3 60 kWh | 4 800 € | 60 | 80 |
| Zoe 52 kWh | 4 690 € | 52 | 90 |
| Ioniq 28 kWh | 2 940 € | 28 | 105 |
| Leaf 62 kWh | 6 899 € | 62 | 111 |
| Leaf 24 kWh G2 | 3 490 € | 24 | 145 |

**Conclusion :** acheter un pack complet divise le prix au kWh par 2 à 3 par rapport aux modules à l'unité. C'est la principale erreur du raisonnement initial : le DIY n'est pas cher au niveau pack, il est cher au niveau *site*, parce que le coût fixe (BMS, protection, coffret, câblage) ne se divise pas.

### 3.2 Modules : topologie, démontabilité, prix

| Module | Tension | Énergie | Masse | €/kWh | Topologie | Démontable |
|---|---|---|---|---|---|---|
| Stellantis 6S2P | 22,2 V | 2,74 kWh | 13 kg | **79** | 6S2P, 61,5 Ah | ❌ soudé |
| LGChem 36S | 131,5 V | 15,19 kWh | 81 kg | **67** | 36S1P, 115 Ah | ⚠️ à vérifier |
| LGChem 24S | 87,5 V | 10,1 kWh | 53 kg | 118 | 24S1P, 115 Ah | ⚠️ à vérifier |
| CATL 16S | 58,7 V | 11 kWh | 45 kg | 108 | 16S2P, 188 Ah | ⚠️ connecteur inclus |
| MEB 12S | 44,4 V | 6,85 kWh | 32 kg | 109 | 12S2P, 78 Ah | ❌ soudé |
| MEB 8S | 29,6 V | 6,85 kWh | 32 kg | 109 | 8S, 234 Ah | ❌ soudé |
| Tesla 6S74P | 22,8 V | 5,3 kWh | 26 kg | 113 | 6S74P, 444 cellules | ❌ fils soudés |
| Tesla 6S86P | 22,8 V | 6,4 kWh | 28 kg | 180 | 6S86P, 516 cellules | ❌ fils soudés |
| BMW i3 12S1P | 45,6 V | 5,3 kWh | 28 kg | 170 | 12S1P, 120 Ah | ❌ |
| Leaf 2S | 7,4 V | ~0,5 kWh | — | ~180 | 2S2P poche | ❌ |

### 3.3 Les pièges des fiches produit

**a) Le module « neuf 12S1P 7,06 kWh » à 1 200 €.** La fiche annonce 240 Ah et 7,06 kWh à 44,4 V. Or 7,06 kWh ÷ 44,4 V = 159 Ah. Les 240 Ah ne collent qu'en 8S : 8 × 3,7 V × 240 Ah = 7,1 kWh. Il s'agit très probablement d'un module 8S (29,6 V), pas 12S. À faire confirmer par écrit avant achat.

**b) Le LGChem 24S à 1 190 €.** Même cellule que le 36S (115 Ah), mais 118 €/kWh contre 67 €/kWh. Aucune raison de l'acheter.

**c) Le CATL 16S 11 kWh à 1 190 €.** 108 €/kWh, mais coupure de charge à 67,2 V, au-dessus des 66 V du MultiPlus-II. Incompatible Victron 48 V, et 2× le besoin.

**d) Le Tesla 6S86P à 1 155 €.** 180 €/kWh, soit 2,7× le LGChem. Il vient d'un pack 100 kWh (référence `TeslaMS100Bat1/16`, 16 × 6,4 kWh) donc de cellules plus récentes, mais l'écart de prix n'est pas justifié pour un usage stationnaire.

**e) Les packs Leaf.** Excellents pour la documentation, médiocres en €/kWh : 111 à 145 €/kWh contre 70 à 80 pour Kona, Mokka-e et e-208.

### 3.4 Démontabilité : le seul critère qui compte

| Construction | Démontable | Exemples |
|---|---|---|
| Prismatique, busbars boulonnés M5/M6 | ✅ | LGChem 115 Ah (à vérifier) |
| Prismatique, busbars soudés laser | ❌ | MEB, Stellantis, CATL CTP |
| Poche, onglets soudés | ❌ | Leaf, Kona |
| Cylindrique, fils soudés + fusible par cellule | ❌ | Tesla 6S74P, 6S86P |

Un module Tesla compte 888 soudures par module, chacune servant de fusible calibré. Un module Kona est un empilement de poches collées au mastic thermique sur des plaques inox. Un module Stellantis est un CTP soudé. **Aucun de ces trois ne se découpe.**

À l'inverse, un module prismatique à bornes M6 se démonte à la vis : c'est le cas de la famille LGChem 115 Ah, sous réserve de vérification.

**Point important :** pour un split *électrique* en 3 × 12S, il n'est pas nécessaire de sortir les cellules. Deux coupes de busbar et quatre bornes de point milieu suffisent, sans perte de compression. C'est l'opération recommandée sur le LGChem 36S.

---

## 4. Architectures

### 4.1 A — Victron 48 V avec modules 12S natifs

C'est l'architecture de référence : aucune découpe, un ou plusieurs strings de 12S en parallèle, un BMS par string.

- Avantages : simplicité, écosystème ouvert (VRM, Node-RED, MQTT, ESS), pièces standard.
- Inconvénients : limité aux modules 12S, donc à des prix module de 79 à 170 €/kWh.
- Modules concernés : Stellantis 6S2P (×2), MEB 12S, BMW i3 12S, Tesla 6S (×2).

### 4.2 B — Victron 48 V avec découpe d'un 36S

Le LGChem 36S devient trois strings de 12S dans le même coffret, partageant la plaque froide et la compression d'origine.

- Avantages : 67 €/kWh, trois strings redondantes, cellules du même lot.
- Inconvénients : deux coupes de busbar, garantie annulée, trois BMS, travail de précision sous 151 V.
- Variante : séparation physique en trois boîtiers, qui impose de refaire la compression (0,3 à 0,5 MPa) et de découper la plaque froide. Non recommandée.

### 4.3 C — Hybride haute tension

Le module reste entier et devient la batterie d'un onduleur hybride HV.

- Avantages : zéro découpe, un seul BMS (ou le BMS d'origine), 30 A de charge/décharge à 131 V, MPPT et réseau intégrés.
- Inconvénients : écosystème propriétaire, BMS/CAN à intégrer, 131 V est bas pour un onduleur HV (optimal 200–400 V), certification et assurance à la charge de l'utilisateur.
- Cas le plus favorable : Kona 64 kWh, dont le BMS d'origine est géré par le projet open source Battery-Emulator.

### 4.4 D — Convertisseur DC-DC 150 V vers 48 V (rejeté)

Techniquement réalisable, mais :

- Victron ne propose rien au-delà de 70 V d'entrée (Orion-Tr).
- Il faut un buck/boost **bidirectionnel** (charge et décharge) 5 kW, 100,8–151,5 V, donc un module OEM ou un développement.
- 6 à 8 % de pertes aller-retour contre 2 % pour une liaison cuivre.
- **Le point rédhibitoire :** le MultiPlus et le MPPT ne voient plus la batterie. Si le BMS ouvre le contacteur HV alors que le MPPT pousse, le bus 48 V n'a plus d'exutoire. Il faut une boucle de contrôle (BMS vers Cerbo) ou un dump load.
- Coût : 600 à 900 € pour 5 kW, plus 350 € de Cerbo, plus le développement.

**Verdict :** le DC-DC ne résout aucun problème que la découpe ne résolve pas déjà, et en crée trois.

### 4.5 E — 24 V

Le 6S NMC (22,2 V, 19,8–25,2 V) est un 24 V parfait. Mais à puissance égale, le courant double : 145 A pour 3 kVA contre 71 A en 48 V, soit des câbles de 95 mm², et un MPPT limité à 1 000 W par 150/35 au lieu de 2 000 W. À réserver aux installations déjà en 24 V.

### 4.6 Comparaison des architectures

| | A (12S natif) | B (36S découpé) | C (HV) | D (DC-DC) |
|---|---|---|---|---|
| Découpe | non | 2 busbars | non | non |
| BMS | 1 par string | 3 | 1 (ou d'origine) | 1 (36S) |
| Rendement | ~98 % | ~98 % | ~97 % | 92–94 % |
| Écosystème | Victron ouvert | Victron ouvert | propriétaire | Victron |
| Coût fini | 124–145 €/kWh | 112 €/kWh | 98–185 €/kWh | > 250 €/kWh |
| Complexité | faible | moyenne | moyenne | élevée |

---

## 5. Économie

### 5.1 Décomposition du coût d'un site

| Poste | Stellantis 5,48 kWh | MEB 6,85 kWh | LGChem 3 × 5,06 kWh |
|---|---|---|---|
| Modules | 432 € | 750 € | 1 014 € |
| BMS | 90 € | 90 € | 270 € (3×) |
| Fusibles | 45 € | 45 € | 135 € (3×) |
| Coffret, câbles, cosses | 110 € | 110 € | 150 € |
| Shunt | — | — | 130 € |
| **Total** | **677 €** | **995 €** | **1 699 €** |
| **€/kWh** | **124** | **145** | **114** |

### 5.2 Le seuil de rentabilité

Le coût fixe par site (BMS, protection, coffret, câblage, soit 245 à 300 €) est indépendant de la capacité. Il pèse :

- **36 %** du coût d'un site de 5,5 kWh ;
- **8 %** d'un site de 50 kWh.

C'est pourquoi :

- à **5 kWh**, le DIY n'économise que 40 % face à du LFP certifié (124 contre 208 €/kWh), avec du NMC d'occasion non certifié ;
- à **20 kWh et plus**, l'économie atteint 40 à 50 % et devient structurelle ;
- à **200 €/kWh** (chemin Tesla 6S86P), le DIY ne vaut plus rien face au LFP certifié.

### 5.3 Le modèle multi-installations

Un pack Stellantis 50 kWh contient 18 modules de 6S2P, soit **9 strings de 12S de 5,48 kWh** exactement, sans reste. C'est le seul pack du catalogue qui se divise parfaitement en sites 48 V.

| Poste | Unitaire | × 9 |
|---|---|---|
| Modules | 432 € | 3 888 € |
| BMS 12S | 90 € | 810 € |
| Fusible + porte-fusible | 45 € | 405 € |
| Coffret, câbles, cosses | 110 € | 990 € |
| Transport ADR | — | 200 € |
| **Total** | | **6 293 €** |
| **€/kWh** | | **128** |

Face à 9 × Pylontech US5000 (43,2 kWh) à 999 € = 8 991 €, soit 208 €/kWh, l'écart est de 30 %.

### 5.4 Le cas haute tension

| | Kona 64 kWh | LGChem 36S 15 kWh |
|---|---|---|
| Pack | 4 500 € | 1 014 € |
| Interface | Battery-Emulator ~100 € | BMS 36S 250–400 € |
| Onduleur HV | 1 500 € | 1 300 € |
| Protection, câbles | 200 € | 200 € |
| **Total** | **6 300 €** | **2 800 €** |
| **€/kWh** | **98** | **185** |

Le Kona est le meilleur €/kWh du catalogue, parce qu'il conserve son BMS d'origine et sa puissance installée.

---

## 6. Recommandations détaillées

### 6.1 Cas par défaut : 4–6 kWh, une maison, Victron 48 V

**2 × module Stellantis 6S2P 2,74 kWh — 432 €**

- Tension : 2 × 22,2 V en série = **44,4 V nominal, 39,6–50,4 V**
- Capacité : **123 Ah, 5,48 kWh**, 26 kg
- Courant : 0,58 C pour un MultiPlus 48/3000 (71 A), 0,24 C en charge à 30 A

**Nomenclature**

| Poste | Référence | Prix |
|---|---|---|
| 2 × Stellantis 6S2P | EVShop réf. 1744 | 432 € |
| BMS 12S 150 A | JK-B2A24S15P | 90 € |
| Fusible Class T 125 A + porte-fusible | — | 45 € |
| Coffret acier, câbles 35 mm², cosses | — | 110 € |
| **Total** | | **677 €** |

**Câblage :**

```
[Module 1] --M6--> [Module 2] --M6--> [Fusible 125 A] --> [Shunt] --> (+) bus 48 V
     |                  |                                              |
     +--- 13 taps ------+--- 13 taps --> [BMS 12S] --> contacteur/précharge
                                                                       |
                                                                   (-) bus 48 V
```

### 6.2 Variante « un seul bloc »

**MEB 12S 6,85 kWh — 750 €**, 44,4 V, 156 Ah, 32 kg, bornes M6, boîtier aluminium. Faisceau de mesure disponible chez VW sous la référence **0Z1 971 690** (modules 12S). Coût fini 995 €, soit 145 €/kWh.

### 6.3 Cas 15 kWh

**LGChem 36S 15,19 kWh — 1 014 €**, découpé électriquement en 3 × 12S (43,8 V, 115 Ah, 5,06 kWh chacune), trois BMS, trois fusibles, coffret commun. Coût fini 1 699 €, soit 112 €/kWh.

### 6.4 Cas haute tension

**Kona 64 kWh — 4 500 €**, conservé entier (98S3P, 356 V), BMS d'origine piloté par Battery-Emulator, onduleur hybride HV (Solax, GoodWe ET, SMA, Deye). Coût fini 6 300 €, soit 98 €/kWh. Aucun travail mécanique.

---

## 7. Réglages et composants

### 7.1 Profil Victron pour 12S NMC

| Paramètre | Valeur | Remarque |
|---|---|---|
| Absorption | **49,2 V** (4,10 V/cellule) | 50,4 V seulement en exception |
| Float | **48,0 V** (4,00 V/cellule) | Stockage : 45,6 V |
| Égalisation | désactivée | jamais sur NMC |
| Compensation température | désactivée | |
| Coupure DC basse MultiPlus | **42,0 V** (3,50 V/cellule) | le défaut 37 V détruirait le pack |
| Pré-alarme | 43,5 V | |
| Redémarrage | 44,5 V | |
| Courant de charge | ≤ 30 A (0,24 C) | |
| MPPT | 48 V **manuel** | l'auto-détection ne se fait qu'au premier démarrage |
| Coupure charge basse température | +2 °C | via NTC du BMS |

### 7.2 Choix du BMS

| Modèle | Specs | Prix | Remarque |
|---|---|---|---|
| JK-B2A24S15P | 7–24S, 150 A, 2 A actif | ~95–105 € | recommandé sur cellules d'occasion |
| JBD / LLT 12S 150 A | 12S, 150 A, 1–2 A | ~70–85 € | bon rapport qualité/prix |
| Daly 12S 150 A | 12S, 150 A, 0,5–1 A | ~55–70 € | économique, balancing faible |

Version **Li-ion 3,7 V** obligatoire (pas LFP), plage 2,5–4,25 V. Prévoir une précharge (25 Ω / 50 W) ou un contacteur piloté, pour éviter l'appel capacitif du MultiPlus.

### 7.3 Dimensionnement

- Fusible : courant continu 71 A × 1,25 = 89 A, donc **Class T 125 A** (pouvoir de coupure élevé, indispensable).
- Câble 48 V : 35 mm² pour 2 m, chute de tension < 1 %.
- Précharge : R = 25 Ω, C ≈ 10 mF, constante de temps 0,25 s, énergie dissipée 13 J.

---

## 8. Risques

| Risque | Probabilité | Impact | Mitigation |
|---|---|---|---|
| SoH réel inférieur à l'annonce | moyenne | moyen | test de capacité, tri par résistance interne |
| Cellules déséquilibrées | élevée | moyen | BMS à balancing actif 2 A, top balance initial |
| Emballement thermique NMC | faible | critique | coffret métallique, détection fumée, pas de charge < 0 °C, assurance |
| Garantie limitée à 1 an | certaine | moyen | budget de remplacement, modules de rechange |
| Transport ADR (81 à 452 kg) | certaine | moyen | 200 à 1 000 € selon masse, à négocier |
| Découpe sous 151 V | moyenne | critique | décharge à 3,3 V/cellule, outils isolés, un lien à la fois |
| Busbars soudées au lieu de boulonnées | moyenne | moyen | photo avant achat, achat d'un seul module d'essai |
| Pyrofuse déclenchée (Kona) | faible | critique | vérifier l'état, pack de remplacement post-rappel |
| Modules arrière Kona à durée de vie réduite | élevée | faible | surveillance thermique, limiter la puissance |
| Refus d'assurance | moyenne | élevé | déclaration préalable, installation hors local habité |

---

## 9. Checklists

### 9.1 Avant achat

1. Exiger un **rapport de capacité et de résistance interne** par module, pas seulement l'année.
2. Demander une **photo de la face busbars** : têtes de vis = boulonné, barre continue = soudé.
3. Demander si le **faisceau de mesure** est inclus (13 ou 37 fils selon le module).
4. Faire préciser l'**origine du pack** (véhicule, année, rappel éventuel) et le nombre de cycles.
5. Faire chiffrer le **transport ADR** avant de valider.
6. Vérifier la **cohérence des specs** : énergie = tension × capacité, sinon demander correction.
7. Pour un pack complet, demander la **répartition des modules** (nombre, tension unitaire).

### 9.2 À réception

1. Contrôle visuel : chocs, oxydation, traces de surchauffe, gonflement.
2. Mesure de la tension de chaque groupe et écart max (viser < 50 mV).
3. Test d'isolement au mégohmmètre entre pôles et boîtier.
4. Test de capacité sur une décharge complète à 0,2 C.
5. Marquage et traçabilité : numéro, capacité mesurée, résistance interne, date.
6. Appariement des paires ou des strings avant mise en parallèle.

### 9.3 Mise en service

1. Top balance avant la première charge complète.
2. Précharge du bus DC avant fermeture du contacteur.
3. Vérification du profil de charge (49,2 V / 48,0 V) avant de brancher le MPPT.
4. Test de coupure : simuler une surtension et vérifier l'ouverture.
5. Journal des 10 premiers cycles (capacité, écart cellule, température).

---

## 10. Annexes

### 10.1 Formules

- Énergie : `E (Wh) = V (V) × C (Ah)`
- Régime : `C-rate = I (A) / C (Ah)`
- Autonomie : `t (h) = E_utile (kWh) / P_moyenne (kW)`
- Section de câble : `S (mm²) = 2 × ρ × L × I / ΔV`, avec ρ = 0,0175 Ω·mm²/m pour le cuivre
- Précharge : `τ = R × C`, `E = ½ × C × V²`

### 10.2 Exemples de calcul

- 6,85 kWh à 80 % de profondeur de décharge = **5,48 kWh utiles**, soit une nuit à 500 W moyens.
- 71 A sur 123 Ah = **0,58 C** ; 30 A = **0,24 C**.
- 48 V, 71 A, 2 m, chute 1 % : `S = 2 × 0,0175 × 2 × 71 / 0,48 = 10,3 mm²`, donc 16 mm² minimum, 35 mm² recommandé.
- 24 V, 145 A, 2 m, chute 1 % : `S = 84 mm²`, soit 95 mm² : c'est le coût caché du 24 V.

### 10.3 Sources

**Catalogue EVShop**

- Module MEB 12S 6,85 kWh : https://evshop.fr/fr/batteries/339-module-de-batterie-12s-685-kwh-48-v-vw-id-meb-utilise.html
- Module Stellantis 6S2P 2,74 kWh : https://evshop.fr/fr/module-batterie/1744-module-de-batterie-stellantis-6s2p-274-kwh-d-occasion.html
- Module LGChem 36S 15,19 kWh : https://evshop.fr/fr/batteries/372-module-de-batterie-lgchem-36s-1519-kwh-d-occasion.html
- Pack Kona 64 kWh : https://evshop.fr/fr/batteries/1073-pack-de-batterie-kona-64-kwh-d-occasion.html
- Pack Leaf 62 kWh : https://evshop.fr/fr/batteries/935-batterie-nissan-leaf-62-kwh-d-occasion.html
- Module Tesla 6S86P : https://evshop.fr/fr/batteries/147-module-de-batterie-tesla-6s86p-64-kwh-utilise.html
- Module Tesla 6S74P : https://evshop.fr/fr/batteries/242-module-tesla-53-kwh-6s74p.html
- Module BMW i3 12S1P : https://evshop.fr/fr/batteries/153-module-de-batterie-12s1p-53-kwh-pour-bmw-i3-utilise.html
- Module CATL 16S 11 kWh : https://evshop.fr/fr/batteries/350-module-de-batterie-catl-16s-11kwh-utilise.html

**Documentation technique**

- Victron MultiPlus-II 230 V, spécifications : https://www.victronenergy.com/media/pg/MultiPlus-II_230V/en/technical-specifications-mp-ii-230v.html
- Victron MPPT 150/35, spécifications : https://www.victronenergy.com/media/pg/Manual_BlueSolar_150-35__150-45/en/technical-specifications.html
- OpenInverter, modules MEB : https://openinverter.org/wiki/MEB_Batteries
- Battery-Emulator, Kia/Hyundai 64 kWh : https://deepwiki.com/dalathegreat/Battery-Emulator/4.8-kiahyundai-64kwh-battery
- Batterydesign, Hyundai Kona 64 kWh : https://www.batterydesign.net/hyundai-kona/
- BMS-EV, guide Leaf pour stockage maison : https://bms-ev.com/en/2026/04/06/nissan-leaf-battery-home-storage-guide/
- JK BMS, protocoles onduleurs : https://www.jkbms.net/solutions/inverter-bms-communication
- Solax X1-Hybrid G4, fiche : https://midsummerwholesale.co.uk/buy/solax/solax-x1-G4-hybrid-5.0

**Référence de prix LFP**

- Pylontech US5000 4,8 kWh, 999 € : https://www.myshop-solaire.com/batterie-lithium-us5000-48v-100ah-4-8-kwh-pylontech-_r_1814_i_4535.html

**Retours d'expérience**

- Annonce Mercedes EQ 36S : https://www.diyelectriccar.com/threads/4-big-ev-modules-4x15-kwh-36s-80-eur-kwh-europe.208880/
- Kona 64 kWh réemployé : https://www.insideevsforum.com/community/threads/for-technical-interest-a-kona-64kwh-battery-repurposed-for-home-use.14713/
- Modules ESS LGChem et BMS CAN : https://secondlifestorage.com/index.php?threads/bms-in-lg-chem-ess-modules.8209/

### 10.4 Glossaire

| Terme | Définition |
|---|---|
| String | Chaîne de cellules en série formant une batterie élémentaire |
| 12S | 12 cellules en série (44,4 V nominal en NMC) |
| CTP | Cell-to-Pack : cellules intégrées directement dans le pack, non démontables |
| BMS | Battery Management System : protection, équilibrage, mesure |
| CMU | Cell Monitoring Unit : carte de mesure cellule, esclave du BMS |
| DoD | Depth of Discharge : profondeur de décharge |
| SoH | State of Health : capacité restante rapportée au neuf |
| LFP | Lithium fer phosphate (3,2 V/cellule) |
| NMC | Nickel manganèse cobalt (3,6–3,7 V/cellule) |
| HV | Haute tension, ici 100 à 800 V |
| ADR | Accord européen sur le transport de marchandises dangereuses |

---

*Rapport établi à partir des fiches produit publiques, de la documentation constructeur et de projets open source. Les prix et disponibilités doivent être revalidés avant commande. Aucune garantie n'est donnée sur la conformité réglementaire d'une installation DIY.*
