// Playthrough 5.22-E, Partes M/U — a semeadura do mundo nasce na mesma
// autoridade canônica (soma), não numa escala paralela nem na média
// geométrica. 0 + 0 permanece 0 (sem ranking).
import assert from 'node:assert/strict';
import { buildSupplementalTeamRows } from '../src/lib/rankingPopulation.js';

const fillers = Array.from({ length: 499 }, (_, i) => ({ team_key: `filler-${i}` }));

const positive = buildSupplementalTeamRows(
  [
    { id: 'seed-a', name: 'A', world_ranking_points: 300, country: 'Brasil' },
    { id: 'seed-b', name: 'B', world_ranking_points: 200, country: 'Espanha' },
  ],
  fillers,
);

assert.equal(positive.length, 1, 'deveria semear exatamente uma dupla');
assert.equal(positive[0].ranking_points, 500, 'semeadura deve ser A + B');
assert.equal(positive[0].team_key, 'seed-a_seed-b');
assert.equal(positive[0].wins, 0, 'semeadura não inventa V/D');
assert.equal(positive[0].matches_played, 0);

const zero = buildSupplementalTeamRows(
  [
    { id: 'zero-a', name: 'A', world_ranking_points: 0, country: 'Brasil' },
    { id: 'zero-b', name: 'B', world_ranking_points: 0, country: 'Espanha' },
  ],
  fillers,
);
assert.equal(zero[0].ranking_points, 0, '0 + 0 deve continuar 0, sem piso artificial');

// A média geométrica antiga daria valores diferentes — garante que o piso
// `Math.max(1, ...)` saiu e a fórmula mudou de fato.
assert.notEqual(positive[0].ranking_points, Math.round(Math.sqrt(300 * 200)));

console.log('test-team-ranking-seeding-after-sum-v522e: PASS');
