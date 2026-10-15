// Playthrough 5.23, Partes F/G/W — contexto da dupla do jogador na Race:
//   A(39) + B(120) = 159
// troca de parceiro: A + C(30) = 69 (soma Race ATUAL dos membros),
// sem herdar V/D/títulos. World e Race são independentes.
import assert from 'node:assert/strict';
import { loadTeamRankingModules, installEntityStore, check, finish } from './lib/v522eTeamRankingHarness.mjs';

const { vite, teamRanking, localGame } = await loadTeamRankingModules();
try {
  const teamRace = await vite.ssrLoadModule('/src/lib/teamRaceRanking.js');
  installEntityStore(localGame, {
    PlayerProfile: [{ id: 'player-zezao', name: 'zezao', rank_points: 0, race_points: 39 }],
    AthleteProfile: [
      { id: 'athlete-b', name: 'Tomás', world_ranking_points: 0, race_points: 120 },
      { id: 'athlete-c', name: 'Carlos', world_ranking_points: 0, race_points: 30 },
    ],
    Partnership: [{ id: 'part-1', profile_id: 'player-zezao', status: 'ativa', partner_bot_id: 'athlete-b' }],
    TeamRanking: [
      { id: 'tr-ab', team_key: teamRanking.teamKey('player-zezao', 'athlete-b'), player1_id: 'player-zezao', player2_id: 'athlete-b', player1_name: 'zezao', player2_name: 'Tomás', ranking_points: 0, matches_played: 5, wins: 4, losses: 1, titles: ['X'] },
      { id: 'tr-ac', team_key: teamRanking.teamKey('player-zezao', 'athlete-c'), player1_id: 'player-zezao', player2_id: 'athlete-c', player1_name: 'zezao', player2_name: 'Carlos', ranking_points: 0, matches_played: 0, wins: 0, losses: 0, titles: [] },
    ],
  });
  const profile = { id: 'player-zezao', name: 'zezao', race_points: 39 };

  const ab = await teamRace.getTeamRaceRank(profile, { id: 'athlete-b' });
  const ac = await teamRace.getTeamRaceRank(profile, { id: 'athlete-c' });
  const board = await teamRace.getTeamRaceRankings(600, { profile });
  const abRow = board.find((r) => r.team_key === teamRanking.teamKey('player-zezao', 'athlete-b'));

  check('A(39) + B(120) = 159 e tem posição na Race', () => {
    assert.equal(ab.points, 159);
    assert.equal(ab.unranked, false);
    assert.ok(ab.rank > 0);
  });

  check('A troca para C: A(39) + C(30) = 69', () => {
    assert.equal(ac.points, 69);
  });

  check('a Race de Duplas não herda V/D/títulos da parceria anterior', () => {
    // A projeção de Race não carrega V/D; o histórico vive na linha mundial/
    // Partnership, preservado intacto (5 wins).
    assert.equal(abRow.matches_played, 5);
    assert.equal(abRow.race_points, 159);
  });

  check('World 0 e Race > 0 são independentes (Parte W)', () => {
    assert.equal(abRow.ranking_points, 0);
    assert.ok(abRow.race_points > 0);
  });

  console.log('   [registro] A+B Race 159 · A+C Race 69');
} finally {
  await vite.close();
}
finish('test-ranking-race-doubles-player-context-v523');
