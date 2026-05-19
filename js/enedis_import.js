/**
 * enedis_import.js — Parser CSV export Enedis (espace client)
 *
 * Formats supportés dans le ZIP :
 *   - ma-conso-mensuelle       : MM/YYYY;kWh   → monthlyKwh
 *   - ma-conso-quotidienne     : DD/MM/YYYY;Wh → agrégé par mois
 *   - mes-puissances-atteintes-30min : format propriétaire Enedis
 *       date sur une ligne (DD/MM/YYYY;;), puis créneaux HH:MM:SS;Watts;
 *       en ordre décroissant → halfHourlyData (kWh/créneau)
 *
 * Le ZIP est toujours traité en chargeant les deux fichiers en parallèle :
 *   1. Fichier consommation (mensuelle ou quotidienne) → monthlyKwh
 *   2. Fichier 30min → halfHourlyData (optionnel)
 *
 * Sortie : { monthlyKwh[12], monthlyKwhHp|null, year, format,
 *            totalAnnual, warnings[], halfHourlyData? }
 *   halfHourlyData = { values: Float32Array(n×48), year, format:'30min' }
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
    let m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return { year: +m[1], month: +m[2] };
    m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (m) return { year: +m[3], month: +m[2], day: +m[1] };
    // Mois seul YYYY-MM
    m = v.match(/^(\d{4})-(\d{2})$/);
    if (m) return { year: +m[1], month: +m[2] };
    m = v.match(/^(\d{2})\/(\d{4})$/);
    if (m) return { year: +m[2], month: +m[1] };
    return null;
  }

  // ── Parse datetime complet → { year, month, day, hour, minute } ou null ──
  function parseDatetime(s) {
    const v = clean(s);
    // ISO : 2024-01-15T00:30:00+01:00 ou 2024-01-15 00:30:00
    let m = v.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
    if (m) return { year: +m[1], month: +m[2], day: +m[3], hour: +m[4], minute: +m[5] };
    // Format français JJ/MM/AAAA HH:MM
    m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})/);
    if (m) return { year: +m[3], month: +m[2], day: +m[1], hour: +m[4], minute: +m[5] };
    return null;
  }

  // ── Calcule le jour de l'année (0-based) ─────────────────────
  function dayOfYear(year, month, day) {
    const start = new Date(year, 0, 1);
    const date  = new Date(year, month - 1, day);
    return Math.floor((date - start) / 86400000);
  }

  // ── Détecte l'index d'une colonne par mots-clés ──────────────
  // exclude : index à ignorer (évite collision ex. "Période de consommation")
  function findCol(headers, keywords, exclude = -1) {
    const kw = keywords.map(k => k.toLowerCase());
    return headers.findIndex((h, i) => i !== exclude && kw.some(k => h.toLowerCase().includes(k)));
  }

  // ── Détecte l'unité dans l'en-tête ──────────────────────────
  // Retourne le facteur de conversion vers kWh par slot 30min
  function detectUnitFactor(headerLine) {
    const h = headerLine.toLowerCase();
    if (/kwh/i.test(h))  return 1;       // kWh direct
    if (/\bwh\b/i.test(h)) return 0.001; // Wh → kWh
    // Puissance en W (ex: "Puissance atteinte (W)") → W × 0.5h / 1000 = kWh/slot
    if (/\bw\b(?!h)/i.test(h) || /puissance/i.test(h)) return 0.5 / 1000;
    return 0.001; // défaut Wh
  }

  // ── Décode un ArrayBuffer en texte (UTF-8 puis ISO-8859-1) ──
  function decodeText(buffer) {
    let text = new TextDecoder('utf-8').decode(buffer);
    if (text.includes('�')) text = new TextDecoder('iso-8859-1').decode(buffer);
    return text;
  }

  // ── Parser générique mensuel/journalier ──────────────────────
  function parse(csvText) {
    const warnings = [];
    const lines = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
      .map(l => l.trim()).filter(l => l.length > 0);

    if (lines.length < 3) return { error: 'Fichier trop court ou vide.' };

    const sep = detectSep(lines);

    let headerIdx = -1;
    for (let i = 0; i < Math.min(lines.length, 30); i++) {
      const low = lines[i].toLowerCase();
      if (low.includes('horodate') || low.includes('date') || low.includes('mois') ||
          low.includes('période') || low.includes('periode')) {
        headerIdx = i;
        break;
      }
    }
    if (headerIdx === -1) return { error: 'En-tête introuvable.' };

    const headerCells = lines[headerIdx].split(sep).map(clean);
    const dataLines   = lines.slice(headerIdx + 1).filter(l => l.split(sep).length >= 2);
    if (dataLines.length === 0) return { error: 'Aucune ligne de données.' };

    // ── Identifier les colonnes ────────────────────────────────
    const idxDate = findCol(headerCells, ['horodate', 'date', 'mois', 'période', 'periode', 'heure de relève', 'releve']);
    const idxVal  = findCol(headerCells, ['valeur', 'energie active totale', 'consommation', 'total', 'puissance atteinte', 'puissance'], idxDate);
    const idxHp   = findCol(headerCells, ['heures pleines', 'heure pleine', 'hp'], idxDate);
    const idxHc   = findCol(headerCells, ['heures creuses', 'heure creuse', 'hc'], idxDate);

    if (idxDate === -1) return { error: 'Colonne date introuvable.' };
    if (idxVal === -1 && idxHp === -1) return { error: 'Colonne consommation introuvable. Colonnes : ' + headerCells.join(', ') };

    // ── Détection unité ────────────────────────────────────────
    const headerStr  = lines[headerIdx];
    const unitFactor = detectUnitFactor(headerStr);

    // ── Agrégation par année → mois + collecte brute 30min ───────
    // Structure : data[year][month] = { kwh, khp, khc, count }
    const data        = {};
    const rawSlots    = {}; // year → Float32Array(366*48) valeurs kWh par slot

    // Tracker pour le format "split" : date sur une ligne, heures sur les suivantes
    let currentDateCtx = null; // { year, month, day }

    for (const line of dataLines) {
      const cells = line.split(sep).map(clean);
      let dt = parseDatetime(cells[idxDate]) || parseDate(cells[idxDate]);

      if (!dt) {
        // Ligne heure seule ? (ex: "00:30:00;474;Réelle")
        const timeMatch = (cells[idxDate] || '').match(/^(\d{2}):(\d{2}):(\d{2})$/);
        if (timeMatch && currentDateCtx) {
          dt = { ...currentDateCtx, hour: +timeMatch[1], minute: +timeMatch[2] };
        } else {
          continue;
        }
      } else if (dt.day !== undefined) {
        // Date complète ou date+heure → mémoriser comme contexte
        currentDateCtx = { year: dt.year, month: dt.month, day: dt.day };
      } else {
        // Date sans jour (mensuelle) → reset contexte
        currentDateCtx = null;
      }

      const { year, month } = dt;
      if (!data[year]) data[year] = {};
      if (!data[year][month]) data[year][month] = { kwh: 0, khp: 0, khc: 0, count: 0 };
      const parseVal = idx => {
        if (idx === -1) return 0;
        const v = parseFloat((cells[idx] || '0').replace(',', '.').replace(/\s/g, ''));
        return isNaN(v) ? 0 : v * unitFactor;
      };
      if (idxHp !== -1 && idxHc !== -1) {
        const hp = parseVal(idxHp);
        const hc = parseVal(idxHc);
        data[year][month].khp   += hp;
        data[year][month].khc   += hc;
        data[year][month].kwh   += hp + hc;
      } else {
        data[year][month].kwh += parseVal(idxVal);
      }
      data[year][month].count++;

      // Collecte des valeurs brutes 30min si heure disponible
      if (dt.day !== undefined && dt.hour !== undefined) {
        const doy  = dayOfYear(year, month, dt.day);
        const slot = Math.min(47, dt.hour * 2 + (dt.minute >= 30 ? 1 : 0));
        const idx  = doy * 48 + slot;
        if (!rawSlots[year]) rawSlots[year] = new Float32Array(366 * 48);
        rawSlots[year][idx] = parseVal(idxVal) || (parseVal(idxHp) + parseVal(idxHc));
      }
    }

    if (Object.keys(data).length === 0) return { error: 'Aucune donnée valide.' };

    const years = Object.keys(data).map(Number).sort((a, b) => b - a);
    let chosenYear = years[0];
    for (const y of years) {
      if (Object.keys(data[y]).length >= 11) { chosenYear = y; break; }
    }
    const yearData = data[chosenYear];
    if (Object.keys(yearData).length < 12) {
      warnings.push(`Année ${chosenYear} incomplète (${Object.keys(yearData).length}/12 mois).`);
    }

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

    // Interpolation des mois manquants
    for (let m = 0; m < 12; m++) {
      if (monthlyKwh[m] === 0) {
        const prev = monthlyKwh[(m + 11) % 12];
        const next = monthlyKwh[(m + 1)  % 12];
        monthlyKwh[m] = prev > 0 && next > 0 ? Math.round((prev + next) / 2) : prev || next;
      }
    }

    const totalRows  = dataLines.length;
    const formatName = totalRows > 60
      ? (totalRows > 400 ? 'Données 30 min' : 'Données journalières')
      : 'Données mensuelles';

    // ── Données brutes 30min si disponibles ────────────────────
    let halfHourlyData = null;
    const raw = rawSlots[chosenYear];
    if (raw) {
      const nonZero = raw.filter(v => v > 0).length;
      if (nonZero >= 48 * 30) {
        halfHourlyData = { values: raw, year: chosenYear };
        // Recalculer les kWh mensuels depuis les slots bruts (plus fiable que l'agrégation directe)
        const yearDays = getMonthlyDays(chosenYear);
        for (let m = 0; m < 12; m++) {
          let startDay = 0;
          for (let mm = 0; mm < m; mm++) startDay += yearDays[mm];
          const endDay = startDay + yearDays[m];
          let sum = 0;
          for (let d = startDay; d < endDay; d++)
            for (let s = 0; s < 48; s++) sum += raw[d * 48 + s];
          if (sum > 0) monthlyKwh[m] = Math.round(sum);
        }
      }
    }

    return {
      monthlyKwh, monthlyKwhHp, monthlyKwhHc,
      year: chosenYear, format: formatName,
      totalAnnual: Math.round(monthlyKwh.reduce((s, v) => s + v, 0)),
      halfHourlyData,
      warnings
    };
  }

  // ── Parser dédié : mes-puissances-atteintes-30min ────────────
  /**
   * Format Enedis "puissances atteintes" :
   *   DD/MM/YYYY;;          ← ligne de date
   *   00:00:00;WATTS;Réelle ← créneau minuit (début de journée)
   *   23:30:00;WATTS;Réelle ← créneaux en ordre décroissant
   *   ...
   *   00:30:00;WATTS;Réelle
   *                         ← ligne vide
   *
   * Valeurs en Watts → conversion en kWh/créneau : W × 0.5h / 1000
   * Retourne { values: Float32Array(jours×48), year, format, monthlyKwh, nDays }
   */
  function parsePuissances30min(csvText) {
    const lines = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

    // Structure : date → slots[48] en Watts
    const dayMap = {};  // 'YYYY-MM-DD' → Float32Array(48) en W

    let currentDate = null;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) { currentDate = null; continue; }

      // Ligne de date : DD/MM/YYYY;;
      const dateMatch = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})\s*;/);
      if (dateMatch) {
        currentDate = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`;
        if (!dayMap[currentDate]) dayMap[currentDate] = new Float32Array(48);
        continue;
      }

      // Ligne créneau : HH:MM:SS;WATTS;...
      if (!currentDate) continue;
      const timeMatch = trimmed.match(/^(\d{2}):(\d{2}):\d{2};(\d+)/);
      if (!timeMatch) continue;

      const hour  = parseInt(timeMatch[1]);
      const min   = parseInt(timeMatch[2]);
      const watts = parseInt(timeMatch[3]);
      const slot  = hour * 2 + (min >= 30 ? 1 : 0);  // 0 = 00:00, 47 = 23:30
      if (slot >= 0 && slot < 48) {
        dayMap[currentDate][slot] = watts;
      }
    }

    const dates = Object.keys(dayMap).sort();
    if (dates.length === 0) return null;

    // Choisir l'année la plus récente et complète (≥ 300 jours)
    const yearCounts = {};
    for (const d of dates) {
      const y = d.substring(0, 4);
      yearCounts[y] = (yearCounts[y] || 0) + 1;
    }
    const sortedYears = Object.keys(yearCounts).sort((a, b) => b - a);
    const chosenYear  = parseInt(
      sortedYears.find(y => yearCounts[y] >= 300) || sortedYears[0]
    );

    const yearStr   = String(chosenYear);
    const yearDates = dates.filter(d => d.startsWith(yearStr)).sort();
    const nDays     = yearDates.length;

    // Float32Array : index = jour × 48 + slot, valeur = kWh/créneau
    const values = new Float32Array(nDays * 48);
    const monthlyKwh = new Array(12).fill(0);

    for (let i = 0; i < nDays; i++) {
      const slots = dayMap[yearDates[i]];
      const month = parseInt(yearDates[i].substring(5, 7)) - 1; // 0-indexed
      for (let s = 0; s < 48; s++) {
        const kwh = (slots[s] || 0) * 0.5 / 1000;  // W × 0.5h / 1000
        values[i * 48 + s] = kwh;
        monthlyKwh[month] += kwh;
      }
    }

    return {
      values,
      year:       chosenYear,
      format:     '30min',
      monthlyKwh: monthlyKwh.map(v => Math.round(v)),
      nDays
    };
  }

  // ── Priorité pour les kWh mensuels (fichier dédié plus fiable) ─
  const MONTHLY_KEYS    = ['ma-conso-mensuelle', 'ma-conso-quotidienne', 'mes-index-elec'];
  const HALFHOURLY_KEYS = ['mes-puissances-atteintes-30min', 'courbe_de_charge', 'courbe-de-charge', 'conso_heure', '30min'];

  // ── Gestionnaire ZIP : parse TOUS les CSV, merge le meilleur ──
  function handleZip(file, onResult) {
    if (typeof JSZip === 'undefined') {
      onResult({ error: 'JSZip non chargé — rechargez la page.' });
      return;
    }

    JSZip.loadAsync(file).then(zip => {
      const csvNames = Object.keys(zip.files)
        .filter(n => !zip.files[n].dir && n.toLowerCase().endsWith('.csv'));
      if (!csvNames.length) { onResult({ error: 'Aucun CSV trouvé dans le ZIP.' }); return; }

      Promise.all(csvNames.map(name =>
        zip.files[name].async('arraybuffer')
          .then(buf => ({ name: name.toLowerCase(), result: parse(decodeText(buf)) }))
      )).then(parsed => {
        const ok = parsed.filter(p => !p.result.error);
        if (!ok.length) { onResult({ error: 'Aucun fichier CSV valide dans le ZIP.' }); return; }

        // Meilleur fichier mensuel (kWh non nuls)
        const pickByKeys = (keys) => {
          for (const key of keys) {
            const m = ok.find(p => p.name.includes(key) && p.result.monthlyKwh.some(v => v > 0));
            if (m) return m.result;
          }
          return null;
        };
        const pickHalfhourly = () => {
          for (const key of HALFHOURLY_KEYS) {
            const m = ok.find(p => p.name.includes(key) && p.result.halfHourlyData);
            if (m) return m.result;
          }
          return ok.find(p => p.result.halfHourlyData)?.result || null;
        };

        const bestMonthly    = pickByKeys(MONTHLY_KEYS)
                            || ok.find(p => p.result.monthlyKwh.some(v => v > 0))?.result
                            || ok[0].result;
        const bestHalfhourly = pickHalfhourly();

        // Merger : kWh mensuels + données 30min si fichiers séparés
        const merged = { ...bestMonthly };
        if (bestHalfhourly && bestHalfhourly !== bestMonthly) {
          merged.halfHourlyData = bestHalfhourly.halfHourlyData;
        }
        merged.warnings = [
          ...bestMonthly.warnings,
          ...(bestHalfhourly && bestHalfhourly !== bestMonthly ? bestHalfhourly.warnings : [])
        ];

        onResult(merged);
      });
    }).catch(err => onResult({ error: 'Impossible de lire le ZIP : ' + err.message }));
  }

  // ── Gestionnaire de fichier ──────────────────────────────────
  function handleFile(file, onResult) {
    if (!file) return;
    if (file.name.toLowerCase().endsWith('.zip') || file.type === 'application/zip') {
      handleZip(file, onResult);
      return;
    }
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

  return { parse, parsePuissances30min, handleFile };
})();
