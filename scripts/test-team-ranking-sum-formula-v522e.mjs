// Playthrough 5.22-E, Partes M/N — contrato da nova fórmula canônica:
//   TeamRankingPoints = CircuitPoints(A) + CircuitPoints(B)
// Substitui a média geométrica (sqrt(a*b)) da 5.11.
import assert from 'node:assert/strict';
import { computeCanonicalTeamRankingPoints as f } from '../src/lib/teamRankingFormula.js';

const cases = [
  [39, 0, 39],
  [0, 39, 39],
  [39, 80, 119],
  [300, 200, 500],
  [0, 0, 0],
  [1100, 880, 1980],
];

for (const [a, b, expected] of cases) {
  assert.equal(f(a, b), expected, `f(${a},${b}) deveria ser ${expected}`);
}

assert.equal(f(100, 200), f(200, 100), 'deve ser simétrica');
assert.equal(f(1234, 5678), f(1234, 5678), 'deve ser determinística');
assert.equal(f(1, 0), 1, 'membro com 0 não zera a dupla');
assert.equal(f(0, 0), 0, '0 + 0 é o único zero');
assert.ok(Number.isFinite(f(null, 100)) && f(null, 100) >= 0, 'inválidos não produzem NaN');
assert.ok(Number.isFinite(f(NaN, 100)) && f(NaN, 100) >= 0, 'NaN não vaza');

// A fórmula antiga (média geométrica) é explicitamente diferente para
// qualquer par assimétrico — prova de que a regra realmente mudou.
const oldGeometric = (a, b) => Math.round(Math.sqrt(a * b));
assert.notEqual(f(39, 80), oldGeometric(39, 80), 'a fórmula nova difere da geométrica');
assert.equal(oldGeometric(39, 80), 56, 'registro da fórmula anterior');

console.log('test-team-ranking-sum-formula-v522e: PASS');
