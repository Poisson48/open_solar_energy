/**
 * inverter_sizing.js - Dimensionnement et recommandation d'onduleurs
 *
 * Types d'onduleurs pris en charge :
 *   - String (réseau, mono ou tri-phase)
 *   - Hybride (avec entrée batterie)
 *   - Micro-onduleurs (par panneau)
 *
 * Dépend de : app_state.js
 */

const InverterSizing = (() => {

  // ── Catalogue simplifié (données représentatives 2024) ────────
  const CATALOG = [
    // ─── String monophasé ───
    { id:'fronius-primo',  brand:'Fronius', model:'Primo',          type:'string',  phase:1,
      sizes:[2.5,3.0,3.5,4.0,4.6,5.0,6.0,8.2,10.0], maxPvRatio:1.5, minPvRatio:0.8,
      nMppt:2, maxMpptCurrent:18, maxVocInput:1000,
      features:['wifi','monitoring','shade-ok'], pricePerKw:340, efficiency:0.977 },
    { id:'sma-sb',         brand:'SMA',     model:'Sunny Boy',       type:'string',  phase:1,
      sizes:[3.0,3.6,4.0,5.0,6.0], maxPvRatio:1.5, minPvRatio:0.8,
      nMppt:2, maxMpptCurrent:15, maxVocInput:1000,
      features:['wifi','shade-ok'], pricePerKw:320, efficiency:0.975 },
    { id:'huawei-l1',      brand:'Huawei',  model:'SUN2000-L1',      type:'string',  phase:1,
      sizes:[2.0,3.0,4.0,5.0,6.0], maxPvRatio:1.5, minPvRatio:0.7,
      nMppt:2, maxMpptCurrent:11, maxVocInput:1100,
      features:['optimizer','app'], pricePerKw:270, efficiency:0.983 },
    { id:'solis-1p',       brand:'Solis',   model:'S6-GR1P',         type:'string',  phase:1,
      sizes:[2.5,3.0,3.6,4.0,5.0,6.0], maxPvRatio:1.6, minPvRatio:0.7,
      nMppt:2, maxMpptCurrent:12.5, maxVocInput:1100,
      features:['monitoring'], pricePerKw:220, efficiency:0.978 },
    // ─── String triphasé ───
    { id:'fronius-symo',   brand:'Fronius', model:'Symo',            type:'string',  phase:3,
      sizes:[3.0,4.0,5.0,6.0,7.0,8.2,10.0,12.5,15.0,17.5,20.0], maxPvRatio:1.5, minPvRatio:0.7,
      nMppt:2, maxMpptCurrent:18, maxVocInput:1000,
      features:['wifi','monitoring'], pricePerKw:310, efficiency:0.980 },
    { id:'sma-stp',        brand:'SMA',     model:'Sunny TriPower',  type:'string',  phase:3,
      sizes:[4.0,5.0,6.0,8.0,10.0,12.0,15.0,17.0,20.0,25.0], maxPvRatio:1.5, minPvRatio:0.8,
      nMppt:2, maxMpptCurrent:22, maxVocInput:1000,
      features:['wifi','shade-ok'], pricePerKw:300, efficiency:0.982 },
    // ─── Hybrides (avec batterie) ───
    { id:'growatt-sph',    brand:'Growatt', model:'SPH 3000-6000',   type:'hybrid',  phase:1,
      sizes:[3.0,4.0,5.0,6.0], maxPvRatio:1.5, minPvRatio:0.8,
      nMppt:2, maxMpptCurrent:12.5, maxVocInput:1000,
      maxBattV:58, maxChargeCurrent:25,
      features:['battery','backup','ems'], pricePerKw:450, efficiency:0.972 },
    { id:'goodwe-et',      brand:'GoodWe',  model:'ET Series',       type:'hybrid',  phase:1,
      sizes:[3.6,5.0,6.0], maxPvRatio:1.5, minPvRatio:0.8,
      nMppt:2, maxMpptCurrent:15, maxVocInput:1100,
      maxBattV:58, maxChargeCurrent:25,
      features:['battery','backup','ems'], pricePerKw:480, efficiency:0.975 },
    { id:'huawei-luna-l1', brand:'Huawei',  model:'SUN2000-L1+LUNA2', type:'hybrid', phase:1,
      sizes:[3.0,4.0,5.0,6.0], maxPvRatio:1.5, minPvRatio:0.8,
      nMppt:2, maxMpptCurrent:11, maxVocInput:1100,
      maxBattV:52, maxChargeCurrent:25,
      features:['battery','backup','app'], pricePerKw:520, efficiency:0.979 },
    { id:'victron-mp2',    brand:'Victron', model:'MultiPlus-II',    type:'hybrid',  phase:1,
      sizes:[2.4,3.0,5.0,10.0], maxPvRatio:2.0, minPvRatio:0.5,
      nMppt: null, // dépend du MPPT externe (SmartSolar)
      maxBattV:52, maxChargeCurrent:50,
      features:['battery','backup','offgrid','bi-directionnel'], pricePerKw:650, efficiency:0.970 },
    { id:'sma-si',         brand:'SMA',     model:'Sunny Island',    type:'hybrid',  phase:1,
      sizes:[3.0,4.4,6.0,8.0], maxPvRatio:2.0, minPvRatio:0.5,
      nMppt: null,
      maxBattV:48, maxChargeCurrent:56,
      features:['battery','backup','offgrid'], pricePerKw:600, efficiency:0.968 },
    // ─── Micro-onduleurs ───
    { id:'enphase-iq8',    brand:'Enphase', model:'IQ8',             type:'micro',   phase:1,
      panelPowerRange:[220, 460], nominalPower:0.349,
      features:['ombrage','monitoring','backup-option'], pricePerUnit:175, efficiency:0.975 },
    { id:'apsystems-qs1',  brand:'APsystems',model:'QS1',            type:'micro',   phase:1,
      panelPowerRange:[200, 420], nominalPower:0.320,
      features:['ombrage','monitoring'], pricePerUnit:145, efficiency:0.968 },
  ];

  /**
   * Recommande des onduleurs adaptés
   * @param {number}  Ppeak        Puissance PV crête (kWc)
   * @param {string}  systemType   'grid' | 'hybrid' | 'offgrid'
   * @param {number}  phase        1 ou 3
   * @param {number}  battKwh      Capacité batterie (kWh, 0 si pas de batterie)
   * @param {number}  panelWp      Puissance d'un panneau (Wc) - pour micro-onduleurs
   * @param {number}  nPanels      Nombre de panneaux
   * @param {number}  vocPanel     Voc d'un panneau (V, optionnel)
   * @param {number}  iscPanel     Isc d'un panneau (A, optionnel)
   * @returns {Array} Liste de recommandations triées par pertinence
   */
  function recommend({ Ppeak, systemType = 'grid', phase = 1, battKwh = 0,
                        panelWp = 400, nPanels, vocPanel = 40, iscPanel = 10 }) {

    const needTypes = {
      grid:    ['string', 'micro'],
      hybrid:  ['hybrid'],
      offgrid: ['hybrid']
    }[systemType] || ['string'];

    const results = [];

    CATALOG.forEach(inv => {
      if (!needTypes.includes(inv.type)) return;
      if (inv.phase !== 1 && inv.phase !== phase) return;

      if (inv.type === 'micro') {
        // Micro-onduleurs : vérifier compatibilité avec le panneau
        if (panelWp < inv.panelPowerRange[0] || panelWp > inv.panelPowerRange[1]) return;
        const n = nPanels || Math.ceil(Ppeak * 1000 / panelWp);
        results.push({
          ...inv,
          recommendedSize: inv.nominalPower,
          quantity: n,
          pvRatio: null,
          estimatedPrice: Math.round(n * inv.pricePerUnit),
          score: 80,
          notes: `${n} micro-onduleurs × ${Math.round(inv.nominalPower * 1000)} W - idéal si ombrage ou toiture complexe`
        });
        return;
      }

      // String / Hybride : trouver la taille adaptée
      inv.sizes.forEach(size => {
        const ratio = Ppeak / size;
        if (ratio < inv.minPvRatio || ratio > inv.maxPvRatio) return;

        // Vérification MPPT (si données disponibles)
        let mpptNote = '';
        if (inv.nMppt && nPanels && vocPanel) {
          const maxSeriesPerString = Math.floor((inv.maxVocInput || 1000) / (vocPanel * 1.15));
          const minStrings = Math.ceil(nPanels / maxSeriesPerString);
          if (minStrings > (inv.nMppt || 2)) {
            mpptNote = ` ⚠ ${minStrings} chaînes nécessaires, ${inv.nMppt} MPPT disponibles`;
          }
        }

        // Vérifier compatibilité batterie
        if (systemType === 'hybrid' && battKwh > 0 && inv.type === 'hybrid') {
          // OK par défaut pour les hybrides
        }

        // Score de pertinence (ratio le plus proche de 1.1 = optimal)
        const score = 100 - Math.abs(ratio - 1.1) * 50;

        results.push({
          brand:    inv.brand,
          model:    inv.model,
          type:     inv.type,
          phase:    inv.phase,
          size,
          pvRatio:  Math.round(ratio * 100) / 100,
          nMppt:    inv.nMppt,
          maxVocInput: inv.maxVocInput,
          efficiency:  inv.efficiency,
          features: inv.features || [],
          estimatedPrice: Math.round(size * inv.pricePerKw),
          score:    Math.round(score),
          notes:    `Ratio PV/onduleur ${Math.round(ratio * 100) / 100}${mpptNote}`
        });
      });
    });

    return results.sort((a, b) => b.score - a.score);
  }

  /**
   * Rendu HTML dans l'élément cible
   * @param {string} containerId  ID du div résultat
   * @param {Object} params        Paramètres pour recommend()
   */
  function renderRecommendations(containerId, params) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const recs = recommend(params);
    if (recs.length === 0) {
      container.innerHTML = '<div class="alert alert-warning">Aucun onduleur compatible trouvé dans le catalogue pour ces paramètres.</div>';
      return;
    }

    // Séparer par type
    const strings  = recs.filter(r => r.type === 'string');
    const hybrids  = recs.filter(r => r.type === 'hybrid');
    const micros   = recs.filter(r => r.type === 'micro');

    const typeLabel = { string: 'String (réseau)', hybrid: 'Hybride (batterie)', micro: 'Micro-onduleurs' };
    const typeIcon  = { string: '⚡', hybrid: '🔋', micro: '🔲' };

    const renderGroup = (list, type) => {
      if (!list.length) return '';
      const top5 = list.slice(0, 5);
      return `
        <div class="card" style="margin-bottom:12px">
          <div class="card-title">${typeIcon[type]} ${typeLabel[type]}</div>
          <table class="data-table">
            <thead>
              <tr>
                <th>Marque / Modèle</th>
                <th>Puissance</th>
                <th>Ratio PV</th>
                <th>MPPT</th>
                <th>Rendement</th>
                <th>Prix est.</th>
                <th>Points clés</th>
              </tr>
            </thead>
            <tbody>
              ${top5.map((r, i) => `
                <tr${i === 0 ? ' style="background:var(--color-surface2)"' : ''}>
                  <td><strong>${r.brand}</strong> ${r.model}${i === 0 ? ' <span style="font-size:10px;background:var(--color-accent);color:#fff;padding:1px 5px;border-radius:3px">✓ recommandé</span>' : ''}</td>
                  <td>${r.quantity ? `${r.quantity} × ${Math.round((r.recommendedSize || r.size) * 1000)} W` : `${(r.size || r.recommendedSize || 0).toFixed(1)} kW`}</td>
                  <td>${r.pvRatio !== null ? r.pvRatio : '1:1/panneau'}</td>
                  <td>${r.nMppt || (r.type === 'micro' ? '1/panneau' : '-')}</td>
                  <td>${r.efficiency ? Math.round(r.efficiency * 1000) / 10 + ' %' : '-'}</td>
                  <td>${r.estimatedPrice ? r.estimatedPrice.toLocaleString('fr') + ' €' : '-'}</td>
                  <td style="font-size:11px">${(r.features || []).join(', ')}<br><span style="color:var(--color-text-muted)">${r.notes || ''}</span></td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>`;
    };

    container.innerHTML = `
      <div class="alert alert-info" style="margin-bottom:12px;font-size:12px">
        ℹ Catalogue simplifié - vérifiez les fiches techniques pour le câblage exact des chaînes (Voc, Isc, MPPT).
        Les prix sont des estimations HT pros (fourniture seule).
      </div>
      ${renderGroup(strings,  'string')}
      ${renderGroup(hybrids,  'hybrid')}
      ${renderGroup(micros,   'micro')}`;
  }

  /**
   * Calcule le câblage optimal des panneaux en chaînes MPPT
   * @param {number} Ppeak     Puissance totale (kWc)
   * @param {number} panelWp   Puissance panneau (Wc)
   * @param {number} vocPanel  Voc panneau (V)
   * @param {number} iscPanel  Isc panneau (A)
   * @param {number} maxVoc    Tension max onduleur (V, ex: 1000)
   * @param {number} maxIsc    Courant max MPPT onduleur (A)
   * @param {number} nMppt     Nombre de trackers MPPT
   * @returns {Object}  { panelsPerString, nStrings, stringsPerMppt, Vstr, Istr }
   */
  function calcStringing({ Ppeak, panelWp, vocPanel, iscPanel, maxVoc = 1000, maxIsc = 12, nMppt = 2 }) {
    const nPanels = Math.ceil(Ppeak * 1000 / panelWp);
    // Correction température : Voc augmente de ~2.5%/10°C en-dessous de 25°C
    // On majore de 15% pour les conditions hivernales
    const vocCorrected = vocPanel * 1.15;
    const maxSeries = Math.floor(maxVoc / vocCorrected);
    const minSeries = Math.max(1, Math.floor(maxSeries * 0.6));  // MPPT window ~60–100% Vmax

    // Chercher la combinaison qui minimise le déséquilibre
    let best = null;
    for (let s = maxSeries; s >= minSeries; s--) {
      const nStr = Math.ceil(nPanels / s);
      const strPerMppt = Math.ceil(nStr / nMppt);
      const Istr = iscPanel * strPerMppt;
      if (Istr > maxIsc) continue;
      const totalPanels = s * nStr;
      const waste = totalPanels - nPanels;
      if (!best || waste < best.waste) {
        best = {
          panelsPerString: s,
          nStrings: nStr,
          stringsPerMppt: strPerMppt,
          Vstr: Math.round(vocPanel * s * 10) / 10,
          Istr: Math.round(Istr * 10) / 10,
          totalPanels,
          waste,
          Ppeak_actual: Math.round(totalPanels * panelWp / 100) / 10
        };
      }
    }
    return best || { error: 'Aucune combinaison compatible trouvée' };
  }

  return { recommend, renderRecommendations, calcStringing, CATALOG };
})();
