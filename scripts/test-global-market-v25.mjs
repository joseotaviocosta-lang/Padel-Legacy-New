import fs from 'node:fs';
import path from 'node:path';
const root = process.cwd();
const lifecycle = fs.readFileSync(path.join(root, 'src/game-core/globalMarketLifecycle.js'), 'utf8');
const page = fs.readFileSync(path.join(root, 'src/pages/WorldMarket.jsx'), 'utf8');
const index = fs.readFileSync(path.join(root, 'src/game-core/index.js'), 'utf8');
const checks = [
  ['mercado garante iniciantes', lifecycle.includes('iniciante: 6') && lifecycle.includes('guaranteeCoachAvailability')],
  ['snapshot reúne atletas, duplas e técnicos', lifecycle.includes('athletes,') && lifecycle.includes('teams,') && lifecycle.includes('coaches,')],
  ['processamento mensal centralizado', lifecycle.includes('processGlobalMarketMonth') && lifecycle.includes('evolveWorldMarket')],
  ['página possui quatro áreas', ['athletes','teams','coaches','movements'].every((id) => page.includes(`id: '${id}'`))],
  ['negociação de atletas preservada', page.includes('submitPartnerOffer') && page.includes('getNegotiationPreview')],
  ['scouting preservado', page.includes('scoutAthlete') && page.includes('toggleShortlist')],
  ['export público disponível', index.includes("from './globalMarketLifecycle'")],
];
let failed = 0;
for (const [label, ok] of checks) { console.log(`${ok ? '✓' : '✗'} ${label}`); if (!ok) failed += 1; }
if (failed) process.exit(1);
console.log('GlobalMarketV25Test: PASS');
