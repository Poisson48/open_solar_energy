#!/usr/bin/env python3
"""Met à jour prix / stock / noms / URLs du catalogue EVShop sans écraser les données curatées.

Fonctions réutilisables :
    scrape_evshop_batteries()  -> dict[id] = champs scrapés
    update_evshop_catalog()    -> fusionne dans data/evshop_batteries/catalog.json

Usage:
    python3 scripts/update_evshop_battery_catalog.py            # met à jour + régénère MD/CSV
    python3 scripts/update_evshop_battery_catalog.py --dry-run  # n'écrit rien

Le script :
  1. récupère les 2 pages de la catégorie « Batteries » ;
  2. relit chaque fiche produit (JSON-LD + data-product) ;
  3. met à jour prix, prix barré, stock, nom et URL des références connues ;
  4. ajoute les nouvelles références dans la famille « À qualifier » ;
  5. marque les références disparues `active = false` (sans les supprimer) ;
  6. régénère docs/CATALOGUE-BATTERIES-EVSHOP.md et catalog.csv.
"""
from __future__ import annotations

import argparse
import html
import json
import re
import subprocess
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "evshop_batteries" / "catalog.json"
RENDER = ROOT / "scripts" / "render_evshop_battery_catalog.py"
CATEGORY = "https://evshop.fr/fr/13-batteries"
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36"


def get(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "fr-FR,fr;q=0.9"})
    with urllib.request.urlopen(req, timeout=40) as r:
        return r.read().decode("utf-8", errors="replace")


def category_items() -> dict[int, str]:
    """Retourne {id_evshop: url} pour toute la catégorie, pages incluses."""
    found: dict[int, str] = {}
    page = 1
    while page <= 20:
        url = CATEGORY if page == 1 else f"{CATEGORY}?page={page}"
        try:
            html_text = get(url)
        except Exception as e:
            print(f"  ! page {page}: {e}", file=sys.stderr)
            break
        added = 0
        for m in re.finditer(r'<script[^>]+type="application/ld\+json"[^>]*>(.*?)</script>', html_text, re.S):
            try:
                data = json.loads(m.group(1))
            except Exception:
                continue
            if not isinstance(data, dict) or data.get("@type") != "ItemList":
                continue
            for el in data.get("itemListElement", []):
                u = el.get("url", "")
                mm = re.search(r"/(\d+)-", u)
                if not mm:
                    continue
                pid = int(mm.group(1))
                if pid not in found:
                    found[pid] = u
                    added += 1
        if added == 0 or 'rel="next"' not in html_text:
            break
        page += 1
    return found


def parse_product(pid: int, url: str) -> dict | None:
    try:
        s = get(url)
    except Exception as e:
        print(f"  ! {pid}: {e}", file=sys.stderr)
        return None
    m = re.search(r'data-product="([^"]+)"', s)
    dp = {}
    if m:
        try:
            dp = json.loads(html.unescape(m.group(1)))
        except Exception:
            dp = {}
    ld = None
    for mm in re.finditer(r'<script[^>]+type="application/ld\+json"[^>]*>(.*?)</script>', s, re.S):
        try:
            x = json.loads(mm.group(1))
        except Exception:
            continue
        if isinstance(x, dict) and x.get("@type") == "Product":
            ld = x
    price = dp.get("price_amount")
    if price is None and ld:
        try:
            price = float((ld.get("offers") or {}).get("price"))
        except Exception:
            price = None
    if price is None:
        return None
    qty = dp.get("quantity", ld.get("offers", {}).get("availability") == "https://schema.org/InStock")
    try:
        qty = int(qty)
    except Exception:
        qty = 0
    return {
        "evshop_id": pid,
        "name": dp.get("name") or (ld or {}).get("name") or f"Référence {pid}",
        "url": dp.get("link") or url,
        "price_eur": float(price),
        "regular_price_eur": dp.get("price_without_reduction") or None,
        "stock_qty": qty,
        "stock_status": ("en stock (%d)" % qty) if qty > 0 else ("sur commande" if qty == 0 else "stock non limité"),
        "description": re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", html.unescape(dp.get("description", "")))).strip(),
    }


def scrape_evshop_batteries(max_workers: int = 4) -> dict[int, dict]:
    """Scrape toute la catégorie et retourne {evshop_id: champs}."""
    urls = category_items()
    print(f"{len(urls)} références dans la catégorie EVShop", flush=True)
    if not urls:
        return {}
    fetched: dict[int, dict] = {}
    with ThreadPoolExecutor(max_workers=max_workers) as ex:
        futs = {ex.submit(parse_product, pid, url): pid for pid, url in urls.items()}
        for fut in as_completed(futs):
            pid = futs[fut]
            p = fut.result()
            if p:
                fetched[pid] = p
    return fetched


