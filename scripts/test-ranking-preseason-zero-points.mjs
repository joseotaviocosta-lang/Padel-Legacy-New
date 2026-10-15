// Playthrough 5.0, Parte T/W (Invariante 5) — Pré-Temporada/Exibição nunca
// pode gerar pontos oficiais de ranking (Race ou Circuito), pro jogador
// nem para o adversário.
import assert from 'node:assert/strict';
import { createServer } from 'vite';

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { getTournamentTierConfig, buildPreSeasonExhibition } = await vite.ssrLoadModule('/src/lib/circuitCatalog.js');
  const { getTournamentRewards } = await vite.ssrLoadModule('/src/lib/career.js');

  const exhibitionPayload = buildPreSeasonExhibition(2026, null);
  assert.equal(exhibitionPayload.is_exhibition, true);
  assert.equal(exhibitionPayload.tier, 'Exibição');

  const config = getTournamentTierConfig('Exibição');
  console.log('roundPoints (Exibição)', config.roundPoints);
  for (const points of config.roundPoints) {
    assert.equal(points, 0, 'nenhuma rodada de Exibição pode conceder pontos de ranking oficiais');
  }

  // A tabela de premiação usada no settlement real (getTournamentRewards)
  // precisa refletir a mesma regra — champion de Exibição também é 0.
  for (let roundsWon = 0; roundsWon <= config.roundCount; roundsWon += 1) {
    const rewards = getTournamentRewards('Exibição', roundsWon);
    assert.equal(rewards.rankPoints, 0, `roundsWon=${roundsWon} não pode gerar rankPoints em Exibição`);
  }

  console.log('test-ranking-preseason-zero-points: PASS');
} finally {
  await vite.close();
}
