// Playthrough 5.22-G, Parte K — POSIÇÃO canônica: a dupla com 1017 pontos
// recebe a posição real dentro do universo TeamRanking por pontos, nunca
// média/rank de um membro.
import assert from 'node:assert/strict';
import { loadTeamRankingModules, installEntityStore, check, finish } from './lib/v522eTeamRankingHarness.mjs';

const { vite, teamRanking, localGame } = await loadTeamRankingModules();
try {
  const store = installEntityStore(localGame, {
    PlayerProfile: [{ id: 'player-zezao', name: 'zezao', rank_points: 39 }],
    AthleteProfile: [{ id: 'athlete-tomas', name: 'Tomás Benítez', world_ranking_points: 978 }],
    Partnership: [{ id: 'part-1', profile_id: 'player-zezao', status: 'ativa', partner_bot_id: 'athlete-tomas' }],
    TeamRanking: [
      { id: 'c1', team_key: 'x1_x2', player1_id: 'x1', player2_id: 'x2', ranking_points: 2000 },
      { id: 'c2', team_key: 'x3_x4', player1_id: 'x3', player2_id: 'x4', ranking_points: 1500 },
      { id: 'c3', team_key: 'x5_x6', player1_id: 'x5', player2_id: 'x6', ranking_points: 500 },
    ],
  });

  const player = store.state.PlayerProfile[0];
  await teamRanking.ensurePlayerTeamRanking(player);
  const rank = await teamRanking.getTeamRank(player, { id: 'athlete-tomas' });
  const board = await teamRanking.getTeamRankings(600);
  const own = board.find((r) => r.team_key === teamRanking.teamKey('player-zezao', 'athlete-tomas'));

  check('a posição é 3 (atrás de 2000 e 1500, à frente de 500)', () => {
    assert.equal(rank.points, 1017);
    assert.equal(rank.rank, 3, `rank = ${rank.rank}`);
  });

  check('a posição não é a média/rank de um membro individual', () => {
    // O jogador individual (39) ficaria bem abaixo; o parceiro (978) acima.
    // A posição da DUPLA tem de vir da soma 1017, distinta dos dois.
    assert.notEqual(rank.points, 39);
    assert.notEqual(rank.points, 978);
    assert.ok(rank.displayRank !== '—');
  });

  check('a posição vem da tabela canônica (displayRank consistente)', () => {
    assert.equal(rank.rank, own.ranking_display_position);
  });

  console.log(`   [registro] 1017 pts -> #${rank.rank} de ${rank.total}`);
} finally {
  await vite.close();
}
finish('test-player-team-ranking-position-v522g');
