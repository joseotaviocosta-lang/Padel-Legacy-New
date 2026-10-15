// Playthrough 5.22-E, Partes U/AA — save existente converge para a nova
// fórmula. `repairLegacyTeamRankings` recalcula TODAS as linhas resolvíveis
// para A + B, e é idempotente.
import assert from 'node:assert/strict';
import { loadTeamRankingModules, installEntityStore, check, finish } from './lib/v522eTeamRankingHarness.mjs';

const { vite, teamRanking, localGame } = await loadTeamRankingModules();
try {
  const store = installEntityStore(localGame, {
    AthleteProfile: [
      { id: 'athlete-a', name: 'A', world_ranking_points: 300 },
      { id: 'athlete-b', name: 'B', world_ranking_points: 200 },
    ],
    TeamRanking: [
      // Valor da fórmula antiga (geométrica): round(sqrt(300*200)) = 245.
      {
        id: 'tr-legacy',
        team_key: 'athlete-a_athlete-b',
        player1_id: 'athlete-a',
        player2_id: 'athlete-b',
        player1_name: 'A',
        player2_name: 'B',
        ranking_points: 245,
        matches_played: 3,
        wins: 2,
        losses: 1,
        titles: ['Título antigo'],
      },
    ],
  });

  const first = await teamRanking.repairLegacyTeamRankings();
  const rowAfterFirst = store.state.TeamRanking.find((r) => r.id === 'tr-legacy');
  const second = await teamRanking.repairLegacyTeamRankings();
  const rowAfterSecond = store.state.TeamRanking.find((r) => r.id === 'tr-legacy');

  check('o valor antigo (245, geométrico) é substituído por 300 + 200 = 500', () => {
    assert.equal(rowAfterFirst.ranking_points, 500);
    assert.ok(first.pointsRecalculated >= 1);
  });

  check('o histórico real (V/D/títulos) é preservado no recálculo', () => {
    assert.equal(rowAfterFirst.matches_played, 3);
    assert.equal(rowAfterFirst.wins, 2);
    assert.equal(rowAfterFirst.losses, 1);
    assert.deepEqual(rowAfterFirst.titles, ['Título antigo']);
  });

  check('idempotente: rodar de novo não altera nem reescreve', () => {
    assert.equal(rowAfterSecond.ranking_points, 500);
    assert.equal(second.pointsRecalculated, 0);
  });

  console.log(`   [registro] repair: ${first.pointsRecalculated} recalculado(s), 2ª passada ${second.pointsRecalculated}`);
} finally {
  await vite.close();
}
finish('test-team-ranking-existing-save-recalc-v522e');
