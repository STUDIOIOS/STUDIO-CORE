// Shared file IO helpers for scripts/.

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(here, '..', '..');
export const DATA = join(ROOT, 'data');

export async function loadJSON(name) {
  const path = join(DATA, `${name}.json`);
  return JSON.parse(await readFile(path, 'utf8'));
}

export async function saveJSON(name, value) {
  const path = join(DATA, `${name}.json`);
  await writeFile(path, JSON.stringify(value, null, 2) + '\n');
}

export function env(key, fallback = undefined) {
  const v = process.env[key];
  if (v == null || v === '') {
    if (fallback !== undefined) return fallback;
    throw new Error(`Missing env var: ${key}`);
  }
  return v;
}
