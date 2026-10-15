// Playthrough 5.27-F, Bloco H — decomposição da subida: pontos do jogador
// (mundo congelado no dia 1) × movimento do mundo (jogador com 0 pontos), com o
// rank recalculado pela regra 1 + nº de ativos com mais pontos conferido contra
// o rank real do jogo.
import { makeSuite, assert } from './lib/v526bTestKit.mjs';
import { loadRankingSummary } from './lib/v527fRankingKit.mjs';

const { check, finish } = makeSuite('test-ranking-world-vs-player-decomposition-v527f');
try {
  const { results } = loadRankingSummary();
  for (const [name, r] of Object.entries(results)) {
    await check(`${name}: rank recalculado ≈ rank real do jogo (±12%)`, () => {
      assert.ok(Math.abs(r.endRankRecomputed - r.endRankActual) <= Math.max(25, r.endRankActual * 0.12), `${r.endRankRecomputed} × ${r.endRankActual}`);
    });
    await check(`${name}: as duas componentes existem e cada uma sozinha sobe menos que as duas juntas`, () => {
      const d = r.decomposition;
      assert.ok(d.rankWithPlayerPointsWorldFrozen > r.endRankRecomputed && d.rankWithZeroPointsWorldMoved > r.endRankRecomputed);
      assert.ok(d.rankWithPlayerPointsWorldFrozen <= d.rankAtStartZeroPoints && d.rankWithZeroPointsWorldMoved <= d.rankAtStartZeroPoints);
    });
  }
  // Os resultados do jogador mudam quem vence os torneios do mundo (e quem
  // pontua), então a componente "só mundo" não é idêntica entre cenários —
  // mas é a mesma ordem de grandeza (±5% da tabela).
  await check('mesmo mundo de base: a componente "só mundo" varia no máximo ±5% da tabela entre cenários', () => {
    const w = Object.values(results).map((r) => r.decomposition.rankWithZeroPointsWorldMoved);
    assert.ok(Math.max(...w) - Math.min(...w) <= 50, w.join(','));
  });
} finally {
  finish();
}
