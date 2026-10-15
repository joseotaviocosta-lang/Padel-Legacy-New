// Playthrough 5.24, Parte A — o card "Sua dupla na Race" ganha destaque
// visual consistente com Mundial → Duplas, mantendo autoridade e fórmula.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/pages/Ranking.jsx', import.meta.url), 'utf8');
const card = source.match(/function RaceDoublesCard[\s\S]*?\n\}/)[0];

assert.match(card, /Sua dupla na Race/);
assert.match(card, /racePairRank/);
assert.match(card, /playerRacePoints/);
assert.match(card, /partnerRacePoints/);
assert.match(card, /Total/);

// Destaque: gradiente + anel + borda viva (não o antigo bg-secondary/5).
assert.match(card, /bg-gradient-to-br/, 'deve ter gradiente de destaque');
assert.match(card, /ring-1 ring-secondary/, 'deve ter anel de destaque');
assert.match(card, /border-secondary\/50/, 'borda deve ser viva');
assert.doesNotMatch(card, /border-secondary\/40 bg-secondary\/5 p-4 shadow-sm/, 'não pode voltar ao card apagado');

// A autoridade da Race de Duplas continua a mesma (sem tocar na fórmula).
assert.match(source, /getTeamRaceRank\b/);
assert.match(source, /getTeamRaceRankings/);
assert.match(source, /<TeamList[\s\S]*?items=\{raceTeams\}/);

console.log('test-ranking-race-doubles-card-v524: PASS');
