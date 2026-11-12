#!/usr/bin/env python3
"""Génère le catalogue Markdown + CSV à partir de data/evshop_batteries/catalog.json.

Usage: python3 scripts/render_evshop_battery_catalog.py
"""
from __future__ import annotations

import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "evshop_batteries" / "catalog.json"
MD = ROOT / "docs" / "CATALOGUE-BATTERIES-EVSHOP.md"
CSV = ROOT / "data" / "evshop_batteries" / "catalog.csv"

FAMILY_ORDER = [
    "Cellules",
    "Modules 8 V",
    "Modules 12 V",
    "Modules 24 V",
    "Modules 48 V",
    "Modules HT",
    "Packs HV 300–500 V",
    "Packs HV 550–700 V",
    "Packs HV 800 V",
]

FAMILY_INTRO = {
    "Cellules": "Cellules nues : aucun BMS, aucun coffret, aucune protection. À réserver à l'assemblage maîtrisé.",
    "Modules 8 V": "Modules 2S ou 3S : il faut impérativement les mettre en série pour atteindre 24 V ou 48 V.",
    "Modules 12 V": "Modules 3S : 4 en série donnent un 12S 48 V. Le câblage et l'appariement sont critiques.",
    "Modules 24 V": "Modules 6S ou 8S : 24 V natif, ou 2 × 6S en série pour un 48 V. C'est la famille la plus simple pour débuter.",
    "Modules 48 V": "Modules 12S : 48 V natif, aucun travail mécanique. La famille de référence pour un MultiPlus-II.",
    "Modules HT": "Modules 24S (87,5 V) et 36S (131,5 V) : ils sortent de la plage Victron 48 V et passent en onduleur hybride haute tension.",
    "Packs HV 300–500 V": "Packs complets 300–500 V : la plus grande famille. Ils gardent leur BMS d'origine et s'intègrent par CAN (Battery-Emulator) ou protocole constructeur.",
    "Packs HV 550–700 V": "Packs 550–700 V, souvent LFP (BYD Blade) ou NMC 800 V : X3-Hybrid G4 ou Deye HV uniquement.",
    "Packs HV 800 V": "Packs 800 V : la plage haute des onduleurs résidentiels s'arrête à 800 V. Vérifier la tension de charge maximale avant tout achat.",
}

CHEM_NOTE = {
    "NMC": "NMC/NCM : 4,10 V/cellule en absorption, 4,00 V en float, 3,50 V en coupure basse. Jamais d'égalisation.",
    "LFP": "LFP : 3,45 V/cellule en absorption, 3,35 V en float, 2,80 V en coupure basse. Plus tolérant, plus lourd.",
    "LFP/NMC": "LFP ou NMC selon la finition : exiger la chimie exacte avant de choisir le profil de charge.",
}


def fnum(v, nd=1):
    if v is None:
        return "—"
    s = f"{v:,.{nd}f}"
    return s.replace(",", " ").replace(".", ",")


def feur(v):
    if v is None:
        return "—"
    return f"{int(round(v)):,}".replace(",", " ") + " €"


def fint(v):
    if v is None:
        return "—"
    return f"{int(round(v)):,}".replace(",", " ")


def fkg(v):
    if v is None:
        return "—"
    if v < 1:
        return fnum(v, 1)
    return fint(v)


def fkwh(item):
    nom = fnum(item.get("energy_kwh"), 2)
    use = item.get("energy_usable_kwh")
    if use is not None and abs(use - (item.get("energy_kwh") or 0)) > 0.1:
        return f"{nom} ({fnum(use, 1)} utiles)"
    return nom


def fv(item):
    v = item.get("voltage_nominal_v")
    if v is None:
        return "—"
    pre = "~" if item.get("voltage_estimated") else ""
    nd = 0 if v >= 100 else 1
    lo, hi = item.get("voltage_min_v"), item.get("voltage_max_v")
    if lo is not None and hi is not None:
        return f"{pre}{fnum(v, nd)} V ({fnum(lo, nd)}–{fnum(hi, nd)})"
    return f"{pre}{fnum(v, nd)} V"


def esc(s):
    return str(s).replace("|", "\\|").replace("\n", " ")


def table(headers, rows):
    out = ["| " + " | ".join(headers) + " |", "|" + "|".join(["---"] * len(headers)) + "|"]
    for r in rows:
        out.append("| " + " | ".join(esc(c) for c in r) + " |")
    return "\n".join(out)


def sorted_by_price(items):
    return sorted(items, key=lambda x: (x["eur_per_kwh"] is None, x["eur_per_kwh"] or 9e9))


def short_name(x):
    n = x["name"]
    for prefix in ("Module de batterie ", "Batterie "):
        if n.startswith(prefix):
            n = n[len(prefix):]
    return n


