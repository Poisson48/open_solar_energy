#!/usr/bin/env python3
"""Met à jour les deux catalogues embarqués : batteries EVShop et matériel Rexel.

Fonctions réutilisables :
    update_all(source="all", dry_run=False, ...)

Usage:
    python3 scripts/update_all_catalogs.py                     # EVShop + Rexel complet
    python3 scripts/update_all_catalogs.py --source evshop      # batteries seulement
    python3 scripts/update_all_catalogs.py --source rexel       # Rexel seulement
    python3 scripts/update_all_catalogs.py --dry-run            # aucune écriture
    python3 scripts/update_all_catalogs.py --source rexel --limit 5 --only panels  # test

Le script EVShop régénère aussi docs/CATALOGUE-BATTERIES-EVSHOP.md et catalog.csv.
Le script Rexel fusionne dans data/rexel_catalog/catalog.json sans écraser les
champs locaux (notes, PDF, favoris) et marque les références disparues `active=false`.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(Path(__file__).resolve().parent))

from update_evshop_battery_catalog import scrape_evshop_batteries, update_evshop_catalog  # noqa: E402
from update_rexel_catalog import scrape_rexel_catalog, update_rexel_catalog  # noqa: E402


def update_all(
    source: str = "all",
    dry_run: bool = False,
    limit: int | None = None,
    only: str | None = None,
    download_pdfs: bool = False,
    sleep: float = 0.25,
    max_workers: int = 4,
) -> dict:
    """Met à jour le ou les catalogues et retourne un résumé."""
    results: dict = {}

    if source in ("all", "evshop"):
        print("\n=== EVShop batteries ===", flush=True)
        fetched = scrape_evshop_batteries(max_workers=max_workers)
        if fetched:
            results["evshop"] = update_evshop_catalog(fetched, dry_run=dry_run)
        else:
            results["evshop"] = {"error": "aucune référence récupérée"}

    if source in ("all", "rexel"):
        print("\n=== Rexel matériel ===", flush=True)
        scraped = scrape_rexel_catalog(
            only=only,
            limit=limit,
            download_pdfs=download_pdfs,
            sleep=sleep,
        )
        if scraped["panels"] or scraped["inverters"]:
            results["rexel"] = update_rexel_catalog(
                scraped,
                dry_run=dry_run,
                mark_missing=not (limit or only),
            )
        else:
            results["rexel"] = {"error": "aucun produit récupéré"}

    return results


def main() -> int:
    ap = argparse.ArgumentParser(description="Met à jour les catalogues EVShop et Rexel")
    ap.add_argument("--source", choices=["all", "evshop", "rexel"], default="all")
    ap.add_argument("--dry-run", action="store_true", help="Scrape et fusionne sans écrire")
    ap.add_argument("--limit", type=int, default=0, help="Rexel : limiter les SKU par catégorie (test)")
    ap.add_argument("--only", choices=["panels", "micro", "mono", "tri"], help="Rexel : une seule catégorie")
    ap.add_argument("--download-pdfs", action="store_true", help="Rexel : conserver les PDF locaux")
    ap.add_argument("--sleep", type=float, default=0.25, help="Rexel : délai entre requêtes (s)")
    ap.add_argument("--max-workers", type=int, default=4, help="EVShop : requêtes parallèles")
    args = ap.parse_args()

    results = update_all(
        source=args.source,
        dry_run=args.dry_run,
        limit=args.limit or None,
        only=args.only,
        download_pdfs=args.download_pdfs,
        sleep=args.sleep,
        max_workers=args.max_workers,
    )
    print("\n=== Résumé ===", flush=True)
    print(json.dumps(results, ensure_ascii=False, indent=2), flush=True)
    if any("error" in r for r in results.values()):
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
