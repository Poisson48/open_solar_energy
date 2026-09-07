/**
 * project_share.js — Partage de projets sans serveur (relais Nostr publics)
 *
 * Comme Colo Course / Open Bingo :
 *  - Clé courte saisissable (OSE-XXXX-XXXX-XXXX-XXXX) pour PC sans caméra
 *  - URI + QR pour téléphone / tablette
 *  - Snapshot chiffré AES-GCM, signé Nostr (kind 30078)
 *
 * Dépend de : vendor/ose_crypto.js (OseCrypto), vendor/qrcode.min.js (qrcode),
 *             ProjectManager, showToast, buildProjectData, loadProject
 */

var ProjectShare = (() => {
  const KIND = 30078;
  const SCHEME = 'opensolar';
  const RELAYS = [
    'wss://nos.lol',
    'wss://relay.nostr.band',
    'wss://offchain.pub',
    'wss://nostr.mom',
    'wss://relay.damus.io', // parfois 503 — en dernier recours
  ];
  const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  const DEVICE_KEY = 'ose_share_device_id';

  /** @type {Map<string, {sockets: WebSocket[], channelTag: string, keyBytes: Uint8Array}>} */
  const _sessions = new Map();
  let _publishTimer = null;
  let _joining = false;

  // ── Utils ────────────────────────────────────────────────────

  function _crypto() {
    if (typeof OseCrypto === 'undefined')
      throw new Error('OseCrypto manquant (vendor/ose_crypto.js)');
    return OseCrypto;
  }

  function _bytesToB64(u8) {
    let bin = '';
    const chunk = 0x8000;
    for (let i = 0; i < u8.length; i += chunk)
      bin += String.fromCharCode.apply(null, u8.subarray(i, i + chunk));
    return btoa(bin);
  }

  function _b64ToBytes(b64) {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function _b64url(u8) {
    return _bytesToB64(u8).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function _b64urlToBytes(s) {
    let b64 = String(s).replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    return _b64ToBytes(b64);
  }

  function _hex(u8) {
    return _crypto().bytesToHex(u8);
  }

  function deviceId() {
    try {
      let id = localStorage.getItem(DEVICE_KEY);
      if (!id) {
        id = 'dev_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
        localStorage.setItem(DEVICE_KEY, id);
      }
      return id;
    } catch {
      return 'dev_anon';
    }
  }

  /** 10 octets → clé courte OSE-XXXX-XXXX-XXXX-XXXX (16 chars Crockford) */
  function encodeShortKey(keyBytes) {
    let bits = 0n;
    for (const b of keyBytes) bits = (bits << 8n) | BigInt(b);
    const nChars = Math.ceil(keyBytes.length * 8 / 5);
    let chars = '';
    for (let i = nChars - 1; i >= 0; i--) {
      const shift = BigInt(i * 5);
      chars += CROCKFORD[Number((bits >> shift) & 31n)];
    }
    const groups = chars.match(/.{1,4}/g) || [chars];
    return 'OSE-' + groups.join('-');
  }

  function decodeShortKey(text) {
    const raw = String(text || '').toUpperCase().replace(/^OSE-/, '').replace(/[^0-9A-Z]/g, '')
      .replace(/O/g, '0').replace(/[IL]/g, '1');
    if (raw.length < 16) throw new Error('Clé trop courte');
    const chars = raw.slice(0, 16);
    let bits = 0n;
    for (const ch of chars) {
      const idx = CROCKFORD.indexOf(ch);
      if (idx < 0) throw new Error('Caractère invalide dans la clé');
      bits = (bits << 5n) | BigInt(idx);
    }
    // 16×5 = 80 bits → 10 octets
    const out = new Uint8Array(10);
    for (let i = 9; i >= 0; i--) {
      out[i] = Number(bits & 0xffn);
      bits >>= 8n;
    }
    return out;
  }

  function generateKeyBytes() {
    const u8 = new Uint8Array(10);
    crypto.getRandomValues(u8);
    return u8;
  }

  function _cat(prefix, keyBytes) {
    const p = new TextEncoder().encode(prefix);
    const out = new Uint8Array(p.length + keyBytes.length);
    out.set(p, 0);
    out.set(keyBytes, p.length);
    return out;
  }

  async function deriveMaterial(keyBytes) {
    const C = _crypto();
    const channelTag = _hex(C.hashSha256(_cat('opensolar/v1/channel', keyBytes))).slice(0, 32);
    let seed = C.hashSha256(_cat('opensolar/v1/nostrkey', keyBytes));
    const aesRaw = C.hashSha256(_cat('opensolar/v1/aes', keyBytes));
    // rare: ensure valid secp256k1 private key by rehashing if needed
    for (let i = 0; i < 8; i++) {
      try {
        const privHex = _hex(seed);
        const pubHex = C.getPublicKey(privHex);
        return { channelTag, privHex, pubHex, aesRaw };
      } catch {
        seed = C.hashSha256(seed);
      }
    }
    throw new Error('Impossible de dériver la clé Nostr');
  }

  async function encryptPayload(aesRaw, channelTag, plaintext) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await crypto.subtle.importKey('raw', aesRaw, { name: 'AES-GCM' }, false, ['encrypt']);
    const ad = new TextEncoder().encode(channelTag);
    const ct = new Uint8Array(await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: ad },
      key,
      new TextEncoder().encode(plaintext)
    ));
    const out = new Uint8Array(iv.length + ct.length);
    out.set(iv, 0);
    out.set(ct, iv.length);
    return _bytesToB64(out);
  }

  async function decryptPayload(aesRaw, channelTag, b64) {
    const all = _b64ToBytes(b64);
    const iv = all.slice(0, 12);
    const ct = all.slice(12);
    const key = await crypto.subtle.importKey('raw', aesRaw, { name: 'AES-GCM' }, false, ['decrypt']);
    const ad = new TextEncoder().encode(channelTag);
    const pt = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv, additionalData: ad },
      key,
      ct
    );
    return new TextDecoder().decode(pt);
  }

  function buildUri(keyBytes, title) {
    const keyPart = _b64url(keyBytes);
    const titlePart = encodeURIComponent(title || 'Projet');
    return `${SCHEME}://join/1/${keyPart}/${titlePart}`;
  }

  function parseInvite(input) {
    const s = String(input || '').trim();
    if (!s) throw new Error('Collez une clé ou une URI');

    // URI opensolar://join/1/<b64url_key>/<title>
    const m = s.match(/^(?:opensolar:\/\/|https?:\/\/opensolar\.app\/)join\/1\/([^/\s]+)(?:\/([^\s]*))?/i);
    if (m) {
      const keyBytes = _b64urlToBytes(m[1]);
      if (keyBytes.length < 8 || keyBytes.length > 32)
        throw new Error('Clé URI invalide');
      let title = 'Projet partagé';
      try { title = decodeURIComponent(m[2] || title); } catch { /* keep */ }
      return { keyBytes: keyBytes.length === 10 ? keyBytes : keyBytes.slice(0, 10), title };
    }

    // Short key
    if (/OSE[- ]/i.test(s) || /^[0-9A-HJ-NP-Z]{16,}$/i.test(s.replace(/[\s-]/g, ''))) {
      return { keyBytes: decodeShortKey(s), title: 'Projet partagé' };
    }

    // Bare base64url key (22 chars for 16 bytes, ~14 for 10 bytes)
    if (/^[A-Za-z0-9_-]{14,44}$/.test(s)) {
      const keyBytes = _b64urlToBytes(s);
      if (keyBytes.length >= 10)
        return { keyBytes: keyBytes.slice(0, 10), title: 'Projet partagé' };
    }

    throw new Error('Format non reconnu — clé OSE-… ou URI opensolar://join/…');
  }

  // ── Nostr event ──────────────────────────────────────────────

  function serializeEvent(evt) {
    return JSON.stringify([0, evt.pubkey, evt.created_at, evt.kind, evt.tags, evt.content]);
  }

  function signEvent(evt, privHex) {
    const C = _crypto();
    const id = _hex(C.hashSha256(new TextEncoder().encode(serializeEvent(evt))));
    const sig = C.signSchnorr(id, privHex);
    return { ...evt, id, sig };
  }

  async function makeSnapEvent(project, share, mat) {
    const rev = (share.rev || 0) + 1;
    const savedAt = Date.now();
    // Horodatage de save : source de vérité LWW multi-appareils
    if (!project.updatedAt) project.updatedAt = new Date(savedAt).toISOString();
    share.savedAt = savedAt;
    const payload = {
      v: 1,
      t: 'snap',
      rev,
      by: deviceId(),
      at: savedAt,
      project: _stripForSync(project),
    };
    const content = await encryptPayload(mat.aesRaw, mat.channelTag, JSON.stringify(payload));
    const evt = {
      kind: KIND,
      created_at: Math.floor(savedAt / 1000),
      tags: [
        ['d', mat.channelTag],
        ['t', mat.channelTag],
        ['rev', String(rev)],
        ['at', String(savedAt)],
      ],
      content,
      pubkey: mat.pubHex,
    };
    return { event: signEvent(evt, mat.privHex), rev, payload, savedAt };
  }

  function _stripForSync(project) {
    const p = JSON.parse(JSON.stringify(project));
    if (p.share) {
      p.share = {
        enabled: true,
        keyB64: p.share.keyB64,
        rev: p.share.rev || 0,
        savedAt: p.share.savedAt || 0,
      };
    }
    // Relais Nostr ~64 Ko : les courbes Enedis 30 min dépassent souvent la limite
    const probe = JSON.stringify(p);
    if (probe.length > 48000 && p.hourlyEnedisData) {
      p.hourlyEnedisOmitted = true;
      p.hourlyEnedisData = null;
    }
    if (JSON.stringify(p).length > 55000 && p.weatherData) {
      p.weatherDataOmitted = true;
      // garder un résumé minimal si présent
      p.weatherData = null;
    }
    return p;
  }

  // ── Relays ───────────────────────────────────────────────────

  function _connectRelays(onMsg) {
    const sockets = [];
    for (const url of RELAYS) {
      let ws;
      try { ws = new WebSocket(url); } catch { continue; }
      ws._oseUrl = url;
      ws.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data);
          if (Array.isArray(data) && data[0] === 'EVENT') onMsg(data[2], url);
        } catch { /* ignore */ }
      };
      ws.onerror = () => { /* ignore */ };
      sockets.push(ws);
    }
    return sockets;
  }

  function _whenOpen(ws, timeoutMs = 8000) {
    if (ws.readyState === WebSocket.OPEN) return Promise.resolve(true);
    return new Promise((resolve) => {
      const t = setTimeout(() => resolve(false), timeoutMs);
      ws.addEventListener('open', () => { clearTimeout(t); resolve(true); }, { once: true });
      ws.addEventListener('error', () => { clearTimeout(t); resolve(false); }, { once: true });
      ws.addEventListener('close', () => { clearTimeout(t); resolve(false); }, { once: true });
    });
  }

  async function publishEvent(event) {
    const sockets = _connectRelays(() => {});
    const msg = JSON.stringify(['EVENT', event]);
    let ok = 0;
    await Promise.all(sockets.map(async (ws) => {
      const open = await _whenOpen(ws);
      if (!open) { try { ws.close(); } catch { /* */ } return; }
      try {
        ws.send(msg);
        ok++;
        setTimeout(() => { try { ws.close(); } catch { /* */ } }, 1500);
      } catch { try { ws.close(); } catch { /* */ } }
    }));
    return ok;
  }

  function subscribeChannel(projectId, keyBytes, mat, onSnap) {
    stopSession(projectId);
    const seen = new Set();
    const filter = {
      kinds: [KIND],
      authors: [mat.pubHex],
      '#d': [mat.channelTag],
      limit: 5,
    };
    const subId = 'ose_' + mat.channelTag.slice(0, 12);
    const sockets = _connectRelays(async (evt) => {
      if (!evt || !evt.id || seen.has(evt.id)) return;
      seen.add(evt.id);
      try {
        const json = await decryptPayload(mat.aesRaw, mat.channelTag, evt.content);
        const payload = JSON.parse(json);
        if (payload?.v !== 1 || payload.t !== 'snap' || !payload.project) return;
        onSnap(payload, evt);
      } catch (e) {
        console.warn('[ProjectShare] decrypt', e);
      }
    });
    sockets.forEach(async (ws) => {
      const open = await _whenOpen(ws);
      if (!open) return;
      try {
        ws.send(JSON.stringify(['REQ', subId, filter]));
      } catch { /* */ }
    });
    _sessions.set(projectId, { sockets, channelTag: mat.channelTag, keyBytes, subId });
  }

  function stopSession(projectId) {
    const s = _sessions.get(projectId);
    if (!s) return;
    s.sockets.forEach((ws) => {
      try {
        if (s.subId && ws.readyState === WebSocket.OPEN)
          ws.send(JSON.stringify(['CLOSE', s.subId]));
        ws.close();
      } catch { /* */ }
    });
    _sessions.delete(projectId);
  }

  function stopAll() {
    [..._sessions.keys()].forEach(stopSession);
  }

  // ── Project share lifecycle ──────────────────────────────────

  function ensureShareOnProject(project) {
    if (project.share?.keyB64) return project.share;
    const keyBytes = generateKeyBytes();
    project.share = {
      enabled: true,
      keyB64: _bytesToB64(keyBytes),
      rev: 0,
      createdAt: new Date().toISOString(),
    };
    return project.share;
  }

  function keyBytesFromShare(share) {
    return _b64ToBytes(share.keyB64);
  }

  async function enableAndPublish(projectId) {
    const project = ProjectManager.get(projectId);
    if (!project) throw new Error('Projet introuvable');
    const share = ensureShareOnProject(project);
    share.enabled = true;
    ProjectManager.save(project);

    const keyBytes = keyBytesFromShare(share);
    const mat = await deriveMaterial(keyBytes);
    const { event, rev, savedAt } = await makeSnapEvent(project, share, mat);
    share.rev = rev;
    share.savedAt = savedAt;
    ProjectManager.save(project, { keepUpdatedAt: true });

    const n = await publishEvent(event);
    subscribeForProject(project);
    return {
      project,
      shortKey: encodeShortKey(keyBytes),
      uri: buildUri(keyBytes, project.name),
      relaysOk: n,
      rev,
    };
  }

  function subscribeForProject(project) {
    if (!project?.share?.enabled || !project.share.keyB64) return;
    const keyBytes = keyBytesFromShare(project.share);
    deriveMaterial(keyBytes).then((mat) => {
      subscribeChannel(project.id, keyBytes, mat, (payload) => {
        _onRemoteSnap(project.id, payload);
      });
    }).catch((e) => console.warn('[ProjectShare] sub', e));
  }

  /** Instant de la save (ms) — pour last-write-wins. */
  function _snapTimeMs(payload, project) {
    if (payload && Number(payload.at) > 0) return Number(payload.at);
    const shareAt = project?.share?.savedAt;
    if (Number(shareAt) > 0) return Number(shareAt);
    const u = project?.updatedAt || payload?.project?.updatedAt;
    const parsed = Date.parse(u || '');
    return Number.isFinite(parsed) ? parsed : 0;
  }

  /**
   * La save la plus récente gagne (horodatage), rev en départage.
   * Chaque appareil garde une copie locale ; on n’applique le distant que s’il est plus neuf.
   */
  function _shouldApplyRemote(local, payload) {
    if (!local?.share) return false;
    if (payload.by && payload.by === deviceId()) return false;
    const remoteTs = _snapTimeMs(payload, payload.project);
    const localTs = _snapTimeMs(null, local);
    const remoteRev = payload.rev || 0;
    const localRev = local.share.rev || 0;
    const SKEW = 250; // ms — anti-rebond
    if (remoteTs > localTs + SKEW) return true;
    if (remoteTs + SKEW < localTs) return false;
    // Horodatages équivalents → révision
    if (remoteRev > localRev) return true;
    return false;
  }

  function _onRemoteSnap(projectId, payload) {
    const local = ProjectManager.get(projectId);
    if (!local?.share) return;
    if (!_shouldApplyRemote(local, payload)) return;

    const incoming = payload.project;
    if (!incoming || typeof incoming !== 'object') return;

    const remoteRev = payload.rev || 0;
    const remoteTs = _snapTimeMs(payload, incoming);
    const updatedAt = incoming.updatedAt
      || (remoteTs ? new Date(remoteTs).toISOString() : new Date().toISOString());

    // Fusion : garder l’id local + clé de partage, prendre le contenu distant (LWW)
    const merged = {
      ...incoming,
      id: local.id,
      updatedAt,
      share: {
        ...local.share,
        enabled: true,
        keyB64: local.share.keyB64,
        rev: Math.max(local.share.rev || 0, remoteRev),
        savedAt: remoteTs || local.share.savedAt || 0,
      },
      isDemo: false,
    };
    // Si le snapshot a omis les gros blobs, conserver la copie locale
    if (incoming.hourlyEnedisOmitted && local.hourlyEnedisData)
      merged.hourlyEnedisData = local.hourlyEnedisData;
    if (incoming.weatherDataOmitted && local.weatherData)
      merged.weatherData = local.weatherData;

    // Ne pas réécrire updatedAt à « maintenant » : garder l’horodatage de la save distante
    ProjectManager.save(merged, { keepUpdatedAt: true });

    if (typeof showToast === 'function')
      showToast(`☁ Projet synchronisé (save la plus récente)`);

    if (AppState.currentProjectId === projectId && typeof loadProject === 'function') {
      loadProject(projectId);
    }
    if (typeof _refreshProjectLists === 'function') _refreshProjectLists();
  }

  async function publishProjectNow(projectId) {
    const project = typeof projectId === 'object' ? projectId : ProjectManager.get(projectId);
    if (!project?.share?.enabled || !project.share.keyB64) return false;
    const keyBytes = keyBytesFromShare(project.share);
    const mat = await deriveMaterial(keyBytes);
    const { event, rev, savedAt } = await makeSnapEvent(project, project.share, mat);
    project.share.rev = rev;
    project.share.savedAt = savedAt;
    // Conserver l’updatedAt de la save locale (déjà posé par ProjectManager.save)
    ProjectManager.save(project, { keepUpdatedAt: true });
    const n = await publishEvent(event);
    return n > 0;
  }

  function schedulePublish(projectId) {
    clearTimeout(_publishTimer);
    _publishTimer = setTimeout(() => {
      publishProjectNow(projectId).catch((e) => console.warn('[ProjectShare] pub', e));
    }, 800);
  }

  async function joinWithInvite(input) {
    if (_joining) throw new Error('Import déjà en cours…');
    _joining = true;
    try {
      const { keyBytes, title } = parseInvite(input);
      const mat = await deriveMaterial(keyBytes);
      const shortKey = encodeShortKey(keyBytes);

      // Déjà lié localement ?
      const existing = ProjectManager.list().find((p) => p.share?.keyB64 === _bytesToB64(keyBytes));
      if (existing) {
        existing.share.enabled = true;
        if (existing.share.savedAt == null) existing.share.savedAt = 0;
        ProjectManager.save(existing);
        if (typeof ProjectManager.flushBackup === 'function') ProjectManager.flushBackup();
        subscribeForProject(existing);
        return { project: existing, shortKey, already: true };
      }

      const payload = await _fetchLatestSnap(keyBytes, mat, 12000);
      let project;
      if (payload?.project) {
        project = {
          ...payload.project,
          id: ProjectManager.newId(),
          name: payload.project.name || title,
          isDemo: false,
          updatedAt: payload.project.updatedAt
            || (payload.at ? new Date(payload.at).toISOString() : new Date().toISOString()),
          share: {
            enabled: true,
            keyB64: _bytesToB64(keyBytes),
            rev: payload.rev || 0,
            savedAt: Number(payload.at) || Date.now(),
            createdAt: new Date().toISOString(),
          },
        };
      } else {
        // Pas encore de snapshot : créer un projet vide lié (hôte n’a pas encore publié)
        project = {
          id: ProjectManager.newId(),
          name: title || 'Projet partagé',
          installationType: 'grid',
          client: { nom: '', adresse: '', tel: '', email: '' },
          location: { lat: null, lon: null, alt: null, name: '' },
          weatherData: null,
          formState: {},
          summary: {},
          share: {
            enabled: true,
            keyB64: _bytesToB64(keyBytes),
            rev: 0,
            savedAt: 0,
            createdAt: new Date().toISOString(),
          },
        };
      }
      ProjectManager.save(project, { keepUpdatedAt: true });
      if (typeof ProjectManager.flushBackup === 'function') ProjectManager.flushBackup();
      subscribeForProject(project);
      return { project, shortKey, empty: !payload };
    } finally {
      _joining = false;
    }
  }

  function _fetchLatestSnap(keyBytes, mat, timeoutMs) {
    return new Promise((resolve) => {
      let best = null;
      let settled = false;
      const finish = (val) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        stopSession('_join_tmp');
        resolve(val);
      };
      const timer = setTimeout(() => finish(best), timeoutMs);

      // session temporaire
      const seen = new Set();
      const filter = {
        kinds: [KIND],
        authors: [mat.pubHex],
        '#d': [mat.channelTag],
        limit: 8,
      };
      const subId = 'ose_join_' + mat.channelTag.slice(0, 8);
      const sockets = _connectRelays(async (evt) => {
        if (!evt?.id || seen.has(evt.id)) return;
        seen.add(evt.id);
        try {
          const json = await decryptPayload(mat.aesRaw, mat.channelTag, evt.content);
          const payload = JSON.parse(json);
          if (payload?.v !== 1 || payload.t !== 'snap') return;
          if (!best || (payload.rev || 0) > (best.rev || 0)) best = payload;
          // parameterized replaceable → first good snap is usually enough; wait a bit for more
          if ((payload.rev || 0) > 0) {
            setTimeout(() => finish(best), 600);
          }
        } catch { /* */ }
      });
      _sessions.set('_join_tmp', { sockets, channelTag: mat.channelTag, keyBytes, subId });
      sockets.forEach(async (ws) => {
        if (await _whenOpen(ws)) {
          try { ws.send(JSON.stringify(['REQ', subId, filter])); } catch { /* */ }
        }
      });
    });
  }

  function resumeAllShared() {
    ProjectManager.list().forEach((p) => {
      if (p.share?.enabled && p.share.keyB64) subscribeForProject(p);
    });
  }

  function getInviteInfo(projectId) {
    const project = ProjectManager.get(projectId);
    if (!project?.share?.keyB64) return null;
    const keyBytes = keyBytesFromShare(project.share);
    return {
      shortKey: encodeShortKey(keyBytes),
      uri: buildUri(keyBytes, project.name),
      enabled: !!project.share.enabled,
      rev: project.share.rev || 0,
    };
  }

  function renderQr(container, text) {
    if (!container) return;
    container.innerHTML = '';
    if (typeof qrcode !== 'function') {
      container.textContent = 'QR indisponible';
      return;
    }
    try {
      const qr = qrcode(0, 'M');
      qr.addData(text);
      qr.make();
      container.innerHTML = qr.createSvgTag(4, 0);
      const svg = container.querySelector('svg');
      if (svg) {
        svg.style.width = '100%';
        svg.style.maxWidth = '220px';
        svg.style.height = 'auto';
        svg.setAttribute('aria-label', 'QR code de partage');
      }
    } catch (e) {
      container.textContent = 'Erreur QR : ' + (e.message || e);
    }
  }

  // ── UI ───────────────────────────────────────────────────────

  function openShareModal(projectId) {
    const project = ProjectManager.get(projectId);
    if (!project) return;

    let overlay = document.getElementById('ose-share-modal');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'ose-share-modal';
      overlay.className = 'ose-share-overlay';
      overlay.innerHTML = `
        <div class="ose-share-dialog" role="dialog" aria-modal="true" aria-labelledby="ose-share-title">
          <div class="ose-share-head">
            <h3 id="ose-share-title">Partager le projet</h3>
            <button type="button" class="btn btn-outline btn-sm" id="ose-share-close" aria-label="Fermer">✕</button>
          </div>
          <p class="ose-share-hint">Sans serveur : chiffrement de bout en bout via relais Nostr publics. Chaque appareil garde une copie locale ; la sauvegarde la plus récente écrase l’ancienne. Quiconque a la clé peut lire et modifier le projet.</p>
          <div id="ose-share-status" class="ose-share-status">Préparation…</div>
          <div class="ose-share-qr" id="ose-share-qr"></div>
          <label class="ose-share-label">Clé courte (saisie sur PC)</label>
          <div class="ose-share-keyrow">
            <code id="ose-share-short" class="ose-share-short"></code>
            <button type="button" class="btn btn-primary btn-sm" id="ose-share-copy-key">Copier</button>
          </div>
          <label class="ose-share-label">Lien complet (QR / collage)</label>
          <div class="ose-share-keyrow">
            <input type="text" id="ose-share-uri" readonly class="ose-share-uri">
            <button type="button" class="btn btn-outline btn-sm" id="ose-share-copy-uri">Copier</button>
          </div>
          <div class="ose-share-actions">
            <button type="button" class="btn btn-outline btn-sm" id="ose-share-republish">↻ Republier</button>
            <button type="button" class="btn btn-outline btn-sm" id="ose-share-disable" style="color:var(--color-danger);border-color:var(--color-danger)">Désactiver sync</button>
          </div>
        </div>`;
      document.body.appendChild(overlay);
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeShareModal();
      });
      document.getElementById('ose-share-close').onclick = closeShareModal;
    }

    overlay.dataset.projectId = projectId;
    overlay.classList.add('open');
    const status = document.getElementById('ose-share-status');
    status.textContent = 'Publication sur les relais…';

    enableAndPublish(projectId).then((info) => {
      document.getElementById('ose-share-short').textContent = info.shortKey;
      document.getElementById('ose-share-uri').value = info.uri;
      renderQr(document.getElementById('ose-share-qr'), info.uri);
      status.textContent = info.relaysOk
        ? `✓ Publié (rev ${info.rev}, ${info.relaysOk} relais)`
        : '⚠ Relais injoignables — la clé est prête ; republiez plus tard';
    }).catch((e) => {
      status.textContent = 'Erreur : ' + (e.message || e);
    });

    document.getElementById('ose-share-copy-key').onclick = () => {
      const t = document.getElementById('ose-share-short').textContent;
      _copy(t, 'Clé copiée');
    };
    document.getElementById('ose-share-copy-uri').onclick = () => {
      const t = document.getElementById('ose-share-uri').value;
      _copy(t, 'Lien copié');
    };
    document.getElementById('ose-share-republish').onclick = async () => {
      status.textContent = 'Republication…';
      try {
        const ok = await publishProjectNow(projectId);
        const info = getInviteInfo(projectId);
        status.textContent = ok
          ? `✓ Republicé (rev ${info?.rev || '?'})`
          : '⚠ Aucun relais n’a accepté l’événement';
      } catch (e) {
        status.textContent = 'Erreur : ' + (e.message || e);
      }
    };
    document.getElementById('ose-share-disable').onclick = () => {
      const p = ProjectManager.get(projectId);
      if (!p?.share) return;
      p.share.enabled = false;
      ProjectManager.save(p);
      stopSession(projectId);
      status.textContent = 'Sync désactivée (la clé reste valide si vous réactivez)';
      if (typeof _refreshProjectLists === 'function') _refreshProjectLists();
    };
  }

  function closeShareModal() {
    document.getElementById('ose-share-modal')?.classList.remove('open');
  }

  function openJoinModal() {
    let overlay = document.getElementById('ose-join-modal');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'ose-join-modal';
      overlay.className = 'ose-share-overlay';
      overlay.innerHTML = `
        <div class="ose-share-dialog" role="dialog" aria-modal="true" aria-labelledby="ose-join-title">
          <div class="ose-share-head">
            <h3 id="ose-join-title">Rejoindre un projet</h3>
            <button type="button" class="btn btn-outline btn-sm" id="ose-join-close" aria-label="Fermer">✕</button>
          </div>
          <p class="ose-share-hint">Collez la clé courte <strong>OSE-…</strong> ou l’URI <code>opensolar://join/…</code> (sans caméra sur PC).</p>
          <textarea id="ose-join-input" rows="3" placeholder="OSE-XXXX-XXXX-XXXX-XXXX&#10;ou opensolar://join/1/…" class="ose-share-input"></textarea>
          <div id="ose-join-status" class="ose-share-status"></div>
          <div class="ose-share-actions">
            <button type="button" class="btn btn-outline" id="ose-join-cancel">Annuler</button>
            <button type="button" class="btn btn-primary" id="ose-join-go">Rejoindre</button>
          </div>
        </div>`;
      document.body.appendChild(overlay);
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeJoinModal();
      });
    }
    // Toujours rebrancher (modale réutilisée) + garantir « Annuler » visible
    const actions = overlay.querySelector('.ose-share-actions');
    if (actions && !document.getElementById('ose-join-cancel')) {
      const cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.className = 'btn btn-outline';
      cancel.id = 'ose-join-cancel';
      cancel.textContent = 'Annuler';
      actions.insertBefore(cancel, actions.firstChild);
    }
    const closeBtn = document.getElementById('ose-join-close');
    if (closeBtn) {
      closeBtn.setAttribute('aria-label', 'Fermer');
      closeBtn.onclick = closeJoinModal;
    }
    const cancelBtn = document.getElementById('ose-join-cancel');
    if (cancelBtn) cancelBtn.onclick = closeJoinModal;
    const goBtn = document.getElementById('ose-join-go');
    if (goBtn) goBtn.onclick = () => submitJoin();

    overlay.classList.add('open');
    overlay.style.display = '';
    overlay.style.pointerEvents = '';
    const input = document.getElementById('ose-join-input');
    if (input) {
      input.value = '';
      document.getElementById('ose-join-status').textContent = '';
      setTimeout(() => input.focus(), 50);
    }
  }

  function closeJoinModal() {
    const el = document.getElementById('ose-join-modal');
    if (!el) return;
    el.classList.remove('open');
    el.style.pointerEvents = '';
  }

  async function submitJoin() {
    const input = document.getElementById('ose-join-input')?.value || '';
    const status = document.getElementById('ose-join-status');
    status.textContent = 'Connexion aux relais…';
    try {
      const { project, already, empty } = await joinWithInvite(input);
      if (already) status.textContent = `✓ Déjà présent : « ${project.name} » — sync réactivée`;
      else if (empty) status.textContent = `✓ Lié « ${project.name} » — en attente du 1er snapshot`;
      else status.textContent = `✓ Projet « ${project.name} » importé`;
      if (typeof showToast === 'function')
        showToast(already ? 'Sync réactivée' : `✓ Projet « ${project.name} » rejoint`);
      if (typeof _refreshProjectLists === 'function') _refreshProjectLists();
      setTimeout(() => {
        closeJoinModal();
        if (typeof loadProject === 'function') loadProject(project.id);
      }, 600);
    } catch (e) {
      status.textContent = 'Erreur : ' + (e.message || e);
    }
  }

  function _copy(text, okMsg) {
    if (!text) return;
    const done = () => { if (typeof showToast === 'function') showToast(okMsg || 'Copié'); };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(() => _copyFallback(text, done));
    } else _copyFallback(text, done);
  }

  function _copyFallback(text, done) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); done(); } catch { /* */ }
    ta.remove();
  }

  // Preserve share field when saving from editor
  function preserveShareOnBuild(project) {
    if (!AppState.currentProjectId) return project;
    const existing = ProjectManager.get(AppState.currentProjectId);
    if (existing?.share) project.share = existing.share;
    return project;
  }

  function onProjectSaved(project) {
    if (project?.share?.enabled && project.share.keyB64)
      schedulePublish(project.id);
  }

  return {
    openShareModal,
    closeShareModal,
    openJoinModal,
    closeJoinModal,
    joinWithInvite,
    enableAndPublish,
    publishProjectNow,
    schedulePublish,
    resumeAllShared,
    getInviteInfo,
    encodeShortKey,
    parseInvite,
    preserveShareOnBuild,
    onProjectSaved,
    stopAll,
    deviceId,
    // exposé pour tests
    _shouldApplyRemote,
    _snapTimeMs,
  };
})();

// Globals for onclick handlers
function openProjectShare(id) { ProjectShare.openShareModal(id); }
function openJoinSharedProject() { ProjectShare.openJoinModal(); }
