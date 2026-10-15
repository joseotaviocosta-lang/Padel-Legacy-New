// Playthrough 5.23, Parte M — URLs antigas continuam funcionando e mapeiam
// para a nova estrutura de dois níveis.
import assert from 'node:assert/strict';
import { resolveRankingView } from '../src/lib/rankingDisplay.js';

const cases = [
  ['?tab=world', { scope: 'world', type: 'individual', legacy: true }],
  ['?tab=circuit', { scope: 'world', type: 'individual', legacy: true }],
  ['?tab=players', { scope: 'world', type: 'individual', legacy: true }],
  ['?tab=race', { scope: 'race', type: 'individual', legacy: true }],
  ['?tab=season', { scope: 'race', type: 'individual', legacy: true }],
  ['?tab=teams', { scope: 'world', type: 'doubles', legacy: true }],
  ['?tab=duplas', { scope: 'world', type: 'doubles', legacy: true }],
  ['?tab=pairs', { scope: 'world', type: 'doubles', legacy: true }],
];

for (const [query, expected] of cases) {
  const view = resolveRankingView(new URLSearchParams(query));
  assert.equal(view.scope, expected.scope, `${query} scope`);
  assert.equal(view.type, expected.type, `${query} type`);
  assert.equal(view.legacy, expected.legacy, `${query} legacy`);
}

// URLs novas têm prioridade e não são marcadas como legadas.
assert.deepEqual(
  resolveRankingView(new URLSearchParams('?scope=race&type=doubles')),
  { scope: 'race', type: 'doubles', legacy: false },
);
assert.deepEqual(
  resolveRankingView(new URLSearchParams('?scope=world&type=doubles')),
  { scope: 'world', type: 'doubles', legacy: false },
);

// Params desconhecidos/vazios caem no default seguro.
assert.deepEqual(resolveRankingView(new URLSearchParams('')), { scope: 'world', type: 'individual', legacy: false });

// A página normaliza o legado preservando os demais params (ex.: athlete).
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../src/pages/Ranking.jsx', import.meta.url), 'utf8');
assert.match(source, /if \(view\.legacy\)/, 'deve normalizar link legado');
assert.match(source, /next\.delete\('tab'\)/, 'deve remover o tab legado');
assert.match(source, /setSearchParams\(next, \{ replace: true \}\)/, 'normalização não deve empilhar histórico');

console.log('test-ranking-legacy-tab-redirects-v523: PASS');
