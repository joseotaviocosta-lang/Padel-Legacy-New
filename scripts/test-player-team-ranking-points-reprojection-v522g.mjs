// Playthrough 5.22-G, Parte P — a dupla deriva dos pontos ATUAIS: quando os
// individuais mudam, o próximo recálculo canônico acompanha. Nada de
// snapshot congelado na formação.
import assert from 'node:assert/strict';
import { loadTeamRankingModules, installEntityStore, check, finish } from './lib/v522eTeamRankingHarness.mjs';

const { vite, teamRanking, localGame } = await loadTeamRankingModules();
try {
  const store = installEntityStore(localGame, {
    PlayerProfile: [{ id: 'player-zezao', name: 'zezao', rank_points: 39 }],
    AthleteProfile: [{ id: 'athlete-tomas', name: 'Tomás Benítez', world_ranking_points: 978 }],
    Partnership: [{ id: 'part-1', profile_id: 'player-zezao', status: 'ativa', partner_bot_id: 'athlete-tomas' }],
    TeamRanking: [],
  });
  const player = store.state.PlayerProfile[0];

  await teamRanking.ensurePlayerTeamRanking(player);
  const initial = (await teamRanking.getTeamRank(player, { id: 'athlete-tomas' })).points;

  await localGame.entities.PlayerProfile.update('player-zezao', { rank_points: 60 });
  player.rank_points = 60;
  await localGame.entities.AthleteProfile.update('athlete-tomas', { world_ranking_points: 1000 });
  await teamRanking.ensurePlayerTeamRanking(player);
  const reprojected = (await teamRanking.getTeamRank(player, { id: 'athlete-tomas' })).points;

  check('valor inicial 39 + 978 = 1017', () => {
    assert.equal(initial, 1017);
  });

  check('após 60 + 1000 o recálculo canônico dá 1060', () => {
    assert.equal(reprojected, 1060);
  });

  check('não ficou congelado no valor da formação', () => {
    assert.notEqual(reprojected, initial);
  });

  console.log('   [registro] 1017 -> 1060 após mudança dos individuais');
} finally {
  await vite.close();
}
finish('test-player-team-ranking-points-reprojection-v522g');