def main():
    root = json.loads(DATA.read_text(encoding="utf-8"))
    items = [x for x in root["items"] if x.get("active", True)]
    assert items, "catalogue vide"

    families = FAMILY_ORDER + sorted({x["family"] for x in items} - set(FAMILY_ORDER))
    by_family = {f: [x for x in items if x["family"] == f] for f in families}
    assert sum(len(v) for v in by_family.values()) == len(items)
    by_id = {x["evshop_id"]: x for x in items}

    L = []
    A = L.append

    A(f"# Catalogue batteries EVShop — {len(items)} références")
    A("")
    A(f"**Inventaire exhaustif des {len(items)} références de la catégorie « Batteries » d'EVShop.fr, avec prix TTC, caractéristiques et choix du chargeur et de l'onduleur.**")
    A("")
    A("- **Source :** <https://evshop.fr/fr/13-batteries> (catégorie principale, 2 pages)")
    A("- **Relevé :** 4 novembre 2026")
    A("- **Prix :** TTC, hors transport ADR et hors options")
    A("- **Données structurées :** [`catalog.json`](../data/evshop_batteries/catalog.json) · [`catalog.csv`](../data/evshop_batteries/catalog.csv)")
    A("- **Rapport de sélection associé :** [`RAPPORT-BATTERIES-EVSHOP-2026.md`](RAPPORT-BATTERIES-EVSHOP-2026.md)")
    A("")
    A("> ⚠️ **Ce catalogue n'est pas un devis.** Les prix, stocks et tensions doivent être revalidés avant commande. Les tensions marquées `~` sont estimées à partir de la plateforme ou de la configuration ; elles ne remplacent pas l'étiquette du pack.")
    A("")

    # 0
    A("## 0. En un coup d'œil")
    A("")
    packs = [x for x in items if x["form"] == "pack"]
    modules = [x for x in items if x["form"] == "module"]
    cells = [x for x in items if x["form"] == "cellule"]
    cell_txt = f"{len(cells)} cellule" + ("s" if len(cells) > 1 else "")
    A(f"- **{len(items)} références** : {len(modules)} modules, {len(packs)} packs complets, {cell_txt}.")
    A(f"- **{sum(1 for x in items if x['stock_qty'] > 0)} références en stock**, {sum(1 for x in items if x['stock_qty'] == 0)} sur commande, {sum(1 for x in items if x['stock_qty'] < 0)} en stock non limité.")
    A("- **Le critère décisif reste la tension du module**, pas la chimie ni le prix au kWh.")
    A("- Le stock web n’est pas affiché pour les références à 0 : elles sont notées **sur commande** et doivent être confirmées.")
    A("")
    A("### 0.1 Les six références à retenir")
    A("")
    rows = []
    picks = [
        (1744, "Meilleur module 24 V", "5,48 kWh avec 2 modules, 48 V natif, aucun travail mécanique", "2 × 216 € = 432 €"),
        (339, "Meilleur module 48 V", "6,85 kWh par bloc, 48 V natif, BMS 12S standard", "750 €"),
        (372, "Meilleur €/kWh module", "36S 15,19 kWh, à découper en 3 × 12S ou à passer en X1", "1 014 €"),
        (1073, "Meilleur pack 400 V en stock", "64 kWh, BMS OEM, Battery-Emulator compatible", "4 500 €"),
        (3568, "Meilleur pack 600 V LFP", "64,8 kWh BYD Blade, X3/Deye", "5 120 €"),
        (350, "Module 48 V limite", "16S 11 kWh, 67,2 V : Victron seulement si charge plafonnée à 65,6 V", "1 190 €"),
    ]
    for pid, role, why, price in picks:
        x = by_id.get(pid)
        if not x:
            continue
        rows.append([f"[{pid}]({x['url']})", role, why, price, f"{fnum(x['eur_per_kwh'])} €/kWh"])
    A(table(["Réf", "Rôle", "Pourquoi", "Prix", "€/kWh"], rows))
    A("")
    A("### 0.2 Le classement brut")
    A("")
    top = sorted_by_price([x for x in items if (x.get("energy_kwh") or 0) >= 10])[:15]
    A(table(
        ["#", "Réf", "Produit", "Prix", "kWh", "Tension", "€/kWh", "Famille"],
        [[i + 1, f"[{x['evshop_id']}]({x['url']})", short_name(x), feur(x["price_eur"]), fkwh(x), fv(x), fnum(x["eur_per_kwh"]), x["family"]] for i, x in enumerate(top)],
    ))
    A("")
    A("Le prix au kWh brut ne dit pas tout : un pack 400 V à 70 €/kWh exige un onduleur HV à 1 500–3 000 € et une intégration CAN. Un module 12S à 110 €/kWh se branche sur un MultiPlus-II déjà présent. **Comparer le coût du site, pas le prix du kWh.** Pour la Mercedes 2719, le classement utilise 31 kWh bruts ; sur 28 kWh utiles, le coût passe à 67,9 €/kWh.")
    A("")

    # 1
    A("## 1. Méthode et limites")
    A("")
    A("1. Inventaire des **80 références** de la catégorie principale « Batteries » (pages 1 et 2), prix TTC au 4 novembre 2026.")
    A("2. Lecture des fiches produit : tension, coupure haute/basse, capacité, configuration, masse, dimensions, connectique.")
    A("3. Croisement avec la documentation constructeur et les projets open source : Victron, Solax, Deye, Battery-Emulator.")
    A("4. Classement par **architecture** (24 V, 48 V, HT 87–132 V, pack 350–450 V, pack 550–700 V, pack 800 V), puis calcul du €/kWh.")
    A("5. Vérification de cohérence : `E = V × Ah`. Les incohérences sont signalées, pas corrigées en silence.")
    A("6. Contrôle d'exhaustivité : les sous-catégories « Batterie » (41) et « Module batterie » (42) totalisent exactement les mêmes 80 références, sans doublon ni référence supplémentaire. Les accessoires de batterie (catégorie 29 : BMS, câbles, coffrets) sont exclus.")
    A("")
    A("**Limites :**")
    A("")
    A("- Aucun produit n'a été testé physiquement ; les SoH annoncés ne sont pas vérifiés.")
    A("- Les prix n'incluent pas le transport ADR (200 à 1 000 € selon la masse) ni les options.")
    A("- Les tensions des packs non documentés sont estimées et marquées `~`.")
    A("- Les coûts de BMS, coffret, câblage et main-d'œuvre sont des estimations de marché.")
    A("- Une batterie DIY n'est pas certifiée : l'assurance et la conformité restent à la charge de l'installateur.")
    A("")

    # 2
    A("## 2. Choisir le chargeur et l'onduleur")
    A("")
    A("### 2.1 La règle qui décide de tout : la tension")
    A("")
    A("Un chargeur ou un onduleur ne s'adapte pas à la tension d'une batterie : c'est la batterie qui doit entrer dans **sa fenêtre DC**. Une fois la tension fixée, le reste (puissance, MPPT, BMS) se déduit.")
    A("")
    A(table(
        ["Architecture", "Tension nominale", "Plage typique", "Onduleur / chargeur", "Verdict"],
        [
            ["6S NMC", "22,2 V", "19,8–25,2 V", "MultiPlus-II 24/3000 (19–33 V)", "✅ 24 V natif"],
            ["8S NMC", "29,6 V", "24,2–33,6 V", "MultiPlus-II 24/3000, charge plafonnée à 32,8 V", "✅ 24 V, limite haute"],
            ["12S NMC", "44,4 V", "39,6–50,4 V", "MultiPlus-II 48/3000 ou 48/5000 (38–66 V)", "✅ 48 V natif"],
            ["16S NMC", "58,7 V", "44,8–67,2 V", "Victron 48 V seulement si charge ≤ 65,6 V", "⚠️ 48 V limite"],
            ["24S NMC", "87,5 V", "67,2–100,8 V", "Solax X1-Hybrid G4 (80–480 V)", "⚠️ X1, plage basse"],
            ["36S NMC", "131,5 V", "100,8–151,5 V", "Solax X1-Hybrid G4 (80–480 V)", "✅ X1 natif"],
            ["Pack 96S–110S", "350–407 V", "260–450 V", "X1 (80–480 V), X3 (180–800 V), Deye HV (160–700 V)", "✅ HV standard"],
            ["Pack 600 V LFP", "580–600 V", "440–684 V", "X3 (180–800 V), Deye HV (160–700 V)", "✅ HV, pas X1"],
            ["Pack 800 V", "650–723 V", "500–840 V", "X3 limite (max 800 V)", "⚠️ vérifier Vmax"],
        ],
    ))
    A("")
    A("> **Règle pratique :** pour du Victron 48 V, il faut des modules **12S** (ou des paires de 6S). Pour du 24 V, des **6S** (ou des 8S avec charge plafonnée). Tout ce qui est 24S, 36S ou pack complet sort du Victron basse tension.")
    A("")

    A("### 2.2 Matrice de compatibilité des équipements")
    A("")
    A(table(
        ["Équipement", "Fenêtre DC", "Ce qui passe", "Ce qui ne passe pas"],
        [
            ["Victron MultiPlus-II 24 V", "19–33 V", "6S (19,8–25,2 V), 8S avec charge ≤ 32,8 V", "12S (39,6 V min) ; 8S à 33,6 V"],
            ["Victron MultiPlus-II 48 V", "38–66 V", "12S (39,6–50,4 V), 16S avec charge ≤ 65,6 V", "24S (67,2 V min) ; 36S ; packs HV"],
            ["Victron MPPT 150/35 à 150/70", "12/24/48 V", "12S, 16S limité, 6S/8S", "24S et plus"],
            ["Victron MPPT 100/30", "12/24 V", "6S, 8S", "48 V"],
            ["Solax X1-Hybrid G4", "80–480 V", "36S (100,8–151,5 V), 24S partiel, packs 350–450 V", "16S (67,2 V) ; packs 600 V ; packs 800 V"],
            ["Solax X3-Hybrid G4", "180–800 V", "48S et plus, packs 350–600 V, packs 800 V limite", "36S (151,5 V max) ; 24S"],
            ["Deye HV (SUN-…-SG01HP3)", "160–700 V", "48S et plus, packs 350–600 V", "36S (151,5 V) ; packs 800 V"],
            ["GoodWe ET 15–30 kW", "200–800 V", "Packs 350–600 V", "36S ; packs 800 V selon modèle"],
        ],
    ))
    A("")
    A("Les plages Victron sont issues de la fiche technique MultiPlus-II 230 V : 38–66 V en 48 V, 19–33 V en 24 V, 35 A de charge sur le 48/3000 et 70 A sur le 48/5000. Les plages Solax X1/X3 et Deye HV sont celles des fiches constructeur (X1 80–480 V / 30 A ; X3 180–800 V / 30 A ; Deye 160–700 V).")
    A("")

    A("### 2.3 Architecture 24 V : simple, mais courants doublés")
    A("")
    A("**Quand :** une installation existante en 24 V, un petit site, ou des modules 6S/8S disponibles à bas prix.")
    A("")
    A("- **Onduleur/chargeur :** Victron MultiPlus-II 24/3000 (chargeur 70 A, plage 19–33 V).")
    A("- **MPPT :** SmartSolar 100/30 pour 6S, 150/35 à 150/60 pour 8S selon le courant.")
    A("- **BMS :** JK-B2A24S15P (7–24S, 150 A) ou JBD 8S 150 A.")
    A("- **Protection :** fusible Class T 200 A, câble 50 mm², précharge.")
    A("- **Réglages 6S NMC :** absorption 24,6 V (4,10 V/cellule), float 24,0 V, coupure 21,0 V.")
    A("- **Réglages 8S NMC :** absorption 32,8 V, float 32,0 V, coupure 28,0 V. **Ne pas dépasser 33 V** (limite MultiPlus).")
    A("")
    A("À puissance égale, le 24 V double le courant : 145 A pour 3 kVA contre 71 A en 48 V, donc des câbles de 50–95 mm² et un MPPT limité à ~1,4 kW. **À réserver aux installations déjà en 24 V.**")
    A("")

    A("### 2.4 Architecture 48 V : le cœur du catalogue")
    A("")
    A("**Quand :** maison, autoconstruction, écosystème Victron, 4 à 20 kWh.")
    A("")
    A("- **Onduleur/chargeur :** MultiPlus-II 48/3000 (35 A de charge) pour ≤ 120 Ah, 48/5000 (70 A) au-delà.")
    A("- **MPPT :** SmartSolar 150/35, 150/45, 150/60 ou 150/70 selon le courant de charge visé.")
    A("- **BMS :** JK-B2A24S15P (12S, 150 A) ; un BMS par string.")
    A("- **Protection :** fusible Class T 125 A (3000 VA) ou 150 A (5000 VA), câble 35 mm², précharge 25 Ω / 50 W.")
    A("- **Réglages 12S NMC :** absorption 49,2 V, float 48,0 V, coupure 42,0 V, redémarrage 44,5 V, égalisation désactivée.")
    A("- **MPPT :** forcer le mode 48 V manuel ; l'auto-détection ne se fait qu'au premier démarrage.")
    A("- **Appariement :** ne jamais mélanger des modules d'âges, de capacités ou de résistances internes différents dans une même string. Un fusible par string, un BMS par string.")
    A("")
    A("**Les trois voies 48 V :**")
    A("")
    A("1. **12S natif** — 1 module 12S, ou 2 modules 6S en série. Aucun travail mécanique. C'est la voie recommandée.")
    A("2. **36S découpé** — 1 module 36S coupé en 3 × 12S, 3 BMS. Le meilleur €/kWh, mais travail sous 151 V et garantie annulée.")
    A("3. **16S limite** — 1 module 16S, charge plafonnée à 65,6 V (4,10 V/cellule) pour rester sous les 66 V Victron. Possible, mais peu de marge.")
    A("")

    A("### 2.5 Architecture haute tension : le pack reste entier")
    A("")
    A("**Quand :** 15 kWh et plus, pack complet disponible, volonté de ne pas découper.")
    A("")
    A("- **X1-Hybrid G4 (80–480 V, 30 A)** : 36S natif, packs 350–450 V. C'est l'onduleur le plus polyvalent pour les packs 400 V.")
    A("- **X3-Hybrid G4 (180–800 V, 30 A)** : packs 550–600 V, packs 800 V en limite haute. Pas de 36S.")
    A("- **Deye HV (160–700 V)** : alternative pour les packs 350–600 V ; pas de 36S, pas de 800 V.")
    A("- **BMS :** celui du pack, conservé. L'intégration passe par CAN (Battery-Emulator ou protocole constructeur).")
    A("- **Charge :** pilotée par l'onduleur hybride, avec le profil du BMS. Pas de chargeur AC séparé.")
    A("- **Protection :** sectionneur DC HV, précharge, surveillance d'isolement, coffret fermé.")
    A("")
    A("> **Le point critique n'est pas l'onduleur, c'est le BMS.** Un pack 64 kWh sans protocole CAN documenté est une loterie : il faut soit Battery-Emulator (liste de compatibilité), soit un BMS de remplacement (Orion 2, REC), soit renoncer.")
    A("")

    A("### 2.6 Dimensionner le chargeur")
    A("")
    A("**Courant de charge cible :** 0,3 à 0,4 C pour du NMC d'occasion, 0,5 C maximum pour du LFP neuf. Pour un module de 115 Ah : 35 à 46 A. Pour un pack de 180 Ah : 54 à 72 A.")
    A("")
    A("**Puissance MPPT :** `P ≈ V_batterie × I_charge × 1,2`. Exemple : 48 V × 45 A × 1,2 = **2,6 kWc** de panneaux pour un MPPT 150/45.")
    A("")
    A("**Choix du MPPT :**")
    A("")
    A("- 24 V : 100/30 pour ≤ 30 A, 150/35 à 150/60 au-delà.")
    A("- 48 V : 150/35 minimum (les 100/30 ne font pas 48 V), puis 150/45, 150/60, 150/70.")
    A("- La tension PV à vide doit rester **< 150 V** (ou 250 V pour les 250/…) à la température la plus froide.")
    A("")
    A("**Choix du chargeur AC :**")
    A("")
    A("- 24 V : MultiPlus-II 24/3000, chargeur 70 A.")
    A("- 48 V : MultiPlus-II 48/3000, chargeur 35 A ; 48/5000, chargeur 70 A.")
    A("- HT : pas de chargeur AC séparé, l'onduleur hybride charge depuis le réseau et le PV.")
    A("")

    A("### 2.7 BMS, protection, précharge")
    A("")
    A(table(
        ["Architecture", "BMS", "Fusible / breaker", "Câble", "Précharge"],
        [
            ["24 V, 6S/8S", "JK-B2A24S15P ou JBD 8S 150 A", "Class T 200 A", "50 mm²", "25 Ω / 50 W"],
            ["48 V, 12S", "JK-B2A24S15P (1 par string)", "Class T 125 A (3000 VA) / 150 A (5000 VA)", "35 mm²", "25 Ω / 50 W"],
            ["48 V, 16S", "JK-B2A24S15P", "Class T 150 A", "35 mm²", "25 Ω / 50 W"],
            ["HT, 24S/36S", "BMS 24S/36S (JK 24S max, Orion 2/REC pour 36S)", "Sectionneur DC 100–125 A / 250 V", "16–25 mm²", "Obligatoire"],
            ["Pack HV", "BMS OEM + CAN", "Sectionneur DC HV + breaker", "Selon courant pack", "Obligatoire"],
        ],
    ))
    A("")
    A("**Pourquoi la précharge :** le MultiPlus et les onduleurs HV ont de gros condensateurs. Sans précharge, la fermeture du contacteur crée un appel de courant qui peut souder les contacts ou déclencher le BMS. `τ = R × C` ; avec 25 Ω et 10 mF, τ = 0,25 s.")
    A("")

    A("### 2.8 Profils de charge")
    A("")
    A(table(
        ["Paramètre", "NMC (3,6–3,7 V)", "LFP (3,2 V)"],
        [
            ["Absorption", "4,10 V/cellule", "3,45 V/cellule"],
            ["Float", "4,00 V/cellule", "3,35 V/cellule"],
            ["Coupure basse BMS", "3,00–3,20 V/cellule", "2,80 V/cellule"],
            ["Coupure basse onduleur", "3,50 V/cellule", "3,00 V/cellule"],
            ["Égalisation", "Jamais", "Jamais"],
            ["Température de charge", "> +2 °C", "> 0 °C"],
            ["Courant", "0,3–0,4 C", "0,5 C"],
        ],
    ))
    A("")
    A("Les packs complets gardent le profil de leur BMS. **Ne pas imposer un profil 12S à un pack 96S** : c'est le BMS qui décide, l'onduleur suit.")
    A("")

    # 3
    A("## 3. Catalogue complet")
    A("")
    A("Chaque famille donne deux tableaux : les **caractéristiques**, puis le **choix chargeur / onduleur**. Les références sont cliquables vers la fiche EVShop. Dans la colonne Config, `—` signifie que la fiche ne documente pas la configuration série/parallèle : elle est à confirmer sur l'étiquette, elle n'a pas été inventée.")
    A("")

    for fam in families:
        group = by_family[fam]
        A(f"### 3.{families.index(fam)+1} {fam} ({len(group)} référence{'s' if len(group)>1 else ''})")
        A("")
        A(FAMILY_INTRO.get(fam, "Références à qualifier : tension, configuration et BMS à vérifier avant intégration."))
        A("")
        # tech table
        rows = []
        for x in group:
            stock = x["stock_status"]
            rows.append([
                f"[{x['evshop_id']}]({x['url']})",
                short_name(x),
                feur(x["price_eur"]),
                fkwh(x),
                fv(x),
                x["configuration"] or "—",
                fint(x["capacity_ah"]),
                fkg(x["mass_kg"]),
                fnum(x["eur_per_kwh"]),
                stock,
            ])
        A(table(["Réf", "Produit", "Prix", "kWh", "Tension", "Config", "Ah", "kg", "€/kWh", "Stock"], rows))
        A("")
        # compat table
        rows = []
        if all(x["form"] == "pack" for x in group):
            A("Tous ces packs gardent leur BMS d'origine. Le vrai discriminant est la **compatibilité CAN** : la colonne Battery-Emulator donne l'état du projet open source, pas une garantie de plug-and-play.")
            A("")
            for x in group:
                rows.append([
                    f"[{x['evshop_id']}]({x['url']})",
                    x["inverter"],
                    x["bms_recommendation"],
                    x["battery_emulator"],
                    x["verdict"],
                ])
            A(table(["Réf", "Onduleur", "BMS / CAN", "Battery-Emulator", "Verdict"], rows))
        else:
            for x in group:
                rows.append([
                    f"[{x['evshop_id']}]({x['url']})",
                    x["charger"],
                    x["inverter"],
                    x["bms_recommendation"],
                    x["verdict"],
                ])
            A(table(["Réf", "Chargeur", "Onduleur / chargeur", "BMS", "Verdict"], rows))
        A("")

    # 4 fiches
    A("## 4. Fiches de décision")
    A("")
    A("Douze références représentatives, avec le détail du montage, du chargeur et de l'onduleur.")

    fiches = {
        1744: {
            "title": "Stellantis 6S2P 2,74 kWh — le meilleur départ en 48 V",
            "why": "Deux modules en série donnent un 12S de 5,48 kWh, 44,4 V, 123 Ah, sans aucune découpe. C'est le meilleur compromis prix/simplicité du catalogue.",
            "mount": "2 × 1744 en série (6S + 6S = 12S), 432 €. BMS 12S JK-B2A24S15P, fusible Class T 125 A, coffret acier, câbles 35 mm², cosses M6.",
            "charger": "MPPT SmartSolar 150/45 (45 A) ; absorption 49,2 V / float 48,0 V ; charge ≤ 49 A (0,4 C).",
            "inverter": "MultiPlus-II 48/3000 (35 A) ; ou 48/5000 si le reste de l'installation dépasse 3 kVA.",
            "limits": "Modules soudés, non démontables. Stock sur commande. Prix 216 €/module, soit 78,8 €/kWh brut ; coût fini estimé 677 €, soit 124 €/kWh.",
        },
        339: {
            "title": "MEB 12S 6,85 kWh — le 48 V en un seul bloc",
            "why": "Un seul module 12S, 44,4 V, 156 Ah, 32 kg, bornes M6. Aucun assemblage série, un seul BMS.",
            "mount": "1 × 339, BMS 12S 150 A, fusible Class T 150 A, câble 35 mm², précharge.",
            "charger": "MPPT SmartSolar 150/70 (70 A) ; absorption 49,2 V / float 48,0 V ; charge ≤ 62 A (0,4 C).",
            "inverter": "MultiPlus-II 48/5000 (70 A) ; un 48/3000 suffit si la charge est limitée à 35 A.",
            "limits": "Soudé, non démontable. 109,5 €/kWh brut. Poids 32–35 kg : prévoir deux personnes.",
        },
        350: {
            "title": "CATL 16S 11 kWh — le 48 V limite",
            "why": "11 kWh pour 1 190 €, 108 €/kWh. Mais 16S NMC charge à 67,2 V, au-dessus des 66 V du MultiPlus-II.",
            "mount": "1 × 350, BMS 16S 150 A. Pour Victron : plafonner l'absorption à 65,6 V (4,10 V/cellule) et la coupure basse à 56 V.",
            "charger": "MPPT 150/70 en 48 V, plage 66 V ; charge max 65,6 V. Sinon 2 × 350 en série = 32S (117 V) sur X1.",
            "inverter": "MultiPlus-II 48/3000/5000 en limite, ou Solax X1-Hybrid G4 avec 2 modules en série.",
            "limits": "Marge de 0,4 V seulement sous la limite Victron. Connecteur de mesure cellules inclus, 4 NTC. Refroidissement liquide.",
        },
        351: {
            "title": "LGChem 24S 10,1 kWh — le 24S à plage basse",
            "why": "10,1 kWh à 1 190 €, 117,8 €/kWh, 87,5 V, 115 Ah, 53 kg. Moins intéressant que le 36S, mais plus proche de la plage X1.",
            "mount": "1 × 351 sur X1, BMS 24S 150 A, sectionneur DC 150 V, précharge. Pas de Victron 48 V.",
            "charger": "X1-Hybrid G4 (80–480 V, 30 A) ; plage utile 80–100,8 V, soit environ 75 % de la capacité exploitable.",
            "inverter": "Solax X1-Hybrid G4 ; 2 × 351 en série = 48S (175 V) pour X1/Deye (X3 limite, min 180 V).",
            "limits": "La plage basse du X1 (80 V) coupe avant la décharge profonde : capacité utile réduite. Préférer le 36S ou 2 × 24S en série.",
        },
        372: {
            "title": "LGChem 36S 15,19 kWh — le meilleur €/kWh module",
            "why": "66,8 €/kWh, 115 Ah, 131,5 V. Le module le moins cher au kWh, mais il faut soit le découper en 3 × 12S, soit passer en X1.",
            "mount": "X1 : 1 × 372, BMS 36S (Orion 2/REC), sectionneur DC 250 V. Victron : découpe électrique en 3 × 12S (3 BMS, 3 fusibles), sans sortir les cellules.",
            "charger": "X1-Hybrid G4 (80–480 V, 30 A) ; absorption 147,6 V / float 144,0 V. En 3 × 12S : 3 × MPPT 150/35.",
            "inverter": "Solax X1-Hybrid G4 ; ou MultiPlus-II 48/5000 + 3 BMS 12S si découpe.",
            "limits": "Découpe sous 151 V : décharge à 3,3 V/cellule, outils isolés, un lien à la fois. Garantie annulée. 81 kg.",
        },
        1073: {
            "title": "Kona 64 kWh — le meilleur pack 400 V",
            "why": "64 kWh à 4 500 €, 70,3 €/kWh, BMS OEM, 300 kg. Battery-Emulator supporte la plateforme Kona/Niro 64 kWh (⭐⭐⭐).",
            "mount": "Pack complet, BMS OEM, contacteurs d'origine. Interface CAN Battery-Emulator (ESP32 + CAN), précharge, sectionneur DC.",
            "charger": "Onduleur hybride HV (X1 80–480 V, X3 180–800 V ou Deye 160–700 V) ; charge pilotée par le BMS.",
            "inverter": "Solax X1-Hybrid G4 (le plus simple en 400 V) ; X3 ou Deye en alternative.",
            "limits": "7 en stock. Vérifier la pyrofuse, l'état des modules arrière et le SoH. Transport ADR 300 kg à chiffrer.",
        },
        935: {
            "title": "Leaf 62 kWh — le pack le mieux documenté",
            "why": "62 kWh, 355,2 V, 366 kg, 111 €/kWh. La plateforme Leaf est la plus documentée (Battery-Emulator ⭐⭐⭐, bms-ev, forums).",
            "mount": "Pack complet, BMS OEM, interface CAN/GPIO selon version. Précharge et sectionneur DC.",
            "charger": "X1 (80–480 V) ; absorption 403,2 V max, coupure 260 V.",
            "inverter": "Solax X1-Hybrid G4 ; ou X3/Deye.",
            "limits": "La fiche annonce 180 Ah par cellule, incohérent avec 62 kWh / 355 V (≈175 Ah). Prix au kWh moyen (111 €).",
        },
        1417: {
            "title": "Tesla Model 3 LFP 55 kWh — la sécurité LFP",
            "why": "55 kWh, 340 V, LFP, 75,3 €/kWh. Chimie plus sûre, 2 000+ cycles, pas de cobalt.",
            "mount": "Pack complet, BMS OEM Tesla, interface CAN Battery-Emulator (Model 3/Y).",
            "charger": "X1 (80–480 V) ; profil LFP du BMS, absorption ~383 V max.",
            "inverter": "Solax X1-Hybrid G4 ; X3/Deye en alternative.",
            "limits": "2 en stock. 106S1P, 52,5 kWh utiles. Le BMS Tesla est verrouillé : l'intégration CAN est indispensable.",
        },
        3568: {
            "title": "BYD Han 64,8 kWh — le 600 V LFP",
            "why": "64,8 kWh Blade LFP, ~600 V, 79 €/kWh. Excellent prix au kWh et chimie sûre.",
            "mount": "Pack complet, BMS intégré, connecteurs HV BYD. Interface CAN (Battery-Emulator BYD, ⭐⭐).",
            "charger": "X3 (180–800 V) ou Deye HV (160–700 V) ; X1 exclu (max 480 V).",
            "inverter": "Solax X3-Hybrid G4 ; Deye HV en alternative.",
            "limits": "Tension ~600 V estimée. Pack lourd (≈500 kg), ADR. Vérifier la compatibilité CAN exacte du Han (la doc Battery-Emulator couvre Atto 3, Dolphin, Seal, Tang ; Han à confirmer).",
        },
        1717: {
            "title": "Porsche Taycan 84 kWh — le piège 800 V",
            "why": "84 kWh à 7 770 €, 92,5 €/kWh. Mais 800 V et 74 kWh utiles seulement.",
            "mount": "Pack 800 V, BMS OEM, refroidissement liquide. Intégration Taycan : travaux en cours chez Battery-Emulator.",
            "charger": "Aucun onduleur résidentiel standard ne couvre 840 V de charge. X3 max 800 V : insuffisant en fin de charge.",
            "inverter": "X3-Hybrid G4 seulement si la tension de charge max est ≤ 800 V ; sinon onduleur 1000 V spécifique.",
            "limits": "À éviter sans étude préalable. 84 kWh annoncés, 74 kWh utiles. 510 kg.",
        },
        213: {
            "title": "Headway 38120S 3,2 V 10 Ah — la cellule nue",
            "why": "30 € la cellule, 718 en stock. Pour un 48 V LFP : 16S = 51,2 V, 0,512 kWh, 480 € de cellules.",
            "mount": "16 cellules en série, barres de liaison, BMS 16S LFP, coffret, 16 supports. Serrage 3 N·m max.",
            "charger": "MPPT 150/35 ; absorption 55,2 V / float 53,6 V ; charge ≤ 5 A par cellule (ici 10 Ah).",
            "inverter": "MultiPlus-II 48/3000 ; BMS 16S LFP 100 A.",
            "limits": "Prix au kWh apparent 937 € : le montage n'a de sens que si l'on a déjà les barres, le coffret et le temps. 2 000 cycles à 80 % DoD.",
        },
        2719: {
            "title": "Mercedes Classe B 28 kWh — le pack le moins cher",
            "why": "1 900 € pour 31 kWh brut / 28 kWh utiles, soit 61,3 €/kWh brut (67,9 €/kWh utile). Le meilleur prix du catalogue.",
            "mount": "Pack 300 V, 12 modules, 84S44P, fabrication Tesla. BMS OEM Mercedes/Tesla, interface CAN (Battery-Emulator B250E ⭐).",
            "charger": "X1-Hybrid G4 (80–480 V) ; profil BMS OEM.",
            "inverter": "Solax X1-Hybrid G4 ; X3/Deye en alternative.",
            "limits": "Pack ancien, 290 kg, 28 kWh utiles. La configuration 84S44P est atypique : vérifier le BMS et les faisceaux avant achat.",
        },
    }

    for pid, f in fiches.items():
        x = by_id.get(pid)
        if not x:
            continue
        A("")
        A(f"### 4.{list(fiches).index(pid)+1} {f['title']}")
        A("")
        A(f"**[Fiche EVShop {pid}]({x['url']})** · {feur(x['price_eur'])} · {fkwh(x)} kWh · {fv(x)} · {fint(x['capacity_ah'])} Ah · {fkg(x['mass_kg'])} kg · **{fnum(x['eur_per_kwh'])} €/kWh** · {x['stock_status']}")
        A("")
        A(f"**Pourquoi :** {f['why']}")
        A("")
        A(f"- **Montage :** {f['mount']}")
        A(f"- **Chargeur :** {f['charger']}")
        A(f"- **Onduleur :** {f['inverter']}")
        A(f"- **BMS / intégration :** {x['bms_recommendation']} — Battery-Emulator : {x['battery_emulator']}")
        A(f"- **Limites :** {f['limits']}")
        A("")

    # 5 synthesis
    A("## 5. Synthèse économique")
    A("")
    A("### 5.1 Top 15 tous formats (≥ 10 kWh)")
    A("")
    top = sorted_by_price([x for x in items if (x.get("energy_kwh") or 0) >= 10])[:15]
    A(table(
        ["#", "Réf", "Produit", "Prix", "kWh", "€/kWh", "Tension", "Verdict"],
        [[i + 1, f"[{x['evshop_id']}]({x['url']})", short_name(x), feur(x["price_eur"]), fkwh(x), fnum(x["eur_per_kwh"]), fv(x), x["verdict"]] for i, x in enumerate(top)],
    ))
    A("")
    A("### 5.2 Top modules 48 V")
    A("")
    top = sorted_by_price([x for x in items if x["family"] == "Modules 48 V"])
    A(table(
        ["Réf", "Produit", "Prix", "kWh", "€/kWh", "Chargeur", "Onduleur", "Verdict"],
        [[f"[{x['evshop_id']}]({x['url']})", short_name(x), feur(x["price_eur"]), fkwh(x), fnum(x["eur_per_kwh"]), x["charger_short"], x["inverter_short"], x["verdict"]] for x in top],
    ))
    A("")
    A("### 5.3 Top modules 24 V")
    A("")
    top = sorted_by_price([x for x in items if x["family"] == "Modules 24 V"])
    A(table(
        ["Réf", "Produit", "Prix", "kWh", "€/kWh", "Chargeur", "Onduleur", "Verdict"],
        [[f"[{x['evshop_id']}]({x['url']})", short_name(x), feur(x["price_eur"]), fkwh(x), fnum(x["eur_per_kwh"]), x["charger_short"], x["inverter_short"], x["verdict"]] for x in top],
    ))
    A("")
    A("### 5.4 Top packs HV")
    A("")
    top = sorted_by_price([x for x in items if x["form"] == "pack"])[:20]
    A(table(
        ["Réf", "Produit", "Prix", "kWh", "€/kWh", "Tension", "Onduleur", "Battery-Emulator"],
        [[f"[{x['evshop_id']}]({x['url']})", short_name(x), feur(x["price_eur"]), fkwh(x), fnum(x["eur_per_kwh"]), fv(x), x["inverter_short"], x["battery_emulator"]] for x in top],
    ))
    A("")
    A("### 5.5 Choix par usage")
    A("")
    A(table(
        ["Besoin", "Solution", "Coût matériel", "Coût fini estimé", "Chargeur", "Onduleur"],
        [
            ["4–6 kWh, 48 V, Victron", "2 × 1744 Stellantis 6S2P (5,48 kWh)", "432 €", "677 € (124 €/kWh)", "MPPT 150/45", "MultiPlus-II 48/3000"],
            ["6,85 kWh, 48 V, un bloc", "1 × 339 MEB 12S", "750 €", "995 € (145 €/kWh)", "MPPT 150/70", "MultiPlus-II 48/5000"],
            ["15 kWh, 48 V, Victron", "1 × 372 LGChem 36S découpé 3 × 12S", "1 014 €", "1 699 € (112 €/kWh)", "3 × MPPT 150/35", "MultiPlus-II 48/5000"],
            ["15 kWh, HV", "1 × 372 LGChem 36S + X1", "1 014 €", "2 800 € (185 €/kWh)", "X1 30 A", "Solax X1-Hybrid G4"],
            ["60 kWh, 400 V", "1 × 1073 Kona 64 kWh", "4 500 €", "6 300 € (98 €/kWh)", "X1 30 A", "Solax X1-Hybrid G4"],
            ["60 kWh, 600 V LFP", "1 × 3568 BYD Han 64,8 kWh", "5 120 €", "6 800 € (105 €/kWh)", "X3 30 A", "Solax X3-Hybrid G4"],
            ["5,3 kWh, 24 V", "1 × 242 Tesla 6S74P", "600 €", "845 € (159 €/kWh)", "MPPT 150/60", "MultiPlus-II 24/3000"],
        ],
    ))
    A("")
    A("Les coûts finis incluent forfaitairement BMS, fusible, coffret, câblage, précharge et, pour le HV, l'interface CAN. Ils n'incluent ni le transport ADR, ni la main-d'œuvre, ni les panneaux.")
    A("")

    # 6 traps
    A("## 6. Pièges et vérifications")
    A("")
    A("### 6.1 Incohérences relevées dans les fiches")
    A("")
    A(table(
        ["Réf", "Ce que dit la fiche", "Le problème", "À faire"],
        [
            ["4600", "12S1P, 7,06 kWh, 240 Ah, 44,4 V", "44,4 × 240 = 10,66 kWh, pas 7,06 kWh. 7,06 kWh / 44,4 V = 159 Ah.", "Demander la capacité réelle par écrit ; le prix au kWh varie de 113 à 170 €."],
            ["322 / 3695", "Pack 85/75 kWh, puis 22,8 V et 232 Ah", "Ce sont les specs d'un module 6S, pas du pack.", "Le pack est en 96S (~364,8 V) : ne pas se fier à la tension affichée."],
            ["217", "Pack Leaf 24 kWh, tension 7,40 V", "7,4 V est la tension d'un module 2S, pas du pack.", "Pack 96S2P ~360 V ; le prix de 3 490 € correspond à 145 €/kWh."],
            ["935", "62 kWh, 96S2P, cellule 180 Ah", "96S2P × 180 Ah ferait 128 kWh, pas 62.", "Retenir ~175 Ah pour 62 kWh / 355 V."],
            ["2719", "28 kWh, 31 kWh brut, 300 V", "Le prix au kWh dépend du brut ou de l'utile.", "Comparer à 67,9 €/kWh utile, pas 61,3."],
            ["1717", "Taycan 84 kWh, 74 kWh utiles", "Deux capacités différentes.", "Retenir 74 kWh utiles et 92,5 €/kWh brut."],
        ],
    ))
    A("")
    A("### 6.2 Les cinq questions avant d'acheter")
    A("")
    A("1. **Tension exacte** : demander une photo de l'étiquette et la tension de charge max, pas seulement le kWh.")
    A("2. **BMS** : modèle, protocole CAN, brochage, et si le pack peut fermer ses contacteurs sans le véhicule.")
    A("3. **SoH** : rapport de capacité et de résistance interne par module, pas seulement l'année.")
    A("4. **Démontabilité** : photo des busbars. Vis = boulonné ; barre continue = soudé.")
    A("5. **Transport ADR** : chiffrer avant de valider. Un pack de 300–600 kg peut coûter 500–1 000 € de port.")
    A("")
    A("### 6.3 Check-list de mise en service")
    A("")
    A("- [ ] Top balance avant la première charge complète.")
    A("- [ ] Précharge du bus DC avant fermeture du contacteur.")
    A("- [ ] Vérifier le profil de charge (49,2 V / 48,0 V en 12S NMC) avant de brancher le MPPT.")
    A("- [ ] Test de coupure : simuler une surtension et vérifier l'ouverture du BMS.")
    A("- [ ] Journal des 10 premiers cycles : capacité, écart cellule, température.")
    A("- [ ] Déclarer l'installation à l'assurance et vérifier la conformité locale.")
    A("")

    # 7 sources
    A("## 7. Sources")
    A("")
    A("**Catalogue**")
    A("")
    A("- Catégorie EVShop « Batteries » : <https://evshop.fr/fr/13-batteries>")
    A("- Chaque référence est liée à sa fiche dans les tableaux ci-dessus.")
    A("")
    A("**Documentation technique**")
    A("")
    A("- Victron MultiPlus-II 230 V, spécifications : <https://www.victronenergy.com/media/pg/MultiPlus-II_230V/en/technical-specifications-mp-ii-230v.html>")
    A("- Victron MPPT 150/35 et 150/45 : <https://www.victronenergy.com/media/pg/Manual_BlueSolar_150-35__150-45/fr/technical-specifications.html>")
    A("- Solax X1/X3 Hybrid G4, sélection batterie : <https://kb.solaxpower.com/solution/detail/2c9fa4148ceddee5018e94039f8026a0>")
    A("- Deye SUN-5-25K-SG01HP3, fiche : <https://pt.deyeinverter.com/deyeinverter/2025/08/08/%e3%80%90b%e3%80%91datasheet_sun-5-25k-sg01hp3-eu_20250805_pt.pdf>")
    A("- Battery-Emulator, batteries compatibles : <https://dalathegreat.github.io/Battery-Emulator-Wiki/battery/>")
    A("- OpenInverter, modules MEB : <https://openinverter.org/wiki/MEB_Batteries>")
    A("")
    A("**Référence de prix LFP certifiée**")
    A("")
    A("- Pylontech US5000 4,8 kWh : <https://www.myshop-solaire.com/batterie-lithium-us5000-48v-100ah-4-8-kwh-pylontech-_r_1229_i_4535.html>")
    A("")
    A("---")
    A("")
    A("*Catalogue généré à partir des fiches publiques EVShop et de la documentation constructeur. Les prix et disponibilités doivent être revalidés avant commande. Aucune garantie n'est donnée sur la conformité réglementaire d'une installation DIY.*")

    MD.write_text("\n".join(L) + "\n", encoding="utf-8")
    print(f"wrote {MD} ({len(L)} lines)")

    # CSV
    fields = [
        "id", "evshop_id", "brand", "model", "name", "price_eur", "regular_price_eur", "stock_qty", "stock_status", "active",
        "family", "form", "energy_kwh", "energy_usable_kwh", "voltage_nominal_v", "voltage_min_v",
        "voltage_max_v", "voltage_estimated", "capacity_ah", "configuration", "chemistry", "mass_kg",
        "removable", "bms", "eur_per_kwh", "eur_per_kwh_usable", "architecture", "charger", "inverter",
        "bms_recommendation", "protection", "verdict", "battery_emulator", "url", "notes",
    ]
    with CSV.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields, delimiter=";", extrasaction="ignore")
        w.writeheader()
        for x in items:
            row = dict(x)
            row["notes"] = " | ".join(x.get("notes", []))
            w.writerow(row)
    print(f"wrote {CSV} ({len(items)} rows)")


if __name__ == "__main__":
    main()
