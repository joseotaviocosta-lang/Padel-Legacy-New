// Playthrough 5.27-F, Blocos G/J — pontos de ranking por ORIGEM (tabela real do
// catálogo + pontos ganhos na carreira de 0 vitórias). Participação é modesta:
// derrota na 1ª rodada vale <= 10% do título em todo tier; o qualifying não dá
// ponto por derrota.
import { makeSuite, assert } from './lib/v526bTestKit.mjs';
import { loadPointsTable, loadRankingSummary } from './lib/v527fRankingKit.mjs';

const { check, finish } = makeSuite('test-ranking-points-by-source-v527f');
try {
  const table = loadPointsTable();
  const z = loadRankingSummary().results.wr0;

  await check('tabela cobre Bronze → Crown', () => {
    assert.deepEqual(table.map((r) => r.tier), ['Bronze', 'Silver', 'Gold', 'Platinum', 'Masters', 'Elite', 'Crown']);
  });

  for (const r of table) {
    await check(`${r.tier}: derrota na R1 = ${r.r1LossPoints} de ${r.championPoints} (<= 10% do título); 1ª vitória dobra; qualifying sem ponto`, () => {
      assert.ok(r.r1LossPoints / r.championPoints <= 0.1 + 1e-9);
      assert.ok(r.firstWinPoints >= r.r1LossPoints * 1.8);
      assert.equal(r.qualifyingLossPoints, 0);
      assert.equal(r.titlePoints, r.championPoints);
    });
  }

  await check('carreira de 0 vitórias: só pontos de participação (rounds-won-0) — e a soma bate', () => {
    const keys = Object.keys(z.bySource);
    assert.ok(keys.every((k) => k.endsWith('rounds-won-0') || k.endsWith('qualifying-loss')), keys.join(','));
    const total = Object.values(z.bySource).reduce((s, v) => s + v.points, 0);
    assert.equal(total, z.pointsEarnedSum);
    assert.ok(z.pointsPerTournament <= 3, `${z.pointsPerTournament} pts/torneio`);
  });
} finally {
  finish();
}
