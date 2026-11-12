#!/usr/bin/env python3
"""Enrichit les onduleurs Rexel depuis leurs fiches PDF locales.

Extrait les caractéristiques électriques utilisées par le contrôle de
compatibilité : Vmax DC, plage MPPT, courant d'entrée max, nombre de MPPT,
plage de tension batterie, puissance d'entrée max.

Usage:
    python3 scripts/enrich_rexel_inverter_specs.py --dry-run --limit 5
    python3 scripts/enrich_rexel_inverter_specs.py
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "rexel_catalog" / "catalog.json"
sys.path.insert(0, str(Path(__file__).resolve().parent))
from scrape_rexel_catalog import attr_map, http_get, parse_ng_product  # noqa: E402


def now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def clean(s: str) -> str:
    return (s.replace("\u00a0", " ").replace("\u202f", " ")
             .replace("\u2019", "'").replace("\u2018", "'")
             .replace("\u2013", "-").replace("\u2014", "-")
             .replace("\u2212", "-"))


def pdf_text(path: Path, pages: int = 2) -> str:
    try:
        return clean(subprocess.check_output(
            ["pdftotext", "-layout", "-f", "1", "-l", str(pages), str(path), "-"],
            text=True, errors="ignore", timeout=20, stderr=subprocess.DEVNULL))
    except Exception:
        return ""


def line_with(text: str, *needles: str) -> str:
    low = text.lower()
    for raw in text.splitlines():
        l = raw.lower()
        if all(n.lower() in l for n in needles):
            return raw
    return ""


def nums(s: str) -> list[float]:
    out = []
    for m in re.finditer(r"(?<![A-Za-z])(\d+(?:[.,]\d+)?)", s):
        try:
            out.append(float(m.group(1).replace(",", ".")))
        except ValueError:
            pass
    return out


def first_range(line: str) -> tuple[float, float] | None:
    m = re.search(r"(\d{2,4}(?:[.,]\d+)?)\s*(?:~|\.{2,3}|-|a|à|to)\s*(\d{2,4}(?:[.,]\d+)?)", line)
    if not m:
        return None
    a = float(m.group(1).replace(",", "."))
    b = float(m.group(2).replace(",", "."))
    return (a, b) if a < b else None


def extract(text: str, inv: dict) -> dict:
    out: dict = {}
    # Vmax DC
    for labels in (
        ("Tension", "entrée", "max"),
        ("Tension", "PV", "max"),
        ("Tension", "DC", "max"),
        ("Max.", "input", "voltage"),
        ("Maximum", "input", "voltage"),
    ):
        line = line_with(text, *labels)
        if line:
            vals = [v for v in nums(line) if 100 <= v <= 1500]
            if vals:
                out["maxInputV"] = max(vals)
                break
    # Plage MPPT
    for labels in (
        ("Plage", "MPP"),
        ("MPP", "voltage"),
        ("Tension", "MPP"),
    ):
        line = line_with(text, *labels)
        if line:
            r = first_range(line)
            if r and 30 <= r[0] < r[1] <= 1500:
                out["mpptMinV"], out["mpptMaxV"] = r
                break
    # Courant d'entrée max
    for labels in (
        ("Courant", "entrée", "max"),
        ("courant", "entrée", "CC", "max"),
        ("Max.", "input", "current"),
        ("Max", "input", "current"),
    ):
        line = line_with(text, *labels)
        if line:
            vals = [v for v in nums(line) if 1 <= v <= 100]
            if vals:
                out["maxInputI"] = vals[0]
                break
    # Nombre de MPPT
    line = line_with(text, "Nombre", "trackers", "MPP")
    if not line:
        m = re.search(r"(\d+)\s*MPPT", text, re.I)
        if m:
            out["nMppt"] = int(m.group(1))
    else:
        vals = [int(v) for v in nums(line) if 1 <= v <= 12]
        if vals:
            out["nMppt"] = vals[0]
    # Puissance d'entrée max
    line = line_with(text, "Puissance", "entrée", "max")
    if line:
        vals = [v for v in nums(line) if 0.5 <= v <= 100]
        if vals:
            out["maxInputPowerKw"] = vals[0]
    # Plage batterie
    for labels in (
        ("Plage", "tension", "batterie"),
        ("Plage", "tensions", "batterie"),
        ("Battery", "voltage", "range"),
    ):
        line = line_with(text, *labels)
        if line:
            r = first_range(line)
            if r and 20 <= r[0] < r[1] <= 1200:
                out["batteryMinV"], out["batteryMaxV"] = r
                break
    # Type batterie / hybride
    if not inv.get("type"):
        if re.search(r"batterie|battery", text, re.I):
            out["type"] = "hybrid"
    return out


def fetch_attrs(sku: str) -> dict:
    try:
        html = http_get(f"https://www.rexel.fr/frx/p/{sku}").decode("utf-8", "ignore")
        product = parse_ng_product(html)
        return attr_map(product) if product else {}
    except Exception:
        return {}


def map_attrs(attrs: dict) -> dict:
    out: dict = {}
    lower = {str(k).lower(): v for k, v in attrs.items()}

    def attr(*needles: str) -> str:
        for k, v in lower.items():
            if all(n.lower() in k for n in needles):
                return str(v)
        return ""

    # Puissance nominale AC
    for keys in (("puissance", "nominale", "sortie"), ("puissance", "ac"), ("puissance", "nominale")):
        raw = attr(*keys)
        if raw:
            v = nums(raw)
            if v:
                p = v[0]
                out["pnom"] = round(p / 1000.0, 3) if p > 100 else p
                break
    # Vmax DC
    for keys in (("tension", "entrée", "dc", "max"), ("tension", "entrée", "max"),
                 ("tension", "pv", "max"), ("tension", "dc", "max")):
        raw = attr(*keys)
        if raw:
            v = [x for x in nums(raw) if 100 <= x <= 1500]
            if v:
                out["maxInputV"] = max(v)
                break
    # Plage MPPT
    for keys in (("plage", "tension", "mpp"), ("plage", "mpp"), ("tension", "mpp", "nominale")):
        raw = attr(*keys)
        if raw:
            r = first_range(raw)
            if r and 30 <= r[0] < r[1] <= 1500:
                out["mpptMinV"], out["mpptMaxV"] = r
                break
    # Courant max par MPPT / entrée
    for keys in (("courant", "entrée", "max", "tracker"), ("courant", "entrée", "dc", "max"),
                 ("courant", "entrée", "max"), ("courant", "court-circuit", "max", "mppt")):
        raw = attr(*keys)
        if raw:
            v = [x for x in nums(raw) if 1 <= x <= 100]
            if v:
                out["maxInputI"] = v[0]
                break
    # Nombre MPPT
    raw = attr("nombre", "trackers", "mpp") or attr("nombre", "mppt")
    if raw:
        v = [int(x) for x in nums(raw) if 1 <= x <= 12]
        if v:
            out["nMppt"] = v[0]
    # Puissance DC max
    raw = attr("puissance", "entrée", "max")
    if raw:
        v = [x for x in nums(raw) if 0.5 <= x <= 100000]
        if v:
            out["maxInputPowerKw"] = round(v[0] / 1000.0, 2) if v[0] > 100 else v[0]
    # Batterie
    for keys in (("plage", "tension", "batterie"), ("plage", "tensions", "batterie")):
        raw = attr(*keys)
        if raw:
            r = first_range(raw)
            if r and 20 <= r[0] < r[1] <= 1200:
                out["batteryMinV"], out["batteryMaxV"] = r
                break
    # Phase
    raw = attr("surveillance", "réseau")
    if "triphas" in raw.lower():
        out["phase"] = 3
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--no-attributes", action="store_true", help="Ne pas relire les attributs Rexel")
    ap.add_argument("--no-pdf", action="store_true", help="Ne pas analyser les PDF")
    ap.add_argument("--pdf-only", action="store_true", help="Uniquement les PDF (pas d'attributs Rexel)")
    ap.add_argument("--max-pdf-mb", type=float, default=20.0, help="Ignorer les PDF plus gros que cette taille (Mo)")
    args = ap.parse_args()
    if args.pdf_only:
        args.no_attributes = True
    root = json.loads(DATA.read_text(encoding="utf-8"))
    inverters = root.get("inverters", [])
    todo = inverters
    if args.limit:
        todo = todo[: args.limit]
    print(f"{len(todo)} onduleurs à analyser", flush=True)
    updated = found = 0
    for i, inv in enumerate(todo, 1):
        specs: dict = {}
        if not args.no_attributes:
            attrs = fetch_attrs(str(inv.get("sku") or ""))
            if attrs:
                specs.update(map_attrs(attrs))
                inv["attributes"] = {k: v for k, v in attrs.items()
                                     if not k.endswith("|raw") and not k.endswith("|unit")}
        # Les attributs Rexel sont souvent suffisants et bien plus rapides.
        # On n'ouvre le PDF que s'il manque une donnée structurante.
        need_pdf = (not specs.get("maxInputV") or not specs.get("maxInputI")
                    or not specs.get("nMppt")
                    or (str(inv.get("type")) == "hybrid" and not specs.get("batteryMinV")))
        if not args.no_pdf and need_pdf and inv.get("datasheetLocal"):
            path = ROOT / inv["datasheetLocal"]
            if path.exists() and path.stat().st_size <= args.max_pdf_mb * 1024 * 1024:
                pdf_specs = extract(pdf_text(path), inv)
                for k, v in pdf_specs.items():
                    specs.setdefault(k, v)
        if specs:
            found += 1
            before = {k: inv.get(k) for k in specs}
            if not args.dry_run:
                inv.update(specs)
                sources = set(str(inv.get("specsSource") or "").split("+"))
                sources.discard("")
                if not args.no_attributes and inv.get("attributes"):
                    sources.add("rexel-attributes")
                if not args.no_pdf and inv.get("datasheetLocal"):
                    sources.add("pdf")
                inv["specsSource"] = "+".join(sorted(sources)) or "unknown"
                inv["specsUpdatedAt"] = now()
            if any(before.get(k) != v for k, v in specs.items()):
                updated += 1
        if i % 10 == 0:
            print(f"   {i}/{len(todo)} · {found} avec specs · {updated} modifiés", flush=True)
            if not args.dry_run:
                root["specsUpdatedAt"] = now()
                DATA.write_text(json.dumps(root, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        if not args.no_attributes:
            time.sleep(0.02)
    print(f"Analysés: {len(todo)} · avec specs: {found} · modifiés: {updated}", flush=True)
    if not args.dry_run:
        root["specsUpdatedAt"] = now()
        DATA.write_text(json.dumps(root, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"Écrit {DATA}", flush=True)
        # Résumé des champs disponibles
        for k in ("maxInputV", "mpptMinV", "maxInputI", "batteryMinV"):
            print(f"  {k}: {sum(1 for x in inverters if x.get(k))}/{len(inverters)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
