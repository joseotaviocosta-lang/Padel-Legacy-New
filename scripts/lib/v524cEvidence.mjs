// Playthrough 5.24-C — leitura compartilhada das evidências medidas no
// navegador por scripts/generate-mobile-quick-actions-screenshots-v524c.mjs.
import { existsSync, readFileSync } from 'node:fs';

export const MOBILE_VIEWPORTS = ['360', '390'];
export const ALL_VIEWPORTS = ['360', '390', '844x390', 'desktop'];

export function loadEvidence() {
  const file = new URL('../../reports/screenshots-524c/evidence.json', import.meta.url);
  if (!existsSync(file)) {
    throw new Error('evidence ausente — rode: node scripts/generate-mobile-quick-actions-screenshots-v524c.mjs');
  }
  return JSON.parse(readFileSync(file, 'utf8'));
}

export function readSource(rel) {
  return readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf8');
}
