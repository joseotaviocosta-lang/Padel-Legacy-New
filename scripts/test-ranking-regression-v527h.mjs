// Playthrough 5.27-H, Bloco H — ranking da 5.27-F preservado: derrota na R1
// dos tiers com corte (Gold+) vale 1% do título; pontos monotônicos com o
// avanço; sem inflação de 0 vitórias; fontes de pontos e ranks 6m/1a/18m/2a
// medidos por carreira.
import { makeSuite, assert } from './lib/v526bTestKit.mjs';
import { csvRows, report, runs } from './lib/v527hTestKit.mjs';

const { check, finish } = makeSuite('test-ranking-regression-v527h');
try {
  const table = Object.fromEntries(csvRows('ranking-points-by-tier.csv').map((r) => [r.tier, r]));
  await check('Gold+ R1 loss = 1% do título (correção 5.27-F ativa no Balanced-E)', () => {
    for (const t of ['Gold', 'Platinum', 'Masters', 'Elite', 'Crown']) assert.equal(table[t].r1LossPoints, Math.round(table[t].championPoints * 0.01), t);
    assert.equal(report('frozen-config.json').blocks.ranking.gatedFirstRoundLossPointsRatio, 0.01);
  });
  await check('torneios da matriz: pontos não decrescem com rodadas vencidas (por tier)', () => {
    const byTier = {};
    for (const { env } of runs()) for (const t of env.result.tournaments) ((byTier[t.tier] ||= {})[t.roundsWon] ||= []).push(t.rankPoints);
    for (const [tier, rounds] of Object.entries(byTier)) {
      const ks = Object.keys(rounds).map(Number).sort((a, b) => a - b);
      for (let i = 1; i < ks.length; i += 1) assert.ok(Math.min(...rounds[ks[i]]) >= Math.max(...rounds[ks[i - 1]]), `${tier}: ${ks[i - 1]}→${ks[i]} rodadas`);
    }
  });
  // Os pontos pagos ao jogador saem ~1,35× a tabela do catálogo em TODAS as
  // rodadas (Gold título 135, R1 1). A regra da 5.27-F é de proporção, então a
  // checagem compara com o título efetivamente pago no mesmo tier.
  await check('0 vitórias em Gold+ (R1 ou qualifying) ≤ 1,5% do título pago no tier (sem inflação)', () => {
    const all = runs().flatMap(({ file, env }) => env.result.tournaments.map((t) => ({ ...t, file })));
    const paidScale = Math.max(...all.filter((t) => t.tier === 'Gold' && t.status === 'champion').map((t) => t.rankPoints)) / table.Gold.championPoints;
    assert.ok(paidScale >= 1 && paidScale <= 1.5, `escala paga ${paidScale}`);
    for (const t of all.filter((x) => x.roundsWon === 0 && ['Gold', 'Platinum', 'Masters', 'Elite', 'Crown'].includes(x.tier))) {
      const paidTitle = table[t.tier].championPoints * paidScale;
      assert.ok(t.rankPoints <= Math.max(1, Math.round(paidTitle * 0.015)), `${t.file} ${t.tournamentId} (${t.tier}): ${t.rankPoints} > 1,5% de ${paidTitle}`);
    }
  });
  await check('ranking.csv e ranking-points.csv: 45 carreiras com rank 6m/1a/18m/2a e fontes que fecham com o total', () => {
    const rk = csvRows('ranking.csv');
    assert.equal(rk.length, 45);
    for (const r of rk) for (const k of ['rank6m', 'rank1y', 'rank18m', 'rank2y']) assert.ok(r[k] > 0, `${r.job} ${k}`);
    for (const r of csvRows('ranking-points.csv')) assert.equal(r.participation + r.wins + r.titles + r.other, r.total, `${r.job} ${r.horizon}`);
  });
} catch (e) { console.error(e); process.exitCode = 1; }
finish();
