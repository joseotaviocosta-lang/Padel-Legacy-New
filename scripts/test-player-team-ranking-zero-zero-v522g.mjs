// Playthrough 5.22-G, Parte M — "Sem ranking" SÓ quando A + B <= 0.
//   0 + 0   -> Sem ranking
//   39 + 0  -> ranking
//   0 + 978 -> ranking
import assert from 'node:assert/strict';
import { loadTeamRankingModules, installEntityStore, check, finish } from './lib/v522eTeamRankingHarness.mjs';

const { vite, teamRanking, localGame } = await loadTeamRankingModules();
try {
  const store = installEntityStore(localGame, {
    PlayerProfile: [{ id: 'player-zezao', name: 'zezao', rank_points: 0 }],
    AthleteProfile: [{ id: 'athlete-tomas', name: 'Tomás Benítez', world_ranking_points: 0 }],
    Partnership: [{ id: 'part-1', profile_id: 'player-zezao', status: 'ativa', partner_bot_id: 'athlete-tomas' }],
    TeamRanking: [],
  });
  const player = store.state.PlayerProfile[0];

  await teamRanking.ensurePlayerTeamRanking(player);
  const zeroZero = await teamRanking.getTeamRank(player, { id: 'athlete-tomas' });

  await localGame.entities.PlayerProfile.update('player-zezao', { rank_points: 39 });
  player.rank_points = 39;
  await teamRanking.ensurePlayerTeamRanking(player);
  const thirtyNineZero = await teamRanking.getTeamRank(player, { id: 'athlete-tomas' });

  await localGame.entities.PlayerProfile.update('player-zezao', { rank_points: 0 });
  player.rank_points = 0;
  await localGame.entities.AthleteProfile.update('athlete-tomas', { world_ranking_points: 978 });
  await teamRanking.ensurePlayerTeamRanking(player);
  const zeroNine = await teamRanking.getTeamRank(player, { id: 'athlete-tomas' });

  check('0 + 0 => Sem ranking (0 pts)', () => {
    assert.equal(zeroZero.points, 0);
    assert.equal(zeroZero.unranked, true);
  });

  check('39 + 0 => ranking (39 pts)', () => {
    assert.equal(thirtyNineZero.points, 39);
    assert.equal(thirtyNineZero.unranked, false);
    assert.ok(thirtyNineZero.rank > 0);
  });

  check('0 + 978 => ranking (978 pts)', () => {
    assert.equal(zeroNine.points, 978);
    assert.equal(zeroNine.unranked, false);
    assert.ok(zeroNine.rank > 0);
  });

  console.log('   [registro] 0+0 sem ranking · 39+0 #rank · 0+978 #rank');
} finally {
  await vite.close();
}
finish('test-player-team-ranking-zero-zero-v522g');
