// Playthrough 5.25 — evidências medidas no navegador por
// scripts/generate-mobile-quick-actions-screenshots-v525.mjs.
import { existsSync, readFileSync } from 'node:fs';

export const MOBILE = ['360', '390'];
export const ALL = ['360', '390', '844x390', 'desktop'];

export function loadEvidence() {
  const file = new URL('../../reports/screenshots-525/evidence.json', import.meta.url);
  if (!existsSync(file)) throw new Error('evidence ausente — rode: node scripts/generate-mobile-quick-actions-screenshots-v525.mjs');
  return JSON.parse(readFileSync(file, 'utf8'));
}

export const source = (rel) => readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf8');
