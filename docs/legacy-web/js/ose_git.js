/**
 * ose_git.js — Git embarqué (isomorphic-git + LightningFS / IndexedDB)
 * Fonctionne sur Android WebView, AppImage et navigateur — même API partout.
 *
 * API (async) :
 *   OseGit.save(projectId, projectJson, message) → { ok, hash?, reason? }
 *   OseGit.log(projectId) → [{ hash, date, message }]
 *   OseGit.read(projectId) → string JSON
 *   OseGit.checkout(projectId, hash) → string JSON (project.json à ce commit)
 *   OseGit.branches(projectId) → [{ name, current }]
 *   OseGit.createBranch(projectId, branchName) → { ok, branchName }
 *   OseGit.switchBranch(projectId, branchName) → { ok }
 *   OseGit.ready → Promise
 */
const OseGit = (() => {
  const AUTHOR = { name: 'Open Solar Energy', email: 'autosave@open-solar-energy.local' };
  const DIR_ROOT = '/ose-projects';

  let _fs = null;
  let _pfs = null;
  let _ready = null;
  let _git = null;

  function _err(reason, extra) {
    return Object.assign({ ok: false, reason }, extra || {});
  }

  function _safeBranch(name) {
    return String(name || 'main')
      .replace(/[^a-zA-Z0-9._\-]/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'main';
  }

  function _dir(projectId) {
    const id = String(projectId || '').replace(/[^a-zA-Z0-9_\-]/g, '_');
    if (!id) throw new Error('projectId manquant');
    return `${DIR_ROOT}/${id}`;
  }

  async function _ensureLibs() {
    if (!_git) {
      if (typeof git === 'undefined')
        throw new Error('isomorphic-git non chargé');
      _git = git;
    }
    if (!_fs) {
      if (typeof LightningFS === 'undefined')
        throw new Error('LightningFS non chargé');
      _fs = new LightningFS('ose-git-v1');
      _pfs = _fs.promises;
    }
  }

  async function init() {
    if (_ready) return _ready;
    _ready = (async () => {
      await _ensureLibs();
      try { await _pfs.mkdir(DIR_ROOT); } catch (_) {}
      return true;
    })();
    return _ready;
  }

  async function _exists(path) {
    try { await _pfs.stat(path); return true; }
    catch { return false; }
  }

  async function _ensureRepo(dir) {
    await init();
    try { await _pfs.mkdir(DIR_ROOT); } catch (_) {}
    try { await _pfs.mkdir(dir); } catch (_) {}

    const gitDir = `${dir}/.git`;
    if (!(await _exists(gitDir))) {
      await _git.init({ fs: _fs, dir, defaultBranch: 'main' });
      await _git.setConfig({ fs: _fs, dir, path: 'user.name', value: AUTHOR.name });
      await _git.setConfig({ fs: _fs, dir, path: 'user.email', value: AUTHOR.email });
    }
  }

  async function save(projectId, projectJson, message) {
    try {
      const dir = _dir(projectId);
      await _ensureRepo(dir);
      const text = typeof projectJson === 'string'
        ? projectJson
        : JSON.stringify(projectJson, null, 2);
      await _pfs.writeFile(`${dir}/project.json`, text, 'utf8');
      // Marqueur pour garantir un diff même si le JSON projet est identique
      await _pfs.writeFile(
        `${dir}/.ose-stamp`,
        `${Date.now()}\n${String(message || '').slice(0, 120)}\n`,
        'utf8'
      );
      await _git.add({ fs: _fs, dir, filepath: 'project.json' });
      await _git.add({ fs: _fs, dir, filepath: '.ose-stamp' });

      const msg = String(message || 'Sauvegarde').slice(0, 200);
      const hash = await _git.commit({
        fs: _fs,
        dir,
        message: msg,
        author: AUTHOR,
      });
      return { ok: true, hash };
    } catch (e) {
      console.error('[OseGit.save]', e);
      return _err(e.message || String(e));
    }
  }

  async function log(projectId) {
    try {
      const dir = _dir(projectId);
      await _ensureRepo(dir);
      const commits = await _git.log({ fs: _fs, dir, depth: 50 });
      return commits.map(c => ({
        hash: c.oid,
        date: new Date((c.commit?.author?.timestamp || 0) * 1000).toISOString(),
        message: (c.commit?.message || '').trim().split('\n')[0],
      }));
    } catch (e) {
      // Repo vide / pas encore de commit
      if (/Could not find|does not exist|ENOENT|No commits/i.test(String(e.message || e)))
        return [];
      console.warn('[OseGit.log]', e);
      return [];
    }
  }

  async function read(projectId) {
    try {
      const dir = _dir(projectId);
      await _ensureRepo(dir);
      return await _pfs.readFile(`${dir}/project.json`, 'utf8');
    } catch (e) {
      console.warn('[OseGit.read]', e);
      return '';
    }
  }

  async function checkout(projectId, hash) {
    try {
      const dir = _dir(projectId);
      await _ensureRepo(dir);
      const oid = String(hash || '');
      if (!/^[a-f0-9]{4,64}$/i.test(oid))
        throw new Error('hash invalide');

      // Lire le blob à ce commit (sans détacher HEAD)
      const { blob } = await _git.readBlob({
        fs: _fs,
        dir,
        oid,
        filepath: 'project.json',
      });
      const text = new TextDecoder().decode(blob);
      // Remettre aussi le working tree pour cohérence
      await _pfs.writeFile(`${dir}/project.json`, text, 'utf8');
      await _git.add({ fs: _fs, dir, filepath: 'project.json' });
      return text;
    } catch (e) {
      console.error('[OseGit.checkout]', e);
      throw e;
    }
  }

  async function branches(projectId) {
    try {
      const dir = _dir(projectId);
      await _ensureRepo(dir);
      const list = await _git.listBranches({ fs: _fs, dir });
      let current = null;
      try {
        current = await _git.currentBranch({ fs: _fs, dir, fullname: false });
      } catch (_) {}
      if (!list.length) {
        return [{ name: 'main', current: true }];
      }
      return list.map(name => ({
        name,
        current: name === current,
      }));
    } catch (e) {
      console.warn('[OseGit.branches]', e);
      return [{ name: 'main', current: true }];
    }
  }

  async function createBranch(projectId, branchName) {
    try {
      const dir = _dir(projectId);
      await _ensureRepo(dir);
      const safe = _safeBranch(branchName);
      // Besoin d’au moins un commit
      const commits = await log(projectId);
      if (!commits.length) {
        await save(projectId, await read(projectId) || '{}', 'Commit initial');
      }
      await _git.branch({ fs: _fs, dir, ref: safe });
      await _git.checkout({ fs: _fs, dir, ref: safe });
      return { ok: true, branchName: safe };
    } catch (e) {
      console.error('[OseGit.createBranch]', e);
      return _err(e.message || String(e));
    }
  }

  async function switchBranch(projectId, branchName) {
    try {
      const dir = _dir(projectId);
      await _ensureRepo(dir);
      const safe = _safeBranch(branchName);
      await _git.checkout({ fs: _fs, dir, ref: safe });
      return { ok: true };
    } catch (e) {
      console.error('[OseGit.switchBranch]', e);
      return _err(e.message || String(e));
    }
  }

  /** Attache les méthodes git sur le bridge natif Android (stub) pour parité API. */
  function polyfillNativeBridge() {
    // Ne pas créer un `{}` vide tant que Qt peut encore enregistrer webBridge :
    // sinon ProjectManager ne voit jamais saveProjectsBackup.
    if (!window.webBridge && !window.nativeBridge) {
      if (typeof qt !== 'undefined' && qt.webChannelTransport)
        return;
      window.webBridge = {};
    }
    if (!window.nativeBridge)
      window.nativeBridge = window.webBridge;
    if (!window.webBridge)
      window.webBridge = window.nativeBridge;

    const targets = [window.webBridge, window.nativeBridge].filter(Boolean);
    const wrap = (fn) => function (...args) {
      return Promise.resolve(fn.apply(null, args));
    };
    const methods = {
      gitSave: wrap(save),
      gitLog: wrap(log),
      gitRead: wrap(read),
      gitCheckout: wrap(checkout),
      gitBranches: wrap(branches),
      gitCreateBranch: wrap(createBranch),
      gitSwitchBranch: wrap(switchBranch),
    };

    targets.forEach(b => {
      // Toujours forcer le backend JS pour la parité tel/PC
      // (le git CLI Qt desktop reste optionnel / redondant).
      Object.assign(b, methods, { __oseGitJs: true });
    });
  }

  // Auto-init + polyfill dès que le DOM est prêt
  function boot() {
    init().then(() => polyfillNativeBridge()).catch(e => console.warn('[OseGit] init', e));
    // Re-polyfill : le stub Android réécrit webBridge après le load
    setInterval(() => {
      try { polyfillNativeBridge(); } catch (_) {}
    }, 2000);
  }
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', boot);
  else
    boot();

  return {
    ready: () => init(),
    save, log, read, checkout, branches, createBranch, switchBranch,
    polyfillNativeBridge,
  };
})();
