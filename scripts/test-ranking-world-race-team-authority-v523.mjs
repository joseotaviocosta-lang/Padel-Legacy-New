// Playthrough 5.23, Parte AB — fixture deliberadamente divergente:
//   A: World 5000 · Race 100
//   B: World 3000 · Race 250
//   WORLD TEAM = 8000
//   RACE TEAM  = 350
// Hard gate: WorldTeamPoints != RaceTeamPoints (autoridades independentes).
import assert from 'node:assert/strict';
import { loadTeamRankingModules, installEntityStore, check, finish } from './lib/v522eTeamRankingHarness.mjs';

const { vite, teamRanking, localGame } = await loadTeamRankingModules();
try {
  const teamRace = await vite.ssrLoadModule('/src/lib/teamRaceRanking.js');
  const { computeCanonicalTeamRankingPoints: worldFormula } = await vite.ssrLoadModule('/src/lib/teamRankingFormula.js');

  installEntityStore(localGame, {
    PlayerProfile: [],
    AthleteProfile: [
      { id: 'athlete-a', name: 'A', world_ranking_points: 5000, ranking_points: 5000, race_points: 100 },
      { id: 'athlete-b', name: 'B', world_ranking_points: 3000, ranking_points: 3000, race_points: 250 },
    ],
    TeamRanking: [{
      id: 'tr-ab', team_key: 'athlete-a_athlete-b',
      player1_id: 'athlete-a', player2_id: 'athlete-b',
      player1_name: 'A', player2_name: 'B',
      ranking_points: 8000, race_points: 0, matches_played: 0, wins: 0, losses: 0, titles: [],
    }],
  });

  const worldTeam = worldFormula(5000, 3000);
  const raceTeam = teamRace.computeTeamRacePoints(100, 250);
  const board = await teamRace.getTeamRaceRankings(600);
  const row = board.find((r) => r.team_key === 'athlete-a_athlete-b');

  check('World team = 5000 + 3000 = 8000', () => {
    assert.equal(worldTeam, 8000);
  });

  check('Race team = 100 + 250 = 350', () => {
    assert.equal(raceTeam, 350);
    assert.equal(Number(row.race_points), 350);
  });

  check('hard gate: WorldTeamPoints != RaceTeamPoints', () => {
    assert.notEqual(worldTeam, raceTeam);
    assert.notEqual(Number(row.ranking_points), Number(row.race_points));
  });

  check('a Race de Duplas não usa World points', () => {
    assert.notEqual(Number(row.race_points), 8000);
  });

  console.log('   [registro] World 8000 · Race 350');
} finally {
  await vite.close();
}
finish('test-ranking-world-race-team-authority-v523');
