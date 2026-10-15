// Playthrough 5.22-E, Partes Q/R — troca de parceiro: cada dupla tem o seu
// próprio valor (soma dos membros atuais); a nova dupla recalcula do zero a
// partir dos indivíduos e NÃO herda V/D/títulos da anterior.
import assert from 'node:assert/strict';
import { loadTeamRankingModules, installEntityStore, check, finish } from './lib/v522eTeamRankingHarness.mjs';

const { vite, teamRanking, localGame } = await loadTeamRankingModules();
try {
  const store = installEntityStore(localGame, { TeamRanking: [] });
  const A = { id: 'player-a', name: 'A', rank_points: 300 };
  const B = { id: 'athlete-b', name: 'B', world_ranking_points: 200 };
  const C = { id: 'athlete-c', name: 'C', world_ranking_points: 80 };

  await teamRanking.materializeTeamRankingForPair(A, B);
  const abKey = teamRanking.teamKey(A.id, B.id);
  // Histórico real da primeira parceria.
  const abRow = store.state.TeamRanking.find((r) => r.team_key === abKey);
  abRow.matches_played = 7;
  abRow.wins = 5;
  abRow.losses = 2;
  abRow.titles = ['Masters de Teste'];

  await teamRanking.materializeTeamRankingForPair(A, C);
  const acKey = teamRanking.teamKey(A.id, C.id);
  const acRow = store.state.TeamRanking.find((r) => r.team_key === acKey);

  check('A+B = 300 + 200 = 500', () => {
    assert.equal(abRow.ranking_points, 500);
  });

  check('A troca para C: A+C = 300 + 80 = 380', () => {
    assert.equal(acRow.ranking_points, 380);
  });

  check('a nova dupla não herda V/D nem títulos da antiga (Parte P)', () => {
    assert.equal(acRow.matches_played, 0);
    assert.equal(acRow.wins, 0);
    assert.equal(acRow.losses, 0);
    assert.deepEqual(acRow.titles, []);
  });

  check('a dupla antiga continua sendo uma linha distinta', () => {
    assert.notEqual(abKey, acKey);
    assert.equal(store.state.TeamRanking.filter((r) => r.team_key === abKey).length, 1);
  });

  check('pontos individuais mudam e o recálculo reflete (Parte R)', async () => {
    A.rank_points = 350;
    B.world_ranking_points = 220;
    await teamRanking.materializeTeamRankingForPair(A, B);
    assert.equal(store.state.TeamRanking.find((r) => r.team_key === abKey).ranking_points, 570);
  });

  console.log('   [registro] 500 -> 380; A+B revisado 570');
} finally {
  await vite.close();
}
finish('test-team-ranking-pair-change-sum-v522e');
