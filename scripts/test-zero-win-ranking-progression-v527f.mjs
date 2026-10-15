// Playthrough 5.27-F, Blocos G/H — carreira real de 1 ano com 0 vitórias
// (calendário da política v2): reproduz a subida e a explica. Gate: progressão
// extrema só é aceita com causa de movimento do mundo DOCUMENTADA; os pontos do
// próprio jogador, com o mundo congelado, têm de render uma subida modesta.
import { makeSuite, assert } from './lib/v526bTestKit.mjs';
import { loadRankingSummary } from './lib/v527fRankingKit.mjs';

const { check, finish } = makeSuite('test-zero-win-ranking-progression-v527f');
try {
  const s = loadRankingSummary();
  const z = s.results.wr0;

  await check('carreira de 1 ano, calendário completo, 0 vitórias', () => {
    assert.ok(z, 'cenário wr0 ausente');
    assert.equal(z.wins, 0);
    assert.ok(z.tournaments >= 25, `${z.tournaments} torneios`);
    assert.equal(s.days, 365);
  });

  await check('subida reproduzida (#1001 → ~#450–500)', () => {
    assert.equal(z.startRank, 1001);
    assert.ok(z.endRankActual >= 350 && z.endRankActual <= 600, `#${z.endRankActual}`);
  });

  await check('só os pontos do jogador (mundo congelado no início): subida modesta, faixa #750–900', () => {
    const r = z.decomposition.rankWithPlayerPointsWorldFrozen;
    assert.ok(r >= 750 && r <= 900, `#${r}`);
  });

  await check('causa documentada: o mundo perde pontos (com 0 pts o jogador já subiria por esvaziamento da base)', () => {
    const d = z.decomposition;
    assert.ok(d.worldAthletesWithPointsEnd < d.worldAthletesWithPointsStart * 0.8, `${d.worldAthletesWithPointsStart} → ${d.worldAthletesWithPointsEnd}`);
    assert.ok(d.rankWithZeroPointsWorldMoved < d.rankAtStartZeroPoints - 200, `#${d.rankAtStartZeroPoints} → #${d.rankWithZeroPointsWorldMoved}`);
    assert.ok(d.worldPointsMedianEnd < d.worldPointsMedianStart / 2, `${d.worldPointsMedianStart} → ${d.worldPointsMedianEnd}`);
  });
} finally {
  finish();
}
