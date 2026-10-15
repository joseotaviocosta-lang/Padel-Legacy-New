// Playthrough 5.22-G, Partes J/P — save EXISTENTE: a linha da dupla ativa já
// existe (0 ou desatualizada). O reparo legado precisa resolver o membro
// JOGADOR (PlayerProfile) e recalcular A+B, idempotente.
import assert from 'node:assert/strict';
import { loadTeamRankingModules, installEntityStore, check, finish } from './lib/v522eTeamRankingHarness.mjs';

const { vite, teamRanking, localGame } = await loadTeamRankingModules();
try {
  const store = installEntityStore(localGame, {
    PlayerProfile: [{ id: 'player-zezao', name: 'zezao', rank_points: 39 }],
    AthleteProfile: [{ id: 'athlete-tomas', name: 'Tomás Benítez', world_ranking_points: 978 }],
    Partnership: [{ id: 'part-1', profile_id: 'player-zezao', status: 'ativa', partner_bot_id: 'athlete-tomas' }],
    TeamRanking: [{
      id: 'tr-player', team_key: teamRanking.teamKey('player-zezao', 'athlete-tomas'),
      player1_id: 'athlete-tomas', player2_id: 'player-zezao',
      player1_name: 'Tomás Benítez', player2_name: 'zezao',
      ranking_points: 0, matches_played: 4, wins: 3, losses: 1, titles: ['Copa Teste'],
    }],
  });

  const first = await teamRanking.repairLegacyTeamRankings();
  const row = store.state.TeamRanking.find((r) => r.id === 'tr-player');
  const second = await teamRanking.repairLegacyTeamRankings();
  const rank = await teamRanking.getTeamRank(store.state.PlayerProfile[0], { id: 'athlete-tomas' });

  check('o reparo resolve o membro-jogador e recalcula 39 + 978 = 1017', () => {
    assert.equal(Number(row.ranking_points), 1017, `pontos = ${row.ranking_points}`);
    assert.ok(first.pointsRecalculated >= 1);
  });

  check('o histórico da parceria (V/D/títulos) é preservado', () => {
    assert.equal(row.matches_played, 4);
    assert.equal(row.wins, 3);
    assert.equal(row.losses, 1);
    assert.deepEqual(row.titles, ['Copa Teste']);
  });

  check('idempotente: a segunda passada não recalcula de novo', () => {
    assert.equal(second.pointsRecalculated, 0);
    assert.equal(Number(row.ranking_points), 1017);
  });

  check('getTeamRank passa a reportar 1017 com posição', () => {
    assert.equal(rank.points, 1017);
    assert.equal(rank.unranked, false);
  });

  console.log(`   [registro] repair: ${first.pointsRecalculated} recalculado(s); 2ª passada ${second.pointsRecalculated}`);
} finally {
  await vite.close();
}
finish('test-player-team-ranking-existing-save-repair-v522g');
