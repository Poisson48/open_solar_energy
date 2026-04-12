/**
 * enedis_import.js — Parser CSV export Enedis (espace client)
 *
 * Formats supportés :
 *   A) Consommation journalière  — colonnes Horodate + Valeur (Wh)
 *   B) Consommation mensuelle    — colonnes Mois/Date + Valeur (kWh ou Wh)
 *   C) HP/HC journalier          — colonnes Horodate + HP (Wh) + HC (Wh)
 *   D) ISO 30 min                — Horodate_Fin + Valeur (Wh), agrégé par jour puis mois
 *
 * Dans tous les cas :
 *   - Séparateur auto-détecté (; ou ,)
 *   - Encodage UTF-8 ou ISO-8859-1 (accents)
 *   - Les lignes de métadonnées en tête sont ignorées
 *   - Si plusieurs années : on prend la plus récente complète (≥ 11 mois)
 *   - Unité auto-détectée (Wh → ÷1000, kWh → ×1)
 *
 * Sortie : { monthlyKwh[12], monthlyKwhHp[12]|null, year, format, warnings[] }
 */

const EnedisImport = (() => {

  // ── Nettoyage d'une cellule CSV ──────────────────────────────
  function clean(s) {
    return (s || '').trim().replace(/^["']|["']$/g, '').trim();
  }

  // ── Détection séparateur ─────────────────────────────────────
  function detectSep(lines) {
    const sample = lines.slice(0, 20).join('\n');
    const nSemi  = (sample.match(/;/g) || []).length;
    const nComma = (sample.match(/,/g) || []).length;
    return nSemi >= nComma ? ';' : ',';
  }

  // ── Parse date → { year, month } ou null ────────────────────
  function parseDate(s) {
    const v = clean(s);
    // ISO avec heure : 2024-01-15T00:30:00+01:00 ou 2024-01-15 00:00:00
    let m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return { year: +m[1], month: +m[2] };
    // Format français JJ/MM/AAAA
    m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (m) return { year: +m[3], month: +m[2] };
    // Mois seul YYYY-MM
    m = v.match(/^(\d{4})-(\d{2})$/);
    if (m) return { year: +m[1], month: +m[2] };
    // MM/YYYY
    m = v.match(/^(\d{2})\/(\d{4})$/);
    if (m) return { year: +m[2], month: +m[1] };
    return null;
  }

  // ── Détecte l'index d'une colonne par mots-clés ──────────────
  // exclude : index à ignorer (évite collision ex. "Période de consommation")
  function findCol(headers, keywords, exclude = -1) {
    const kw = keywords.map(k => k.toLowerCase());
    return headers.findIndex((h, i) => i !== exclude && kw.some(k => h.toLowerCase().includes(k)));
  }

  // ── Détecte si l'unité est Wh (sinon kWh supposé) ───────────
  function isWh(headerLine) {
    return /\bwh\b/i.test(headerLine) && !/kwh/i.test(headerLine);
  }

  // ── Corps principal ──────────────────────────────────────────
  function parse(csvText) {
    const warnings = [];
    // Normaliser les sauts de ligne
    const lines = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
      .map(l => l.trim()).filter(l => l.length > 0);

    if (lines.length < 3) {
      return { error: 'Fichier trop court ou vide.' };
    }

    const sep = detectSep(lines);

    // ── Trouver la ligne d'en-tête des données ─────────────────
    // On cherche la première ligne qui contient "horodate" ou "date" ou "mois"
    let headerIdx = -1;
    for (let i = 0; i < Math.min(lines.length, 30); i++) {
      const low = lines[i].toLowerCase();
      if (low.includes('horodate') || low.includes('date') || low.includes('mois') ||
          low.includes('période') || low.includes('periode')) {
        headerIdx = i;
        break;
      }
    }
    if (headerIdx === -1) {
      return { error: 'En-tête introuvable — vérifiez que le fichier est bien un export Enedis.' };
    }

    const headerCells = lines[headerIdx].split(sep).map(clean);
    const dataLines   = lines.slice(headerIdx + 1).filter(l => l.split(sep).length >= 2);

    if (dataLines.length === 0) {
      return { error: 'Aucune ligne de données après l\'en-tête.' };
    }

    // ── Identifier les colonnes ────────────────────────────────
    const idxDate = findCol(headerCells, ['horodate', 'date', 'mois', 'période', 'periode']);
    const idxVal  = findCol(headerCells, ['valeur', 'energie active totale', 'consommation', 'total'], idxDate);
    const idxHp   = findCol(headerCells, ['heures pleines', 'heure pleine', 'hp'], idxDate);
    const idxHc   = findCol(headerCells, ['heures creuses', 'heure creuse', 'hc'], idxDate);

    if (idxDate === -1) {
      return { error: 'Colonne date/horodate introuvable dans l\'en-tête.' };
    }
    if (idxVal === -1 && idxHp === -1) {
      return { error: 'Colonne de consommation introuvable. Colonnes détectées : ' + headerCells.join(', ') };
    }

    // ── Détection unité ────────────────────────────────────────
    const headerStr = lines[headerIdx];
    const unitFactor = isWh(headerStr) ? 0.001 : 1; // Wh→kWh ou kWh direct

    // ── Agrégation par année → mois ────────────────────────────
    // Structure : data[year][month] = { kwh, khp, khc, count }
    const data = {};

    for (const line of dataLines) {
      const cells = line.split(sep).map(clean);
      const dt = parseDate(cells[idxDate]);
      if (!dt) continue;

      const { year, month } = dt;
      if (!data[year]) data[year] = {};
      if (!data[year][month]) data[year][month] = { kwh: 0, khp: 0, khc: 0, count: 0 };

      const parseVal = idx => {
        if (idx === -1) return 0;
        const v = parseFloat((cells[idx] || '0').replace(',', '.'));
        return isNaN(v) ? 0 : v * unitFactor;
      };

      if (idxHp !== -1 && idxHc !== -1) {
        // Format HP/HC
        const hp = parseVal(idxHp);
        const hc = parseVal(idxHc);
        data[year][month].khp   += hp;
        data[year][month].khc   += hc;
        data[year][month].kwh   += hp + hc;
      } else {
        data[year][month].kwh   += parseVal(idxVal);
      }
      data[year][month].count++;
    }

    if (Object.keys(data).length === 0) {
      return { error: 'Aucune donnée valide parsée (dates non reconnues ?).' };
    }

    // ── Choisir l'année la plus récente avec ≥ 11 mois ────────
    const years = Object.keys(data).map(Number).sort((a, b) => b - a);
    let chosenYear = years[0];
    for (const y of years) {
      if (Object.keys(data[y]).length >= 11) { chosenYear = y; break; }
    }
    const yearData = data[chosenYear];
    const monthsFound = Object.keys(yearData).length;
    if (monthsFound < 12) {
      warnings.push(`Année ${chosenYear} incomplète (${monthsFound}/12 mois) — les mois manquants sont estimés par interpolation.`);
    }

    // ── Construire les tableaux mensuels ───────────────────────
    // Interpoler les mois manquants par moyenne des voisins
    const monthlyKwh   = new Array(12).fill(0);
    const monthlyKwhHp = idxHp !== -1 ? new Array(12).fill(0) : null;
    const monthlyKwhHc = idxHc !== -1 ? new Array(12).fill(0) : null;

    for (let m = 1; m <= 12; m++) {
      if (yearData[m]) {
        monthlyKwh[m - 1] = Math.round(yearData[m].kwh);
        if (monthlyKwhHp) monthlyKwhHp[m - 1] = Math.round(yearData[m].khp);
        if (monthlyKwhHc) monthlyKwhHc[m - 1] = Math.round(yearData[m].khc);
      }
    }

    // Interpolation des mois manquants (moyenne glissante des voisins connus)
    for (let m = 0; m < 12; m++) {
      if (monthlyKwh[m] === 0) {
        const prev = monthlyKwh[(m + 11) % 12];
        const next = monthlyKwh[(m + 1) % 12];
        if (prev > 0 && next > 0) {
          monthlyKwh[m] = Math.round((prev + next) / 2);
        } else if (prev > 0) {
          monthlyKwh[m] = prev;
        } else if (next > 0) {
          monthlyKwh[m] = next;
        }
      }
    }

    // ── Détecter le format ─────────────────────────────────────
    const totalRows  = dataLines.length;
    const formatName = totalRows > 60
      ? (totalRows > 400 ? 'Données 30 min' : 'Données journalières')
      : 'Données mensuelles';

    return {
      monthlyKwh,
      monthlyKwhHp,
      monthlyKwhHc,
      year: chosenYear,
      format: formatName,
      totalAnnual: Math.round(monthlyKwh.reduce((s, v) => s + v, 0)),
      warnings
    };
  }

  // ── Décode un ArrayBuffer en texte (UTF-8 puis ISO-8859-1) ──
  function decodeText(buffer) {
    let text = new TextDecoder('utf-8').decode(buffer);
    if (text.includes('�')) text = new TextDecoder('iso-8859-1').decode(buffer);
    return text;
  }

  // ── Priorité des CSV dans le ZIP EDF/suiviconso ───────────────
  const ZIP_PRIORITY = [
    'ma-conso-mensuelle',
    'ma-conso-quotidienne',
    'mes-index-elec',
    'mes-puissances-atteintes-30min',
  ];

  function pickBestCsv(names) {
    for (const key of ZIP_PRIORITY) {
      const match = names.find(n => n.toLowerCase().includes(key));
      if (match) return match;
    }
    return names.find(n => n.endsWith('.csv')) || names[0];
  }

  // ── Gestionnaire ZIP (EDF suiviconso) ────────────────────────
  function handleZip(file, onResult) {
    if (typeof JSZip === 'undefined') {
      onResult({ error: 'JSZip non chargé — rechargez la page.' });
      return;
    }
    JSZip.loadAsync(file).then(zip => {
      const names = Object.keys(zip.files).filter(n => !zip.files[n].dir);
      const chosen = pickBestCsv(names);
      if (!chosen) { onResult({ error: 'Aucun CSV trouvé dans le ZIP.' }); return; }
      zip.files[chosen].async('arraybuffer').then(buf => {
        onResult(parse(decodeText(buf)));
      });
    }).catch(err => onResult({ error: 'Impossible de lire le ZIP : ' + err.message }));
  }

  // ── Gestionnaire de fichier ──────────────────────────────────
  function handleFile(file, onResult) {
    if (!file) return;
    // ZIP EDF (suiviconso.edf.fr)
    if (file.name.toLowerCase().endsWith('.zip') || file.type === 'application/zip') {
      handleZip(file, onResult);
      return;
    }
    // CSV direct
    const reader = new FileReader();
    reader.onload = e => {
      let text = e.target.result;
      if (text.includes('�')) {
        const r2 = new FileReader();
        r2.onload = e2 => onResult(parse(e2.target.result));
        r2.readAsText(file, 'ISO-8859-1');
        return;
      }
      onResult(parse(text));
    };
    reader.readAsText(file, 'UTF-8');
  }

  return { parse, handleFile };
})();
