/**
 * native_bridge.js — Pont Qt (QWebChannel) pour l’AppImage / APK.
 * Expose window.webBridge (= getNativeBridge()) quand le shell Qt est présent.
 * En navigateur pur : null (git / dialogue fichier non disponibles).
 */
(function (global) {
  function bind(obj) {
    if (!obj) return;
    global.webBridge = obj;
    global.nativeBridge = obj;
    // Après connexion Qt : retenter restauration projets (localStorage vide / MAJ)
    try {
      if (typeof ProjectManager !== 'undefined' && ProjectManager.list)
        ProjectManager.list();
    } catch (_) {}
  }

  function connectQt() {
    if (typeof qt === 'undefined' || !qt.webChannelTransport) return;

    let attempts = 0;
    const maxAttempts = 40; // ~8 s — le registerObject QML peut arriver après le 1er paint

    function attach() {
      // eslint-disable-next-line no-undef
      new QWebChannel(qt.webChannelTransport, function (channel) {
        const obj = channel.objects && channel.objects.webBridge;
        if (obj) {
          bind(obj);
          return;
        }
        attempts += 1;
        if (attempts < maxAttempts)
          setTimeout(attach, 200);
        else
          console.warn('[native_bridge] webBridge Qt absent (registerObject trop tard ?)');
      });
    }

    if (typeof QWebChannel === 'function') {
      attach();
      return;
    }
    const s = document.createElement('script');
    s.src = 'qrc:///qtwebchannel/qwebchannel.js';
    s.onload = attach;
    s.onerror = function () {
      console.warn('[native_bridge] qwebchannel.js indisponible');
    };
    document.head.appendChild(s);
  }

  global.getNativeBridge = function () {
    return global.webBridge || global.nativeBridge || null;
  };

  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', connectQt);
  else
    connectQt();
})(typeof window !== 'undefined' ? window : globalThis);
