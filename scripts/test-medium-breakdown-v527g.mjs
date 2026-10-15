// Playthrough 5.27-G, Bloco L — o Medium é reportado separado em qualifying e
// chave principal (Gold, Platinum); o qualifying não pode mascarar a chave.
import { makeSuite, assert } from './lib/v526bTestKit.mjs';
import { readFileSync } from 'node:fs';

const { check, finish } = makeSuite('test-medium-breakdown-v527g');
try {
  const lines = readFileSync('reports/rebalance-527g/medium-breakdown.csv', 'utf8').trim().split('\n');
  const head = lines[0].split(',');
  const rows = lines.slice(1).map((l) => Object.fromEntries(l.split(',').map((v, i) => [head[i], Number.isNaN(Number(v)) ? v : Number(v)])));
  await check('4 linhas: Gold/Platinum × qualifying/main, com amostra e WR', () => {
    const keys = rows.filter((r) => r.scope === 'balanced-e-v3 2y').map((r) => `${r.tier}|${r.stage}`).sort();
    assert.deepEqual(keys, ['Gold|main', 'Gold|qualifying', 'Platinum|main', 'Platinum|qualifying']);
    for (const r of rows) assert.ok(Number.isFinite(r.matches));
  });
  await check('Medium agregado = soma ponderada das partes (qualifying não some do cálculo)', () => {
    const scope = rows.filter((r) => r.scope === 'balanced-e-v3 2y');
    const n = scope.reduce((s, r) => s + r.matches, 0);
    const w = scope.reduce((s, r) => s + r.wins, 0);
    const agg = JSON.parse(readFileSync('reports/rebalance-527g/micro-post-527g.json', 'utf8')).y2['balanced-e-v3'];
    assert.ok(Math.abs((100 * w) / n - agg.mediumWR) <= 0.2, `${((100 * w) / n).toFixed(1)} × ${agg.mediumWR}`);
  });
} finally {
  finish();
}