def _new_item(pid: int, p: dict) -> dict:
    kwh = None
    m = re.search(r"([0-9]+(?:[.,][0-9]+)?)\s*kWh", p["name"], re.I)
    if m:
        kwh = float(m.group(1).replace(",", "."))
    return {
        "id": f"evshop_{pid}", "evshop_id": pid, "brand": "à qualifier", "model": p["name"],
        "name": p["name"], "url": p["url"],
        "price_eur": p["price_eur"], "regular_price_eur": p["regular_price_eur"],
        "stock_qty": p["stock_qty"], "stock_status": p["stock_status"],
        "family": "À qualifier", "form": "pack", "energy_kwh": kwh, "energy_usable_kwh": None,
        "voltage_nominal_v": None, "voltage_min_v": None, "voltage_max_v": None,
        "capacity_ah": None, "configuration": None, "chemistry": "à confirmer", "mass_kg": None,
        "removable": "?", "bms": "à confirmer", "voltage_estimated": True,
        "eur_per_kwh": round(p["price_eur"] / kwh, 1) if kwh else None,
        "eur_per_kwh_usable": None, "architecture": "à qualifier",
        "notes": ["Nouvelle référence détectée automatiquement : qualifier tension, configuration et BMS"],
        "description": p.get("description", ""), "scraped_at": "auto",
        "charger": "À qualifier", "inverter": "À qualifier",
        "bms_recommendation": "À qualifier", "protection": "À qualifier",
        "verdict": "À qualifier", "battery_emulator": "à qualifier",
        "charger_short": "À qualifier", "inverter_short": "À qualifier",
        "active": True,
    }


def update_evshop_catalog(fetched: dict[int, dict] | None = None, dry_run: bool = False) -> dict:
    """Fusionne un scrape EVShop dans le catalogue existant."""
    if fetched is None:
        raise ValueError("fetched est requis")
    if DATA.exists():
        root = json.loads(DATA.read_text(encoding="utf-8"))
    else:
        root = {"source": CATEGORY, "items": []}
    root.setdefault("items", [])
    items = root["items"]
    by_id = {x["evshop_id"]: x for x in items}
    updated = added = 0

    for pid, p in fetched.items():
        x = by_id.get(pid)
        if not x:
            items.append(_new_item(pid, p))
            added += 1
            continue
        changed = False
        for key in ("name", "url", "price_eur", "regular_price_eur", "stock_qty", "stock_status", "description"):
            if p.get(key) not in (None, "") and x.get(key) != p[key]:
                x[key] = p[key]
                changed = True
        if x.get("energy_kwh"):
            x["eur_per_kwh"] = round(x["price_eur"] / x["energy_kwh"], 1)
            e = x.get("energy_usable_kwh") or x["energy_kwh"]
            x["eur_per_kwh_usable"] = round(x["price_eur"] / e, 1)
        if changed:
            updated += 1
        x["active"] = True
        x["scraped_at"] = "auto"

    missing = 0
    for pid, x in by_id.items():
        if pid not in fetched:
            x["active"] = False
            missing += 1

    summary = {"fetched": len(fetched), "updated": updated, "added": added, "missing": missing, "total": len(items)}
    print(
        f"EVShop · mises à jour: {updated} · ajouts: {added} · disparues: {missing} · total: {len(items)}"
        + (" · dry-run (aucune écriture)" if dry_run else ""),
        flush=True,
    )
    if dry_run:
        return summary

    root["items"] = items
    root["count"] = len(items)
    root["scraped_at"] = "auto"
    DATA.parent.mkdir(parents=True, exist_ok=True)
    DATA.write_text(json.dumps(root, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    subprocess.run([sys.executable, str(RENDER)], check=True)
    return summary


def main() -> int:
    ap = argparse.ArgumentParser(description="Met à jour data/evshop_batteries/catalog.json")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--max-workers", type=int, default=4)
    args = ap.parse_args()

    fetched = scrape_evshop_batteries(max_workers=args.max_workers)
    if not fetched:
        print("Aucune référence récupérée : abandon.", file=sys.stderr)
        return 1
    update_evshop_catalog(fetched, dry_run=args.dry_run)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
