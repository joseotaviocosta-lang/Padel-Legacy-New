import { createMatch, playPoint, MATCH_TACTICS } from './index.js';

const athlete = (id, name, level, style, personality = {}) => ({
  id,
  sport_name: name,
  play_style: style,
  energy: 100,
  morale: 72,
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
  ...personality,
});

function simulate(seed) {
  let state = createMatch(
    [
      athlete('n1', 'Nina', 75, 'Agressivo', { aggression: 88, courage: 84 }),
      athlete('n2', 'Lia', 71, 'Tático', { creativity: 82, discipline: 77 }),
    ],
    [
      athlete('n3', 'Mara', 73, 'Defensivo', { consistency: 87, emotional_control: 84 }),
      athlete('n4', 'Sara', 70, 'Equilibrado', { teamwork: 82, strategy: 80 }),
    ],
    { seed },
  );
  let safety = 5000;
  while (!state.finished && safety-- > 0) state = playPoint(state, MATCH_TACTICS[0]);
  if (!state.finished) throw new Error('A partida de teste excedeu o limite de segurança.');
  return state;
}

export async function runAdvancedNarrativeStatsTest() {
  const first = simulate('v040-stage3');
  const second = simulate('v040-stage3');
  const players = Object.values(first.stats.players);
  const narrativeEvents = first.narration.filter((event) => event.narrative);
  const advancedStats = players.every((row) =>
    typeof row.unforcedErrors === 'number' &&
    typeof row.forcedErrors === 'number' &&
    typeof row.netEfficiency === 'number' &&
    typeof row.decisiveEfficiency === 'number' &&
    row.shotWinners && row.shotErrors,
  );
  const narrativeReady = narrativeEvents.length > 0 && narrativeEvents.every((event) =>
    typeof event.narrative.headline === 'string' &&
    Array.isArray(event.narrative.tags) &&
    typeof event.narrative.importance === 'number',
  );
  const analysisReady = Boolean(
    first.analysis &&
    first.analysis.statistics &&
    Array.isArray(first.analysis.keyMoments) &&
    Array.isArray(first.analysis.tacticalSummary),
  );
  const deterministic = JSON.stringify({
    score: first.setScores,
    winner: first.winner,
    points: first.stats.points,
    headlines: narrativeEvents.slice(0, 10).map((event) => event.narrative.headline),
  }) === JSON.stringify({
    score: second.setScores,
    winner: second.winner,
    points: second.stats.points,
    headlines: second.narration.filter((event) => event.narrative).slice(0, 10).map((event) => event.narrative.headline),
  });

  return {
    success: advancedStats && narrativeReady && analysisReady && deterministic,
    version: first.engineVersion,
    advancedStats,
    narrativeReady,
    analysisReady,
    deterministic,
    narrativeEvents: narrativeEvents.length,
    keyMoments: first.analysis?.keyMoments?.length || 0,
    averageRally: first.stats.averageRally,
    longestRally: first.stats.longestRally,
    playerOfTheMatch: first.analysis?.playerOfTheMatch || null,
  };
}

export function setupAdvancedNarrativeStatsTest() {
  if (typeof window !== 'undefined') {
    window.PadelAdvancedNarrativeStatsTest = { run: runAdvancedNarrativeStatsTest };
  }
}
