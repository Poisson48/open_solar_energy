# Catalogue batteries EVShop

Données structurées du catalogue complet des batteries EVShop, avec recommandations de chargeur et d'onduleur.

## Fichiers

| Fichier | Rôle |
|---|---|
| `catalog.json` | Source de vérité : 80 références, caractéristiques, prix, stock, recommandations. |
| `catalog.csv` | Export tableur (`;`, UTF-8 BOM) pour filtres et tris. |
| `../../docs/CATALOGUE-BATTERIES-EVSHOP.md` | Catalogue lisible : méthode, matrice de compatibilité, tableaux, fiches de décision. |

## Champs principaux

- `evshop_id`, `brand`, `model`, `name`, `url`, `price_eur`, `regular_price_eur`, `stock_qty`, `stock_status`, `active`
- `family`, `form` (`cellule` / `module` / `pack`), `energy_kwh`, `energy_usable_kwh`
- `voltage_nominal_v`, `voltage_min_v`, `voltage_max_v`, `voltage_estimated`
- `capacity_ah`, `configuration`, `chemistry`, `mass_kg`, `removable`, `bms`
- `eur_per_kwh`, `eur_per_kwh_usable`
- `charger`, `inverter`, `bms_recommendation`, `protection`, `verdict`
- `battery_emulator`, `notes`

Les tensions marquées `voltage_estimated: true` sont des estimations de plateforme : elles doivent être confirmées sur l'étiquette du pack. Une `configuration` à `null` signifie « non documentée », pas « inconnue inventée ».

## Mettre à jour

```bash
python3 scripts/update_evshop_battery_catalog.py --dry-run   # vérifie sans écrire
python3 scripts/update_evshop_battery_catalog.py             # met à jour + régénère MD/CSV
```

Le script :

1. récupère les pages de la catégorie <https://evshop.fr/fr/13-batteries> ;
2. relit chaque fiche (JSON-LD + `data-product`) ;
3. met à jour prix, prix barré, stock, nom et URL ;
4. ajoute les nouvelles références dans la famille `À qualifier` ;
5. marque les références disparues `active: false` sans les supprimer ;
6. régénère le Markdown et le CSV.

## Mettre à jour les deux catalogues (EVShop + Rexel)

```bash
python3 scripts/update_all_catalogs.py --dry-run
python3 scripts/update_all_catalogs.py
```

Le détail Rexel est dans `data/rexel_catalog/catalog.json` ; le script préserve les champs locaux et marque les références disparues `active: false`.

## Régénérer uniquement le rendu

```bash
python3 scripts/render_evshop_battery_catalog.py
```

## Limites

- Prix TTC hors transport ADR, hors options, relevés à une date donnée.
- Aucun produit n'est testé physiquement ; les SoH ne sont pas vérifiés.
- Les recommandations d'onduleurs sont des règles de compatibilité de tension, pas une validation d'installation.
- Une batterie DIY n'est pas certifiée : conformité et assurance restent à la charge de l'installateur.
