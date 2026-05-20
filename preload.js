/**
 * preload.js - Bridge sécurisé entre le renderer et le main process Electron
 * contextIsolation: true -> pas de require() dans le renderer
 * Expose uniquement les méthodes git nécessaires via contextBridge.
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  /**
   * Sauvegarde le projet dans un repo git dédié.
   * @param {string} projectId - Identifiant unique du projet
   * @param {string} projectJson - Contenu JSON du projet
   * @param {string} commitMessage - Message de commit descriptif
   * @returns {Promise<{ok: boolean}>}
   */
  gitSave: (projectId, projectJson, commitMessage) =>
    ipcRenderer.invoke('git:save', projectId, projectJson, commitMessage),

  /**
   * Retourne les 50 derniers commits du repo du projet.
   * @param {string} projectId
   * @returns {Promise<Array<{hash: string, date: string, message: string}>>}
   */
  gitLog: (projectId) =>
    ipcRenderer.invoke('git:log', projectId),

  /**
   * Restaure le project.json d un commit donne.
   * @param {string} projectId
   * @param {string} hash - Hash court ou complet du commit
   * @returns {Promise<string>} - Contenu JSON du project.json a ce commit
   */
  gitCheckout: (projectId, hash) =>
    ipcRenderer.invoke('git:checkout', projectId, hash),

  /**
   * Lit le project.json courant (après un switch de branche).
   * @param {string} projectId
   * @returns {Promise<string>} - Contenu JSON
   */
  gitRead: (projectId) =>
    ipcRenderer.invoke('git:read', projectId),

  /**
   * Liste les branches du repo du projet.
   * @param {string} projectId
   * @returns {Promise<Array<{name: string, current: boolean}>>}
   */
  gitBranches: (projectId) =>
    ipcRenderer.invoke('git:branches', projectId),

  /**
   * Cree une nouvelle branche dans le repo du projet.
   * @param {string} projectId
   * @param {string} branchName
   * @returns {Promise<{ok: boolean}>}
   */
  gitCreateBranch: (projectId, branchName) =>
    ipcRenderer.invoke('git:create-branch', projectId, branchName),

  /**
   * Change de branche dans le repo du projet.
   * @param {string} projectId
   * @param {string} branchName
   * @returns {Promise<{ok: boolean}>}
   */
  gitSwitchBranch: (projectId, branchName) =>
    ipcRenderer.invoke('git:switch-branch', projectId, branchName),
});
