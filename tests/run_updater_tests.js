#!/usr/bin/env node
/**
 * tests/run_updater_tests.js — Logique MAJ (versions + versionCode Android)
 * Ne remplace pas un test device, mais empêche les régressions CI évidentes.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let fails = 0;
function assert(cond, msg) {
  if (cond) console.log('  ✓', msg);
  else { console.error('  ✗', msg); fails++; }
}

/** Miroir de Updater::isNewer (updater.cpp) */
function isNewer(candidate, current) {
  const parts = (v) => {
    let s = String(v || '');
    if (s[0] === 'v' || s[0] === 'V') s = s.slice(1);
    return s.split('.').map((p) => {
      let digits = 0;
      while (digits < p.length && /\d/.test(p[digits])) digits++;
      return parseInt(p.slice(0, digits), 10) || 0;
    });
  };
  const a = parts(candidate);
  const b = parts(current);
  if (!a.length) return false;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const x = a[i] || 0, y = b[i] || 0;
    if (x !== y) return x > y;
  }
  return false;
}

function versionCodeFromName(name) {
  const s = String(name || '').replace(/^[vV]/, '');
  const [ma, mi, pa] = s.split('.').map((x) => parseInt(x, 10) || 0);
  return ma * 10000 + mi * 100 + pa;
}

console.log('\n═══ Updater / versions Android ═══');

assert(isNewer('2.0.73', '2.0.69'), '2.0.73 > 2.0.69');
assert(!isNewer('2.0.69', '2.0.73'), '2.0.69 ≯ 2.0.73');
assert(isNewer('v2.0.73', '2.0.69'), 'strip v');
assert(!isNewer('2.0.73', '2.0.73'), 'égal → pas newer');
assert(isNewer('2.1.0', '2.0.99'), 'mineur gagne');
assert(versionCodeFromName('2.0.73') === 20073, 'versionCode 2.0.73 → 20073');
assert(versionCodeFromName('2.0.69') === 20069, 'versionCode 2.0.69 → 20069');
assert(versionCodeFromName('2.0.73') > versionCodeFromName('2.0.69'), 'codes monotones');
assert(versionCodeFromName('2.0.73') > 185, 'code marketing > ancien git-count (~185)');

const releaseYml = fs.readFileSync(path.join(ROOT, '.github/workflows/release.yml'), 'utf8');
assert(!/git rev-list --count HEAD/.test(releaseYml),
  'release.yml : plus de versionCode = git rev-list');
assert(/10000/.test(releaseYml) && /versionCode/.test(releaseYml),
  'release.yml : formule XXYYZZ présente');

const man = fs.readFileSync(path.join(ROOT, 'android/AndroidManifest.xml'), 'utf8');
assert(/android:versionCode="20073"/.test(man), 'manifest versionCode=20073');
assert(/android:versionName="2\.0\.73"/.test(man), 'manifest versionName=2.0.73');
assert(/InstallCallbackActivity/.test(man), 'InstallCallbackActivity déclarée');
assert(/ApkFileProvider/.test(man), 'ApkFileProvider déclaré');
assert(/android:exported="false"[\s\S]*InstallReceiver|InstallReceiver[\s\S]*android:exported="false"/.test(man)
    || /Platform\$InstallReceiver"[\s\S]*?android:exported="false"/.test(man),
  'InstallReceiver non exporté (callback = Activity)');

const plat = fs.readFileSync(
  path.join(ROOT, 'android/src/org/opensolarenergy/app/Platform.java'), 'utf8');
assert(/PendingIntent\.getActivity/.test(plat), 'install via PendingIntent.getActivity');
assert(/installApkWithViewIntent/.test(plat), 'fallback ACTION_VIEW');
assert(/retryPendingInstallIfReady/.test(plat), 'retry après permission');

const act = fs.readFileSync(
  path.join(ROOT, 'android/src/org/opensolarenergy/app/OseActivity.java'), 'utf8');
assert(/retryPendingInstallIfReady/.test(act), 'OseActivity.onResume retry install');

const cb = path.join(ROOT, 'android/src/org/opensolarenergy/app/InstallCallbackActivity.java');
assert(fs.existsSync(cb), 'InstallCallbackActivity.java existe');

