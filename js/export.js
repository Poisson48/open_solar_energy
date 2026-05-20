/**
 * export.js - Export CSV, JSON, PDF
 */

const Exporter = (() => {

  function toCSV(headers, rows) {
    const lines = [headers.join(';')];
    rows.forEach(row => lines.push(row.map(v => String(v).replace(',', '.')).join(';')));
    return lines.join('\n');
  }

  function downloadBlob(content, filename, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportGridCSV(results, params) {
    const headers = ['Mois', 'Irradiation_inclinée_kWh_m2', 'Production_kWh', 'T_moy_C'];
    const rows = results.monthly.map(m => [m.name, m.Htilt, m.E_month, m.T_avg]);
    rows.push(['TOTAL', results.H_annual, results.E_annual, '']);
    downloadBlob(toCSV(headers, rows), 'production_pv.csv', 'text/csv');
  }

  function exportGridJSON(results, params) {
    const data = {
      parametres: params,
      resultats: {
        production_annuelle_kWh: results.E_annual,
        irradiation_annuelle_kWh_m2: results.H_annual,
        performance_ratio: results.PR,
        facteur_capacite_pct: results.CF,
        rendement_specifique_kWh_kWc: results.specificYield,
        retour_sur_investissement_ans: results.ROI,
        co2_evite_kg: results.CO2,
        mensuel: results.monthly
      }
    };
    downloadBlob(JSON.stringify(data, null, 2), 'production_pv.json', 'application/json');
  }

  function exportOffgridCSV(monthly) {
    const headers = ['Mois', 'Production_solaire_kWh_j', 'Taux_couverture_pct', 'Autonomie_jours', 'Déficit_kWh'];
    const rows = monthly.map(m => [m.name, m.solarDaily, m.coverageRatio, m.autonomyDays, m.deficit]);
    downloadBlob(toCSV(headers, rows), 'systeme_hors_reseau.csv', 'text/csv');
  }

  function exportIrradiationCSV(weatherData) {
    const headers = ['Mois', 'GHI_kWh_m2', 'DHI_kWh_m2', 'T_moy_C'];
    const rows = weatherData.map(m => [m.name, m.GHI, m.DHI, m.T_avg]);
    downloadBlob(toCSV(headers, rows), 'irradiation_mensuelle.csv', 'text/csv');
  }

  function exportPDF() {
    window.print();
  }

  return { exportGridCSV, exportGridJSON, exportOffgridCSV, exportIrradiationCSV, exportPDF };
})();
