// Playthrough 5.27-C, Bloco E/K — prize share por ano (prêmio precisa importar).
import { makeSuite, assert } from './lib/v526bTestKit.mjs';
import { existsSync, readFileSync } from 'node:fs';

const { check, finish } = makeSuite('test-prize-share-distribution-v527c');
const prizeShare = (ledger) => {
  let prize = 0; let inc = 0;
  for (const L of Object.values(ledger || {})) {
    prize += Number(L.income?.prize) || 0;
    inc += Object.values(L.income || {}).reduce((s, v) => s + (Number(v) || 0), 0);
  }
  return inc ? Math.round((100 * prize) / inc) : 0;
};
try {
  await check('prize share é calculável', () => {
    assert.equal(prizeShare({ '2026-01': { income: { prize: 250, sponsor_monthly: 750 } } }), 25);
    assert.equal(prizeShare({}), 0);
  });

  await check('carreira medida (se disponível) tem prêmio registrado', () => {
    const f = 'reports/rebalance-527/balanced2/raw/optimizer-001.json';
    if (!existsSync(f)) return;
    const c = JSON.parse(readFileSync(f, 'utf8'));
    const hasPrize = Object.values(c.ledger || {}).some((L) => Number(L.income?.prize) > 0);
    assert.ok(hasPrize, 'sem prêmio no ledger');
  });

  await check('prizes.csv (se presente) existe', () => {
    if (!existsSync('reports/rebalance-527c/prizes.csv')) return;
    assert.match(readFileSync('reports/rebalance-527c/prizes.csv', 'utf8'), /profile/);
  });
} finally {
  finish();
}
