# Catalogue batteries EVShop — 80 références

**Inventaire exhaustif des 80 références de la catégorie « Batteries » d'EVShop.fr, avec prix TTC, caractéristiques et choix du chargeur et de l'onduleur.**

- **Source :** <https://evshop.fr/fr/13-batteries> (catégorie principale, 2 pages)
- **Relevé :** 4 novembre 2026
- **Prix :** TTC, hors transport ADR et hors options
- **Données structurées :** [`catalog.json`](../data/evshop_batteries/catalog.json) · [`catalog.csv`](../data/evshop_batteries/catalog.csv)
- **Rapport de sélection associé :** [`RAPPORT-BATTERIES-EVSHOP-2026.md`](RAPPORT-BATTERIES-EVSHOP-2026.md)

> ⚠️ **Ce catalogue n'est pas un devis.** Les prix, stocks et tensions doivent être revalidés avant commande. Les tensions marquées `~` sont estimées à partir de la plateforme ou de la configuration ; elles ne remplacent pas l'étiquette du pack.

## 0. En un coup d'œil

- **80 références** : 17 modules, 62 packs complets, 1 cellule.
- **23 références en stock**, 56 sur commande, 1 en stock non limité.
- **Le critère décisif reste la tension du module**, pas la chimie ni le prix au kWh.
- Le stock web n’est pas affiché pour les références à 0 : elles sont notées **sur commande** et doivent être confirmées.

### 0.1 Les six références à retenir

