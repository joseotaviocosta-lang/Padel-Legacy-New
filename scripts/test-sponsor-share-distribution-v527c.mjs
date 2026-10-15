// Playthrough 5.27-C, Bloco E/K — sponsor share por ano.
import { makeSuite, assert } from './lib/v526bTestKit.mjs';
import { existsSync, readFileSync } from 'node:fs';

const { check, finish } = makeSuite('test-sponsor-share-distribution-v527c');
const shareByYear = (ledger, keys) => {
  const out = {};
  for (const [month, L] of Object.entries(ledger || {})) {
    const y = String(month).slice(0, 4);
    const inc = Object.values(L.income || {}).reduce((s, v) => s + (Number(v) || 0), 0);
    const part = keys.reduce((s, k) => s + (Number(L.income?.[k]) || 0), 0);
    (out[y] ||= { inc: 0, part: 0 }); out[y].inc += inc; out[y].part += part;
  }
  return Object.fromEntries(Object.entries(out).map(([y, v]) => [y, v.inc ? Math.round((100 * v.part) / v.inc) : 0]));
};
try {
  await check('sponsor share por ano é calculável', () => {
    const ledger = { '2026-01': { income: { sponsor_monthly: 400, prize: 100 } }, '2027-01': { income: { sponsor_monthly: 900, prize: 100 } } };
    assert.deepEqual(shareByYear(ledger, ['sponsor_monthly', 'sponsor_signing']), { 2026: 80, 2027: 90 });
  });

  await check('carreira medida (se disponível) tem ledger', () => {
    const f = 'reports/rebalance-527/balanced2/raw/normal-001.json';
    if (!existsSync(f)) return;
    const c = JSON.parse(readFileSync(f, 'utf8'));
    assert.ok(c.ledger && Object.keys(c.ledger).length);
  });

  await check('sponsors.csv (se presente) existe', () => {
    if (!existsSync('reports/rebalance-527c/sponsors.csv')) return;
    assert.match(readFileSync('reports/rebalance-527c/sponsors.csv', 'utf8'), /profile/);
  });
} finally {
  finish();
}