const pui = fs.readFileSync(path.join(ROOT, 'js/project_ui.js'), 'utf8');
assert(!/function openUpdateApkFallback/.test(pui), 'pas de openUpdateApkFallback');
assert(!/Ouvrir l’APK \(navigateur\)/.test(pui), 'pas de bouton Ouvrir APK navigateur');
assert(!/Ouverture du téléchargement APK/.test(pui), 'pas de toast ouverture APK');
assert(!/window\.open\(target/.test(pui), 'checkForUpdates n’ouvre plus d’URL externe');
assert(/is-visible/.test(pui) && /demo_ose_v2/.test(pui), 'bandeau démo : is-visible + ids démo');
assert(/function restoreLocationSiteStatusUI/.test(pui), 'restauration statuts Lieu');
assert(/weatherMeta/.test(pui) && /weatherMeta/.test(fs.readFileSync(path.join(ROOT, 'js/project_forms.js'), 'utf8')),
  'weatherMeta persisté dans le projet');

const idx = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
assert(/main\.css\?v=2\.0\.73/.test(idx), 'CSS cache-bust ?v=2.0.73');
assert(/setSizingLimitMode/.test(pui) || /setSizingLimitMode/.test(fs.readFileSync(path.join(ROOT, 'js/renderers/sizing.js'), 'utf8')),
  'modes limite dimensionnement');
const tabSz = fs.readFileSync(path.join(ROOT, 'js/tabs/tab_sizing.js'), 'utf8');
assert(/sz-lmode-objectif/.test(tabSz) && /sz-roof-length/.test(tabSz) && /sz-npanels-fixe/.test(tabSz),
  'UI Objectif / Toiture L×l / Nb. fixe');
assert(!/placeholder="obligatoire"/.test(tabSz), 'surface plus marquée obligatoire');
assert(!/Projet démo : des valeurs sont préremplies/.test(tabSz), 'plus de texte démo en dur dans le HTML');
assert(/tab-label-short">Devis</.test(idx), 'label court Devis (sans « 3 »)');
assert(!/tab-label-short">3 Devis</.test(idx), 'plus de « 3 Devis » en label court');
// Site avant Dim / Hors réseau (ombrage 30 min → dimensionnement)
const primaryTabs = [...idx.matchAll(/data-tab="([^"]+)"[^>]*data-tier="primary"/g)].map(m => m[1]);
assert(primaryTabs.includes('quote') && primaryTabs.includes('site') && primaryTabs.includes('daily'),
  'primary inclut site, daily, quote');
const quoteIdx = primaryTabs.indexOf('quote');
const sizingIdx = primaryTabs.indexOf('sizing');
const siteIdx = primaryTabs.indexOf('site');
const gridIdx = primaryTabs.indexOf('grid');
const offgridIdx = primaryTabs.indexOf('offgrid');
assert(primaryTabs[0] === 'location' && primaryTabs[1] === 'site',
  'ordre DOM : Lieu → Site');
const dailyIdx = primaryTabs.indexOf('daily');
const layoutIdx = primaryTabs.indexOf('layout');
assert(siteIdx < offgridIdx && siteIdx < sizingIdx && sizingIdx < gridIdx,
  'ordre Site → Dim/Hors réseau → PV');
assert(offgridIdx < dailyIdx && sizingIdx < dailyIdx && dailyIdx < layoutIdx && layoutIdx < quoteIdx,
  'Dim/Hors réseau → Analyse → Implantation → … → Devis');
assert(offgridIdx < quoteIdx, 'Hors réseau avant Devis');
assert(quoteIdx > dailyIdx, 'Devis après Analyse');
const mainJs = fs.readFileSync(path.join(ROOT, 'js/main.js'), 'utf8');
assert(/function goNextPrimaryTab/.test(mainJs) && /PRIMARY_FLOW_GRID/.test(mainJs),
  'goNextPrimaryTab + PRIMARY_FLOW_GRID');
assert(/'location', 'site', 'offgrid', 'daily'/.test(mainJs.replace(/\s+/g, ' ')),
  'flow autonome : Site → Hors réseau → Analyse');
assert(/og2-load-day/.test(fs.readFileSync(path.join(ROOT, 'js/tabs/tab_offgrid.js'), 'utf8')),
  'UI autonome conso jour/nuit');
assert(/og2-2h-\$\{i\}|og2-2h-0/.test(fs.readFileSync(path.join(ROOT, 'js/tabs/tab_offgrid.js'), 'utf8')),
  'UI autonome profil 2 h');
assert(/buildTwoHourLoadYear/.test(fs.readFileSync(path.join(ROOT, 'js/pv_profiles.js'), 'utf8')),
  'buildTwoHourLoadYear');
assert(/minBattFromNight/.test(fs.readFileSync(path.join(ROOT, 'js/offgrid_sizing.js'), 'utf8')),
  'plancher batterie depuis conso nuit');
assert(/ose-journey-nav/.test(fs.readFileSync(path.join(ROOT, 'js/tabs/tab_site.js'), 'utf8')),
  'Passer/Continuer sur Site');
assert(/Appliquer au dimensionnement/.test(fs.readFileSync(path.join(ROOT, 'js/tabs/tab_site.js'), 'utf8')),
  'bouton ombrage → dimensionnement');
const siteSurvey = fs.readFileSync(path.join(ROOT, 'js/site_survey.js'), 'utf8');
assert(/persist\(\);\s*\/\/ halfHourlyKeep|persist\(\); \/\/ halfHourlyKeep|halfHourlyKeep doit être dans AppState/.test(siteSurvey),
  'recompute persiste halfHourlyKeep');
assert(/Import terrain \(relief\)/.test(siteSurvey),
  'terrain auto-sauvegardé');
assert(/half === 0 \? 0\.25 : 0\.75/.test(fs.readFileSync(path.join(ROOT, 'js/solar_math.js'), 'utf8')),
  'ensoleillement géométrie 30 min');
assert(/applySiteShade/.test(fs.readFileSync(path.join(ROOT, 'js/offgrid_sizing.js'), 'utf8')),
  'offgrid applique ombrage site');
const css = fs.readFileSync(path.join(ROOT, 'css/main.css'), 'utf8');
assert(/clearEnedisLoad/.test(fs.readFileSync(path.join(ROOT, 'js/hourly_module.js'), 'utf8')),
  'clearEnedisLoad pour retrouver jour/nuit');
assert(/sz-daynight-enedis-note/.test(fs.readFileSync(path.join(ROOT, 'js/tabs/tab_sizing.js'), 'utf8')),
  'note Enedis sans masquer jour/nuit');
assert(/ose-goal-hint/.test(fs.readFileSync(path.join(ROOT, 'js/renderers/sizing.js'), 'utf8')),
  'explication autoconso ≠ couverture / pas de prod nuit');
assert(/\.ose-demo-note\s*\{[^}]*display:\s*none/.test(css), 'bandeau démo display:none par défaut');
assert(/\.ose-demo-note\.is-visible\s*\{[^}]*display:\s*block/.test(css), 'bandeau démo visible via .is-visible');
assert(/\.tab-btn > \.tab-label-short \{ display: none !important/.test(css),
  'CSS : short label masqué par défaut (!important)');
assert(/\.tab-btn > \.tab-label-full \{ display: none !important/.test(css),
  'CSS : full label masqué sur mobile (!important)');

const host = fs.readFileSync(path.join(ROOT, 'src/app/webhost.cpp'), 'utf8');
assert(/Cache-Control: no-store/.test(host), 'WebHost : no-store pour html/css/js');

const appState = fs.readFileSync(path.join(ROOT, 'js/app_state.js'), 'utf8');
assert(/OSE_RELEASE_FEED/.test(appState), 'notes embarquées OSE_RELEASE_FEED');
assert(/og2-load-day/.test(appState), 'persist conso jour autonome');
assert(!/Impossible de charger les news/.test(pui), 'plus de message d’échec news utilisateur');
assert(/_fetchHubReleasesFromAtom/.test(pui), 'fallback Atom GitHub');
assert(/_bundledHubReleases/.test(pui), 'fallback notes embarquées');

assert(!/actions\/checkout@v4/.test(fs.readFileSync(path.join(ROOT, '.github/workflows/release.yml'), 'utf8')),
  'release.yml : checkout@v5+');
assert(/actions\/setup-java@v5/.test(fs.readFileSync(path.join(ROOT, '.github/workflows/android.yml'), 'utf8')),
  'android.yml : setup-java@v5');
assert(/actions\/cache@v5/.test(fs.readFileSync(path.join(ROOT, '.github/workflows/desktop.yml'), 'utf8')),
  'desktop.yml : cache@v5');
assert(/actions\/upload-artifact@v5/.test(fs.readFileSync(path.join(ROOT, '.github/workflows/android.yml'), 'utf8')),
  'android.yml : upload-artifact@v5');
assert(/actions\/download-artifact@v5/.test(fs.readFileSync(path.join(ROOT, '.github/workflows/release.yml'), 'utf8')),
  'release.yml : download-artifact@v5');
assert(/node-version: "22"/.test(fs.readFileSync(path.join(ROOT, '.github/workflows/ci.yml'), 'utf8')),
  'ci.yml : Node 22');


console.log(fails === 0 ? '\nOK\n' : `\n${fails} échec(s)\n`);
process.exit(fails === 0 ? 0 : 1);
