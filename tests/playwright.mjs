/**
 * Résout Playwright depuis node_modules local, ~/.local, ou le paquet npm.
 */
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const candidates = [
  join(process.cwd(), 'node_modules/playwright/index.mjs'),
  join(homedir(), '.local/node_modules/playwright/index.mjs'),
  '/data/leo/memoire_des_cevennes/node_modules/playwright/index.mjs',
];

let mod;
for (const p of candidates) {
  if (existsSync(p)) {
    mod = await import(pathToFileURL(p).href);
    break;
  }
}
if (!mod) {
  try {
    mod = await import('playwright');
  } catch (e) {
    throw new Error(
      'Playwright introuvable. Installez-le (npm i -D playwright) ou dans ~/.local/node_modules.',
      { cause: e },
    );
  }
}

export const { chromium, firefox, webkit, devices } = mod;
