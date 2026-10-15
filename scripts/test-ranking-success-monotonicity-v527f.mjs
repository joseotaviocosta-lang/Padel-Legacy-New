// Playthrough 5.27-F, Bloco K — mesma carreira (seed, política, calendário),
// taxa de vitórias fixada em 0 / 25 / 50 / 75%: mais sucesso esportivo nunca
// termina com ranking pior. Hard gate: sem inversões.
import { makeSuite, assert } from './lib/v526bTestKit.mjs';
import { loadRankingSummary } from './lib/v527fRankingKit.mjs';

const { check, finish } = makeSuite('test-ranking-success-monotonicity-v527f');
try {
  const { results } = loadRankingSummary();
  const order = ['wr0', 'wr25', 'wr50', 'wr75'].map((k) => [k, results[k]]);

  await check('os 4 cenários existem e o WR real acompanha o alvo (±12 pp)', () => {
    for (const [k, r] of order) {
      assert.ok(r, `${k} ausente`);
      assert.ok(Math.abs(r.actualWR - r.targetWR * 100) <= 12, `${k}: ${r.actualWR}% × alvo ${r.targetWR * 100}%`);
    }
  });

  await check('pontos ganhos crescem com o sucesso: 0% < 25% < 50% < 75%', () => {
    for (let i = 1; i < order.length; i += 1) assert.ok(order[i][1].pointsHeldEnd > order[i - 1][1].pointsHeldEnd, `${order[i - 1][0]} ${order[i - 1][1].pointsHeldEnd} → ${order[i][0]} ${order[i][1].pointsHeldEnd}`);
  });

  await check('rank final melhora com o sucesso: 75% > 50% > 25% > 0% (sem inversão)', () => {
    for (let i = 1; i < order.length; i += 1) assert.ok(order[i][1].endRankActual < order[i - 1][1].endRankActual, `${order[i - 1][0]} #${order[i - 1][1].endRankActual} → ${order[i][0]} #${order[i][1].endRankActual}`);
  });

  await check('títulos não diminuem com o sucesso', () => {
    for (let i = 1; i < order.length; i += 1) assert.ok(order[i][1].titles >= order[i - 1][1].titles);
  });
} finally {
  finish();
}
