/**
 * layout_roofs.js — Plusieurs toitures / orientations dans un même projet.
 * Dépend de : app_state.js, panel_3d.js (optionnel), solar_math.js (optionnel)
 */
const LayoutRoofs = (() => {
  let _seq = 1;

  function uid() {
    return `roof-${Date.now().toString(36)}-${(_seq++).toString(36)}`;
  }

  function defaultRoof(overrides = {}) {
    return {
      id: overrides.id || uid(),
      name: overrides.name || 'Toiture 1',
      roofW: overrides.roofW ?? 8,
      roofD: overrides.roofD ?? 6,
      panelW: overrides.panelW ?? 1.13,
      panelH: overrides.panelH ?? 1.76,
      nPanels: overrides.nPanels ?? 12,
      rows: overrides.rows ?? 2,
      tilt: overrides.tilt ?? 30,
      azimuth: overrides.azimuth ?? 0,
      gap: overrides.gap ?? 0.02,
    };
  }

  function ensure() {
    if (typeof AppState === 'undefined') return null;
    if (!AppState.layoutRoofs || !Array.isArray(AppState.layoutRoofs.roofs)) {
      AppState.layoutRoofs = { activeId: null, roofs: [defaultRoof()] };
    }
    if (!AppState.layoutRoofs.roofs.length) {
      AppState.layoutRoofs.roofs = [defaultRoof()];
    }
    if (!AppState.layoutRoofs.activeId
        || !AppState.layoutRoofs.roofs.some(r => r.id === AppState.layoutRoofs.activeId)) {
      AppState.layoutRoofs.activeId = AppState.layoutRoofs.roofs[0].id;
    }
    return AppState.layoutRoofs;
  }

  function getRoofs() {
    return ensure()?.roofs.slice() || [];
  }

  function getActiveRoof() {
    const st = ensure();
    if (!st) return null;
    return st.roofs.find(r => r.id === st.activeId) || st.roofs[0] || null;
  }

  function setActive(id) {
    const st = ensure();
    if (!st?.roofs.some(r => r.id === id)) return false;
    st.activeId = id;
    fillFormFromActive();
    renderRoofTabs();
    if (typeof renderPanelLayoutTab === 'function') renderPanelLayoutTab();
    if (typeof Scene3D !== 'undefined') Scene3D.refresh?.();
    return true;
  }

  function addRoof(name) {
    const st = ensure();
    const n = st.roofs.length + 1;
    const base = getActiveRoof() || defaultRoof();
    const roof = defaultRoof({
      name: name || `Toiture ${n}`,
      roofW: base.roofW,
      roofD: base.roofD,
      panelW: base.panelW,
      panelH: base.panelH,
      nPanels: 6,
      rows: base.rows,
      tilt: base.tilt,
      azimuth: base.azimuth === 0 ? 90 : 0,
      gap: base.gap,
    });
    st.roofs.push(roof);
    st.activeId = roof.id;
    fillFormFromActive();
    renderRoofTabs();
    if (typeof renderPanelLayoutTab === 'function') renderPanelLayoutTab();
    return roof;
  }

  function removeRoof(id) {
    const st = ensure();
    if (st.roofs.length <= 1) return false;
    const idx = st.roofs.findIndex(r => r.id === id);
    if (idx < 0) return false;
    st.roofs.splice(idx, 1);
    if (st.activeId === id) st.activeId = st.roofs[0].id;
    fillFormFromActive();
    renderRoofTabs();
    if (typeof renderPanelLayoutTab === 'function') renderPanelLayoutTab();
    return true;
  }

  function readFormIntoRoof(roof) {
    if (!roof) return roof;
    const num = (id, fb) => {
      const el = document.getElementById(id);
      const n = el ? parseFloat(el.value) : NaN;
      return isFinite(n) ? n : fb;
    };
    roof.roofW = num('lay-roof-w', roof.roofW);
    roof.roofD = num('lay-roof-d', roof.roofD);
    roof.panelW = num('lay-panel-w', roof.panelW);
    roof.panelH = num('lay-panel-h', roof.panelH);
    roof.nPanels = Math.max(0, Math.round(num('lay-npanels', roof.nPanels)));
    roof.rows = Math.max(1, Math.round(num('lay-rows', roof.rows)));
    roof.tilt = num('lay-tilt', roof.tilt);
    roof.azimuth = num('lay-azimuth', roof.azimuth);
    const nameEl = document.getElementById('lay-roof-name');
    if (nameEl && nameEl.value.trim()) roof.name = nameEl.value.trim();
    return roof;
  }

  function saveActiveFromForm() {
    const roof = getActiveRoof();
    if (!roof) return null;
    readFormIntoRoof(roof);
    syncInstallFromRoofs();
    return roof;
  }

  function fillFormFromActive() {
    const roof = getActiveRoof();
    if (!roof) return;
    const set = (id, v) => {
      const el = document.getElementById(id);
      if (el && v != null) el.value = v;
    };
    set('lay-roof-name', roof.name);
    set('lay-roof-w', roof.roofW);
    set('lay-roof-d', roof.roofD);
    set('lay-panel-w', roof.panelW);
    set('lay-panel-h', roof.panelH);
    set('lay-npanels', roof.nPanels);
    set('lay-rows', roof.rows);
    set('lay-tilt', roof.tilt);
    set('lay-azimuth', roof.azimuth);
  }

  function renderRoofTabs() {
    const wrap = document.getElementById('lay-roof-tabs');
    if (!wrap) return;
    const st = ensure();
    wrap.innerHTML = st.roofs.map(r => {
      const active = r.id === st.activeId;
      return `<button type="button" class="lay-roof-tab${active ? ' active' : ''}" data-roof-id="${r.id}" onclick="LayoutRoofs.setActive('${r.id}')">${escapeHtml(r.name || 'Toiture')}</button>`;
    }).join('');
    const removeBtn = document.getElementById('lay-roof-remove');
    if (removeBtn) removeBtn.disabled = st.roofs.length <= 1;
    const countEl = document.getElementById('lay-roof-count');
    if (countEl) countEl.textContent = `${st.roofs.length} toiture${st.roofs.length > 1 ? 's' : ''}`;
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  }

  function totalPanels() {
    return getRoofs().reduce((s, r) => s + Math.max(0, Math.round(r.nPanels || 0)), 0);
  }

  function totalPanelSurfaceM2() {
    return getRoofs().reduce((s, r) => {
      const n = Math.max(0, Math.round(r.nPanels || 0));
      return s + n * (r.panelW || 1.13) * (r.panelH || 1.76);
    }, 0);
  }

  function totalRoofSurfaceM2() {
    return getRoofs().reduce((s, r) => s + (r.roofW || 0) * (r.roofD || 0), 0);
  }

  /** Htilt mensuel pondéré par la puissance de chaque toiture. */
  function getProductionRoofs() {
    saveActiveFromForm();
    return getRoofs().filter(r => (r.nPanels || 0) > 0);
  }

  /**
   * Répartit un total de panneaux (dimensionnement) sur les toitures existantes.
   * Conserve les proportions si déjà définies, sinon répartition équitable.
   */
  function distributePanels(totalN) {
    const st = ensure();
    saveActiveFromForm();
    const n = Math.max(0, Math.round(Number(totalN) || 0));
    if (!st.roofs.length) return;

    if (st.roofs.length === 1) {
      st.roofs[0].nPanels = n;
    } else {
      const current = st.roofs.map(r => Math.max(0, Math.round(r.nPanels || 0)));
      const sum = current.reduce((a, b) => a + b, 0);
      if (sum > 0 && n > 0) {
        let assigned = 0;
        st.roofs.forEach((r, i) => {
          if (i === st.roofs.length - 1) {
            r.nPanels = Math.max(0, n - assigned);
          } else {
            const part = Math.round(n * current[i] / sum);
            r.nPanels = part;
            assigned += part;
          }
        });
      } else if (n > 0) {
        const base = Math.floor(n / st.roofs.length);
        let rem = n - base * st.roofs.length;
        st.roofs.forEach((r, i) => {
          r.nPanels = base + (i < rem ? 1 : 0);
        });
      } else {
        st.roofs.forEach(r => { r.nPanels = 0; });
      }
    }
    fillFormFromActive();
    renderRoofTabs();
    syncInstallFromRoofs();
  }

  /** Libellé court pour les résultats de dimensionnement. */
  function productionMixLabel() {
    const roofs = getProductionRoofs();
    if (!roofs.length) return null;
    return roofs.map(r =>
      `${r.nPanels} pan · ${r.name || 'Toiture'} (${r.tilt ?? 30}° / az ${r.azimuth ?? 0}°)`
    ).join(' · ');
  }

  function weightedMonthlyHtilt(lat, weather, panelWp) {
    if (!Array.isArray(weather) || typeof SolarMath?.tiltedIrradiation !== 'function') return null;
    const roofs = getRoofs();
    let totalWp = 0;
    const monthly = weather.map(() => 0);
    roofs.forEach(r => {
      const wp = Math.max(0, Math.round(r.nPanels || 0)) * (panelWp || 400);
      if (wp <= 0) return;
      totalWp += wp;
      weather.forEach((m, i) => {
        monthly[i] += SolarMath.tiltedIrradiation(
          m.GHI, m.DHI, lat, r.tilt ?? 30, r.azimuth ?? 0, i + 1,
        ) * wp;
      });
    });
    if (totalWp <= 0) return null;
    return monthly.map(h => h / totalWp);
  }

  /** Tilt / azimut moyens pondérés (compat onglets mono-orientation). */
  function weightedOrientation(panelWp) {
    const roofs = getRoofs().filter(r => (r.nPanels || 0) > 0);
    if (!roofs.length) return null;
    let wSum = 0, tilt = 0, az = 0;
    roofs.forEach(r => {
      const w = Math.max(0, r.nPanels) * (panelWp || 400);
      wSum += w;
      tilt += (r.tilt ?? 30) * w;
      az += (r.azimuth ?? 0) * w;
    });
    if (wSum <= 0) return null;
    return { tilt: tilt / wSum, azimuth: az / wSum };
  }

  function syncInstallFromRoofs() {
    if (typeof AppState === 'undefined' || !AppState.install) return;
    const wp = AppState.install.panelWp || 400;
    const ori = weightedOrientation(wp);
    if (ori) {
      AppState.install.tilt = Math.round(ori.tilt * 10) / 10;
      AppState.install.azimuth = Math.round(ori.azimuth);
    }
    AppState.install.surface = Math.round(totalPanelSurfaceM2() * 100) / 100;
  }

  /** Panneaux pour l’ombrage 3D — coordonnées locales par toiture + offset scène. */
  function buildPanelsForShading() {
    const roofs = getRoofs();
    const allRoofs = [];
    const allPanels = [];
    let sceneX = 0;
    const sceneGap = 1.5;

    roofs.forEach((r, ri) => {
      const cfg = {
        roofW: r.roofW, roofD: r.roofD,
        panelW: r.panelW, panelH: r.panelH,
        nPanels: r.nPanels, rows: r.rows,
        gap: r.gap ?? 0.02,
        tilt: r.tilt, azimuth: r.azimuth,
      };
      const layout = typeof PanelLayout3D !== 'undefined' && PanelLayout3D.computeLayout
        ? PanelLayout3D.computeLayout(cfg)
        : null;

      allRoofs.push({
        id: r.id,
        name: r.name,
        widthM: r.roofW,
        depthM: r.roofD,
        tilt: r.tilt,
        azimuth: r.azimuth,
        sceneX,
        sceneY: 0,
      });

      if (layout && layout.nPanels > 0 && layout.cols > 0) {
        const { cols, panelW: pw, footprintH, gap: gp } = layout;
        const arrayW = cols * pw + (cols - 1) * gp;
        const arrayD = layout.rows * footprintH + (layout.rows - 1) * gp;
        const offX = (r.roofW - arrayW) / 2;
        const offY = (r.roofD - arrayD) / 2;
        let placed = 0;
        for (let row = 0; row < layout.rows && placed < layout.nPanels; row++) {
          for (let col = 0; col < cols && placed < layout.nPanels; col++, placed++) {
            allPanels.push({
              id: `${r.id}-${placed}`,
              roofId: r.id,
              row, col,
              x: sceneX + offX + col * (pw + gp),
              y: offY + row * (footprintH + gp),
              w: pw,
              d: footprintH,
              h: r.panelH * Math.sin((r.tilt * Math.PI) / 180),
              tilt: r.tilt,
              azimuth: r.azimuth,
            });
          }
        }
      }
      sceneX += r.roofW + sceneGap;
    });

    return { roofs: allRoofs, panels: allPanels };
  }

  function migrateLegacy() {
    const st = ensure();
    if (st.roofs.length > 1) return;
    const g = (id) => parseFloat(document.getElementById(id)?.value);
    const hasForm = document.getElementById('lay-npanels');
    const legacyRoof = AppState?.siteSurvey?.roof;
    const r0 = st.roofs[0];
    if (hasForm) {
      readFormIntoRoof(r0);
    } else if (legacyRoof) {
      Object.assign(r0, {
        roofW: legacyRoof.widthM ?? r0.roofW,
        roofD: legacyRoof.depthM ?? r0.roofD,
        tilt: legacyRoof.tilt ?? r0.tilt,
        azimuth: legacyRoof.azimuth ?? r0.azimuth,
      });
    } else if (AppState?.install) {
      r0.tilt = AppState.install.tilt ?? r0.tilt;
      r0.azimuth = AppState.install.azimuth ?? r0.azimuth;
    }
  }

  function loadFromAppState() {
    if (typeof AppState === 'undefined') return;
    if (!AppState.layoutRoofs?.roofs?.length) {
      ensure();
      migrateLegacy();
    } else {
      ensure();
    }
    fillFormFromActive();
    renderRoofTabs();
  }

  function snapshot() {
    const st = ensure();
    saveActiveFromForm();
    return JSON.parse(JSON.stringify(st));
  }

  function restore(data) {
    if (!data?.roofs?.length) {
      AppState.layoutRoofs = { activeId: null, roofs: [defaultRoof()] };
      migrateLegacy();
    } else {
      AppState.layoutRoofs = JSON.parse(JSON.stringify(data));
      ensure();
    }
    fillFormFromActive();
    renderRoofTabs();
    syncInstallFromRoofs();
  }

  return {
    defaultRoof,
    ensure,
    getRoofs,
    getActiveRoof,
    getProductionRoofs,
    distributePanels,
    productionMixLabel,
    setActive,
    addRoof,
    removeRoof,
    saveActiveFromForm,
    fillFormFromActive,
    renderRoofTabs,
    totalPanels,
    totalPanelSurfaceM2,
    totalRoofSurfaceM2,
    weightedMonthlyHtilt,
    weightedOrientation,
    syncInstallFromRoofs,
    buildPanelsForShading,
    migrateLegacy,
    loadFromAppState,
    snapshot,
    restore,
  };
})();

if (typeof window !== 'undefined') window.LayoutRoofs = LayoutRoofs;
