// Playthrough 5.27-J, Blocos N/O (itens 44–48) — smoke competitivo e
// econômico do Balanced-E depois do fix de lifecycle (5 seeds × Normal × 2
// anos), contra a 5.27-I (mesmas seeds/config). Sem rebalanceamento: config
// idêntica (hash) e nenhuma métrica central mudando > 10 pp sem investigação.
import { makeSuite, assert } from './lib/v526bTestKit.mjs';
import { computeFrozenConfig } from './lib/v527iFreeze.mjs';
import { report } from './lib/v527jTestKit.mjs';

const { check, finish } = makeSuite('test-balanced-e-smoke-after-lifecycle-v527j');
try {
  const c = report('competitive-smoke.json');
  await check('Balanced-E, Silver 15%, Normal v3, Otimizador v4, táticas, ranking: hash idêntico ao da 5.27-I', async () => {
    const now = await computeFrozenConfig();
    const before = report('frozen-balance.json');
    for (const k of ['balance', 'partnerPolicy', 'tactics', 'engine', 'ranking', 'population', 'silver', 'optimizerPolicy']) assert.equal(now.blockHashes[k], before.blockHashes[k], k);
  });
  await check('5 carreiras completas de 2 anos', () => assert.equal(c.after.careers, 5));
  for (const k of ['easy', 'medium', 'r1']) {
    await check(`${k}: |Δ| ≤ 10 pp contra a 5.27-I (${c.before[k]} → ${c.after[k]})`, () => assert.ok(Math.abs(c.after[k] - c.before[k]) <= 10));
  }
  await check('hard gates do Balanced-E continuam verdes no smoke (Easy ≥ 45, Medium ≥ 30, Hard ≤ 50, R1 ≥ 40, Silver+5 ≥ Gold)', () => {
    const a = c.after;
    assert.ok(a.easy >= 45 && a.medium >= 30 && (a.hard == null || a.hard <= 50) && a.r1 >= 40, JSON.stringify(a));
    assert.ok(a.silver + 5 >= a.gold, `Silver ${a.silver} × Gold ${a.gold}`);
  });
  await check('economia (smoke): sponsor Y1 ≤ 60, prize Y1 ≥ 10, dívida Normal ≤ 10%', () => {
    const e = report('economy-smoke.json').after;
    assert.ok(e.sponsorY1Median <= 60 && e.prizeY1Median >= 10 && e.debtPct <= 10, JSON.stringify(e));
  });
} catch (e) { console.error(e); process.exitCode = 1; }
finish();
