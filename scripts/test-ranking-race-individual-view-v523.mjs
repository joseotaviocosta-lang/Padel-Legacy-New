// Playthrough 5.23, Partes D/I/R — Race → Individual: card sazonal próprio,
// sem "Top 8" implicando 8 jogadores.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/pages/Ranking.jsx', import.meta.url), 'utf8');
// Comentários podem citar "Top 8" para explicar o que NÃO fazer; o gate é
// sobre o texto renderizado.
const raceCard = source.match(/function RaceIndividualCard[\s\S]*?\n\}/)[0]
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

assert.match(source, /function RaceIndividualCard/);
assert.match(raceCard, /Sua temporada/);
assert.match(raceCard, /na Race/);
assert.match(raceCard, /raceSeason\.tournaments/);
assert.match(raceCard, /Melhor resultado/);
assert.match(raceCard, /Últimos pontos/);

// Hard gate: a Race individual NÃO pode mostrar "Top 8" como se fossem 8
// jogadores. No máximo a explicação secundária de que são 8 duplas.
assert.doesNotMatch(raceCard, /Top\s*8/, 'Race individual não pode mostrar Top 8');
assert.match(raceCard, /melhores duplas/, 'deve explicar que o corte é de duplas');

console.log('test-ranking-race-individual-view-v523: PASS');
