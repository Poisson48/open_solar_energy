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

assert(isNewer('2.0.63', '2.0.62'), '2.0.63 > 2.0.62');
assert(!isNewer('2.0.62', '2.0.63'), '2.0.62 ≯ 2.0.63');
assert(isNewer('v2.0.63', '2.0.62'), 'strip v');
assert(!isNewer('2.0.63', '2.0.63'), 'égal → pas newer');
assert(isNewer('2.1.0', '2.0.99'), 'mineur gagne');
assert(versionCodeFromName('2.0.63') === 20063, 'versionCode 2.0.63 → 20063');
assert(versionCodeFromName('2.0.62') === 20062, 'versionCode 2.0.62 → 20062');
assert(versionCodeFromName('2.0.63') > versionCodeFromName('2.0.62'), 'codes monotones');
assert(versionCodeFromName('2.0.63') > 185, 'code marketing > ancien git-count (~185)');

const releaseYml = fs.readFileSync(path.join(ROOT, '.github/workflows/release.yml'), 'utf8');
assert(!/git rev-list --count HEAD/.test(releaseYml),
  'release.yml : plus de versionCode = git rev-list');
assert(/10000/.test(releaseYml) && /versionCode/.test(releaseYml),
  'release.yml : formule XXYYZZ présente');

const man = fs.readFileSync(path.join(ROOT, 'android/AndroidManifest.xml'), 'utf8');
assert(/android:versionCode="20063"/.test(man), 'manifest versionCode=20063');
assert(/android:versionName="2\.0\.63"/.test(man), 'manifest versionName=2.0.63');
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

console.log(fails === 0 ? '\nOK\n' : `\n${fails} échec(s)\n`);
process.exit(fails === 0 ? 0 : 1);
