// Playthrough 5.22-E, Partes O/P/X — uma parceria recém-formada NÃO começa
// necessariamente em zero: herda imediatamente a soma dos pontos individuais
// atuais. A identidade é nova (V/D e títulos zerados).
import assert from 'node:assert/strict';
import { loadTeamRankingModules, installEntityStore, check, finish } from './lib/v522eTeamRankingHarness.mjs';

const { vite, teamRanking, localGame } = await loadTeamRankingModules();
try {
  const store = installEntityStore(localGame, { TeamRanking: [] });
  const profile = { id: 'player-zezao', name: 'zezao', rank_points: 39 };
  const partner = { id: 'athlete-tomas', name: 'Tomás Benítez', world_ranking_points: 0 };

  const first = await teamRanking.materializeTeamRankingForPair(profile, partner);
  const row = store.state.TeamRanking[0];
  const again = await teamRanking.materializeTeamRankingForPair(profile, partner);
  const second = await teamRanking.materializeTeamRankingForPair(profile, { id: 'athlete-other', name: 'Outro', world_ranking_points: 80 });
  const rank = await teamRanking.getTeamRank(profile, partner);

  check('nova dupla materializada com a soma (39 + 0 = 39)', () => {
    assert.equal(first.points, 39);
    assert.equal(first.created, true);
  });

  check('a linha nasce sem histórico de V/D nem títulos', () => {
    assert.equal(row.matches_played, 0);
    assert.equal(row.wins, 0);
    assert.equal(row.losses, 0);
    assert.deepEqual(row.titles, []);
  });

  check('re-materializar é idempotente (não duplica, não soma de novo)', () => {
    assert.equal(again.created, false);
    assert.equal(store.state.TeamRanking.filter((r) => r.team_key === row.team_key).length, 1);
    assert.equal(store.state.TeamRanking.find((r) => r.team_key === row.team_key).ranking_points, 39);
  });

  check('parceiro com pontos entra na soma (39 + 80 = 119)', () => {
    assert.equal(second.points, 119);
  });

  check('a dupla ganha posição imediatamente quando a soma > 0 (Partes X/Y)', () => {
    assert.equal(rank.unranked, false, 'dupla com 39 pts não pode aparecer sem ranking');
    assert.ok(rank.rank > 0);
    assert.equal(rank.points, 39);
  });

  console.log('   [registro] materialize + getTeamRank: ok');
} finally {
  await vite.close();
}
finish('test-team-ranking-new-pair-inherits-points-v522e');
