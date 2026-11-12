# Catalogue Rexel

`catalog.json` contient les panneaux et onduleurs Rexel embarqués dans l'app.

## Fiches PDF des onduleurs

Les PDF sont téléchargés dans `pdfs/` (dossier ignoré par Git) et référencés dans
`catalog.json` via `datasheetLocal`. Un index lisible est généré dans
`inverter_datasheets.csv`.

```bash
# Vérifier sans télécharger
python3 scripts/download_rexel_inverter_datasheets.py --dry-run

# Télécharger tous les PDF manquants
python3 scripts/download_rexel_inverter_datasheets.py --resolve-missing

# Seulement les onduleurs hybrides
python3 scripts/download_rexel_inverter_datasheets.py --only-hybrid --resolve-missing

# Un lot de test
python3 scripts/download_rexel_inverter_datasheets.py --limit 5
```

Le script :

1. lit `catalog.json` ;
2. utilise `datasheetUrl` quand il existe ;
3. avec `--resolve-missing`, re-scrape la fiche Rexel pour retrouver l'URL ;
4. valide que la réponse commence par `%PDF` ;
5. écrit `pdfs/<sku>.pdf` et met à jour `datasheetLocal`, `datasheetBytes` et
   `datasheetDownloadedAt` ;
6. régénère `inverter_datasheets.csv` avec le statut de chaque onduleur.

Les PDF ne sont pas versionnés : ils sont régénérables et peuvent être lourds.
