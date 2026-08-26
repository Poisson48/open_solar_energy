#!/usr/bin/env python3
"""
Scrape le catalogue photovoltaïque Rexel France (modules + onduleurs)
et produit data/rexel_catalog.json + PDF locaux optionnels.

Usage:
  python3 scripts/scrape_rexel_catalog.py
  python3 scripts/scrape_rexel_catalog.py --download-pdfs
  python3 scripts/scrape_rexel_catalog.py --limit 5   # smoke test

Respecte un délai entre requêtes. Données publiques SSR / API anonyme Rexel.
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "data" / "rexel_catalog"
OUT_JSON = OUT_DIR / "catalog.json"
PDF_DIR = OUT_DIR / "pdfs"

UA = "OpenSolarEnergyCatalogBot/1.0 (+https://github.com/Poisson48/open_solar_energy; educational)"
BFF = "https://eu.dif.rexel.com"
SITE = "https://www.rexel.fr"

CATEGORIES = {
    "panels": {
        "kind": "panel",
        "code": "M2_140201",
        "url": (
            f"{SITE}/frx/Cat%C3%A9gorie/Production-d%27%C3%A9nergie---Photovolta%C3%AFque/"
            "Module-photovolta%C3%AFque/Module-rigide/c/M2_140201"
        ),
    },
    "micro": {
        "kind": "inverter",
        "type": "micro",
        "phase": 1,
        "code": "M2_140301",
        "url": (
            f"{SITE}/frx/Cat%C3%A9gorie/Production-d%27%C3%A9nergie---Photovolta%C3%AFque/"
            "Conversion-d%27%C3%A9nergie-PV-et-onduleur/Micro-onduleur-PV/c/M2_140301"
        ),
    },
    "mono": {
        "kind": "inverter",
        "type": "string",
        "phase": 1,
        "code": "M2_140302",
        "url": (
            f"{SITE}/frx/Cat%C3%A9gorie/Production-d%27%C3%A9nergie---Photovolta%C3%AFque/"
            "Conversion-d%27%C3%A9nergie-PV-et-onduleur/Onduleur-monophas%C3%A9-PV/c/M2_140302"
        ),
    },
    "tri": {
        "kind": "inverter",
        "type": "string",
        "phase": 3,
        "code": "M2_140303",
        "url": (
            f"{SITE}/frx/Cat%C3%A9gorie/Production-d%27%C3%A9nergie---Photovolta%C3%AFque/"
            "Conversion-d%27%C3%A9nergie-PV-et-onduleur/Onduleur-triphas%C3%A9-PV/c/M2_140303"
        ),
    },
}

SLEEP = 0.25


def log(msg: str) -> None:
    print(msg, flush=True)


def http_get(url: str, accept: str = "text/html,application/json") -> bytes:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": UA,
            "Accept": accept,
            "Accept-Language": "fr-FR,fr;q=0.9",
            "Content-Language": "fr",
            "x-banner": "frx",
            "x-client-name": "frx",
            "Origin": SITE,
            "Referer": SITE + "/",
        },
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        return resp.read()


def http_get_json(url: str) -> dict:
    raw = http_get(url, accept="application/json")
    return json.loads(raw.decode("utf-8"))


def list_skus(category_url: str, limit: int | None = None) -> list[str]:
    skus: list[str] = []
    seen: set[str] = set()
    page = 1
    while page <= 40:
        url = category_url if page == 1 else f"{category_url}?page={page}"
        html = http_get(url).decode("utf-8", "ignore")
        found = sorted(set(re.findall(r"/p/(\d{5,})", html)))
        new = [s for s in found if s not in seen]
        if not new:
            break
        for s in new:
            seen.add(s)
            skus.append(s)
            if limit and len(skus) >= limit:
                return skus
        page += 1
        time.sleep(SLEEP)
    return skus


def parse_ng_product(html: str) -> dict | None:
    m = re.search(r'id="ng-state"[^>]*>(.*?)</script>', html, re.S)
    if not m:
        return None
    try:
        data = json.loads(m.group(1))
    except json.JSONDecodeError:
        return None
    return data.get("pdp.product")


def attr_map(product: dict) -> dict[str, str]:
    out = {}
    for a in product.get("attributes") or []:
        name = (a.get("featureName") or "").strip()
        val = a.get("value")
        if name and val is not None:
            unit = a.get("unitSymbol") or ""
            out[name] = f"{val} {unit}".strip() if unit else str(val)
            out[name + "|raw"] = str(val)
            if unit:
                out[name + "|unit"] = unit
    return out


def parse_fr_float(s: str | None) -> float | None:
    if s is None:
        return None
    t = str(s).strip().replace("\u00a0", " ").replace(" ", "")
    t = t.replace(",", ".")
    t = re.sub(r"[^0-9.\-+]", "", t)
    if not t or t in "+-.":
        return None
    try:
        return float(t)
    except ValueError:
        return None


def dims_from_attr(attrs: dict) -> tuple[float | None, float | None]:
    raw = attrs.get("Dimension standardisée|raw") or attrs.get("Dimension standardisée") or ""
    # formats: 1,76*1,13*0,30  or 1762×1134×30
    raw = raw.replace(",", ".")
    m = re.search(r"([\d.]+)\s*[x×*]\s*([\d.]+)", raw, re.I)
    if not m:
        return None, None
    a, b = float(m.group(1)), float(m.group(2))
    # if looks like mm
    if a > 20 and b > 20:
        return round(a / 1000, 4), round(b / 1000, 4)
    return round(a, 4), round(b, 4)


def dims_from_description(desc: str) -> tuple[float | None, float | None]:
    m = re.search(r"Dimensions?\s*\(mm\)\s*([\d.,]+)\s*[x×]\s*([\d.,]+)", desc, re.I)
    if not m:
        m = re.search(r"([\d]{3,4})\s*[x×]\s*([\d]{3,4})\s*[x×]\s*([\d]{1,3})", desc)
    if not m:
        return None, None
    a = parse_fr_float(m.group(1))
    b = parse_fr_float(m.group(2))
    if a and b and a > 20:
        return round(a / 1000, 4), round(b / 1000, 4)
    return a, b


def pick_datasheet(assets: list[dict]) -> dict | None:
    """Préfère « Fiche produit », puis Notice, puis premier PDF."""
    pdfs = [a for a in assets if (a.get("mime") or a.get("contentType") or "").lower() == "application/pdf"]
    if not pdfs:
        return None

    def url_of(a: dict) -> str | None:
        for u in a.get("url") or []:
            if u.get("template") == "DOCUMENTS" or (u.get("url") or "").startswith("http"):
                return u.get("url")
        return None

    for purpose in ("Fiche produit", "Notice", "Documentation technique", "Technical documentation"):
        for a in pdfs:
            if (a.get("MIME_PURPOSE") or "") == purpose:
                url = url_of(a)
                if url:
                    return {"purpose": purpose, "url": url, "code": a.get("MIME_PURPOSE_CODE")}
    a = pdfs[0]
    url = url_of(a)
    if not url:
        return None
    return {"purpose": a.get("MIME_PURPOSE") or "PDF", "url": url, "code": a.get("MIME_PURPOSE_CODE")}


def extract_elec_from_pdf_text(text: str, target_wp: float | None) -> dict:
    """Extrait Voc/Isc/Vmp/Imp (+ coef) depuis une fiche fabricant multi-colonnes."""
    out: dict = {}
    lines = text.splitlines()

    def nums(line: str) -> list[float]:
        vals = []
        for m in re.finditer(r"[-+]?\d+[.,]?\d*", line):
            v = parse_fr_float(m.group(0))
            if v is not None:
                vals.append(v)
        return vals

    # Find STC table rows
    row_map = {
        "pmax": re.compile(r"Puissance Maximale\s*\(Pmax", re.I),
        "imp": re.compile(r"Courant de Puissance Maximale\s*\(Imp", re.I),
        "vmp": re.compile(r"Tension de Puissance Maximale\s*\(Vmp", re.I),
        "isc": re.compile(r"Courant de Court-Circuit\s*\(Isc", re.I),
        "voc": re.compile(r"Tension en Circuit Ouvert\s*\(Voc", re.I),
    }
    table: dict[str, list[float]] = {}
    for line in lines:
        for key, rx in row_map.items():
            if rx.search(line) and key not in table:
                table[key] = nums(line)
                break

    col = 0
    if target_wp and "pmax" in table and table["pmax"]:
        # columns often alternate STC / NMOT — take even indices for STC
        pmax = table["pmax"]
        stc_cols = list(range(0, len(pmax), 2)) if len(pmax) >= 4 else list(range(len(pmax)))
        best_i, best_d = 0, 1e9
        for i in stc_cols:
            d = abs(pmax[i] - target_wp)
            if d < best_d:
                best_d, best_i = d, i
        col = best_i

    def pick(key: str) -> float | None:
        vals = table.get(key) or []
        if not vals:
            return None
        if col < len(vals):
            return vals[col]
        return vals[0]

    for k, dst in (("voc", "voc"), ("isc", "isc"), ("vmp", "vmp"), ("imp", "imp")):
        v = pick(k)
        if v is not None:
            out[dst] = v

    for line in lines:
        if re.search(r"Coefficient de Température de Pmax", line, re.I):
            ns = nums(line)
            if ns:
                out["coef_temp"] = ns[0]
                break
    return out


def download_pdf(url: str, dest: Path) -> bool:
    try:
        data = http_get(url, accept="application/pdf,*/*")
        if not data.startswith(b"%PDF"):
            return False
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(data)
        return True
    except Exception as e:
        print(f"  PDF fail {url}: {e}", file=sys.stderr)
        return False


def fetch_product(sku: str, meta: dict, download_pdfs: bool) -> dict | None:
    pdp_url = f"{SITE}/frx/p/{sku}"
    try:
        html = http_get(pdp_url).decode("utf-8", "ignore")
    except Exception as e:
        print(f"  PDP fail {sku}: {e}", file=sys.stderr)
        return None
    product = parse_ng_product(html)
    if not product:
        # fallback API (sans attributes)
        try:
            product = http_get_json(f"{BFF}/web/api/v1/products/{sku}")
        except Exception as e:
            print(f"  API fail {sku}: {e}", file=sys.stderr)
            return None

    attrs = attr_map(product)
    manufacturer = (product.get("manufacturer") or {}).get("name") or (product.get("brand") or {}).get("name") or ""
    model_id = (product.get("manufacturer") or {}).get("productId") or (product.get("brand") or {}).get("productId") or ""
    name = product.get("name") or ""
    model = (model_id or name).strip()
    desc = ""
    d = product.get("description") or {}
    if isinstance(d, dict):
        desc = (d.get("longDescription") or "") + "\n" + (d.get("shortDescription") or "")
    desc = re.sub(r"<[^>]+>", " ", desc)

    # documents
    datasheet = None
    try:
        dam = http_get_json(f"{BFF}/web/api/v1/dam/products/assets/{sku}")
        datasheet = pick_datasheet(dam.get("assets") or [])
    except Exception as e:
        print(f"  DAM fail {sku}: {e}", file=sys.stderr)

    entry: dict = {
        "sku": sku,
        "rexelPartNumber": product.get("rexelPartNumber") or "",
        "name": name,
        "model": model,
        "fabricant": manufacturer,
        "brand": (product.get("brand") or {}).get("name") or manufacturer,
        "url": product.get("webshopUrl") or pdp_url,
        "attributes": {k: v for k, v in attrs.items() if not k.endswith("|raw") and not k.endswith("|unit")},
        "datasheetUrl": (datasheet or {}).get("url"),
        "datasheetPurpose": (datasheet or {}).get("purpose"),
        "source": "rexel",
        "categoryCode": meta.get("code"),
    }

    if meta["kind"] == "panel":
        wp = parse_fr_float(attrs.get("Puissance MPP|raw") or attrs.get("Puissance MPP"))
        if wp is None:
            m = re.search(r"(\d{3,4})\s*W[pc]?", name + " " + desc, re.I)
            wp = float(m.group(1)) if m else None
        if wp is None:
            m = re.search(r"(?:^|[^\d])(\d{3,4})\s*(?:Wc|WP|Wc\b)", name, re.I)
            if m:
                wp = float(m.group(1))
        if wp is None:
            m = re.search(r"(?:DM|TSM|JKM|LR|VSMP|VSMS)[^\d]*(\d{3})", model + name, re.I)
            if m:
                wp = float(m.group(1))
        largeur, hauteur = dims_from_attr(attrs)
        if not largeur:
            largeur, hauteur = dims_from_description(desc)
        bifacial = "bifac" in (attrs.get("Bifacial") or "").lower() or "bifac" in desc.lower()
        tech_raw = (attrs.get("Matériau de la cellule") or attrs.get("Technologie cellule") or "mono").lower()
        tech = "mono"
        if "poly" in tech_raw:
            tech = "poly"
        elif bifacial or "bifac" in tech_raw:
            tech = "bifacial"
        elif "half" in tech_raw:
            tech = "half-cut"

        garantie = None
        gm = re.search(r"(\d+)\s*ans?\s+de\s+garantie", desc, re.I)
        if gm:
            garantie = int(gm.group(1))

        entry.update(
            {
                "kind": "panel",
                "wp": wp,
                "largeur": largeur,
                "hauteur": hauteur,
                "tech": tech,
                "bifacial": bifacial,
                "garantie_p": garantie,
            }
        )

        # PDF → Voc/Isc/Vmp/Imp (téléchargement temporaire sauf --download-pdfs)
        if datasheet and datasheet.get("url"):
            PDF_DIR.mkdir(parents=True, exist_ok=True)
            pdf_path = PDF_DIR / f"{sku}.pdf"
            ok = pdf_path.exists() or download_pdf(datasheet["url"], pdf_path)
            if ok and pdf_path.exists():
                try:
                    text = subprocess.check_output(
                        ["pdftotext", "-layout", "-f", "1", "-l", "3", str(pdf_path), "-"],
                        text=True,
                        errors="ignore",
                        timeout=30,
                        stderr=subprocess.DEVNULL,
                    )
                    elec = extract_elec_from_pdf_text(text, wp)
                    entry.update(elec)
                except Exception as e:
                    print(f"  pdftotext fail {sku}: {e}", file=sys.stderr)
                if download_pdfs:
                    entry["datasheetLocal"] = f"data/rexel_catalog/pdfs/{sku}.pdf"
                else:
                    try:
                        pdf_path.unlink(missing_ok=True)
                    except Exception:
                        pass

    else:
        # inverter
        pnom = None
        for key in ("Puissance nominale", "Puissance AC", "Puissance de sortie", "Puissance"):
            if key in attrs or f"{key}|raw" in attrs:
                pnom = parse_fr_float(attrs.get(f"{key}|raw") or attrs.get(key))
                break
        if pnom is None:
            m = re.search(r"(\d+[.,]?\d*)\s*kW", name + " " + desc, re.I)
            if m:
                pnom = parse_fr_float(m.group(1))
            else:
                m = re.search(r"(\d{3,5})\s*VA", name + " " + desc, re.I)
                if m:
                    pnom = parse_fr_float(m.group(1))
                    if pnom:
                        pnom = pnom / 1000.0
        # if still large like 6000 assume W
        if pnom and pnom > 100:
            pnom = pnom / 1000.0

        n_mppt = None
        for key in ("Nombre de MPPT", "Nb MPPT", "MPPT"):
            v = attrs.get(f"{key}|raw") or attrs.get(key)
            if v:
                n_mppt = int(parse_fr_float(v) or 0) or None
                break
        if n_mppt is None:
            m = re.search(r"(\d+)\s*MPPT", name + " " + desc, re.I)
            if m:
                n_mppt = int(m.group(1))

        inv_type = meta.get("type") or "string"
        if re.search(r"hybride|hybrid", name + " " + desc, re.I):
            inv_type = "hybrid"

        entry.update(
            {
                "kind": "inverter",
                "type": inv_type,
                "phase": meta.get("phase") or 1,
                "pnom": pnom,
                "nMppt": n_mppt,
            }
        )

        if datasheet and datasheet.get("url") and download_pdfs:
            pdf_path = PDF_DIR / f"{sku}.pdf"
            if download_pdf(datasheet["url"], pdf_path):
                entry["datasheetLocal"] = f"data/rexel_catalog/pdfs/{sku}.pdf"

    return entry


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--download-pdfs", action="store_true", help="Conserver les PDF locaux (lourds)")
    ap.add_argument("--limit", type=int, default=0, help="Limiter le nb de SKU par catégorie (test)")
    ap.add_argument("--only", choices=list(CATEGORIES.keys()), help="Une seule catégorie")
    args = ap.parse_args()
    limit = args.limit or None

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    if args.download_pdfs:
        PDF_DIR.mkdir(parents=True, exist_ok=True)

    panels: list[dict] = []
    inverters: list[dict] = []
    errors = 0

    cats = {args.only: CATEGORIES[args.only]} if args.only else CATEGORIES
    for cat_name, meta in cats.items():
        log(f"== Listing {cat_name} …")
        skus = list_skus(meta["url"], limit=limit)
        log(f"   {len(skus)} SKUs")
        for i, sku in enumerate(skus, 1):
            log(f"   [{i}/{len(skus)}] {sku}")
            try:
                entry = fetch_product(sku, meta, download_pdfs=args.download_pdfs)
            except Exception as e:
                print(f"   ERR {sku}: {e}", file=sys.stderr, flush=True)
                errors += 1
                entry = None
            time.sleep(SLEEP)
            if not entry:
                errors += 1
                continue
            if entry.get("kind") == "panel":
                if entry.get("wp"):
                    panels.append(entry)
                else:
                    log(f"   skip panel sans Wc: {sku}")
            else:
                inverters.append(entry)
            if (i % 10) == 0:
                OUT_JSON.write_text(
                    json.dumps(
                        {
                            "source": "rexel.fr",
                            "scrapedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                            "panels": panels,
                            "inverters": inverters,
                            "stats": {"panels": len(panels), "inverters": len(inverters), "errors": errors, "partial": True},
                        },
                        ensure_ascii=False,
                        indent=2,
                    ),
                    encoding="utf-8",
                )
                log(f"   … checkpoint {len(panels)} panels / {len(inverters)} inverters")

    catalog = {
        "source": "rexel.fr",
        "scrapedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "panels": panels,
        "inverters": inverters,
        "stats": {
            "panels": len(panels),
            "inverters": len(inverters),
            "errors": errors,
        },
    }
    OUT_JSON.write_text(json.dumps(catalog, ensure_ascii=False, indent=2), encoding="utf-8")
    log(f"Wrote {OUT_JSON} — {len(panels)} panels, {len(inverters)} inverters, {errors} errors")
    return 0 if panels or inverters else 1


if __name__ == "__main__":
    raise SystemExit(main())
