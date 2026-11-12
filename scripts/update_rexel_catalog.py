#!/usr/bin/env python3
"""Met à jour le catalogue Rexel (panneaux + onduleurs) sans écraser les données locales.

Le scraper historique `scrape_rexel_catalog.py` réécrit tout le fichier.
Ce script ajoute un mode « update » : il relit Rexel, met à jour les SKU connus,
ajoute les nouveaux et marque les disparus `active = false`.

Usage:
    python3 scripts/update_rexel_catalog.py --dry-run
    python3 scripts/update_rexel_catalog.py --limit 2 --only panels
    python3 scripts/update_rexel_catalog.py --download-pdfs
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "rexel_catalog" / "catalog.json"

# Le scraper vit dans le même dossier ; l'import fonctionne en direct et via update_all_catalogs.py.
sys.path.insert(0, str(Path(__file__).resolve().parent))
from scrape_rexel_catalog import CATEGORIES, fetch_product, list_skus  # noqa: E402


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def scrape_rexel_catalog(
    only: str | None = None,
    limit: int | None = None,
    download_pdfs: bool = False,
    sleep: float = 0.25,
) -> dict:
    """Scrape les catégories Rexel et retourne {panels, inverters, errors, skus}."""
    cats = {only: CATEGORIES[only]} if only else CATEGORIES
    panels: list[dict] = []
    inverters: list[dict] = []
    errors = 0
    seen_skus: list[str] = []

    for cat_name, meta in cats.items():
        print(f"== Listing {cat_name}…", flush=True)
        try:
            skus = list_skus(meta["url"], limit=limit)
        except Exception as e:
            print(f"   ! listing {cat_name}: {e}", file=sys.stderr, flush=True)
            errors += 1
            continue
        print(f"   {len(skus)} SKUs", flush=True)
        for i, sku in enumerate(skus, 1):
            if sku in seen_skus:
                continue
            seen_skus.append(sku)
            try:
                entry = fetch_product(sku, meta, download_pdfs=download_pdfs)
            except Exception as e:
                print(f"   ERR {sku}: {e}", file=sys.stderr, flush=True)
                errors += 1
                entry = None
            if not entry:
                errors += 1
                continue
            if entry.get("kind") == "panel":
                if entry.get("wp"):
                    panels.append(entry)
                else:
                    print(f"   skip panel sans Wc: {sku}", flush=True)
            else:
                inverters.append(entry)
            if i % 10 == 0:
                print(f"   … {i}/{len(skus)} · {len(panels)} panneaux / {len(inverters)} onduleurs", flush=True)
            time.sleep(sleep)

    return {"panels": panels, "inverters": inverters, "errors": errors, "skus": seen_skus}


def _load_existing() -> dict:
    if not DATA.exists():
        return {"source": "rexel.fr", "panels": [], "inverters": [], "stats": {}}
    try:
        data = json.loads(DATA.read_text(encoding="utf-8"))
    except Exception as e:
        raise SystemExit(f"Catalogue Rexel illisible ({DATA}): {e}")
    data.setdefault("panels", [])
    data.setdefault("inverters", [])
    return data


def _merge_one(old: dict, new: dict) -> bool:
    """Met à jour old avec les champs renseignés de new. Retourne True si changé."""
    changed = False
    protected = {"datasheetLocal", "notes", "seeded", "downloadCount", "favorite"}
    for k, v in new.items():
        if k in protected:
            continue
        if v in (None, "", [], {}):
            continue
        if old.get(k) != v:
            old[k] = v
            changed = True
    if old.get("active") is False:
        old["active"] = True
        changed = True
    return changed


def update_rexel_catalog(
    scraped: dict | None = None,
    dry_run: bool = False,
    mark_missing: bool = True,
) -> dict:
    """Fusionne un résultat de scrape dans le catalogue existant.

    mark_missing=False est utilisé pour les scans partiels (--limit / --only) :
    on met à jour et on ajoute, mais on ne désactive pas les références non vues.
    """
    existing = _load_existing()
    if scraped is None:
        raise ValueError("scraped est requis")

    summary = {"panels": 0, "inverters": 0, "updated": 0, "added": 0, "missing": 0, "errors": scraped.get("errors", 0)}
    for kind in ("panels", "inverters"):
        old_items = existing.get(kind, [])
        by_sku = {str(x.get("sku")): x for x in old_items if x.get("sku")}
        new_items = scraped.get(kind, [])
        if not new_items:
            # Scan partiel (--only) : ne pas toucher à l'autre famille.
            continue
        new_skus = {str(x.get("sku")) for x in new_items if x.get("sku")}

        for new in new_items:
            sku = str(new.get("sku"))
            if not sku:
                continue
            old = by_sku.get(sku)
            if old is None:
                new["active"] = True
                old_items.append(new)
                by_sku[sku] = new
                summary["added"] += 1
                summary[kind] += 1
            else:
                if _merge_one(old, new):
                    summary["updated"] += 1
                old["active"] = True
                summary[kind] += 1

        # Les SKU absents du scrape ne sont pas supprimés : ils sont marqués inactifs.
        # Un scan partiel (--limit / --only) ne doit pas désactiver le reste du catalogue.
        if mark_missing:
            for sku, old in by_sku.items():
                if sku not in new_skus:
                    old["active"] = False
                    summary["missing"] += 1

        existing[kind] = old_items

    existing["source"] = "rexel.fr"
    existing["scrapedAt"] = _now()
    panels_active = [x for x in existing.get("panels", []) if x.get("active", True)]
    inverters_active = [x for x in existing.get("inverters", []) if x.get("active", True)]
    existing["stats"] = {
        "panels": len(panels_active),
        "inverters": len(inverters_active),
        "panelsTotal": len(existing.get("panels", [])),
        "invertersTotal": len(existing.get("inverters", [])),
        "errors": summary["errors"],
        "updated": summary["updated"],
        "added": summary["added"],
        "missing": summary["missing"],
        "active": True,
    }

    if not dry_run:
        DATA.parent.mkdir(parents=True, exist_ok=True)
        DATA.write_text(json.dumps(existing, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return summary


def main() -> int:
    ap = argparse.ArgumentParser(description="Met à jour data/rexel_catalog/catalog.json")
    ap.add_argument("--dry-run", action="store_true", help="Scrape et fusionne sans écrire")
    ap.add_argument("--limit", type=int, default=0, help="Limiter le nombre de SKU par catégorie (test)")
    ap.add_argument("--only", choices=list(CATEGORIES.keys()), help="Une seule catégorie")
    ap.add_argument("--download-pdfs", action="store_true", help="Conserver les PDF locaux")
    ap.add_argument("--sleep", type=float, default=0.25, help="Délai entre requêtes (s)")
    args = ap.parse_args()

    scraped = scrape_rexel_catalog(
        only=args.only,
        limit=args.limit or None,
        download_pdfs=args.download_pdfs,
        sleep=args.sleep,
    )
    if not scraped["panels"] and not scraped["inverters"]:
        print("Aucun produit récupéré : abandon.", file=sys.stderr)
        return 1
    summary = update_rexel_catalog(
        scraped,
        dry_run=args.dry_run,
        mark_missing=not (args.limit or args.only),
    )
    print(
        "Rexel · "
        f"{summary['panels']} panneaux, {summary['inverters']} onduleurs · "
        f"mises à jour: {summary['updated']} · ajouts: {summary['added']} · "
        f"disparus: {summary['missing']} · erreurs: {summary['errors']}"
        + (" · dry-run (aucune écriture)" if args.dry_run else ""),
        flush=True,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