| Réf | Rôle | Pourquoi | Prix | €/kWh |
|---|---|---|---|---|
| [1744](https://evshop.fr/fr/module-batterie/1744-module-de-batterie-stellantis-6s2p-274-kwh-d-occasion.html) | Meilleur module 24 V | 5,48 kWh avec 2 modules, 48 V natif, aucun travail mécanique | 2 × 216 € = 432 € | 78,8 €/kWh |
| [339](https://evshop.fr/fr/batteries/339-module-de-batterie-12s-685-kwh-48-v-vw-id-meb-utilise.html) | Meilleur module 48 V | 6,85 kWh par bloc, 48 V natif, BMS 12S standard | 750 € | 109,5 €/kWh |
| [372](https://evshop.fr/fr/batteries/372-module-de-batterie-lgchem-36s-1519-kwh-d-occasion.html) | Meilleur €/kWh module | 36S 15,19 kWh, à découper en 3 × 12S ou à passer en X1 | 1 014 € | 66,8 €/kWh |
| [1073](https://evshop.fr/fr/batteries/1073-pack-de-batterie-kona-64-kwh-d-occasion.html) | Meilleur pack 400 V en stock | 64 kWh, BMS OEM, Battery-Emulator compatible | 4 500 € | 70,3 €/kWh |
| [3568](https://evshop.fr/fr/byd/3568-pack-de-batterie-byd-han-de-64-kwh.html) | Meilleur pack 600 V LFP | 64,8 kWh BYD Blade, X3/Deye | 5 120 € | 79,0 €/kWh |
| [350](https://evshop.fr/fr/batteries/350-module-de-batterie-catl-16s-11kwh-utilise.html) | Module 48 V limite | 16S 11 kWh, 67,2 V : Victron seulement si charge plafonnée à 65,6 V | 1 190 € | 108,2 €/kWh |

### 0.2 Le classement brut

| # | Réf | Produit | Prix | kWh | Tension | €/kWh | Famille |
|---|---|---|---|---|---|---|---|
| 1 | [2719](https://evshop.fr/fr/mercedes/2719-batterie-mercedes-classe-b-28-kwh-d-occasion.html) | Mercedes Classe B 28 kWh (d'occasion) | 1 900 € | 31,00 (28,0 utiles) | 300 V (250–350) | 61,3 | Packs HV 300–500 V |
| 2 | [372](https://evshop.fr/fr/batteries/372-module-de-batterie-lgchem-36s-1519-kwh-d-occasion.html) | LGChem 36S 15,19 kWh (d'occasion) | 1 014 € | 15,19 | 132 V (101–152) | 66,8 | Modules HT |
| 3 | [3695](https://evshop.fr/fr/batteries/3695-batterie-tesla-model-s-75-kwh-d-occasion.html) | Tesla Model S 75 kWh (d'occasion) | 5 175 € | 75,00 | 365 V (288–403) | 69,0 | Packs HV 300–500 V |
| 4 | [1073](https://evshop.fr/fr/batteries/1073-pack-de-batterie-kona-64-kwh-d-occasion.html) | Pack de batterie Kona 64 kWh (d'occasion) | 4 500 € | 64,00 | 356 V (268–403) | 70,3 | Packs HV 300–500 V |
| 5 | [1713](https://evshop.fr/fr/batterie/1713-pack-batterie-54kwh-opel-mokka-e-d-occasion.html) | Pack batterie 54kWh Opel Mokka-e (d'occasion) | 3 900 € | 54,00 | ~400 V (300–450) | 72,2 | Packs HV 300–500 V |
| 6 | [292](https://evshop.fr/fr/batteries/292-pack-de-batterie-longue-portee-tesla-model-3-de-75-kwh-d-occasion.html) | Pack de batterie longue portée Tesla Model 3 de 75 kWh (d'occasion) | 5 500 € | 75,00 | 355 V (288–403) | 73,3 | Packs HV 300–500 V |
| 7 | [1417](https://evshop.fr/fr/batterie/1417-pack-de-batteries-lfp-tesla-model-3-de-55-kwh-d-occasion.html) | Pack de batteries LFP Tesla Model 3 de 55 kWh (d'occasion) | 4 140 € | 55,00 (52,5 utiles) | 340 V (250–383) | 75,3 | Packs HV 300–500 V |
| 8 | [1710](https://evshop.fr/fr/batterie/1710-pack-batterie-peugeot-e-208-50kwh-d-occasion.html) | Pack batterie Peugeot e-208 50kWh (d'occasion) | 3 900 € | 50,00 | ~400 V (300–450) | 78,0 | Packs HV 300–500 V |
| 9 | [1711](https://evshop.fr/fr/batterie/1711-pack-batterie-peugeot-e-rifter-50kwh-d-occasion.html) | Pack batterie Peugeot e-rifter 50kWh (d'occasion) | 3 900 € | 50,00 | ~400 V (300–450) | 78,0 | Packs HV 300–500 V |
| 10 | [1712](https://evshop.fr/fr/batterie/1712-pack-batterie-peugeot-e-2008-50kwh-d-occasion.html) | Pack batterie Peugeot e-2008 50kWh (d'occasion) | 3 900 € | 50,00 | ~400 V (300–450) | 78,0 | Packs HV 300–500 V |
| 11 | [3568](https://evshop.fr/fr/byd/3568-pack-de-batterie-byd-han-de-64-kwh.html) | Pack de batterie BYD Han de 64 kWh | 5 120 € | 64,80 | ~600 V (450–684) | 79,0 | Packs HV 550–700 V |
| 12 | [3575](https://evshop.fr/fr/mg/3575-pack-batterie-mg-zs-ev-44-kwh.html) | Pack batterie MG ZS EV 44 kWh | 3 520 € | 44,50 | ~350 V (270–403) | 79,1 | Packs HV 300–500 V |
| 13 | [4229](https://evshop.fr/fr/byd/4229-batterie-byd-atto-3-lames-de-60-kwh.html) | BYD Atto 3 lames de 60 kWh | 4 800 € | 60,48 | 410 V (320–460) | 79,4 | Packs HV 300–500 V |
| 14 | [3570](https://evshop.fr/fr/byd/3570-pack-batterie-byd-t3-de-50-kwh.html) | Pack batterie BYD T3 de 50 kWh | 4 000 € | 50,30 | ~580 V (440–660) | 79,5 | Packs HV 550–700 V |
| 15 | [3569](https://evshop.fr/fr/byd/3569-pack-de-batteries-byd-tang-de-85-kwh.html) | Pack de batteries BYD Tang de 85 kWh | 6 800 € | 85,40 | ~600 V (450–684) | 79,6 | Packs HV 550–700 V |

Le prix au kWh brut ne dit pas tout : un pack 400 V à 70 €/kWh exige un onduleur HV à 1 500–3 000 € et une intégration CAN. Un module 12S à 110 €/kWh se branche sur un MultiPlus-II déjà présent. **Comparer le coût du site, pas le prix du kWh.** Pour la Mercedes 2719, le classement utilise 31 kWh bruts ; sur 28 kWh utiles, le coût passe à 67,9 €/kWh.

## 1. Méthode et limites

1. Inventaire des **80 références** de la catégorie principale « Batteries » (pages 1 et 2), prix TTC au 4 novembre 2026.
2. Lecture des fiches produit : tension, coupure haute/basse, capacité, configuration, masse, dimensions, connectique.
3. Croisement avec la documentation constructeur et les projets open source : Victron, Solax, Deye, Battery-Emulator.
4. Classement par **architecture** (24 V, 48 V, HT 87–132 V, pack 350–450 V, pack 550–700 V, pack 800 V), puis calcul du €/kWh.
5. Vérification de cohérence : `E = V × Ah`. Les incohérences sont signalées, pas corrigées en silence.
6. Contrôle d'exhaustivité : les sous-catégories « Batterie » (41) et « Module batterie » (42) totalisent exactement les mêmes 80 références, sans doublon ni référence supplémentaire. Les accessoires de batterie (catégorie 29 : BMS, câbles, coffrets) sont exclus.

**Limites :**

- Aucun produit n'a été testé physiquement ; les SoH annoncés ne sont pas vérifiés.
- Les prix n'incluent pas le transport ADR (200 à 1 000 € selon la masse) ni les options.
- Les tensions des packs non documentés sont estimées et marquées `~`.
- Les coûts de BMS, coffret, câblage et main-d'œuvre sont des estimations de marché.
- Une batterie DIY n'est pas certifiée : l'assurance et la conformité restent à la charge de l'installateur.

## 2. Choisir le chargeur et l'onduleur

### 2.1 La règle qui décide de tout : la tension

Un chargeur ou un onduleur ne s'adapte pas à la tension d'une batterie : c'est la batterie qui doit entrer dans **sa fenêtre DC**. Une fois la tension fixée, le reste (puissance, MPPT, BMS) se déduit.

| Architecture | Tension nominale | Plage typique | Onduleur / chargeur | Verdict |
|---|---|---|---|---|
| 6S NMC | 22,2 V | 19,8–25,2 V | MultiPlus-II 24/3000 (19–33 V) | ✅ 24 V natif |
| 8S NMC | 29,6 V | 24,2–33,6 V | MultiPlus-II 24/3000, charge plafonnée à 32,8 V | ✅ 24 V, limite haute |
| 12S NMC | 44,4 V | 39,6–50,4 V | MultiPlus-II 48/3000 ou 48/5000 (38–66 V) | ✅ 48 V natif |
| 16S NMC | 58,7 V | 44,8–67,2 V | Victron 48 V seulement si charge ≤ 65,6 V | ⚠️ 48 V limite |
| 24S NMC | 87,5 V | 67,2–100,8 V | Solax X1-Hybrid G4 (80–480 V) | ⚠️ X1, plage basse |
| 36S NMC | 131,5 V | 100,8–151,5 V | Solax X1-Hybrid G4 (80–480 V) | ✅ X1 natif |
| Pack 96S–110S | 350–407 V | 260–450 V | X1 (80–480 V), X3 (180–800 V), Deye HV (160–700 V) | ✅ HV standard |
| Pack 600 V LFP | 580–600 V | 440–684 V | X3 (180–800 V), Deye HV (160–700 V) | ✅ HV, pas X1 |
| Pack 800 V | 650–723 V | 500–840 V | X3 limite (max 800 V) | ⚠️ vérifier Vmax |

> **Règle pratique :** pour du Victron 48 V, il faut des modules **12S** (ou des paires de 6S). Pour du 24 V, des **6S** (ou des 8S avec charge plafonnée). Tout ce qui est 24S, 36S ou pack complet sort du Victron basse tension.

### 2.2 Matrice de compatibilité des équipements

| Équipement | Fenêtre DC | Ce qui passe | Ce qui ne passe pas |
|---|---|---|---|
| Victron MultiPlus-II 24 V | 19–33 V | 6S (19,8–25,2 V), 8S avec charge ≤ 32,8 V | 12S (39,6 V min) ; 8S à 33,6 V |
| Victron MultiPlus-II 48 V | 38–66 V | 12S (39,6–50,4 V), 16S avec charge ≤ 65,6 V | 24S (67,2 V min) ; 36S ; packs HV |
| Victron MPPT 150/35 à 150/70 | 12/24/48 V | 12S, 16S limité, 6S/8S | 24S et plus |
| Victron MPPT 100/30 | 12/24 V | 6S, 8S | 48 V |
| Solax X1-Hybrid G4 | 80–480 V | 36S (100,8–151,5 V), 24S partiel, packs 350–450 V | 16S (67,2 V) ; packs 600 V ; packs 800 V |
| Solax X3-Hybrid G4 | 180–800 V | 48S et plus, packs 350–600 V, packs 800 V limite | 36S (151,5 V max) ; 24S |
| Deye HV (SUN-…-SG01HP3) | 160–700 V | 48S et plus, packs 350–600 V | 36S (151,5 V) ; packs 800 V |
| GoodWe ET 15–30 kW | 200–800 V | Packs 350–600 V | 36S ; packs 800 V selon modèle |

Les plages Victron sont issues de la fiche technique MultiPlus-II 230 V : 38–66 V en 48 V, 19–33 V en 24 V, 35 A de charge sur le 48/3000 et 70 A sur le 48/5000. Les plages Solax X1/X3 et Deye HV sont celles des fiches constructeur (X1 80–480 V / 30 A ; X3 180–800 V / 30 A ; Deye 160–700 V).

### 2.3 Architecture 24 V : simple, mais courants doublés

**Quand :** une installation existante en 24 V, un petit site, ou des modules 6S/8S disponibles à bas prix.

- **Onduleur/chargeur :** Victron MultiPlus-II 24/3000 (chargeur 70 A, plage 19–33 V).
- **MPPT :** SmartSolar 100/30 pour 6S, 150/35 à 150/60 pour 8S selon le courant.
- **BMS :** JK-B2A24S15P (7–24S, 150 A) ou JBD 8S 150 A.
- **Protection :** fusible Class T 200 A, câble 50 mm², précharge.
- **Réglages 6S NMC :** absorption 24,6 V (4,10 V/cellule), float 24,0 V, coupure 21,0 V.
- **Réglages 8S NMC :** absorption 32,8 V, float 32,0 V, coupure 28,0 V. **Ne pas dépasser 33 V** (limite MultiPlus).

À puissance égale, le 24 V double le courant : 145 A pour 3 kVA contre 71 A en 48 V, donc des câbles de 50–95 mm² et un MPPT limité à ~1,4 kW. **À réserver aux installations déjà en 24 V.**

### 2.4 Architecture 48 V : le cœur du catalogue

**Quand :** maison, autoconstruction, écosystème Victron, 4 à 20 kWh.

- **Onduleur/chargeur :** MultiPlus-II 48/3000 (35 A de charge) pour ≤ 120 Ah, 48/5000 (70 A) au-delà.
- **MPPT :** SmartSolar 150/35, 150/45, 150/60 ou 150/70 selon le courant de charge visé.
- **BMS :** JK-B2A24S15P (12S, 150 A) ; un BMS par string.
- **Protection :** fusible Class T 125 A (3000 VA) ou 150 A (5000 VA), câble 35 mm², précharge 25 Ω / 50 W.
- **Réglages 12S NMC :** absorption 49,2 V, float 48,0 V, coupure 42,0 V, redémarrage 44,5 V, égalisation désactivée.
- **MPPT :** forcer le mode 48 V manuel ; l'auto-détection ne se fait qu'au premier démarrage.
- **Appariement :** ne jamais mélanger des modules d'âges, de capacités ou de résistances internes différents dans une même string. Un fusible par string, un BMS par string.

**Les trois voies 48 V :**

1. **12S natif** — 1 module 12S, ou 2 modules 6S en série. Aucun travail mécanique. C'est la voie recommandée.
2. **36S découpé** — 1 module 36S coupé en 3 × 12S, 3 BMS. Le meilleur €/kWh, mais travail sous 151 V et garantie annulée.
3. **16S limite** — 1 module 16S, charge plafonnée à 65,6 V (4,10 V/cellule) pour rester sous les 66 V Victron. Possible, mais peu de marge.

### 2.5 Architecture haute tension : le pack reste entier

**Quand :** 15 kWh et plus, pack complet disponible, volonté de ne pas découper.

- **X1-Hybrid G4 (80–480 V, 30 A)** : 36S natif, packs 350–450 V. C'est l'onduleur le plus polyvalent pour les packs 400 V.
- **X3-Hybrid G4 (180–800 V, 30 A)** : packs 550–600 V, packs 800 V en limite haute. Pas de 36S.
- **Deye HV (160–700 V)** : alternative pour les packs 350–600 V ; pas de 36S, pas de 800 V.
- **BMS :** celui du pack, conservé. L'intégration passe par CAN (Battery-Emulator ou protocole constructeur).
- **Charge :** pilotée par l'onduleur hybride, avec le profil du BMS. Pas de chargeur AC séparé.
- **Protection :** sectionneur DC HV, précharge, surveillance d'isolement, coffret fermé.

> **Le point critique n'est pas l'onduleur, c'est le BMS.** Un pack 64 kWh sans protocole CAN documenté est une loterie : il faut soit Battery-Emulator (liste de compatibilité), soit un BMS de remplacement (Orion 2, REC), soit renoncer.

### 2.6 Dimensionner le chargeur

**Courant de charge cible :** 0,3 à 0,4 C pour du NMC d'occasion, 0,5 C maximum pour du LFP neuf. Pour un module de 115 Ah : 35 à 46 A. Pour un pack de 180 Ah : 54 à 72 A.

**Puissance MPPT :** `P ≈ V_batterie × I_charge × 1,2`. Exemple : 48 V × 45 A × 1,2 = **2,6 kWc** de panneaux pour un MPPT 150/45.

**Choix du MPPT :**

- 24 V : 100/30 pour ≤ 30 A, 150/35 à 150/60 au-delà.
- 48 V : 150/35 minimum (les 100/30 ne font pas 48 V), puis 150/45, 150/60, 150/70.
- La tension PV à vide doit rester **< 150 V** (ou 250 V pour les 250/…) à la température la plus froide.

**Choix du chargeur AC :**

- 24 V : MultiPlus-II 24/3000, chargeur 70 A.
- 48 V : MultiPlus-II 48/3000, chargeur 35 A ; 48/5000, chargeur 70 A.
- HT : pas de chargeur AC séparé, l'onduleur hybride charge depuis le réseau et le PV.

### 2.7 BMS, protection, précharge

| Architecture | BMS | Fusible / breaker | Câble | Précharge |
|---|---|---|---|---|
| 24 V, 6S/8S | JK-B2A24S15P ou JBD 8S 150 A | Class T 200 A | 50 mm² | 25 Ω / 50 W |
| 48 V, 12S | JK-B2A24S15P (1 par string) | Class T 125 A (3000 VA) / 150 A (5000 VA) | 35 mm² | 25 Ω / 50 W |
| 48 V, 16S | JK-B2A24S15P | Class T 150 A | 35 mm² | 25 Ω / 50 W |
| HT, 24S/36S | BMS 24S/36S (JK 24S max, Orion 2/REC pour 36S) | Sectionneur DC 100–125 A / 250 V | 16–25 mm² | Obligatoire |
| Pack HV | BMS OEM + CAN | Sectionneur DC HV + breaker | Selon courant pack | Obligatoire |

**Pourquoi la précharge :** le MultiPlus et les onduleurs HV ont de gros condensateurs. Sans précharge, la fermeture du contacteur crée un appel de courant qui peut souder les contacts ou déclencher le BMS. `τ = R × C` ; avec 25 Ω et 10 mF, τ = 0,25 s.

### 2.8 Profils de charge

| Paramètre | NMC (3,6–3,7 V) | LFP (3,2 V) |
|---|---|---|
| Absorption | 4,10 V/cellule | 3,45 V/cellule |
| Float | 4,00 V/cellule | 3,35 V/cellule |
| Coupure basse BMS | 3,00–3,20 V/cellule | 2,80 V/cellule |
| Coupure basse onduleur | 3,50 V/cellule | 3,00 V/cellule |
| Égalisation | Jamais | Jamais |
| Température de charge | > +2 °C | > 0 °C |
| Courant | 0,3–0,4 C | 0,5 C |

Les packs complets gardent le profil de leur BMS. **Ne pas imposer un profil 12S à un pack 96S** : c'est le BMS qui décide, l'onduleur suit.

## 3. Catalogue complet

Chaque famille donne deux tableaux : les **caractéristiques**, puis le **choix chargeur / onduleur**. Les références sont cliquables vers la fiche EVShop. Dans la colonne Config, `—` signifie que la fiche ne documente pas la configuration série/parallèle : elle est à confirmer sur l'étiquette, elle n'a pas été inventée.

### 3.1 Cellules (1 référence)

Cellules nues : aucun BMS, aucun coffret, aucune protection. À réserver à l'assemblage maîtrisé.

| Réf | Produit | Prix | kWh | Tension | Config | Ah | kg | €/kWh | Stock |
|---|---|---|---|---|---|---|---|---|---|
| [213](https://evshop.fr/fr/batteries/213-batterie-38120s-32-v-10-ah-lifepo4-utilisee.html) | 38120S 3,2 V 10 Ah LifePO4 (utilisée) | 30 € | 0,03 | 3,2 V (2,0–3,6) | 1S | 10 | 0,3 | 937,5 | en stock (718) |

| Réf | Chargeur | Onduleur / chargeur | BMS | Verdict |
|---|---|---|---|---|
| [213](https://evshop.fr/fr/batteries/213-batterie-38120s-32-v-10-ah-lifepo4-utilisee.html) | 16S LFP (51,2 V) : MPPT 150/35 ; absorption 55,2 V / float 53,6 V | MultiPlus-II 48/3000 ; BMS 16S LFP ; fusible 125 A | BMS 16S LFP 100–150 A (JK/JBD) | Assemblage 48 V LFP (16 cellules) |

### 3.2 Modules 8 V (1 référence)

Modules 2S ou 3S : il faut impérativement les mettre en série pour atteindre 24 V ou 48 V.

| Réf | Produit | Prix | kWh | Tension | Config | Ah | kg | €/kWh | Stock |
|---|---|---|---|---|---|---|---|---|---|
| [321](https://evshop.fr/fr/batteries/321-module-de-batterie-2s-nissan-leaf-gen-2-utilise.html) | 2s Nissan Leaf Gen 2 (utilisé) | 90 € | 0,44 | 7,4 V (6,0–8,3) | 2S2P | 60 | 4 | 204,5 | en stock (43) |

| Réf | Chargeur | Onduleur / chargeur | BMS | Verdict |
|---|---|---|---|---|
| [321](https://evshop.fr/fr/batteries/321-module-de-batterie-2s-nissan-leaf-gen-2-utilise.html) | 6× en série = 12S 48 V → MPPT 150/35 ; 3× = 6S 24 V → MPPT 100/30 | 6× série : MultiPlus-II 48/3000 ; 3× série : MultiPlus-II 24/3000 | BMS 6S/12S 100–150 A (JK-B2A24S15P) | Petit module : assemblage série obligatoire |

### 3.3 Modules 12 V (1 référence)

Modules 3S : 4 en série donnent un 12S 48 V. Le câblage et l'appariement sont critiques.

| Réf | Produit | Prix | kWh | Tension | Config | Ah | kg | €/kWh | Stock |
|---|---|---|---|---|---|---|---|---|---|
| [1072](https://evshop.fr/fr/batteries/1072-module-de-batterie-jaguar-i-pace-26-kwh-11-v-236-ah-utilise.html) | Jaguar I-Pace 2,6 kWh, 11 V, 236 Ah (utilisé) | 300 € | 2,60 | 11,1 V (8,4–12,6) | 3S1P | 236 | 12 | 115,4 | en stock (15) |

| Réf | Chargeur | Onduleur / chargeur | BMS | Verdict |
|---|---|---|---|---|
| [1072](https://evshop.fr/fr/batteries/1072-module-de-batterie-jaguar-i-pace-26-kwh-11-v-236-ah-utilise.html) | 4× en série = 12S 48 V (44,4 V) → MPPT 150/70 ; absorption 49,2 V / float 48,0 V ; charge ≤ 70 A | MultiPlus-II 48/5000 (70 A) ; BMS 12S 150 A | BMS 12S 150 A (JK-B2A24S15P) | Module 12 V : 4× en série pour 48 V |

### 3.4 Modules 24 V (7 références)

Modules 6S ou 8S : 24 V natif, ou 2 × 6S en série pour un 48 V. C'est la famille la plus simple pour débuter.

| Réf | Produit | Prix | kWh | Tension | Config | Ah | kg | €/kWh | Stock |
|---|---|---|---|---|---|---|---|---|---|
| [147](https://evshop.fr/fr/batteries/147-module-de-batterie-tesla-6s86p-64-kwh-utilise.html) | Tesla 6S86P 6,4 kWh (utilisé) | 1 155 € | 6,40 | 22,8 V (19,8–25,2) | 6S86P | 287 | 28 | 180,5 | en stock (16) |
| [186](https://evshop.fr/fr/batteries/186-module-de-batterie-8s-12-kwh-pour-mitsubishi-outlander-phev-d-occasion.html) | 8S 1,2 kWh pour Mitsubishi Outlander PHEV (d'occasion) | 380 € | 1,20 | 30,0 V (22,0–32,8) | 8S1P | 40 | 26 | 316,7 | sur commande |
| [242](https://evshop.fr/fr/batteries/242-module-tesla-53-kwh-6s74p.html) | Module Tesla 6S74P 5,3 kWh (fabriqué en 2015 ou plus récent) | 600 € | 5,30 | 22,8 V (19,8–25,2) | 6S74P | 232 | 26 | 113,2 | en stock (24) |
| [345](https://evshop.fr/fr/batteries/345-module-de-batterie-8s-685-kwh-30-v-vw-id-meb-utilise.html) | 8S 6,85 kWh 30 V VW ID (MEB) (utilisé) | 750 € | 6,85 | 29,6 V (24,2–33,6) | 8S3P | 234 | 32 | 109,5 | en stock (17) |
| [1064](https://evshop.fr/fr/batteries/1064-module-de-batterie-6s2p-24-kwh-ioniq-5-utilise.html) | 6s2p 2,4 kWh Ioniq 5 (utilisé) | 250 € | 2,40 | 22,2 V (19,8–25,2) | 6S2P | 108 | 12 | 104,2 | en stock (24) |
| [1416](https://evshop.fr/fr/batteries/1416-module-tesla-6s74p-53-kwh-fabrique-en-2014-ou-avant.html) | Module Tesla 6S74P 5,3 kWh (fabriqué en 2014 ou avant) | 650 € | 5,30 | 22,8 V (19,8–25,2) | 6S74P | 232 | 26 | 122,6 | en stock (10) |
| [1744](https://evshop.fr/fr/module-batterie/1744-module-de-batterie-stellantis-6s2p-274-kwh-d-occasion.html) | Stellantis 6s2p 2,74 kWh (d'occasion) | 216 € | 2,74 | 22,2 V (19,8–25,2) | 6S2P | 123 | 13 | 78,8 | sur commande |

| Réf | Chargeur | Onduleur / chargeur | BMS | Verdict |
|---|---|---|---|---|
| [147](https://evshop.fr/fr/batteries/147-module-de-batterie-tesla-6s86p-64-kwh-utilise.html) | 1× = 24 V : MPPT 150/60, absorption 24,6 V / float 24,0 V ; 2× en série = 48 V (recommandé) : MPPT 150/45, absorption 49,2 V / float 48,0 V | 1× : MultiPlus-II 24/3000 ; 2× série : MultiPlus-II 48/3000 | BMS 6S/12S 150 A (JK-B2A24S15P) | 24 V natif, ou 48 V avec 2× en série |
| [186](https://evshop.fr/fr/batteries/186-module-de-batterie-8s-12-kwh-pour-mitsubishi-outlander-phev-d-occasion.html) | 1× = 24 V : MPPT 150/60, absorption 32,8 V / float 32,0 V (plafond MultiPlus 33 V) ; 3× en série = 24S (88,8 V) : X1-Hybrid G4 | 1× : MultiPlus-II 24/3000 ; 3× série : Solax X1-Hybrid G4 | BMS 8S 150 A (JK-B2A24S15P) | 24 V limite, ou 24S HV avec 3× en série |
| [242](https://evshop.fr/fr/batteries/242-module-tesla-53-kwh-6s74p.html) | 1× = 24 V : MPPT 150/60, absorption 24,6 V / float 24,0 V ; 2× en série = 48 V (recommandé) : MPPT 150/45, absorption 49,2 V / float 48,0 V | 1× : MultiPlus-II 24/3000 ; 2× série : MultiPlus-II 48/3000 | BMS 6S/12S 150 A (JK-B2A24S15P) | 24 V natif, ou 48 V avec 2× en série |
| [345](https://evshop.fr/fr/batteries/345-module-de-batterie-8s-685-kwh-30-v-vw-id-meb-utilise.html) | 1× = 24 V : MPPT 150/60, absorption 32,8 V / float 32,0 V (plafond MultiPlus 33 V) ; 3× en série = 24S (88,8 V) : X1-Hybrid G4 | 1× : MultiPlus-II 24/3000 ; 3× série : Solax X1-Hybrid G4 | BMS 8S 150 A (JK-B2A24S15P) | 24 V limite, ou 24S HV avec 3× en série |
| [1064](https://evshop.fr/fr/batteries/1064-module-de-batterie-6s2p-24-kwh-ioniq-5-utilise.html) | 1× = 24 V : MPPT 150/60, absorption 24,6 V / float 24,0 V ; 2× en série = 48 V (recommandé) : MPPT 150/45, absorption 49,2 V / float 48,0 V | 1× : MultiPlus-II 24/3000 ; 2× série : MultiPlus-II 48/3000 | BMS 6S/12S 150 A (JK-B2A24S15P) | 24 V natif, ou 48 V avec 2× en série |
| [1416](https://evshop.fr/fr/batteries/1416-module-tesla-6s74p-53-kwh-fabrique-en-2014-ou-avant.html) | 1× = 24 V : MPPT 150/60, absorption 24,6 V / float 24,0 V ; 2× en série = 48 V (recommandé) : MPPT 150/45, absorption 49,2 V / float 48,0 V | 1× : MultiPlus-II 24/3000 ; 2× série : MultiPlus-II 48/3000 | BMS 6S/12S 150 A (JK-B2A24S15P) | 24 V natif, ou 48 V avec 2× en série |
| [1744](https://evshop.fr/fr/module-batterie/1744-module-de-batterie-stellantis-6s2p-274-kwh-d-occasion.html) | 1× = 24 V : MPPT 150/60, absorption 24,6 V / float 24,0 V ; 2× en série = 48 V (recommandé) : MPPT 150/45, absorption 49,2 V / float 48,0 V | 1× : MultiPlus-II 24/3000 ; 2× série : MultiPlus-II 48/3000 | BMS 6S/12S 150 A (JK-B2A24S15P) | 24 V natif, ou 48 V avec 2× en série |

### 3.5 Modules 48 V (6 références)

Modules 12S : 48 V natif, aucun travail mécanique. La famille de référence pour un MultiPlus-II.

| Réf | Produit | Prix | kWh | Tension | Config | Ah | kg | €/kWh | Stock |
|---|---|---|---|---|---|---|---|---|---|
| [153](https://evshop.fr/fr/batteries/153-module-de-batterie-12s1p-53-kwh-pour-bmw-i3-utilise.html) | 12S1P 5,3 kWh pour BMW i3 (utilisé) | 900 € | 5,30 | 45,6 V (39,6–50,4) | 12S1P | 120 | 28 | 169,8 | sur commande |
| [216](https://evshop.fr/fr/batteries/216-module-de-batterie-12s1p-415-kwh-pour-bmw-i3-utilise.html) | 12S1P 4,15 kWh pour BMW i3 (utilisé) | 890 € | 4,15 | 45,6 V (39,6–50,4) | 12S1P | 94 | 29 | 214,5 | sur commande |
| [339](https://evshop.fr/fr/batteries/339-module-de-batterie-12s-685-kwh-48-v-vw-id-meb-utilise.html) | 12S 6,85 kWh 48 V VW ID (MEB) (utilisé) | 750 € | 6,85 | 44,4 V (39,6–50,4) | 12S2P | 156 | 32 | 109,5 | en stock (19) |
| [350](https://evshop.fr/fr/batteries/350-module-de-batterie-catl-16s-11kwh-utilise.html) | CATL 16S 11kWh (utilisé) | 1 190 € | 11,00 | 58,7 V (44,8–67,2) | 16S2P | 188 | 45 | 108,2 | en stock (5) |
| [1074](https://evshop.fr/fr/batteries/1074-module-de-batterie-12s-25ah-vw-gte-11kwh-48v-utilise.html) | 12S 25Ah VW GTE 1,1kWh 48V (utilisé) | 190 € | 1,09 | 44,4 V (36,0–50,4) | 12S1P | 25 | 8 | 175,0 | sur commande |
| [4600](https://evshop.fr/fr/module-batterie/4600-module-de-batterie-neuf-12s1p-706-kwh-vw-meb-catl.html) | neuf 12S1P 7,06 kWh VW MEB CATL | 1 200 € | 7,06 | 44,4 V (39,6–50,4) | 12S1P | 240 | 30 | 170,0 | sur commande |

| Réf | Chargeur | Onduleur / chargeur | BMS | Verdict |
|---|---|---|---|---|
| [153](https://evshop.fr/fr/batteries/153-module-de-batterie-12s1p-53-kwh-pour-bmw-i3-utilise.html) | Victron SmartSolar 150/60 (48 V) ; absorption 49,2 V / float 48,0 V ; charge ≤ 48 A | MultiPlus-II 48/3000 (35 A) | BMS 12S 150 A (JK-B2A24S15P) | 48 V natif |
| [216](https://evshop.fr/fr/batteries/216-module-de-batterie-12s1p-415-kwh-pour-bmw-i3-utilise.html) | Victron SmartSolar 150/45 (48 V) ; absorption 49,2 V / float 48,0 V ; charge ≤ 38 A | MultiPlus-II 48/3000 (35 A) | BMS 12S 150 A (JK-B2A24S15P) | 48 V natif |
| [339](https://evshop.fr/fr/batteries/339-module-de-batterie-12s-685-kwh-48-v-vw-id-meb-utilise.html) | Victron SmartSolar 150/70 (48 V) ; absorption 49,2 V / float 48,0 V ; charge ≤ 62 A | MultiPlus-II 48/5000 (70 A) | BMS 12S 150 A (JK-B2A24S15P) | 48 V natif |
| [350](https://evshop.fr/fr/batteries/350-module-de-batterie-catl-16s-11kwh-utilise.html) | Victron MPPT 150/70 (48 V), mais plage 66 V : charge plafonnée à 65,6 V (4,10 V/cellule), float 64,0 V ; sinon 2× en série = 32S sur X1 | MultiPlus-II 48/3000/5000 limite (66 V) ; sinon 2× en série = 32S (117 V) sur X1-Hybrid G4 | BMS 16S 150 A (JK-B2A24S15P) | 48 V limite : Victron seulement avec charge ≤ 65,6 V |
| [1074](https://evshop.fr/fr/batteries/1074-module-de-batterie-12s-25ah-vw-gte-11kwh-48v-utilise.html) | Victron SmartSolar 150/35 (48 V) ; absorption 49,2 V / float 48,0 V ; charge ≤ 10 A | MultiPlus-II 48/3000 (35 A) | BMS 12S 150 A (JK-B2A24S15P) | 48 V natif |
| [4600](https://evshop.fr/fr/module-batterie/4600-module-de-batterie-neuf-12s1p-706-kwh-vw-meb-catl.html) | Victron SmartSolar 150/70 (48 V) ; absorption 49,2 V / float 48,0 V ; charge ≤ 70 A | MultiPlus-II 48/5000 (70 A) | BMS 12S 150 A (JK-B2A24S15P) | 48 V natif |

### 3.6 Modules HT (2 références)

Modules 24S (87,5 V) et 36S (131,5 V) : ils sortent de la plage Victron 48 V et passent en onduleur hybride haute tension.

| Réf | Produit | Prix | kWh | Tension | Config | Ah | kg | €/kWh | Stock |
|---|---|---|---|---|---|---|---|---|---|
| [351](https://evshop.fr/fr/batteries/351-module-de-batterie-lgchem-24s-101-kwh-occasion.html) | LGChem 24S 10,1 kWh (Occasion) | 1 190 € | 10,10 | 87,5 V (67,2–100,8) | 24S1P | 115 | 53 | 117,8 | en stock (2) |
| [372](https://evshop.fr/fr/batteries/372-module-de-batterie-lgchem-36s-1519-kwh-d-occasion.html) | LGChem 36S 15,19 kWh (d'occasion) | 1 014 € | 15,19 | 132 V (101–152) | 36S1P | 115 | 81 | 66,8 | en stock (8) |

| Réf | Chargeur | Onduleur / chargeur | BMS | Verdict |
|---|---|---|---|---|
| [351](https://evshop.fr/fr/batteries/351-module-de-batterie-lgchem-24s-101-kwh-occasion.html) | Solax X1-Hybrid G4 (80–480 V), 30 A max ; pas de MPPT Victron 48 V | Solax X1-Hybrid G4 ; 2 × 351 en série = 48S (175 V) pour X1/Deye (X3 limite, min 180 V) | BMS 24S 150 A (JK-B2A24S15P) ou BMS 24S dédié | HV X1 (plage basse, capacité utile réduite) |
| [372](https://evshop.fr/fr/batteries/372-module-de-batterie-lgchem-36s-1519-kwh-d-occasion.html) | Solax X1-Hybrid G4 (80–480 V), 30 A max ; ou X3/Deye avec 2× en série | Solax X1-Hybrid G4 ; X3 (min 180 V) et Deye (min 160 V) avec 2× en série (263 V) | BMS 36S (Orion BMS 2 / REC) ou découpe 3×12S + 3 BMS | HV X1 natif |

### 3.7 Packs HV 300–500 V (55 références)

Packs complets 300–500 V : la plus grande famille. Ils gardent leur BMS d'origine et s'intègrent par CAN (Battery-Emulator) ou protocole constructeur.

| Réf | Produit | Prix | kWh | Tension | Config | Ah | kg | €/kWh | Stock |
|---|---|---|---|---|---|---|---|---|---|
| [217](https://evshop.fr/fr/batteries/217-pack-batterie-24kwh-nissan-leaf-gen-2-occasion.html) | Pack batterie 24kWh Nissan Leaf Gen 2 (Occasion) | 3 490 € | 24,00 | 360 V (300–403) | 96S2P | 60 | 180 | 145,4 | en stock (1) |
| [292](https://evshop.fr/fr/batteries/292-pack-de-batterie-longue-portee-tesla-model-3-de-75-kwh-d-occasion.html) | Pack de batterie longue portée Tesla Model 3 de 75 kWh (d'occasion) | 5 500 € | 75,00 | 355 V (288–403) | 96S1P | 217 | 479 | 73,3 | en stock (20) |
| [298](https://evshop.fr/fr/batteries/298-pack-de-batterie-bmwi3-de-42-kwh-d-occasion.html) | Pack de batterie BMWI3 de 42 kWh (d'occasion) | 8 400 € | 42,00 | ~355 V (300–403) | — | 120 | 275 | 200,0 | stock non limité |
| [322](https://evshop.fr/fr/batteries/322-pack-de-batterie-tesla-model-s-de-85-kwh-d-occasion.html) | Pack de batterie Tesla Model S de 85 kWh (d'occasion) | 7 800 € | 85,00 | 365 V (288–403) | 96S74P | 232 | 540 | 91,8 | en stock (10) |
| [369](https://evshop.fr/fr/batteries/369-batterie-tesla-model-s-100-kwh-d-occasion.html) | Tesla Model S 100 kWh (d'occasion) | 11 500 € | 100,00 | ~400 V (300–403) | — | 250 | 540 | 115,0 | en stock (5) |
| [676](https://evshop.fr/fr/batteries/676-pack-de-batterie-100-kwh-pour-tesla-model-s-plaid-d-occasion.html) | Pack de batterie 100 kWh pour Tesla Model S Plaid (d'occasion) | 10 995 € | 100,00 | 407 V (350–450) | 110S72P | 246 | 479 | 110,0 | en stock (3) |
| [928](https://evshop.fr/fr/batterie/928-batterie-lgchem-vw-id-82-kwh-d-occasion.html) | LGCHEM VW ID 82 kWh (d'occasion) | 9 240 € | 82,00 | 352 V (300–403) | 96S3P | 233 | 384 | 112,7 | en stock (5) |
| [933](https://evshop.fr/fr/batterie/933-pack-de-batteries-eqa-de-68-kwh-d-occasion.html) | Pack de batteries EQA de 68 kWh (d'occasion) | 6 900 € | 68,80 (68,0 utiles) | 367 V (300–420) | — | 188 | 469 | 100,3 | en stock (3) |
| [935](https://evshop.fr/fr/batteries/935-batterie-nissan-leaf-62-kwh-d-occasion.html) | Nissan Leaf 62 kWh (d'occasion) | 6 899 € | 62,00 | 355 V (260–403) | 96S2P | 175 | 366 | 111,3 | en stock (3) |
| [940](https://evshop.fr/fr/batteries/940-pack-batterie-audi-q7-17-kwh-d-occasion.html) | Pack batterie Audi Q7 17 kWh (d'occasion) | 3 990 € | 17,30 | 307 V (252–344) | 84S2P | 56 | 190 | 230,6 | en stock (2) |
| [955](https://evshop.fr/fr/batteries/955-batterie-lgchem-vw-id-62-kwh-d-occasion.html) | LGCHEM VW ID 62 kWh (d'occasion) | 7 630 € | 62,00 (58,0 utiles) | 350 V (300–403) | 108S2P | 177 | 288 | 123,1 | sur commande |
| [958](https://evshop.fr/fr/batteries/958-pack-de-batteries-lgchem-vw-id-54-kwh-d-occasion.html) | Pack de batteries LGCHEM VW ID 54 kWh (d'occasion) | 6 825 € | 54,00 | 355 V (300–403) | 96S2P | 152 | 206 | 126,4 | sur commande |
| [1073](https://evshop.fr/fr/batteries/1073-pack-de-batterie-kona-64-kwh-d-occasion.html) | Pack de batterie Kona 64 kWh (d'occasion) | 4 500 € | 64,00 | 356 V (268–403) | 98S3P | 180 | 300 | 70,3 | en stock (7) |
| [1390](https://evshop.fr/fr/batteries/1390-pack-de-batterie-catl-vw-id-54-kwh-d-occasion.html) | Pack de batterie CATL VW ID 54 kWh (d'occasion) | 6 825 € | 54,00 | 355 V (300–403) | 96S2P | 152 | 206 | 126,4 | sur commande |
| [1391](https://evshop.fr/fr/batteries/1391-batterie-catl-62-kwh-pour-vw-id-d-occasion.html) | CATL 62 kWh pour VW ID (d'occasion) | 7 630 € | 62,00 (58,0 utiles) | 350 V (300–403) | 108S2P | 177 | 288 | 123,1 | sur commande |
| [1392](https://evshop.fr/fr/batterie/1392-batterie-catl-vw-id-82-kwh-d-occasion.html) | CATL VW ID 82 kWh (d'occasion) | 9 240 € | 82,00 | 352 V (300–403) | 96S3P | 233 | 384 | 112,7 | sur commande |
| [1417](https://evshop.fr/fr/batterie/1417-pack-de-batteries-lfp-tesla-model-3-de-55-kwh-d-occasion.html) | Pack de batteries LFP Tesla Model 3 de 55 kWh (d'occasion) | 4 140 € | 55,00 (52,5 utiles) | 340 V (250–383) | 106S1P | 162 | 350 | 75,3 | en stock (2) |
| [1513](https://evshop.fr/fr/batterie/1513-batterie-tesla-model-s-90-kwh-d-occasion.html) | Tesla Model S 90 kWh (d'occasion) | 9 000 € | 90,00 | 365 V (288–403) | — | 247 | 550 | 100,0 | sur commande |
| [1514](https://evshop.fr/fr/batterie/1514-pack-batterie-renault-zoe-52kwh-d-occasion.html) | Pack batterie Renault Zoe 52kWh (d'occasion) | 4 690 € | 54,70 (52,0 utiles) | ~350 V (300–403) | 96S2P | 148 | 326 | 85,7 | sur commande |
| [1515](https://evshop.fr/fr/batterie/1515-pack-batterie-renault-zoe-41kwh-d-occasion.html) | Pack batterie Renault Zoe 41kWh (d'occasion) | 3 900 € | 44,10 (41,0 utiles) | ~350 V (300–403) | 96S2P | 117 | 305 | 88,4 | sur commande |
| [1693](https://evshop.fr/fr/batterie/1693-pack-de-batterie-audi-e-tron-82-kwh-d-occasion.html) | Pack de batterie Audi e-tron 82 kWh (d'occasion) | 8 610 € | 82,00 | ~396 V (300–450) | — | 207 | 660 | 105,0 | sur commande |
| [1694](https://evshop.fr/fr/batterie/1694-pack-de-batterie-audi-e-tron-71-kwh-d-occasion.html) | Pack de batterie Audi e-tron 71 kWh (d'occasion) | 7 455 € | 71,00 | ~396 V (300–450) | — | 179 | 580 | 105,0 | sur commande |
| [1695](https://evshop.fr/fr/batterie/1695-pack-de-batterie-audi-e-tron-95-kwh-d-occasion.html) | Pack de batterie Audi e-tron 95 kWh (d'occasion) | 9 975 € | 95,00 | ~396 V (300–450) | — | 240 | 680 | 105,0 | sur commande |
| [1696](https://evshop.fr/fr/batterie/1696-pack-batterie-bmw-i4-m50xdrive-84kwh-d-occasion.html) | Pack batterie BMW i4 m50xdrive 84kWh (d'occasion) | 8 820 € | 84,00 | ~400 V (300–450) | — | 210 | 640 | 105,0 | sur commande |
| [1697](https://evshop.fr/fr/batterie/1697-pack-batterie-66kwh-pour-bmw-ix130xdrive-occasion.html) | Pack batterie 66kWh pour BMW iX130xdrive (occasion) | 6 930 € | 66,00 | ~400 V (300–450) | — | 165 | 500 | 105,0 | sur commande |
| [1698](https://evshop.fr/fr/batterie/1698-pack-batterie-bmw-ix-xdrive40-76-kwh-d-occasion.html) | Pack batterie BMW iX xdrive40 76 kWh (d'occasion) | 7 980 € | 76,00 | ~400 V (300–450) | — | 190 | 550 | 105,0 | sur commande |
| [1699](https://evshop.fr/fr/batterie/1699-pack-batterie-bmw-ix-xdrive50-111-kwh-d-occasion.html) | Pack batterie BMW iX xdrive50 111 kWh (d'occasion) | 11 655 € | 111,00 | ~400 V (300–450) | — | 278 | 750 | 105,0 | sur commande |
| [1701](https://evshop.fr/fr/batterie/1701-pack-de-batterie-hyundai-ioniq-28-kwh-d-occasion.html) | Pack de batterie Hyundai Ioniq 28 kWh (d'occasion) | 2 940 € | 28,00 | ~360 V (280–403) | — | 78 | 300 | 105,0 | sur commande |
| [1702](https://evshop.fr/fr/batterie/1702-pack-batterie-jaguar-i-pace-90-kwh-d-occasion.html) | Pack batterie Jaguar I-Pace 90 kWh (d'occasion) | 9 450 € | 90,00 | ~400 V (300–450) | — | 225 | 610 | 105,0 | sur commande |
| [1706](https://evshop.fr/fr/batterie/1706-pack-batterie-kia-niro-64kwh-d-occasion.html) | Pack batterie Kia Niro 64kWh (d'occasion) | 6 720 € | 64,00 | 356 V (268–403) | 98S3P | 180 | 500 | 105,0 | sur commande |
| [1707](https://evshop.fr/fr/batterie/1707-pack-batterie-nissan-leaf-40kwh-d-occasion.html) | Pack batterie Nissan Leaf 40kWh (d'occasion) | 5 000 € | 40,00 | ~350 V (260–403) | — | 114 | 320 | 125,0 | sur commande |
| [1708](https://evshop.fr/fr/batterie/1708-batterie-nissan-ariya-87-kwh-utilisee.html) | Nissan Ariya 87 kWh (utilisée) | 9 135 € | 87,00 | ~400 V (300–450) | — | 218 | 580 | 105,0 | sur commande |
| [1709](https://evshop.fr/fr/batterie/1709-pack-batterie-nissan-e-nv200-40-kwh-d-occasion.html) | Pack batterie Nissan E-NV200 40 kWh (d'occasion) | 4 200 € | 40,00 | ~350 V (260–403) | — | 114 | 320 | 105,0 | sur commande |
| [1710](https://evshop.fr/fr/batterie/1710-pack-batterie-peugeot-e-208-50kwh-d-occasion.html) | Pack batterie Peugeot e-208 50kWh (d'occasion) | 3 900 € | 50,00 | ~400 V (300–450) | — | 125 | 350 | 78,0 | sur commande |
| [1711](https://evshop.fr/fr/batterie/1711-pack-batterie-peugeot-e-rifter-50kwh-d-occasion.html) | Pack batterie Peugeot e-rifter 50kWh (d'occasion) | 3 900 € | 50,00 | ~400 V (300–450) | — | 125 | 350 | 78,0 | sur commande |
| [1712](https://evshop.fr/fr/batterie/1712-pack-batterie-peugeot-e-2008-50kwh-d-occasion.html) | Pack batterie Peugeot e-2008 50kWh (d'occasion) | 3 900 € | 50,00 | ~400 V (300–450) | — | 125 | 340 | 78,0 | sur commande |
| [1713](https://evshop.fr/fr/batterie/1713-pack-batterie-54kwh-opel-mokka-e-d-occasion.html) | Pack batterie 54kWh Opel Mokka-e (d'occasion) | 3 900 € | 54,00 | ~400 V (300–450) | — | 135 | 340 | 72,2 | sur commande |
| [1714](https://evshop.fr/fr/batterie/1714-pack-batterie-opel-ampera-e-60kwh-d-occasion.html) | Pack batterie Opel Ampera-e 60kWh (d'occasion) | 6 300 € | 60,00 | ~355 V (270–403) | — | 169 | 380 | 105,0 | sur commande |
| [1718](https://evshop.fr/fr/batterie/1718-pack-batterie-renault-kangoo-36kwh-occasion.html) | Pack Batterie Renault Kangoo 36kWh (Occasion) | 3 780 € | 36,00 | ~400 V (300–450) | — | 90 | 340 | 105,0 | sur commande |
| [1719](https://evshop.fr/fr/batterie/1719-pack-batterie-skoda-enyaq-82kwh-d-occasion.html) | Pack batterie Skoda Enyaq 82kWh (d'occasion) | 8 610 € | 82,00 | ~400 V (300–450) | — | 205 | 600 | 105,0 | sur commande |
| [1720](https://evshop.fr/fr/batterie/1720-pack-batterie-toyota-bz4x-71kwh-d-occasion.html) | Pack batterie Toyota bZ4X 71kWh (d'occasion) | 7 455 € | 71,00 | ~355 V (270–403) | — | 200 | 570 | 105,0 | sur commande |
| [1721](https://evshop.fr/fr/batterie/1721-pack-batterie-toyota-rav-4-41-kwh-d-occasion.html) | Pack batterie Toyota Rav 4 41 kWh (d'occasion) | 4 305 € | 41,00 | ~400 V (300–450) | — | 103 | 340 | 105,0 | sur commande |
| [1722](https://evshop.fr/fr/batterie/1722-pack-batterie-volvo-ex30-66-kwh-d-occasion.html) | Pack batterie Volvo EX30 66 kWh (d'occasion) | 6 930 € | 66,00 | ~400 V (300–450) | — | 165 | 470 | 105,0 | sur commande |
| [1723](https://evshop.fr/fr/batterie/1723-pack-batterie-volvo-xc40-78-kwh-d-occasion.html) | Pack batterie Volvo XC40 78 kWh (d'occasion) | 8 190 € | 78,00 | ~400 V (300–450) | — | 195 | 560 | 105,0 | sur commande |
| [2719](https://evshop.fr/fr/mercedes/2719-batterie-mercedes-classe-b-28-kwh-d-occasion.html) | Mercedes Classe B 28 kWh (d'occasion) | 1 900 € | 31,00 (28,0 utiles) | 300 V (250–350) | 84S44P | 103 | 290 | 61,3 | sur commande |
| [3561](https://evshop.fr/fr/fisker/3561-pack-de-batteries-fisker-ocean-de-113-kwh.html) | Pack de batteries Fisker Ocean de 113 kWh | 9 040 € | 113,00 | ~400 V (300–450) | — | 283 | 630 | 80,0 | sur commande |
| [3565](https://evshop.fr/fr/fisker/3565-pack-fisker-ocean-personnalise-113-kwh-orion-2-bms.html) | Pack Fisker Ocean personnalisé 113 kWh + Orion 2 BMS | 16 000 € | 113,00 | ~400 V (300–450) | — | 283 | 630 | 141,6 | sur commande |
| [3572](https://evshop.fr/fr/xpeng/3572-pack-de-batterie-xpeng-g3-de-66-kwh.html) | Pack de batterie XPENG G3 de 66 kWh | 5 280 € | 66,00 | ~400 V (300–450) | — | 165 | 390 | 80,0 | sur commande |
| [3573](https://evshop.fr/fr/mg/3573-pack-batterie-mg-mg4-de-64-kwh.html) | Pack batterie MG MG4 de 64 kWh | 5 120 € | 64,00 | ~400 V (300–450) | — | 160 | 450 | 80,0 | sur commande |
| [3574](https://evshop.fr/fr/mg/3574-pack-batterie-mg-marvel-r-70-kwh.html) | Pack batterie MG Marvel R 70 kWh | 5 600 € | 70,00 | ~450 V (350–500) | — | 156 | 530 | 80,0 | sur commande |
| [3575](https://evshop.fr/fr/mg/3575-pack-batterie-mg-zs-ev-44-kwh.html) | Pack batterie MG ZS EV 44 kWh | 3 520 € | 44,50 | ~350 V (270–403) | — | 127 | 330 | 79,1 | sur commande |
| [3682](https://evshop.fr/fr/byd/3682-batterie-byd-dolphin-de-604-kwh.html) | BYD Dolphin de 60,4 kWh | 5 100 € | 60,40 | ~400 V (300–450) | — | 151 | 450 | 84,4 | sur commande |
| [3695](https://evshop.fr/fr/batteries/3695-batterie-tesla-model-s-75-kwh-d-occasion.html) | Tesla Model S 75 kWh (d'occasion) | 5 175 € | 75,00 | 365 V (288–403) | 96S | 206 | 400 | 69,0 | sur commande |
| [4033](https://evshop.fr/fr/batterie/4033-18kwh-porsche-cayenne-hybrid-battery-pack.html) | 18kWh Porsche Cayenne Hybrid Battery Pack | 3 900 € | 18,00 | ~400 V (300–450) | — | 45 | 150 | 216,7 | sur commande |
| [4229](https://evshop.fr/fr/byd/4229-batterie-byd-atto-3-lames-de-60-kwh.html) | BYD Atto 3 lames de 60 kWh | 4 800 € | 60,48 | 410 V (320–460) | — | 148 | 450 | 79,4 | sur commande |

Tous ces packs gardent leur BMS d'origine. Le vrai discriminant est la **compatibilité CAN** : la colonne Battery-Emulator donne l'état du projet open source, pas une garantie de plug-and-play.

| Réf | Onduleur | BMS / CAN | Battery-Emulator | Verdict |
|---|---|---|---|---|
| [217](https://evshop.fr/fr/batteries/217-pack-batterie-24kwh-nissan-leaf-gen-2-occasion.html) | Solax X1-Hybrid G4 (80–480 V), X3-Hybrid G4 ou Deye HV | BMS OEM du pack ; intégration CAN (Battery-Emulator si supporté) | oui (Leaf/e-NV200, ⭐⭐⭐) | HV 300–500 V : X1/X3/Deye |
| [292](https://evshop.fr/fr/batteries/292-pack-de-batterie-longue-portee-tesla-model-3-de-75-kwh-d-occasion.html) | Solax X1-Hybrid G4 (80–480 V), X3-Hybrid G4 ou Deye HV | BMS OEM du pack ; intégration CAN (Battery-Emulator si supporté) | oui (Tesla Model 3/Y) | HV 300–500 V : X1/X3/Deye |
| [298](https://evshop.fr/fr/batteries/298-pack-de-batterie-bmwi3-de-42-kwh-d-occasion.html) | Solax X1-Hybrid G4 (80–480 V), X3-Hybrid G4 ou Deye HV | BMS OEM du pack ; intégration CAN (Battery-Emulator si supporté) | oui (BMW i3, ⭐⭐⭐) | HV 300–500 V : X1/X3/Deye |
| [322](https://evshop.fr/fr/batteries/322-pack-de-batterie-tesla-model-s-de-85-kwh-d-occasion.html) | Solax X1-Hybrid G4 (80–480 V), X3-Hybrid G4 ou Deye HV | BMS OEM du pack ; intégration CAN (Battery-Emulator si supporté) | oui (Tesla Model S/X 2012-2020, ⭐⭐⭐) | HV 300–500 V : X1/X3/Deye |
| [369](https://evshop.fr/fr/batteries/369-batterie-tesla-model-s-100-kwh-d-occasion.html) | Solax X1-Hybrid G4 (80–480 V), X3-Hybrid G4 ou Deye HV | BMS OEM du pack ; intégration CAN (Battery-Emulator si supporté) | oui (Tesla Model S/X 2012-2020, ⭐⭐⭐) | HV 300–500 V : X1/X3/Deye |
| [676](https://evshop.fr/fr/batteries/676-pack-de-batterie-100-kwh-pour-tesla-model-s-plaid-d-occasion.html) | Solax X1-Hybrid G4 (80–480 V), X3-Hybrid G4 ou Deye HV | BMS OEM du pack ; intégration CAN (Battery-Emulator si supporté) | oui (Tesla Model S/X 2021+) | HV 300–500 V : X1/X3/Deye |
| [928](https://evshop.fr/fr/batterie/928-batterie-lgchem-vw-id-82-kwh-d-occasion.html) | Solax X1-Hybrid G4 (80–480 V), X3-Hybrid G4 ou Deye HV | BMS OEM du pack ; intégration CAN (Battery-Emulator si supporté) | oui (VW MEB) | HV 300–500 V : X1/X3/Deye |
| [933](https://evshop.fr/fr/batterie/933-pack-de-batteries-eqa-de-68-kwh-d-occasion.html) | Solax X1-Hybrid G4 (80–480 V), X3-Hybrid G4 ou Deye HV | BMS OEM du pack ; intégration CAN (Battery-Emulator si supporté) | non documenté | HV 300–500 V : X1/X3/Deye |
| [935](https://evshop.fr/fr/batteries/935-batterie-nissan-leaf-62-kwh-d-occasion.html) | Solax X1-Hybrid G4 (80–480 V), X3-Hybrid G4 ou Deye HV | BMS OEM du pack ; intégration CAN (Battery-Emulator si supporté) | oui (Leaf/e-NV200, ⭐⭐⭐) | HV 300–500 V : X1/X3/Deye |
| [940](https://evshop.fr/fr/batteries/940-pack-batterie-audi-q7-17-kwh-d-occasion.html) | Solax X1-Hybrid G4 (80–480 V), X3-Hybrid G4 ou Deye HV | BMS OEM du pack ; intégration CAN (Battery-Emulator si supporté) | non documenté | HV 300–500 V : X1/X3/Deye |
| [955](https://evshop.fr/fr/batteries/955-batterie-lgchem-vw-id-62-kwh-d-occasion.html) | Solax X1-Hybrid G4 (80–480 V), X3-Hybrid G4 ou Deye HV | BMS OEM du pack ; intégration CAN (Battery-Emulator si supporté) | oui (VW MEB) | HV 300–500 V : X1/X3/Deye |
| [958](https://evshop.fr/fr/batteries/958-pack-de-batteries-lgchem-vw-id-54-kwh-d-occasion.html) | Solax X1-Hybrid G4 (80–480 V), X3-Hybrid G4 ou Deye HV | BMS OEM du pack ; intégration CAN (Battery-Emulator si supporté) | oui (VW MEB) | HV 300–500 V : X1/X3/Deye |
| [1073](https://evshop.fr/fr/batteries/1073-pack-de-batterie-kona-64-kwh-d-occasion.html) | Solax X1-Hybrid G4 (80–480 V), X3-Hybrid G4 ou Deye HV | BMS OEM du pack ; intégration CAN (Battery-Emulator si supporté) | oui (Kona/Niro 64, ⭐⭐⭐) | HV 300–500 V : X1/X3/Deye |
| [1390](https://evshop.fr/fr/batteries/1390-pack-de-batterie-catl-vw-id-54-kwh-d-occasion.html) | Solax X1-Hybrid G4 (80–480 V), X3-Hybrid G4 ou Deye HV | BMS OEM du pack ; intégration CAN (Battery-Emulator si supporté) | oui (VW MEB) | HV 300–500 V : X1/X3/Deye |
| [1391](https://evshop.fr/fr/batteries/1391-batterie-catl-62-kwh-pour-vw-id-d-occasion.html) | Solax X1-Hybrid G4 (80–480 V), X3-Hybrid G4 ou Deye HV | BMS OEM du pack ; intégration CAN (Battery-Emulator si supporté) | oui (VW MEB) | HV 300–500 V : X1/X3/Deye |
| [1392](https://evshop.fr/fr/batterie/1392-batterie-catl-vw-id-82-kwh-d-occasion.html) | Solax X1-Hybrid G4 (80–480 V), X3-Hybrid G4 ou Deye HV | BMS OEM du pack ; intégration CAN (Battery-Emulator si supporté) | oui (VW MEB) | HV 300–500 V : X1/X3/Deye |
| [1417](https://evshop.fr/fr/batterie/1417-pack-de-batteries-lfp-tesla-model-3-de-55-kwh-d-occasion.html) | Solax X1-Hybrid G4 (80–480 V), X3-Hybrid G4 ou Deye HV | BMS OEM du pack ; intégration CAN (Battery-Emulator si supporté) | oui (Tesla Model 3/Y) | HV 300–500 V : X1/X3/Deye |
| [1513](https://evshop.fr/fr/batterie/1513-batterie-tesla-model-s-90-kwh-d-occasion.html) | Solax X1-Hybrid G4 (80–480 V), X3-Hybrid G4 ou Deye HV | BMS OEM du pack ; intégration CAN (Battery-Emulator si supporté) | oui (Tesla Model S/X 2012-2020, ⭐⭐⭐) | HV 300–500 V : X1/X3/Deye |
| [1514](https://evshop.fr/fr/batterie/1514-pack-batterie-renault-zoe-52kwh-d-occasion.html) | Solax X1-Hybrid G4 (80–480 V), X3-Hybrid G4 ou Deye HV | BMS OEM du pack ; intégration CAN (Battery-Emulator si supporté) | oui (Zoe Gen2, ⭐⭐⭐) | HV 300–500 V : X1/X3/Deye |
| [1515](https://evshop.fr/fr/batterie/1515-pack-batterie-renault-zoe-41kwh-d-occasion.html) | Solax X1-Hybrid G4 (80–480 V), X3-Hybrid G4 ou Deye HV | BMS OEM du pack ; intégration CAN (Battery-Emulator si supporté) | oui (Zoe Gen2, ⭐⭐⭐) | HV 300–500 V : X1/X3/Deye |
| [1693](https://evshop.fr/fr/batterie/1693-pack-de-batterie-audi-e-tron-82-kwh-d-occasion.html) | Solax X1-Hybrid G4 (80–480 V), X3-Hybrid G4 ou Deye HV | BMS OEM du pack ; intégration CAN (Battery-Emulator si supporté) | non documenté | HV 300–500 V : X1/X3/Deye |
| [1694](https://evshop.fr/fr/batterie/1694-pack-de-batterie-audi-e-tron-71-kwh-d-occasion.html) | Solax X1-Hybrid G4 (80–480 V), X3-Hybrid G4 ou Deye HV | BMS OEM du pack ; intégration CAN (Battery-Emulator si supporté) | non documenté | HV 300–500 V : X1/X3/Deye |
| [1695](https://evshop.fr/fr/batterie/1695-pack-de-batterie-audi-e-tron-95-kwh-d-occasion.html) | Solax X1-Hybrid G4 (80–480 V), X3-Hybrid G4 ou Deye HV | BMS OEM du pack ; intégration CAN (Battery-Emulator si supporté) | non documenté | HV 300–500 V : X1/X3/Deye |
| [1696](https://evshop.fr/fr/batterie/1696-pack-batterie-bmw-i4-m50xdrive-84kwh-d-occasion.html) | Solax X1-Hybrid G4 (80–480 V), X3-Hybrid G4 ou Deye HV | BMS OEM du pack ; intégration CAN (Battery-Emulator si supporté) | oui (BMW iX/i4 Gen5, ⭐⭐) | HV 300–500 V : X1/X3/Deye |
| [1697](https://evshop.fr/fr/batterie/1697-pack-batterie-66kwh-pour-bmw-ix130xdrive-occasion.html) | Solax X1-Hybrid G4 (80–480 V), X3-Hybrid G4 ou Deye HV | BMS OEM du pack ; intégration CAN (Battery-Emulator si supporté) | oui (BMW iX/i4 Gen5, ⭐⭐) | HV 300–500 V : X1/X3/Deye |
| [1698](https://evshop.fr/fr/batterie/1698-pack-batterie-bmw-ix-xdrive40-76-kwh-d-occasion.html) | Solax X1-Hybrid G4 (80–480 V), X3-Hybrid G4 ou Deye HV | BMS OEM du pack ; intégration CAN (Battery-Emulator si supporté) | oui (BMW iX/i4 Gen5, ⭐⭐) | HV 300–500 V : X1/X3/Deye |
| [1699](https://evshop.fr/fr/batterie/1699-pack-batterie-bmw-ix-xdrive50-111-kwh-d-occasion.html) | Solax X1-Hybrid G4 (80–480 V), X3-Hybrid G4 ou Deye HV | BMS OEM du pack ; intégration CAN (Battery-Emulator si supporté) | oui (BMW iX/i4 Gen5, ⭐⭐) | HV 300–500 V : X1/X3/Deye |
| [1701](https://evshop.fr/fr/batterie/1701-pack-de-batterie-hyundai-ioniq-28-kwh-d-occasion.html) | Solax X1-Hybrid G4 (80–480 V), X3-Hybrid G4 ou Deye HV | BMS OEM du pack ; intégration CAN (Battery-Emulator si supporté) | non confirmé | HV 300–500 V : X1/X3/Deye |
| [1702](https://evshop.fr/fr/batterie/1702-pack-batterie-jaguar-i-pace-90-kwh-d-occasion.html) | Solax X1-Hybrid G4 (80–480 V), X3-Hybrid G4 ou Deye HV | BMS OEM du pack ; intégration CAN (Battery-Emulator si supporté) | travaux en cours (I-Pace) | HV 300–500 V : X1/X3/Deye |
| [1706](https://evshop.fr/fr/batterie/1706-pack-batterie-kia-niro-64kwh-d-occasion.html) | Solax X1-Hybrid G4 (80–480 V), X3-Hybrid G4 ou Deye HV | BMS OEM du pack ; intégration CAN (Battery-Emulator si supporté) | oui (Kona/Niro 64, ⭐⭐⭐) | HV 300–500 V : X1/X3/Deye |
| [1707](https://evshop.fr/fr/batterie/1707-pack-batterie-nissan-leaf-40kwh-d-occasion.html) | Solax X1-Hybrid G4 (80–480 V), X3-Hybrid G4 ou Deye HV | BMS OEM du pack ; intégration CAN (Battery-Emulator si supporté) | oui (Leaf/e-NV200, ⭐⭐⭐) | HV 300–500 V : X1/X3/Deye |
| [1708](https://evshop.fr/fr/batterie/1708-batterie-nissan-ariya-87-kwh-utilisee.html) | Solax X1-Hybrid G4 (80–480 V), X3-Hybrid G4 ou Deye HV | BMS OEM du pack ; intégration CAN (Battery-Emulator si supporté) | travaux en cours (Ariya) | HV 300–500 V : X1/X3/Deye |
| [1709](https://evshop.fr/fr/batterie/1709-pack-batterie-nissan-e-nv200-40-kwh-d-occasion.html) | Solax X1-Hybrid G4 (80–480 V), X3-Hybrid G4 ou Deye HV | BMS OEM du pack ; intégration CAN (Battery-Emulator si supporté) | oui (Leaf/e-NV200, ⭐⭐⭐) | HV 300–500 V : X1/X3/Deye |
| [1710](https://evshop.fr/fr/batterie/1710-pack-batterie-peugeot-e-208-50kwh-d-occasion.html) | Solax X1-Hybrid G4 (80–480 V), X3-Hybrid G4 ou Deye HV | BMS OEM du pack ; intégration CAN (Battery-Emulator si supporté) | oui (Stellantis eCMP, ⭐⭐) | HV 300–500 V : X1/X3/Deye |
| [1711](https://evshop.fr/fr/batterie/1711-pack-batterie-peugeot-e-rifter-50kwh-d-occasion.html) | Solax X1-Hybrid G4 (80–480 V), X3-Hybrid G4 ou Deye HV | BMS OEM du pack ; intégration CAN (Battery-Emulator si supporté) | oui (Stellantis eCMP, ⭐⭐) | HV 300–500 V : X1/X3/Deye |
| [1712](https://evshop.fr/fr/batterie/1712-pack-batterie-peugeot-e-2008-50kwh-d-occasion.html) | Solax X1-Hybrid G4 (80–480 V), X3-Hybrid G4 ou Deye HV | BMS OEM du pack ; intégration CAN (Battery-Emulator si supporté) | oui (Stellantis eCMP, ⭐⭐) | HV 300–500 V : X1/X3/Deye |
| [1713](https://evshop.fr/fr/batterie/1713-pack-batterie-54kwh-opel-mokka-e-d-occasion.html) | Solax X1-Hybrid G4 (80–480 V), X3-Hybrid G4 ou Deye HV | BMS OEM du pack ; intégration CAN (Battery-Emulator si supporté) | oui (Stellantis eCMP, ⭐⭐) | HV 300–500 V : X1/X3/Deye |
| [1714](https://evshop.fr/fr/batterie/1714-pack-batterie-opel-ampera-e-60kwh-d-occasion.html) | Solax X1-Hybrid G4 (80–480 V), X3-Hybrid G4 ou Deye HV | BMS OEM du pack ; intégration CAN (Battery-Emulator si supporté) | oui (Ampera-e, ⭐) | HV 300–500 V : X1/X3/Deye |
| [1718](https://evshop.fr/fr/batterie/1718-pack-batterie-renault-kangoo-36kwh-occasion.html) | Solax X1-Hybrid G4 (80–480 V), X3-Hybrid G4 ou Deye HV | BMS OEM du pack ; intégration CAN (Battery-Emulator si supporté) | oui (Kangoo, ⭐⭐) | HV 300–500 V : X1/X3/Deye |
| [1719](https://evshop.fr/fr/batterie/1719-pack-batterie-skoda-enyaq-82kwh-d-occasion.html) | Solax X1-Hybrid G4 (80–480 V), X3-Hybrid G4 ou Deye HV | BMS OEM du pack ; intégration CAN (Battery-Emulator si supporté) | oui (VW MEB) | HV 300–500 V : X1/X3/Deye |
| [1720](https://evshop.fr/fr/batterie/1720-pack-batterie-toyota-bz4x-71kwh-d-occasion.html) | Solax X1-Hybrid G4 (80–480 V), X3-Hybrid G4 ou Deye HV | BMS OEM du pack ; intégration CAN (Battery-Emulator si supporté) | non documenté | HV 300–500 V : X1/X3/Deye |
| [1721](https://evshop.fr/fr/batterie/1721-pack-batterie-toyota-rav-4-41-kwh-d-occasion.html) | Solax X1-Hybrid G4 (80–480 V), X3-Hybrid G4 ou Deye HV | BMS OEM du pack ; intégration CAN (Battery-Emulator si supporté) | non documenté | HV 300–500 V : X1/X3/Deye |
| [1722](https://evshop.fr/fr/batterie/1722-pack-batterie-volvo-ex30-66-kwh-d-occasion.html) | Solax X1-Hybrid G4 (80–480 V), X3-Hybrid G4 ou Deye HV | BMS OEM du pack ; intégration CAN (Battery-Emulator si supporté) | travaux en cours (Volvo SEA) | HV 300–500 V : X1/X3/Deye |
| [1723](https://evshop.fr/fr/batterie/1723-pack-batterie-volvo-xc40-78-kwh-d-occasion.html) | Solax X1-Hybrid G4 (80–480 V), X3-Hybrid G4 ou Deye HV | BMS OEM du pack ; intégration CAN (Battery-Emulator si supporté) | oui (Volvo SPA, ⭐⭐) | HV 300–500 V : X1/X3/Deye |
| [2719](https://evshop.fr/fr/mercedes/2719-batterie-mercedes-classe-b-28-kwh-d-occasion.html) | Solax X1-Hybrid G4 (80–480 V), X3-Hybrid G4 ou Deye HV | BMS OEM du pack ; intégration CAN (Battery-Emulator si supporté) | oui (Mercedes B250E, ⭐) | HV 300–500 V : X1/X3/Deye |
| [3561](https://evshop.fr/fr/fisker/3561-pack-de-batteries-fisker-ocean-de-113-kwh.html) | Solax X1-Hybrid G4 (80–480 V), X3-Hybrid G4 ou Deye HV | BMS OEM du pack ; intégration CAN (Battery-Emulator si supporté) | travaux en cours (Fisker Ocean) | HV 300–500 V : X1/X3/Deye |
| [3565](https://evshop.fr/fr/fisker/3565-pack-fisker-ocean-personnalise-113-kwh-orion-2-bms.html) | Solax X1-Hybrid G4 (80–480 V), X3-Hybrid G4 ou Deye HV | BMS OEM du pack ; intégration CAN (Battery-Emulator si supporté) | Orion 2 BMS (supporté) ; pack Fisker WIP | HV 300–500 V : X1/X3/Deye |
| [3572](https://evshop.fr/fr/xpeng/3572-pack-de-batterie-xpeng-g3-de-66-kwh.html) | Solax X1-Hybrid G4 (80–480 V), X3-Hybrid G4 ou Deye HV | BMS OEM du pack ; intégration CAN (Battery-Emulator si supporté) | non documenté | HV 300–500 V : X1/X3/Deye |
| [3573](https://evshop.fr/fr/mg/3573-pack-batterie-mg-mg4-de-64-kwh.html) | Solax X1-Hybrid G4 (80–480 V), X3-Hybrid G4 ou Deye HV | BMS OEM du pack ; intégration CAN (Battery-Emulator si supporté) | travaux en cours (MG4) | HV 300–500 V : X1/X3/Deye |
| [3574](https://evshop.fr/fr/mg/3574-pack-batterie-mg-marvel-r-70-kwh.html) | Solax X3-Hybrid G4 (180–800 V) ou Deye HV (160–700 V) | BMS OEM du pack ; intégration CAN (Battery-Emulator si supporté) | oui (MG5/Marvel R, ⭐⭐) | HV 450 V : X3/Deye (X1 limite) |
| [3575](https://evshop.fr/fr/mg/3575-pack-batterie-mg-zs-ev-44-kwh.html) | Solax X1-Hybrid G4 (80–480 V), X3-Hybrid G4 ou Deye HV | BMS OEM du pack ; intégration CAN (Battery-Emulator si supporté) | oui (MG ZS, ⭐) | HV 300–500 V : X1/X3/Deye |
| [3682](https://evshop.fr/fr/byd/3682-batterie-byd-dolphin-de-604-kwh.html) | Solax X1-Hybrid G4 (80–480 V), X3-Hybrid G4 ou Deye HV | BMS OEM du pack ; intégration CAN (Battery-Emulator si supporté) | oui (BYD, ⭐⭐) | HV 300–500 V : X1/X3/Deye |
| [3695](https://evshop.fr/fr/batteries/3695-batterie-tesla-model-s-75-kwh-d-occasion.html) | Solax X1-Hybrid G4 (80–480 V), X3-Hybrid G4 ou Deye HV | BMS OEM du pack ; intégration CAN (Battery-Emulator si supporté) | oui (Tesla Model S/X 2012-2020, ⭐⭐⭐) | HV 300–500 V : X1/X3/Deye |
| [4033](https://evshop.fr/fr/batterie/4033-18kwh-porsche-cayenne-hybrid-battery-pack.html) | Solax X1-Hybrid G4 (80–480 V), X3-Hybrid G4 ou Deye HV | BMS OEM du pack ; intégration CAN (Battery-Emulator si supporté) | non documenté | HV 300–500 V : X1/X3/Deye |
| [4229](https://evshop.fr/fr/byd/4229-batterie-byd-atto-3-lames-de-60-kwh.html) | Solax X1-Hybrid G4 (80–480 V), X3-Hybrid G4 ou Deye HV | BMS OEM du pack ; intégration CAN (Battery-Emulator si supporté) | oui (BYD Atto 3, ⭐⭐) | HV 300–500 V : X1/X3/Deye |

### 3.8 Packs HV 550–700 V (6 références)

Packs 550–700 V, souvent LFP (BYD Blade) ou NMC 800 V : X3-Hybrid G4 ou Deye HV uniquement.

| Réf | Produit | Prix | kWh | Tension | Config | Ah | kg | €/kWh | Stock |
|---|---|---|---|---|---|---|---|---|---|
| [1700](https://evshop.fr/fr/batterie/1700-pack-batterie-hyundai-ioniq-5-72-kwh-d-occasion.html) | Pack batterie Hyundai Ioniq 5 72 kWh (d'occasion) | 7 560 € | 72,00 | ~653 V (500–750) | — | 110 | 500 | 105,0 | sur commande |
| [1703](https://evshop.fr/fr/batterie/1703-pack-batterie-kia-ev6-77kwh-d-occasion.html) | Pack batterie Kia EV6 77kWh (d'occasion) | 8 085 € | 77,00 | ~697 V (550–800) | — | 111 | 580 | 105,0 | sur commande |
| [3568](https://evshop.fr/fr/byd/3568-pack-de-batterie-byd-han-de-64-kwh.html) | Pack de batterie BYD Han de 64 kWh | 5 120 € | 64,80 | ~600 V (450–684) | — | 108 | 500 | 79,0 | sur commande |
| [3569](https://evshop.fr/fr/byd/3569-pack-de-batteries-byd-tang-de-85-kwh.html) | Pack de batteries BYD Tang de 85 kWh | 6 800 € | 85,40 | ~600 V (450–684) | — | 142 | 600 | 79,6 | sur commande |
| [3570](https://evshop.fr/fr/byd/3570-pack-batterie-byd-t3-de-50-kwh.html) | Pack batterie BYD T3 de 50 kWh | 4 000 € | 50,30 | ~580 V (440–660) | — | 87 | 390 | 79,5 | sur commande |
| [3571](https://evshop.fr/fr/xpeng/3571-pack-de-batterie-xpeng-p7-de-80-kwh.html) | Pack de batterie Xpeng P7 de 80 kWh | 6 400 € | 80,00 | ~550 V (420–630) | — | 145 | 510 | 80,0 | sur commande |

Tous ces packs gardent leur BMS d'origine. Le vrai discriminant est la **compatibilité CAN** : la colonne Battery-Emulator donne l'état du projet open source, pas une garantie de plug-and-play.

| Réf | Onduleur | BMS / CAN | Battery-Emulator | Verdict |
|---|---|---|---|---|
| [1700](https://evshop.fr/fr/batterie/1700-pack-batterie-hyundai-ioniq-5-72-kwh-d-occasion.html) | Solax X3-Hybrid G4 (180–800 V) ; Deye HV limite (max 700 V, Vmax 750 V) | BMS OEM du pack ; intégration CAN (Battery-Emulator si supporté) | travaux en cours (E-GMP) | HV 650–700 V : X3 |
| [1703](https://evshop.fr/fr/batterie/1703-pack-batterie-kia-ev6-77kwh-d-occasion.html) | Solax X3-Hybrid G4 (180–800 V) uniquement ; Vmax 800 V à vérifier | BMS OEM du pack ; intégration CAN (Battery-Emulator si supporté) | travaux en cours (EV6) | HV 800 V : X3 limite haute |
| [3568](https://evshop.fr/fr/byd/3568-pack-de-batterie-byd-han-de-64-kwh.html) | Solax X3-Hybrid G4 (180–800 V) ou Deye HV (160–700 V) | BMS OEM du pack ; intégration CAN (Battery-Emulator si supporté) | partiel (BYD ; Han à confirmer) | HV 550–700 V : X3/Deye |
| [3569](https://evshop.fr/fr/byd/3569-pack-de-batteries-byd-tang-de-85-kwh.html) | Solax X3-Hybrid G4 (180–800 V) ou Deye HV (160–700 V) | BMS OEM du pack ; intégration CAN (Battery-Emulator si supporté) | oui (BYD Tang, ⭐⭐) | HV 550–700 V : X3/Deye |
| [3570](https://evshop.fr/fr/byd/3570-pack-batterie-byd-t3-de-50-kwh.html) | Solax X3-Hybrid G4 (180–800 V) ou Deye HV (160–700 V) | BMS OEM du pack ; intégration CAN (Battery-Emulator si supporté) | non documenté | HV 550–700 V : X3/Deye |
| [3571](https://evshop.fr/fr/xpeng/3571-pack-de-batterie-xpeng-p7-de-80-kwh.html) | Solax X3-Hybrid G4 (180–800 V) ou Deye HV (160–700 V) | BMS OEM du pack ; intégration CAN (Battery-Emulator si supporté) | non documenté | HV 550–700 V : X3/Deye |

### 3.9 Packs HV 800 V (1 référence)

Packs 800 V : la plage haute des onduleurs résidentiels s'arrête à 800 V. Vérifier la tension de charge maximale avant tout achat.

| Réf | Produit | Prix | kWh | Tension | Config | Ah | kg | €/kWh | Stock |
|---|---|---|---|---|---|---|---|---|---|
| [1717](https://evshop.fr/fr/batterie/1717-batterie-porsche-taycan-84-kwh-d-occasion.html) | Porsche Taycan 84 kWh (d'occasion) | 7 770 € | 84,00 (74,0 utiles) | ~723 V (600–840) | — | 116 | 510 | 92,5 | sur commande |

Tous ces packs gardent leur BMS d'origine. Le vrai discriminant est la **compatibilité CAN** : la colonne Battery-Emulator donne l'état du projet open source, pas une garantie de plug-and-play.

| Réf | Onduleur | BMS / CAN | Battery-Emulator | Verdict |
|---|---|---|---|---|
| [1717](https://evshop.fr/fr/batterie/1717-batterie-porsche-taycan-84-kwh-d-occasion.html) | Aucun onduleur résidentiel standard : vérifier la tension max réelle | BMS OEM du pack ; intégration CAN (Battery-Emulator si supporté) | travaux en cours (Taycan) | HV > 800 V : hors plage standard |

## 4. Fiches de décision

Douze références représentatives, avec le détail du montage, du chargeur et de l'onduleur.

### 4.1 Stellantis 6S2P 2,74 kWh — le meilleur départ en 48 V

**[Fiche EVShop 1744](https://evshop.fr/fr/module-batterie/1744-module-de-batterie-stellantis-6s2p-274-kwh-d-occasion.html)** · 216 € · 2,74 kWh · 22,2 V (19,8–25,2) · 123 Ah · 13 kg · **78,8 €/kWh** · sur commande

**Pourquoi :** Deux modules en série donnent un 12S de 5,48 kWh, 44,4 V, 123 Ah, sans aucune découpe. C'est le meilleur compromis prix/simplicité du catalogue.

- **Montage :** 2 × 1744 en série (6S + 6S = 12S), 432 €. BMS 12S JK-B2A24S15P, fusible Class T 125 A, coffret acier, câbles 35 mm², cosses M6.
- **Chargeur :** MPPT SmartSolar 150/45 (45 A) ; absorption 49,2 V / float 48,0 V ; charge ≤ 49 A (0,4 C).
- **Onduleur :** MultiPlus-II 48/3000 (35 A) ; ou 48/5000 si le reste de l'installation dépasse 3 kVA.
- **BMS / intégration :** BMS 6S/12S 150 A (JK-B2A24S15P) — Battery-Emulator : non applicable (module/cellule : BMS externe)
- **Limites :** Modules soudés, non démontables. Stock sur commande. Prix 216 €/module, soit 78,8 €/kWh brut ; coût fini estimé 677 €, soit 124 €/kWh.


### 4.2 MEB 12S 6,85 kWh — le 48 V en un seul bloc

**[Fiche EVShop 339](https://evshop.fr/fr/batteries/339-module-de-batterie-12s-685-kwh-48-v-vw-id-meb-utilise.html)** · 750 € · 6,85 kWh · 44,4 V (39,6–50,4) · 156 Ah · 32 kg · **109,5 €/kWh** · en stock (19)

**Pourquoi :** Un seul module 12S, 44,4 V, 156 Ah, 32 kg, bornes M6. Aucun assemblage série, un seul BMS.

- **Montage :** 1 × 339, BMS 12S 150 A, fusible Class T 150 A, câble 35 mm², précharge.
- **Chargeur :** MPPT SmartSolar 150/70 (70 A) ; absorption 49,2 V / float 48,0 V ; charge ≤ 62 A (0,4 C).
- **Onduleur :** MultiPlus-II 48/5000 (70 A) ; un 48/3000 suffit si la charge est limitée à 35 A.
- **BMS / intégration :** BMS 12S 150 A (JK-B2A24S15P) — Battery-Emulator : non applicable (module/cellule : BMS externe)
- **Limites :** Soudé, non démontable. 109,5 €/kWh brut. Poids 32–35 kg : prévoir deux personnes.


### 4.3 CATL 16S 11 kWh — le 48 V limite

**[Fiche EVShop 350](https://evshop.fr/fr/batteries/350-module-de-batterie-catl-16s-11kwh-utilise.html)** · 1 190 € · 11,00 kWh · 58,7 V (44,8–67,2) · 188 Ah · 45 kg · **108,2 €/kWh** · en stock (5)

**Pourquoi :** 11 kWh pour 1 190 €, 108 €/kWh. Mais 16S NMC charge à 67,2 V, au-dessus des 66 V du MultiPlus-II.

- **Montage :** 1 × 350, BMS 16S 150 A. Pour Victron : plafonner l'absorption à 65,6 V (4,10 V/cellule) et la coupure basse à 56 V.
- **Chargeur :** MPPT 150/70 en 48 V, plage 66 V ; charge max 65,6 V. Sinon 2 × 350 en série = 32S (117 V) sur X1.
- **Onduleur :** MultiPlus-II 48/3000/5000 en limite, ou Solax X1-Hybrid G4 avec 2 modules en série.
- **BMS / intégration :** BMS 16S 150 A (JK-B2A24S15P) — Battery-Emulator : non applicable (module/cellule : BMS externe)
- **Limites :** Marge de 0,4 V seulement sous la limite Victron. Connecteur de mesure cellules inclus, 4 NTC. Refroidissement liquide.


### 4.4 LGChem 24S 10,1 kWh — le 24S à plage basse

**[Fiche EVShop 351](https://evshop.fr/fr/batteries/351-module-de-batterie-lgchem-24s-101-kwh-occasion.html)** · 1 190 € · 10,10 kWh · 87,5 V (67,2–100,8) · 115 Ah · 53 kg · **117,8 €/kWh** · en stock (2)

**Pourquoi :** 10,1 kWh à 1 190 €, 117,8 €/kWh, 87,5 V, 115 Ah, 53 kg. Moins intéressant que le 36S, mais plus proche de la plage X1.

- **Montage :** 1 × 351 sur X1, BMS 24S 150 A, sectionneur DC 150 V, précharge. Pas de Victron 48 V.
- **Chargeur :** X1-Hybrid G4 (80–480 V, 30 A) ; plage utile 80–100,8 V, soit environ 75 % de la capacité exploitable.
- **Onduleur :** Solax X1-Hybrid G4 ; 2 × 351 en série = 48S (175 V) pour X1/Deye (X3 limite, min 180 V).
- **BMS / intégration :** BMS 24S 150 A (JK-B2A24S15P) ou BMS 24S dédié — Battery-Emulator : non applicable (module/cellule : BMS externe)
- **Limites :** La plage basse du X1 (80 V) coupe avant la décharge profonde : capacité utile réduite. Préférer le 36S ou 2 × 24S en série.


### 4.5 LGChem 36S 15,19 kWh — le meilleur €/kWh module

**[Fiche EVShop 372](https://evshop.fr/fr/batteries/372-module-de-batterie-lgchem-36s-1519-kwh-d-occasion.html)** · 1 014 € · 15,19 kWh · 132 V (101–152) · 115 Ah · 81 kg · **66,8 €/kWh** · en stock (8)

**Pourquoi :** 66,8 €/kWh, 115 Ah, 131,5 V. Le module le moins cher au kWh, mais il faut soit le découper en 3 × 12S, soit passer en X1.

- **Montage :** X1 : 1 × 372, BMS 36S (Orion 2/REC), sectionneur DC 250 V. Victron : découpe électrique en 3 × 12S (3 BMS, 3 fusibles), sans sortir les cellules.
- **Chargeur :** X1-Hybrid G4 (80–480 V, 30 A) ; absorption 147,6 V / float 144,0 V. En 3 × 12S : 3 × MPPT 150/35.
- **Onduleur :** Solax X1-Hybrid G4 ; ou MultiPlus-II 48/5000 + 3 BMS 12S si découpe.
- **BMS / intégration :** BMS 36S (Orion BMS 2 / REC) ou découpe 3×12S + 3 BMS — Battery-Emulator : non applicable (module/cellule : BMS externe)
- **Limites :** Découpe sous 151 V : décharge à 3,3 V/cellule, outils isolés, un lien à la fois. Garantie annulée. 81 kg.


### 4.6 Kona 64 kWh — le meilleur pack 400 V

**[Fiche EVShop 1073](https://evshop.fr/fr/batteries/1073-pack-de-batterie-kona-64-kwh-d-occasion.html)** · 4 500 € · 64,00 kWh · 356 V (268–403) · 180 Ah · 300 kg · **70,3 €/kWh** · en stock (7)

**Pourquoi :** 64 kWh à 4 500 €, 70,3 €/kWh, BMS OEM, 300 kg. Battery-Emulator supporte la plateforme Kona/Niro 64 kWh (⭐⭐⭐).

- **Montage :** Pack complet, BMS OEM, contacteurs d'origine. Interface CAN Battery-Emulator (ESP32 + CAN), précharge, sectionneur DC.
- **Chargeur :** Onduleur hybride HV (X1 80–480 V, X3 180–800 V ou Deye 160–700 V) ; charge pilotée par le BMS.
- **Onduleur :** Solax X1-Hybrid G4 (le plus simple en 400 V) ; X3 ou Deye en alternative.
- **BMS / intégration :** BMS OEM du pack ; intégration CAN (Battery-Emulator si supporté) — Battery-Emulator : oui (Kona/Niro 64, ⭐⭐⭐)
- **Limites :** 7 en stock. Vérifier la pyrofuse, l'état des modules arrière et le SoH. Transport ADR 300 kg à chiffrer.


### 4.7 Leaf 62 kWh — le pack le mieux documenté

**[Fiche EVShop 935](https://evshop.fr/fr/batteries/935-batterie-nissan-leaf-62-kwh-d-occasion.html)** · 6 899 € · 62,00 kWh · 355 V (260–403) · 175 Ah · 366 kg · **111,3 €/kWh** · en stock (3)

**Pourquoi :** 62 kWh, 355,2 V, 366 kg, 111 €/kWh. La plateforme Leaf est la plus documentée (Battery-Emulator ⭐⭐⭐, bms-ev, forums).

- **Montage :** Pack complet, BMS OEM, interface CAN/GPIO selon version. Précharge et sectionneur DC.
- **Chargeur :** X1 (80–480 V) ; absorption 403,2 V max, coupure 260 V.
- **Onduleur :** Solax X1-Hybrid G4 ; ou X3/Deye.
- **BMS / intégration :** BMS OEM du pack ; intégration CAN (Battery-Emulator si supporté) — Battery-Emulator : oui (Leaf/e-NV200, ⭐⭐⭐)
- **Limites :** La fiche annonce 180 Ah par cellule, incohérent avec 62 kWh / 355 V (≈175 Ah). Prix au kWh moyen (111 €).


### 4.8 Tesla Model 3 LFP 55 kWh — la sécurité LFP

**[Fiche EVShop 1417](https://evshop.fr/fr/batterie/1417-pack-de-batteries-lfp-tesla-model-3-de-55-kwh-d-occasion.html)** · 4 140 € · 55,00 (52,5 utiles) kWh · 340 V (250–383) · 162 Ah · 350 kg · **75,3 €/kWh** · en stock (2)

**Pourquoi :** 55 kWh, 340 V, LFP, 75,3 €/kWh. Chimie plus sûre, 2 000+ cycles, pas de cobalt.

- **Montage :** Pack complet, BMS OEM Tesla, interface CAN Battery-Emulator (Model 3/Y).
- **Chargeur :** X1 (80–480 V) ; profil LFP du BMS, absorption ~383 V max.
- **Onduleur :** Solax X1-Hybrid G4 ; X3/Deye en alternative.
- **BMS / intégration :** BMS OEM du pack ; intégration CAN (Battery-Emulator si supporté) — Battery-Emulator : oui (Tesla Model 3/Y)
- **Limites :** 2 en stock. 106S1P, 52,5 kWh utiles. Le BMS Tesla est verrouillé : l'intégration CAN est indispensable.


### 4.9 BYD Han 64,8 kWh — le 600 V LFP

**[Fiche EVShop 3568](https://evshop.fr/fr/byd/3568-pack-de-batterie-byd-han-de-64-kwh.html)** · 5 120 € · 64,80 kWh · ~600 V (450–684) · 108 Ah · 500 kg · **79,0 €/kWh** · sur commande

**Pourquoi :** 64,8 kWh Blade LFP, ~600 V, 79 €/kWh. Excellent prix au kWh et chimie sûre.

- **Montage :** Pack complet, BMS intégré, connecteurs HV BYD. Interface CAN (Battery-Emulator BYD, ⭐⭐).
- **Chargeur :** X3 (180–800 V) ou Deye HV (160–700 V) ; X1 exclu (max 480 V).
- **Onduleur :** Solax X3-Hybrid G4 ; Deye HV en alternative.
- **BMS / intégration :** BMS OEM du pack ; intégration CAN (Battery-Emulator si supporté) — Battery-Emulator : partiel (BYD ; Han à confirmer)
- **Limites :** Tension ~600 V estimée. Pack lourd (≈500 kg), ADR. Vérifier la compatibilité CAN exacte du Han (la doc Battery-Emulator couvre Atto 3, Dolphin, Seal, Tang ; Han à confirmer).


### 4.10 Porsche Taycan 84 kWh — le piège 800 V

**[Fiche EVShop 1717](https://evshop.fr/fr/batterie/1717-batterie-porsche-taycan-84-kwh-d-occasion.html)** · 7 770 € · 84,00 (74,0 utiles) kWh · ~723 V (600–840) · 116 Ah · 510 kg · **92,5 €/kWh** · sur commande

**Pourquoi :** 84 kWh à 7 770 €, 92,5 €/kWh. Mais 800 V et 74 kWh utiles seulement.

- **Montage :** Pack 800 V, BMS OEM, refroidissement liquide. Intégration Taycan : travaux en cours chez Battery-Emulator.
- **Chargeur :** Aucun onduleur résidentiel standard ne couvre 840 V de charge. X3 max 800 V : insuffisant en fin de charge.
- **Onduleur :** X3-Hybrid G4 seulement si la tension de charge max est ≤ 800 V ; sinon onduleur 1000 V spécifique.
- **BMS / intégration :** BMS OEM du pack ; intégration CAN (Battery-Emulator si supporté) — Battery-Emulator : travaux en cours (Taycan)
- **Limites :** À éviter sans étude préalable. 84 kWh annoncés, 74 kWh utiles. 510 kg.


### 4.11 Headway 38120S 3,2 V 10 Ah — la cellule nue

**[Fiche EVShop 213](https://evshop.fr/fr/batteries/213-batterie-38120s-32-v-10-ah-lifepo4-utilisee.html)** · 30 € · 0,03 kWh · 3,2 V (2,0–3,6) · 10 Ah · 0,3 kg · **937,5 €/kWh** · en stock (718)

**Pourquoi :** 30 € la cellule, 718 en stock. Pour un 48 V LFP : 16S = 51,2 V, 0,512 kWh, 480 € de cellules.

- **Montage :** 16 cellules en série, barres de liaison, BMS 16S LFP, coffret, 16 supports. Serrage 3 N·m max.
- **Chargeur :** MPPT 150/35 ; absorption 55,2 V / float 53,6 V ; charge ≤ 5 A par cellule (ici 10 Ah).
- **Onduleur :** MultiPlus-II 48/3000 ; BMS 16S LFP 100 A.
- **BMS / intégration :** BMS 16S LFP 100–150 A (JK/JBD) — Battery-Emulator : non applicable (module/cellule : BMS externe)
- **Limites :** Prix au kWh apparent 937 € : le montage n'a de sens que si l'on a déjà les barres, le coffret et le temps. 2 000 cycles à 80 % DoD.


### 4.12 Mercedes Classe B 28 kWh — le pack le moins cher

**[Fiche EVShop 2719](https://evshop.fr/fr/mercedes/2719-batterie-mercedes-classe-b-28-kwh-d-occasion.html)** · 1 900 € · 31,00 (28,0 utiles) kWh · 300 V (250–350) · 103 Ah · 290 kg · **61,3 €/kWh** · sur commande

**Pourquoi :** 1 900 € pour 31 kWh brut / 28 kWh utiles, soit 61,3 €/kWh brut (67,9 €/kWh utile). Le meilleur prix du catalogue.

- **Montage :** Pack 300 V, 12 modules, 84S44P, fabrication Tesla. BMS OEM Mercedes/Tesla, interface CAN (Battery-Emulator B250E ⭐).
- **Chargeur :** X1-Hybrid G4 (80–480 V) ; profil BMS OEM.
- **Onduleur :** Solax X1-Hybrid G4 ; X3/Deye en alternative.
- **BMS / intégration :** BMS OEM du pack ; intégration CAN (Battery-Emulator si supporté) — Battery-Emulator : oui (Mercedes B250E, ⭐)
- **Limites :** Pack ancien, 290 kg, 28 kWh utiles. La configuration 84S44P est atypique : vérifier le BMS et les faisceaux avant achat.

## 5. Synthèse économique

### 5.1 Top 15 tous formats (≥ 10 kWh)

| # | Réf | Produit | Prix | kWh | €/kWh | Tension | Verdict |
|---|---|---|---|---|---|---|---|
| 1 | [2719](https://evshop.fr/fr/mercedes/2719-batterie-mercedes-classe-b-28-kwh-d-occasion.html) | Mercedes Classe B 28 kWh (d'occasion) | 1 900 € | 31,00 (28,0 utiles) | 61,3 | 300 V (250–350) | HV 300–500 V : X1/X3/Deye |
| 2 | [372](https://evshop.fr/fr/batteries/372-module-de-batterie-lgchem-36s-1519-kwh-d-occasion.html) | LGChem 36S 15,19 kWh (d'occasion) | 1 014 € | 15,19 | 66,8 | 132 V (101–152) | HV X1 natif |
| 3 | [3695](https://evshop.fr/fr/batteries/3695-batterie-tesla-model-s-75-kwh-d-occasion.html) | Tesla Model S 75 kWh (d'occasion) | 5 175 € | 75,00 | 69,0 | 365 V (288–403) | HV 300–500 V : X1/X3/Deye |
| 4 | [1073](https://evshop.fr/fr/batteries/1073-pack-de-batterie-kona-64-kwh-d-occasion.html) | Pack de batterie Kona 64 kWh (d'occasion) | 4 500 € | 64,00 | 70,3 | 356 V (268–403) | HV 300–500 V : X1/X3/Deye |
| 5 | [1713](https://evshop.fr/fr/batterie/1713-pack-batterie-54kwh-opel-mokka-e-d-occasion.html) | Pack batterie 54kWh Opel Mokka-e (d'occasion) | 3 900 € | 54,00 | 72,2 | ~400 V (300–450) | HV 300–500 V : X1/X3/Deye |
| 6 | [292](https://evshop.fr/fr/batteries/292-pack-de-batterie-longue-portee-tesla-model-3-de-75-kwh-d-occasion.html) | Pack de batterie longue portée Tesla Model 3 de 75 kWh (d'occasion) | 5 500 € | 75,00 | 73,3 | 355 V (288–403) | HV 300–500 V : X1/X3/Deye |
| 7 | [1417](https://evshop.fr/fr/batterie/1417-pack-de-batteries-lfp-tesla-model-3-de-55-kwh-d-occasion.html) | Pack de batteries LFP Tesla Model 3 de 55 kWh (d'occasion) | 4 140 € | 55,00 (52,5 utiles) | 75,3 | 340 V (250–383) | HV 300–500 V : X1/X3/Deye |
| 8 | [1710](https://evshop.fr/fr/batterie/1710-pack-batterie-peugeot-e-208-50kwh-d-occasion.html) | Pack batterie Peugeot e-208 50kWh (d'occasion) | 3 900 € | 50,00 | 78,0 | ~400 V (300–450) | HV 300–500 V : X1/X3/Deye |
| 9 | [1711](https://evshop.fr/fr/batterie/1711-pack-batterie-peugeot-e-rifter-50kwh-d-occasion.html) | Pack batterie Peugeot e-rifter 50kWh (d'occasion) | 3 900 € | 50,00 | 78,0 | ~400 V (300–450) | HV 300–500 V : X1/X3/Deye |
| 10 | [1712](https://evshop.fr/fr/batterie/1712-pack-batterie-peugeot-e-2008-50kwh-d-occasion.html) | Pack batterie Peugeot e-2008 50kWh (d'occasion) | 3 900 € | 50,00 | 78,0 | ~400 V (300–450) | HV 300–500 V : X1/X3/Deye |
| 11 | [3568](https://evshop.fr/fr/byd/3568-pack-de-batterie-byd-han-de-64-kwh.html) | Pack de batterie BYD Han de 64 kWh | 5 120 € | 64,80 | 79,0 | ~600 V (450–684) | HV 550–700 V : X3/Deye |
| 12 | [3575](https://evshop.fr/fr/mg/3575-pack-batterie-mg-zs-ev-44-kwh.html) | Pack batterie MG ZS EV 44 kWh | 3 520 € | 44,50 | 79,1 | ~350 V (270–403) | HV 300–500 V : X1/X3/Deye |
| 13 | [4229](https://evshop.fr/fr/byd/4229-batterie-byd-atto-3-lames-de-60-kwh.html) | BYD Atto 3 lames de 60 kWh | 4 800 € | 60,48 | 79,4 | 410 V (320–460) | HV 300–500 V : X1/X3/Deye |
| 14 | [3570](https://evshop.fr/fr/byd/3570-pack-batterie-byd-t3-de-50-kwh.html) | Pack batterie BYD T3 de 50 kWh | 4 000 € | 50,30 | 79,5 | ~580 V (440–660) | HV 550–700 V : X3/Deye |
| 15 | [3569](https://evshop.fr/fr/byd/3569-pack-de-batteries-byd-tang-de-85-kwh.html) | Pack de batteries BYD Tang de 85 kWh | 6 800 € | 85,40 | 79,6 | ~600 V (450–684) | HV 550–700 V : X3/Deye |

### 5.2 Top modules 48 V

| Réf | Produit | Prix | kWh | €/kWh | Chargeur | Onduleur | Verdict |
|---|---|---|---|---|---|---|---|
| [350](https://evshop.fr/fr/batteries/350-module-de-batterie-catl-16s-11kwh-utilise.html) | CATL 16S 11kWh (utilisé) | 1 190 € | 11,00 | 108,2 | Victron MPPT 150/70 (48 V), mais plage 66 V : charge plafonnée à 65,6 V (4,10 V/cellule), float 64,0 V | MultiPlus-II 48/3000/5000 limite (66 V) | 48 V limite : Victron seulement avec charge ≤ 65,6 V |
| [339](https://evshop.fr/fr/batteries/339-module-de-batterie-12s-685-kwh-48-v-vw-id-meb-utilise.html) | 12S 6,85 kWh 48 V VW ID (MEB) (utilisé) | 750 € | 6,85 | 109,5 | Victron SmartSolar 150/70 (48 V) | MultiPlus-II 48/5000 (70 A) | 48 V natif |
| [153](https://evshop.fr/fr/batteries/153-module-de-batterie-12s1p-53-kwh-pour-bmw-i3-utilise.html) | 12S1P 5,3 kWh pour BMW i3 (utilisé) | 900 € | 5,30 | 169,8 | Victron SmartSolar 150/60 (48 V) | MultiPlus-II 48/3000 (35 A) | 48 V natif |
| [4600](https://evshop.fr/fr/module-batterie/4600-module-de-batterie-neuf-12s1p-706-kwh-vw-meb-catl.html) | neuf 12S1P 7,06 kWh VW MEB CATL | 1 200 € | 7,06 | 170,0 | Victron SmartSolar 150/70 (48 V) | MultiPlus-II 48/5000 (70 A) | 48 V natif |
| [1074](https://evshop.fr/fr/batteries/1074-module-de-batterie-12s-25ah-vw-gte-11kwh-48v-utilise.html) | 12S 25Ah VW GTE 1,1kWh 48V (utilisé) | 190 € | 1,09 | 175,0 | Victron SmartSolar 150/35 (48 V) | MultiPlus-II 48/3000 (35 A) | 48 V natif |
| [216](https://evshop.fr/fr/batteries/216-module-de-batterie-12s1p-415-kwh-pour-bmw-i3-utilise.html) | 12S1P 4,15 kWh pour BMW i3 (utilisé) | 890 € | 4,15 | 214,5 | Victron SmartSolar 150/45 (48 V) | MultiPlus-II 48/3000 (35 A) | 48 V natif |

### 5.3 Top modules 24 V

| Réf | Produit | Prix | kWh | €/kWh | Chargeur | Onduleur | Verdict |
|---|---|---|---|---|---|---|---|
| [1744](https://evshop.fr/fr/module-batterie/1744-module-de-batterie-stellantis-6s2p-274-kwh-d-occasion.html) | Stellantis 6s2p 2,74 kWh (d'occasion) | 216 € | 2,74 | 78,8 | 1× = 24 V : MPPT 150/60, absorption 24,6 V / float 24,0 V | 1× : MultiPlus-II 24/3000 | 24 V natif, ou 48 V avec 2× en série |
| [1064](https://evshop.fr/fr/batteries/1064-module-de-batterie-6s2p-24-kwh-ioniq-5-utilise.html) | 6s2p 2,4 kWh Ioniq 5 (utilisé) | 250 € | 2,40 | 104,2 | 1× = 24 V : MPPT 150/60, absorption 24,6 V / float 24,0 V | 1× : MultiPlus-II 24/3000 | 24 V natif, ou 48 V avec 2× en série |
| [345](https://evshop.fr/fr/batteries/345-module-de-batterie-8s-685-kwh-30-v-vw-id-meb-utilise.html) | 8S 6,85 kWh 30 V VW ID (MEB) (utilisé) | 750 € | 6,85 | 109,5 | 1× = 24 V : MPPT 150/60, absorption 32,8 V / float 32,0 V (plafond MultiPlus 33 V) | 1× : MultiPlus-II 24/3000 | 24 V limite, ou 24S HV avec 3× en série |
| [242](https://evshop.fr/fr/batteries/242-module-tesla-53-kwh-6s74p.html) | Module Tesla 6S74P 5,3 kWh (fabriqué en 2015 ou plus récent) | 600 € | 5,30 | 113,2 | 1× = 24 V : MPPT 150/60, absorption 24,6 V / float 24,0 V | 1× : MultiPlus-II 24/3000 | 24 V natif, ou 48 V avec 2× en série |
| [1416](https://evshop.fr/fr/batteries/1416-module-tesla-6s74p-53-kwh-fabrique-en-2014-ou-avant.html) | Module Tesla 6S74P 5,3 kWh (fabriqué en 2014 ou avant) | 650 € | 5,30 | 122,6 | 1× = 24 V : MPPT 150/60, absorption 24,6 V / float 24,0 V | 1× : MultiPlus-II 24/3000 | 24 V natif, ou 48 V avec 2× en série |
| [147](https://evshop.fr/fr/batteries/147-module-de-batterie-tesla-6s86p-64-kwh-utilise.html) | Tesla 6S86P 6,4 kWh (utilisé) | 1 155 € | 6,40 | 180,5 | 1× = 24 V : MPPT 150/60, absorption 24,6 V / float 24,0 V | 1× : MultiPlus-II 24/3000 | 24 V natif, ou 48 V avec 2× en série |
| [186](https://evshop.fr/fr/batteries/186-module-de-batterie-8s-12-kwh-pour-mitsubishi-outlander-phev-d-occasion.html) | 8S 1,2 kWh pour Mitsubishi Outlander PHEV (d'occasion) | 380 € | 1,20 | 316,7 | 1× = 24 V : MPPT 150/60, absorption 32,8 V / float 32,0 V (plafond MultiPlus 33 V) | 1× : MultiPlus-II 24/3000 | 24 V limite, ou 24S HV avec 3× en série |

### 5.4 Top packs HV

| Réf | Produit | Prix | kWh | €/kWh | Tension | Onduleur | Battery-Emulator |
|---|---|---|---|---|---|---|---|
| [2719](https://evshop.fr/fr/mercedes/2719-batterie-mercedes-classe-b-28-kwh-d-occasion.html) | Mercedes Classe B 28 kWh (d'occasion) | 1 900 € | 31,00 (28,0 utiles) | 61,3 | 300 V (250–350) | Solax X1-Hybrid G4 (80–480 V), X3-Hybrid G4 ou Deye HV | oui (Mercedes B250E, ⭐) |
| [3695](https://evshop.fr/fr/batteries/3695-batterie-tesla-model-s-75-kwh-d-occasion.html) | Tesla Model S 75 kWh (d'occasion) | 5 175 € | 75,00 | 69,0 | 365 V (288–403) | Solax X1-Hybrid G4 (80–480 V), X3-Hybrid G4 ou Deye HV | oui (Tesla Model S/X 2012-2020, ⭐⭐⭐) |
| [1073](https://evshop.fr/fr/batteries/1073-pack-de-batterie-kona-64-kwh-d-occasion.html) | Pack de batterie Kona 64 kWh (d'occasion) | 4 500 € | 64,00 | 70,3 | 356 V (268–403) | Solax X1-Hybrid G4 (80–480 V), X3-Hybrid G4 ou Deye HV | oui (Kona/Niro 64, ⭐⭐⭐) |
| [1713](https://evshop.fr/fr/batterie/1713-pack-batterie-54kwh-opel-mokka-e-d-occasion.html) | Pack batterie 54kWh Opel Mokka-e (d'occasion) | 3 900 € | 54,00 | 72,2 | ~400 V (300–450) | Solax X1-Hybrid G4 (80–480 V), X3-Hybrid G4 ou Deye HV | oui (Stellantis eCMP, ⭐⭐) |
| [292](https://evshop.fr/fr/batteries/292-pack-de-batterie-longue-portee-tesla-model-3-de-75-kwh-d-occasion.html) | Pack de batterie longue portée Tesla Model 3 de 75 kWh (d'occasion) | 5 500 € | 75,00 | 73,3 | 355 V (288–403) | Solax X1-Hybrid G4 (80–480 V), X3-Hybrid G4 ou Deye HV | oui (Tesla Model 3/Y) |
| [1417](https://evshop.fr/fr/batterie/1417-pack-de-batteries-lfp-tesla-model-3-de-55-kwh-d-occasion.html) | Pack de batteries LFP Tesla Model 3 de 55 kWh (d'occasion) | 4 140 € | 55,00 (52,5 utiles) | 75,3 | 340 V (250–383) | Solax X1-Hybrid G4 (80–480 V), X3-Hybrid G4 ou Deye HV | oui (Tesla Model 3/Y) |
| [1710](https://evshop.fr/fr/batterie/1710-pack-batterie-peugeot-e-208-50kwh-d-occasion.html) | Pack batterie Peugeot e-208 50kWh (d'occasion) | 3 900 € | 50,00 | 78,0 | ~400 V (300–450) | Solax X1-Hybrid G4 (80–480 V), X3-Hybrid G4 ou Deye HV | oui (Stellantis eCMP, ⭐⭐) |
| [1711](https://evshop.fr/fr/batterie/1711-pack-batterie-peugeot-e-rifter-50kwh-d-occasion.html) | Pack batterie Peugeot e-rifter 50kWh (d'occasion) | 3 900 € | 50,00 | 78,0 | ~400 V (300–450) | Solax X1-Hybrid G4 (80–480 V), X3-Hybrid G4 ou Deye HV | oui (Stellantis eCMP, ⭐⭐) |
| [1712](https://evshop.fr/fr/batterie/1712-pack-batterie-peugeot-e-2008-50kwh-d-occasion.html) | Pack batterie Peugeot e-2008 50kWh (d'occasion) | 3 900 € | 50,00 | 78,0 | ~400 V (300–450) | Solax X1-Hybrid G4 (80–480 V), X3-Hybrid G4 ou Deye HV | oui (Stellantis eCMP, ⭐⭐) |
| [3568](https://evshop.fr/fr/byd/3568-pack-de-batterie-byd-han-de-64-kwh.html) | Pack de batterie BYD Han de 64 kWh | 5 120 € | 64,80 | 79,0 | ~600 V (450–684) | Solax X3-Hybrid G4 (180–800 V) ou Deye HV (160–700 V) | partiel (BYD ; Han à confirmer) |
| [3575](https://evshop.fr/fr/mg/3575-pack-batterie-mg-zs-ev-44-kwh.html) | Pack batterie MG ZS EV 44 kWh | 3 520 € | 44,50 | 79,1 | ~350 V (270–403) | Solax X1-Hybrid G4 (80–480 V), X3-Hybrid G4 ou Deye HV | oui (MG ZS, ⭐) |
| [4229](https://evshop.fr/fr/byd/4229-batterie-byd-atto-3-lames-de-60-kwh.html) | BYD Atto 3 lames de 60 kWh | 4 800 € | 60,48 | 79,4 | 410 V (320–460) | Solax X1-Hybrid G4 (80–480 V), X3-Hybrid G4 ou Deye HV | oui (BYD Atto 3, ⭐⭐) |
| [3570](https://evshop.fr/fr/byd/3570-pack-batterie-byd-t3-de-50-kwh.html) | Pack batterie BYD T3 de 50 kWh | 4 000 € | 50,30 | 79,5 | ~580 V (440–660) | Solax X3-Hybrid G4 (180–800 V) ou Deye HV (160–700 V) | non documenté |
| [3569](https://evshop.fr/fr/byd/3569-pack-de-batteries-byd-tang-de-85-kwh.html) | Pack de batteries BYD Tang de 85 kWh | 6 800 € | 85,40 | 79,6 | ~600 V (450–684) | Solax X3-Hybrid G4 (180–800 V) ou Deye HV (160–700 V) | oui (BYD Tang, ⭐⭐) |
| [3561](https://evshop.fr/fr/fisker/3561-pack-de-batteries-fisker-ocean-de-113-kwh.html) | Pack de batteries Fisker Ocean de 113 kWh | 9 040 € | 113,00 | 80,0 | ~400 V (300–450) | Solax X1-Hybrid G4 (80–480 V), X3-Hybrid G4 ou Deye HV | travaux en cours (Fisker Ocean) |
| [3571](https://evshop.fr/fr/xpeng/3571-pack-de-batterie-xpeng-p7-de-80-kwh.html) | Pack de batterie Xpeng P7 de 80 kWh | 6 400 € | 80,00 | 80,0 | ~550 V (420–630) | Solax X3-Hybrid G4 (180–800 V) ou Deye HV (160–700 V) | non documenté |
| [3572](https://evshop.fr/fr/xpeng/3572-pack-de-batterie-xpeng-g3-de-66-kwh.html) | Pack de batterie XPENG G3 de 66 kWh | 5 280 € | 66,00 | 80,0 | ~400 V (300–450) | Solax X1-Hybrid G4 (80–480 V), X3-Hybrid G4 ou Deye HV | non documenté |
| [3573](https://evshop.fr/fr/mg/3573-pack-batterie-mg-mg4-de-64-kwh.html) | Pack batterie MG MG4 de 64 kWh | 5 120 € | 64,00 | 80,0 | ~400 V (300–450) | Solax X1-Hybrid G4 (80–480 V), X3-Hybrid G4 ou Deye HV | travaux en cours (MG4) |
| [3574](https://evshop.fr/fr/mg/3574-pack-batterie-mg-marvel-r-70-kwh.html) | Pack batterie MG Marvel R 70 kWh | 5 600 € | 70,00 | 80,0 | ~450 V (350–500) | Solax X3-Hybrid G4 (180–800 V) ou Deye HV (160–700 V) | oui (MG5/Marvel R, ⭐⭐) |
| [3682](https://evshop.fr/fr/byd/3682-batterie-byd-dolphin-de-604-kwh.html) | BYD Dolphin de 60,4 kWh | 5 100 € | 60,40 | 84,4 | ~400 V (300–450) | Solax X1-Hybrid G4 (80–480 V), X3-Hybrid G4 ou Deye HV | oui (BYD, ⭐⭐) |

### 5.5 Choix par usage

| Besoin | Solution | Coût matériel | Coût fini estimé | Chargeur | Onduleur |
|---|---|---|---|---|---|
| 4–6 kWh, 48 V, Victron | 2 × 1744 Stellantis 6S2P (5,48 kWh) | 432 € | 677 € (124 €/kWh) | MPPT 150/45 | MultiPlus-II 48/3000 |
| 6,85 kWh, 48 V, un bloc | 1 × 339 MEB 12S | 750 € | 995 € (145 €/kWh) | MPPT 150/70 | MultiPlus-II 48/5000 |
| 15 kWh, 48 V, Victron | 1 × 372 LGChem 36S découpé 3 × 12S | 1 014 € | 1 699 € (112 €/kWh) | 3 × MPPT 150/35 | MultiPlus-II 48/5000 |
| 15 kWh, HV | 1 × 372 LGChem 36S + X1 | 1 014 € | 2 800 € (185 €/kWh) | X1 30 A | Solax X1-Hybrid G4 |
| 60 kWh, 400 V | 1 × 1073 Kona 64 kWh | 4 500 € | 6 300 € (98 €/kWh) | X1 30 A | Solax X1-Hybrid G4 |
| 60 kWh, 600 V LFP | 1 × 3568 BYD Han 64,8 kWh | 5 120 € | 6 800 € (105 €/kWh) | X3 30 A | Solax X3-Hybrid G4 |
| 5,3 kWh, 24 V | 1 × 242 Tesla 6S74P | 600 € | 845 € (159 €/kWh) | MPPT 150/60 | MultiPlus-II 24/3000 |

Les coûts finis incluent forfaitairement BMS, fusible, coffret, câblage, précharge et, pour le HV, l'interface CAN. Ils n'incluent ni le transport ADR, ni la main-d'œuvre, ni les panneaux.

## 6. Pièges et vérifications

### 6.1 Incohérences relevées dans les fiches

| Réf | Ce que dit la fiche | Le problème | À faire |
|---|---|---|---|
| 4600 | 12S1P, 7,06 kWh, 240 Ah, 44,4 V | 44,4 × 240 = 10,66 kWh, pas 7,06 kWh. 7,06 kWh / 44,4 V = 159 Ah. | Demander la capacité réelle par écrit ; le prix au kWh varie de 113 à 170 €. |
| 322 / 3695 | Pack 85/75 kWh, puis 22,8 V et 232 Ah | Ce sont les specs d'un module 6S, pas du pack. | Le pack est en 96S (~364,8 V) : ne pas se fier à la tension affichée. |
| 217 | Pack Leaf 24 kWh, tension 7,40 V | 7,4 V est la tension d'un module 2S, pas du pack. | Pack 96S2P ~360 V ; le prix de 3 490 € correspond à 145 €/kWh. |
| 935 | 62 kWh, 96S2P, cellule 180 Ah | 96S2P × 180 Ah ferait 128 kWh, pas 62. | Retenir ~175 Ah pour 62 kWh / 355 V. |
| 2719 | 28 kWh, 31 kWh brut, 300 V | Le prix au kWh dépend du brut ou de l'utile. | Comparer à 67,9 €/kWh utile, pas 61,3. |
| 1717 | Taycan 84 kWh, 74 kWh utiles | Deux capacités différentes. | Retenir 74 kWh utiles et 92,5 €/kWh brut. |

### 6.2 Les cinq questions avant d'acheter

1. **Tension exacte** : demander une photo de l'étiquette et la tension de charge max, pas seulement le kWh.
2. **BMS** : modèle, protocole CAN, brochage, et si le pack peut fermer ses contacteurs sans le véhicule.
3. **SoH** : rapport de capacité et de résistance interne par module, pas seulement l'année.
4. **Démontabilité** : photo des busbars. Vis = boulonné ; barre continue = soudé.
5. **Transport ADR** : chiffrer avant de valider. Un pack de 300–600 kg peut coûter 500–1 000 € de port.

### 6.3 Check-list de mise en service

- [ ] Top balance avant la première charge complète.
- [ ] Précharge du bus DC avant fermeture du contacteur.
- [ ] Vérifier le profil de charge (49,2 V / 48,0 V en 12S NMC) avant de brancher le MPPT.
- [ ] Test de coupure : simuler une surtension et vérifier l'ouverture du BMS.
- [ ] Journal des 10 premiers cycles : capacité, écart cellule, température.
- [ ] Déclarer l'installation à l'assurance et vérifier la conformité locale.

## 7. Sources

**Catalogue**

- Catégorie EVShop « Batteries » : <https://evshop.fr/fr/13-batteries>
- Chaque référence est liée à sa fiche dans les tableaux ci-dessus.

**Documentation technique**

- Victron MultiPlus-II 230 V, spécifications : <https://www.victronenergy.com/media/pg/MultiPlus-II_230V/en/technical-specifications-mp-ii-230v.html>
- Victron MPPT 150/35 et 150/45 : <https://www.victronenergy.com/media/pg/Manual_BlueSolar_150-35__150-45/fr/technical-specifications.html>
- Solax X1/X3 Hybrid G4, sélection batterie : <https://kb.solaxpower.com/solution/detail/2c9fa4148ceddee5018e94039f8026a0>
- Deye SUN-5-25K-SG01HP3, fiche : <https://pt.deyeinverter.com/deyeinverter/2025/08/08/%e3%80%90b%e3%80%91datasheet_sun-5-25k-sg01hp3-eu_20250805_pt.pdf>
- Battery-Emulator, batteries compatibles : <https://dalathegreat.github.io/Battery-Emulator-Wiki/battery/>
- OpenInverter, modules MEB : <https://openinverter.org/wiki/MEB_Batteries>

**Référence de prix LFP certifiée**

- Pylontech US5000 4,8 kWh : <https://www.myshop-solaire.com/batterie-lithium-us5000-48v-100ah-4-8-kwh-pylontech-_r_1229_i_4535.html>

---

*Catalogue généré à partir des fiches publiques EVShop et de la documentation constructeur. Les prix et disponibilités doivent être revalidés avant commande. Aucune garantie n'est donnée sur la conformité réglementaire d'une installation DIY.*
