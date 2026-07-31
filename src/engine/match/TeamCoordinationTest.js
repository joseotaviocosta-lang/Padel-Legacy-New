import { createMatch, playPoint, MATCH_TACTICS } from './index.js';
import { TeamCoordinationEngine } from './TeamCoordinationEngine.js';
import { createStatistics } from './StatisticsEngine.js';
import { createTeams } from './playerModel.js';

const athlete = (id, name, level, side, extras = {}) => ({
  id,
  sport_name: name,
  preferred_side: side,
  play_style: 'Tático',
  energy: 100,
  morale: 74,
  serve: level,
  forehand: level,
  backhand: level,
  volley: level,
  bandeja: level,
  smash: level,
  defense: level,
  agility: level,
  strategy: level,
  emotional_control: level,
  teamwork: 88,
  chemistry: 84,
  ...extras,
});

function simulate(seed) {
  let state = createMatch(
    [
      athlete('tc-a1', 'Lia', 75, 'left', { aggression: 79 }),
      athlete('tc-a2', 'Nina', 73, 'right', { teamwork: 92 }),
    ],
    [
      athlete('tc-b1', 'Mara', 74, 'left', { teamwork: 72, chemistry: 58 }),
      athlete('tc-b2', 'Sara', 72, 'right', { teamwork: 70, chemistry: 56 }),
    ],
    { seed },
  );
  let safety = 5000;
  while (!state.finished && safety-- > 0) state = playPoint(state, MATCH_TACTICS[4]);
  if (!state.finished) throw new Error('A partida de coordenação excedeu o limite de segurança.');
  return state;
}

export async function runTeamCoordinationTest() {
  const directTeams = createTeams(
    [athlete('d1', 'A', 75, 'left'), athlete('d2', 'B', 73, 'right')],
    [athlete('d3', 'C', 72, 'left'), athlete('d4', 'D', 71, 'right')],
  );
  const engine = new TeamCoordinationEngine();
  const stats = createStatistics(directTeams);
  directTeams.A[0].energy = 25;
  const directEvents = engine.coordinate({ teams: directTeams, activeTeam: 'A', player: directTeams.A[0], shot: 'chiquita', rallyLength: 5 });

  const first = simulate('v040-stage4');
  const second = simulate('v040-stage4');
  const teamRows = Object.values(first.stats.teams);
  const coordinationEvents = first.narration.flatMap((event) => event.narrative?.coordination ? [event.narrative.coordination] : []);
  const statsReady = teamRows.every((row) =>
    typeof row.coordinationEfficiency === 'number' &&
    typeof row.averageCoordinationQuality === 'number' &&
    typeof row.coordinationErrors === 'number'
  );
  const coverageReady = directEvents.some((event) => ['fatigue_cover', 'coordinated_advance', 'center_cover'].includes(event.type));
  const spacingReady = directTeams.A[0].position.lane !== directTeams.A[1].position.lane;
  const deterministic = JSON.stringify({
    score: first.setScores,
    winner: first.winner,
    coordination: first.stats.teams,
  }) === JSON.stringify({
    score: second.setScores,
    winner: second.winner,
    coordination: second.stats.teams,
  });
  const integrated = first.stats.teams.A.coordinationEvents + first.stats.teams.B.coordinationEvents > 0;

  return {
    success: statsReady && coverageReady && spacingReady && deterministic && integrated,
    version: first.engineVersion,
    statsReady,
    coverageReady,
    spacingReady,
    deterministic,
    integrated,
    narrativeCoordinationEvents: coordinationEvents.length,
    teamA: first.stats.teams.A,
    teamB: first.stats.teams.B,
  };
}

export function setupTeamCoordinationTest() {
  if (typeof window !== 'undefined') window.PadelTeamCoordinationTest = { run: runTeamCoordinationTest };
}
