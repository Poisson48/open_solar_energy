#!/usr/bin/env python3
"""Télécharge les fiches PDF des onduleurs du catalogue Rexel.

Les PDF sont stockés dans data/rexel_catalog/pdfs/ (dossier ignoré par Git).
Le catalogue est mis à jour avec `datasheetLocal` et un index CSV est généré.

Usage:
    python3 scripts/download_rexel_inverter_datasheets.py --dry-run
    python3 scripts/download_rexel_inverter_datasheets.py --limit 5
    python3 scripts/download_rexel_inverter_datasheets.py --only-hybrid
    python3 scripts/download_rexel_inverter_datasheets.py --resolve-missing
"""
from __future__ import annotations

import argparse
import csv
import json
import re
import sys
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "rexel_catalog" / "catalog.json"
PDF_DIR = ROOT / "data" / "rexel_catalog" / "pdfs"
INDEX = ROOT / "data" / "rexel_catalog" / "inverter_datasheets.csv"

sys.path.insert(0, str(Path(__file__).resolve().parent))
from scrape_rexel_catalog import CATEGORIES, fetch_product  # noqa: E402

UA = "OpenSolarEnergyCatalogBot/1.0 (+https://github.com/Poisson48/open_solar_energy; educational)"


def log(msg: str) -> None:
    print(msg, flush=True)


def now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def safe_name(sku: str) -> str:
    return re.sub(r"[^0-9A-Za-z._-]+", "_", sku)[:120] or "onduleur"


def get_pdf(url: str, timeout: int = 60) -> bytes | None:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": UA,
            "Accept": "application/pdf,*/*",
            "Accept-Language": "fr-FR,fr;q=0.9",
        },
    )
    with urllib.request.urlopen(req, timeout=timeout) as r:
        data = r.read()
    if not data.startswith(b"%PDF"):
        return None
    return data


def is_valid_pdf(path: Path) -> bool:
    try:
        with path.open("rb") as f:
            head = f.read(4)
        return head == b"%PDF" and path.stat().st_size > 2048
    except Exception:
        return False


def meta_for(inv: dict) -> dict:
    if (inv.get("type") or "") == "micro":
        return CATEGORIES["micro"]
    if int(inv.get("phase") or 1) == 3:
        return CATEGORIES["tri"]
    return CATEGORIES["mono"]


def resolve_datasheet_url(inv: dict) -> str:
    if inv.get("datasheetUrl"):
        return inv["datasheetUrl"]
    sku = str(inv.get("sku") or "")
    if not sku:
        return ""
    try:
        entry = fetch_product(sku, meta_for(inv), download_pdfs=False)
    except Exception as e:
        log(f"  ! résolution {sku}: {e}")
        return ""
    if not entry:
        return ""
    url = entry.get("datasheetUrl") or ""
    if url:
        inv["datasheetUrl"] = url
        inv["datasheetPurpose"] = entry.get("datasheetPurpose") or inv.get("datasheetPurpose")
    return url


def write_index(inverters: list[dict]) -> None:
    fields = ["sku", "brand", "name", "type", "phase", "pnom", "datasheetUrl", "datasheetLocal", "datasheetBytes", "status"]
    with INDEX.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields, delimiter=";", extrasaction="ignore")
        w.writeheader()
        for inv in inverters:
            local = inv.get("datasheetLocal") or ""
            status = "ok" if local and (ROOT / local).exists() else ("manquant" if not inv.get("datasheetUrl") else "à télécharger")
            w.writerow({
                "sku": inv.get("sku"),
                "brand": inv.get("brand") or inv.get("fabricant"),
                "name": inv.get("name"),
                "type": inv.get("type"),
                "phase": inv.get("phase"),
                "pnom": inv.get("pnom"),
                "datasheetUrl": inv.get("datasheetUrl"),
                "datasheetLocal": local,
                "datasheetBytes": inv.get("datasheetBytes"),
                "status": status,
            })


def main() -> int:
    ap = argparse.ArgumentParser(description="Télécharge les PDF des onduleurs Rexel")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--only-hybrid", action="store_true")
    ap.add_argument("--only-missing", action="store_true", help="Uniquement les PDF absents")
    ap.add_argument("--resolve-missing", action="store_true", help="Re-scraper les onduleurs sans datasheetUrl")
    ap.add_argument("--force", action="store_true", help="Retélécharger même si le PDF existe")
    ap.add_argument("--sleep", type=float, default=0.15)
    args = ap.parse_args()

    if not DATA.exists():
        print(f"Catalogue absent : {DATA}", file=sys.stderr)
        return 1
    root = json.loads(DATA.read_text(encoding="utf-8"))
    inverters = root.get("inverters", [])
    if args.only_hybrid:
        inverters = [x for x in inverters if (x.get("type") or "") == "hybrid"]
    if args.limit:
        inverters = inverters[: args.limit]
    PDF_DIR.mkdir(parents=True, exist_ok=True)

    todo = []
    for inv in inverters:
        url = inv.get("datasheetUrl") or ""
        if not url and args.resolve_missing:
            url = resolve_datasheet_url(inv)
        local = inv.get("datasheetLocal") or ""
        path = ROOT / local if local else PDF_DIR / f"{safe_name(str(inv.get('sku') or ''))}.pdf"
        exists = path.exists() and is_valid_pdf(path)
        if exists and not args.force:
            inv["datasheetLocal"] = str(path.relative_to(ROOT))
            inv["datasheetBytes"] = path.stat().st_size
            continue
        if not url:
            continue
        if args.only_missing and exists:
            continue
        todo.append((inv, url, path))

    log(f"{len(inverters)} onduleurs examinés · {len(todo)} PDF à télécharger")
    ok = fail = skipped = 0
    for i, (inv, url, path) in enumerate(todo, 1):
        sku = str(inv.get("sku") or "?")
        if args.dry_run:
            log(f"   [{i}/{len(todo)}] {sku} → {path.name} (dry-run)")
            skipped += 1
            continue
        data = None
        for attempt in range(1, 4):
            try:
                data = get_pdf(url)
                if data:
                    break
                log(f"   [{i}/{len(todo)}] {sku} : réponse non-PDF")
                break
            except Exception as e:
                log(f"   [{i}/{len(todo)}] {sku} : essai {attempt}/3 — {e}")
                time.sleep(1.0 * attempt)
        if data:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
            inv["datasheetLocal"] = str(path.relative_to(ROOT))
            inv["datasheetBytes"] = len(data)
            inv["datasheetDownloadedAt"] = now()
            ok += 1
            log(f"   [{i}/{len(todo)}] {sku} → {path.name} ({len(data)//1024} Ko)")
        else:
            fail += 1
            log(f"   [{i}/{len(todo)}] {sku} : ÉCHEC")
        if i % 10 == 0:
            root["inverters"] = root.get("inverters", [])
            if not args.dry_run:
                DATA.write_text(json.dumps(root, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
                write_index(root["inverters"])
        time.sleep(args.sleep)

    if not args.dry_run:
        root["datasheetsUpdatedAt"] = now()
        DATA.write_text(json.dumps(root, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        write_index(root.get("inverters", []))
    log(f"PDF téléchargés: {ok} · échecs: {fail} · ignorés: {skipped} · index: {INDEX.relative_to(ROOT)}")
    return 0 if fail == 0 else 2


if __name__ == "__main__":
    raise SystemExit(main())
