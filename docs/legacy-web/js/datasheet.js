/**
 * datasheet.js — Ouvre une fiche technique PDF dans la visioneuse système.
 * Flux : télécharge l’URL (ou lit un chemin), puis demande au shell d’ouvrir
 * le PDF (Android Intent / QDesktopServices) — le système propose une visioneuse.
 */
const Datasheet = (() => {

  function _toast(msg, kind) {
    if (typeof showToast === 'function') showToast(msg, kind);
  }

  function _bridge() {
    return typeof getNativeBridge === 'function' ? getNativeBridge() : null;
  }

  function _bytesToBase64(buf) {
    const bytes = buf instanceof ArrayBuffer ? new Uint8Array(buf) : buf;
    let bin = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(bin);
  }

  function _safeName(url, fallback) {
    try {
      const u = new URL(url, location.href);
      const base = (u.pathname.split('/').pop() || '').replace(/[^\w.\-]+/g, '_');
      if (base.toLowerCase().endsWith('.pdf')) return base;
      if (base) return base + '.pdf';
    } catch { /* ignore */ }
    return fallback || 'fiche_technique.pdf';
  }

  async function _fetchPdfBytes(url) {
    const res = await fetch(url, { credentials: 'omit', mode: 'cors' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const buf = await res.arrayBuffer();
    if (buf.byteLength < 5) throw new Error('PDF vide');
    const head = new Uint8Array(buf.slice(0, 5));
    const sig = String.fromCharCode(...head);
    if (sig !== '%PDF-') throw new Error('Réponse non-PDF');
    return buf;
  }

  /**
   * Ouvre un PDF (URL http(s), chemin relatif app, ou chemin fichier absolu).
   * Demande toujours une visioneuse PDF via le shell natif si possible.
   */
  async function open(urlOrPath, opts) {
    const raw = String(urlOrPath || '').trim();
    if (!raw) {
      _toast('Aucune fiche technique disponible.', 'warning');
      return false;
    }
    const filename = (opts && opts.filename) || _safeName(raw, 'fiche_technique.pdf');
    const bridge = _bridge();

    try {
      // Chemin local absolu / file:// → shell directement
      if (/^file:\/\//i.test(raw) || /^(\/|[A-Za-z]:\\)/.test(raw)) {
        if (bridge?.openExternal) {
          bridge.openExternal(raw);
          _toast('Ouverture de la visioneuse PDF…');
          return true;
        }
        window.open(raw, '_blank', 'noopener');
        return true;
      }

      // URL http(s) : préférer le téléchargement natif (pas de CORS WebView)
      if (/^https?:\/\//i.test(raw) && bridge?.openPdfFromUrl) {
        _toast('Téléchargement de la fiche PDF…');
        const ok = await Promise.resolve(bridge.openPdfFromUrl(raw));
        if (ok !== false) {
          _toast('Choisissez une visioneuse PDF…');
          return true;
        }
      }

      // URL relative (assets embarqués) ou http(s) via fetch
      let fetchUrl = raw;
      if (!/^https?:\/\//i.test(raw)) {
        fetchUrl = new URL(raw, location.href).href;
      }

      _toast('Téléchargement de la fiche PDF…');
      const buf = await _fetchPdfBytes(fetchUrl);
      const b64 = _bytesToBase64(buf);

      if (bridge?.openPdf) {
        const ok = await Promise.resolve(bridge.openPdf(filename, b64));
        if (ok !== false) {
          _toast('Choisissez une visioneuse PDF…');
          return true;
        }
      }

      // Fallback : shareFile (souvent ACTION_SEND / enregistrer) puis blob
      if (bridge?.shareFile) {
        bridge.shareFile(filename, 'application/pdf', b64);
        _toast('Ouvrez le PDF avec une visioneuse…');
        return true;
      }

      const blob = new Blob([buf], { type: 'application/pdf' });
      const obj = URL.createObjectURL(blob);
      const w = window.open(obj, '_blank', 'noopener');
      if (!w) {
        const a = document.createElement('a');
        a.href = obj;
        a.download = filename;
        a.rel = 'noopener';
        document.body.appendChild(a);
        a.click();
        a.remove();
        _toast('PDF téléchargé — ouvrez-le avec une visioneuse.', 'warning');
      } else {
        _toast('PDF ouvert dans le navigateur / visioneuse.');
      }
      setTimeout(() => URL.revokeObjectURL(obj), 60_000);
      return true;
    } catch (e) {
      console.error('Datasheet.open', e);
      // Dernier recours : ouvrir l’URL distante telle quelle
      if (bridge?.openExternal && /^https?:\/\//i.test(raw)) {
        bridge.openExternal(raw);
        _toast('Ouverture du lien fiche technique…', 'warning');
        return true;
      }
      if (/^https?:\/\//i.test(raw)) {
        window.open(raw, '_blank', 'noopener');
        return true;
      }
      _toast('Impossible d’ouvrir la fiche PDF : ' + (e.message || e), 'error');
      return false;
    }
  }

  return { open };
})();
