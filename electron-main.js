const { app, BrowserWindow, shell, dialog, ipcMain } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs   = require('fs');
const os   = require('os');
const { execSync } = require('child_process');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    title: 'Open Solar Energy',
  });

  mainWindow.loadFile('index.html');

  // Liens externes → navigateur système
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file://')) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });
}

app.whenReady().then(() => {
  createWindow();
  if (app.isPackaged) {
    autoUpdater.checkForUpdatesAndNotify();
  }
});

autoUpdater.on('update-available', () => {
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'Mise à jour disponible',
    message: 'Une nouvelle version est disponible et sera téléchargée en arrière-plan.',
    buttons: ['OK'],
  });
});

autoUpdater.on('update-downloaded', () => {
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'Mise à jour prête',
    message: "La mise à jour a été téléchargée. Redémarrer pour l'installer ?",
    buttons: ['Redémarrer', 'Plus tard'],
    defaultId: 0,
  }).then(({ response }) => {
    if (response === 0) autoUpdater.quitAndInstall();
  });
});

// ══════════════════════════════════════════════════════════════
//  IPC HANDLERS — SHELL / DIALOG
// ══════════════════════════════════════════════════════════════

ipcMain.handle('shell:openExternal', async (event, url) => {
  // Autoriser uniquement http/https/file pour éviter tout abus
  if (/^(https?:\/\/|file:\/\/)/.test(url)) {
    await shell.openExternal(url);
  } else if (!url.startsWith('http') && fs.existsSync(url)) {
    await shell.openPath(url);
  }
});

ipcMain.handle('dialog:openFile', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'Sélectionner un fichier',
    filters: [
      { name: 'Documents', extensions: ['pdf', 'png', 'jpg', 'jpeg', 'webp'] },
      { name: 'Tous les fichiers', extensions: ['*'] },
    ],
    properties: ['openFile'],
  });
  return canceled ? null : filePaths[0];
});

// ══════════════════════════════════════════════════════════════
//  HELPERS GIT
// ══════════════════════════════════════════════════════════════

/**
 * Retourne le répertoire git du projet (~/OpenSolarEnergy/projects/<id>/).
 * Crée le dossier si besoin.
 */
function getProjectDir(projectId) {
  const dir = path.join(os.homedir(), 'OpenSolarEnergy', 'projects', projectId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function ensureGitRepo(dir) {
  const gitDir = path.join(dir, '.git');
  if (!fs.existsSync(gitDir)) {
    execSync('git init', { cwd: dir });
    execSync('git config user.email "autosave@open-solar-energy"', { cwd: dir });
    execSync('git config user.name "Open Solar Energy"', { cwd: dir });
  }
}

/**
 * Vérifie que git est disponible sur la machine.
 * Retourne false silencieusement si git n'est pas installé.
 */
function isGitAvailable() {
  try {
    execSync('git --version', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

// ══════════════════════════════════════════════════════════════
//  IPC HANDLERS — GIT
// ══════════════════════════════════════════════════════════════

/**
 * git:save — Écrit project.json et crée un commit git.
 * Fallback silencieux si git absent ou erreur.
 */
ipcMain.handle('git:save', async (event, projectId, projectJson, message) => {
  if (!isGitAvailable()) return { ok: false, reason: 'git_unavailable' };
  try {
    const dir = getProjectDir(projectId);
    ensureGitRepo(dir);
    fs.writeFileSync(path.join(dir, 'project.json'), projectJson, 'utf8');
    execSync('git add project.json', { cwd: dir });
    // Sanitise le message pour éviter l'injection de commandes
    const safeMsg = message.replace(/"/g, "'").replace(/`/g, "'").replace(/\$/g, '').slice(0, 200);
    try {
      execSync(`git commit -m "${safeMsg}"`, { cwd: dir, stdio: 'pipe' });
    } catch {
      // "nothing to commit" ou autre erreur non critique → OK
    }
    return { ok: true };
  } catch (e) {
    console.warn('[git:save] erreur :', e.message);
    return { ok: false, reason: e.message };
  }
});

/**
 * git:log — Retourne les 50 derniers commits (hash, date, message).
 */
ipcMain.handle('git:log', async (event, projectId) => {
  if (!isGitAvailable()) return [];
  try {
    const dir = getProjectDir(projectId);
    ensureGitRepo(dir);
    const out = execSync(
      'git log --max-count=50 --pretty=format:"%H|%ai|%s"',
      { cwd: dir, stdio: 'pipe' }
    ).toString().trim();
    if (!out) return [];
    return out.split('\n').map(line => {
      const [hash, date, ...rest] = line.split('|');
      return { hash, date, message: rest.join('|') };
    });
  } catch (e) {
    console.warn('[git:log] erreur :', e.message);
    return [];
  }
});

/**
 * git:checkout — Restaure project.json depuis un commit donné.
 * Retourne le contenu JSON du fichier à cet instant.
 */
ipcMain.handle('git:checkout', async (event, projectId, hash) => {
  if (!isGitAvailable()) throw new Error('git_unavailable');
  const dir = getProjectDir(projectId);
  // Valider le hash (alphanumérique uniquement)
  if (!/^[a-f0-9]{4,64}$/i.test(hash)) throw new Error('hash invalide');
  execSync(`git checkout ${hash} -- project.json`, { cwd: dir, stdio: 'pipe' });
  const content = fs.readFileSync(path.join(dir, 'project.json'), 'utf8');
  return content;
});

/**
 * git:read — Lit le project.json courant (après un switch de branche).
 */
ipcMain.handle('git:read', async (event, projectId) => {
  const dir  = getProjectDir(projectId);
  const file = path.join(dir, 'project.json');
  if (!fs.existsSync(file)) throw new Error('project.json introuvable');
  return fs.readFileSync(file, 'utf8');
});

/**
 * git:branches — Liste les branches du repo.
 */
ipcMain.handle('git:branches', async (event, projectId) => {
  if (!isGitAvailable()) return [];
  try {
    const dir = getProjectDir(projectId);
    ensureGitRepo(dir);
    const out = execSync('git branch', { cwd: dir, stdio: 'pipe' }).toString().trim();
    if (!out) return [];
    return out.split('\n').map(line => ({
      name:    line.replace(/^\*\s*/, '').trim(),
      current: line.startsWith('*'),
    }));
  } catch (e) {
    console.warn('[git:branches] erreur :', e.message);
    return [];
  }
});

/**
 * git:create-branch — Crée et bascule sur une nouvelle branche.
 */
ipcMain.handle('git:create-branch', async (event, projectId, branchName) => {
  if (!isGitAvailable()) return { ok: false, reason: 'git_unavailable' };
  const dir = getProjectDir(projectId);
  const safeName = branchName.replace(/[^a-zA-Z0-9._\-]/g, '-').slice(0, 80);
  execSync(`git checkout -b "${safeName}"`, { cwd: dir, stdio: 'pipe' });
  return { ok: true, branchName: safeName };
});

/**
 * git:switch-branch — Bascule sur une branche existante.
 */
ipcMain.handle('git:switch-branch', async (event, projectId, branchName) => {
  if (!isGitAvailable()) return { ok: false, reason: 'git_unavailable' };
  const dir = getProjectDir(projectId);
  const safeName = branchName.replace(/[^a-zA-Z0-9._\-]/g, '-').slice(0, 80);
  execSync(`git checkout "${safeName}"`, { cwd: dir, stdio: 'pipe' });
  return { ok: true };
});

// ══════════════════════════════════════════════════════════════

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
