import { createMatch, playPoint, MATCH_TACTICS } from './MatchEngine.js';

const round = (value, digits = 2) => {
  const factor = 10 ** digits;
  return Math.round(Number(value || 0) * factor) / factor;
};

const average = (values) => values.length
  ? values.reduce((sum, value) => sum + Number(value || 0), 0) / values.length
  : 0;

const percentile = (values, ratio) => {
  if (!values.length) return 0;
  const ordered = [...values].sort((a, b) => a - b);
  const index = Math.min(ordered.length - 1, Math.max(0, Math.floor((ordered.length - 1) * ratio)));
  return ordered[index];
};

export function createBalanceAthlete(id, name, level = 72, style = 'Equilibrado', side = 'right', extras = {}) {
  return {
    id,
    sport_name: name,
    preferred_side: side,
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
    teamwork: 76,
    chemistry: 76,
    ...extras,
  };
}

export function createDefaultBalanceTeams() {
  return {
    teamA: [
      createBalanceAthlete('balance-a-left', 'Atlas', 72, 'Equilibrado', 'left'),
      createBalanceAthlete('balance-a-right', 'Nexo', 72, 'Equilibrado', 'right'),
    ],
    teamB: [
      createBalanceAthlete('balance-b-left', 'Orion', 72, 'Equilibrado', 'left'),
      createBalanceAthlete('balance-b-right', 'Vega', 72, 'Equilibrado', 'right'),
    ],
  };
}

export function simulateBalancedMatch({ teamA, teamB, seed, tacticA = MATCH_TACTICS[0], maxPoints = 5000 }) {
  let state = createMatch(teamA, teamB, { seed });
  let safety = maxPoints;
  while (!state.finished && safety-- > 0) {
    // O motor atual recebe uma tática por ponto. Alternar pelo sacador evita favorecer uma
    // única dupla em cenários que testam táticas diferentes.
    const tactic = state.servingTeam === 'A' ? tacticA : tacticA;
    state = playPoint(state, tactic);
  }
  if (!state.finished) throw new Error(`Partida ${seed} excedeu o limite de ${maxPoints} pontos.`);
  return state;
}

function collectMatchMetrics(state) {
  const playerRows = Object.values(state.stats.players);
  const teamRows = Object.values(state.stats.teams);
  const setCount = state.setScores.length;
  const games = state.setScores.reduce((total, set) => total + set.gamesA + set.gamesB, 0);
  const finalEnergies = playerRows.map((row) => row.energyEnd);
  const unforcedErrors = playerRows.reduce((total, row) => total + row.unforcedErrors, 0);
  const winners = playerRows.reduce((total, row) => total + row.winners, 0);
  const coordinationEvents = teamRows.reduce((total, row) => total + row.coordinationEvents, 0);
  const coordinationErrors = teamRows.reduce((total, row) => total + row.coordinationErrors, 0);
  const completedGames = (state.pointEvents || []).filter(event => !event.scoreBefore.inTiebreak && (event.scoreAfter.gamesA !== event.scoreBefore.gamesA || event.scoreAfter.gamesB !== event.scoreBefore.gamesB || event.scoreAfter.setsA !== event.scoreBefore.setsA || event.scoreAfter.setsB !== event.scoreBefore.setsB));
  const serviceGamesWon = completedGames.filter(event => event.winnerTeamId === event.servingTeamId).length;
  const loveGames = completedGames.filter(event => Math.min(event.scoreBefore.pointsA, event.scoreBefore.pointsB) === 0).length;
  const deucePoints = (state.pointEvents || []).filter(event => !event.scoreBefore.inTiebreak && event.scoreBefore.pointsA >= 3 && event.scoreBefore.pointsB >= 3).length;
  const tiebreakEnds = state.narration.filter(event => event.type === 'tiebreak_end').map(event => `${event.pointsA}-${event.pointsB}`);
  return {
    winner: state.winner,
    points: state.stats.rallies,
    games,
    sets: setCount,
    longestRally: state.stats.longestRally,
    averageRally: state.stats.averageRally,
    finalEnergies,
    unforcedErrors,
    winners,
    coordinationEvents,
    coordinationErrors,
    superTiebreak: state.setScores.some((set) => set.gamesA >= 10 || set.gamesB >= 10),
    completedGames: completedGames.length,
    serviceGamesWon,
    breaks: completedGames.length - serviceGamesWon,
    loveGames,
    deucePoints,
    sixAllSets: state.setScores.filter(set => (set.gamesA === 7 && set.gamesB === 6) || (set.gamesB === 7 && set.gamesA === 6)).length,
    tiebreakEnds,
  };
}

export function runBalanceBatch(options = {}) {
  const matches = Math.max(2, Number(options.matches || 250));
  const seedPrefix = options.seedPrefix || 'v040-balance';
  const teams = options.teams || createDefaultBalanceTeams();
  const tactic = options.tactic || MATCH_TACTICS[0];
  const alternateSides = options.alternateSides !== false;
  const results = [];

  for (let index = 0; index < matches; index += 1) {
    const swap = alternateSides && index % 2 === 1;
    const state = simulateBalancedMatch({
      teamA: swap ? teams.teamB : teams.teamA,
      teamB: swap ? teams.teamA : teams.teamB,
      seed: `${seedPrefix}:${Math.floor(index / 2)}:${swap ? 'swap' : 'base'}`,
      tacticA: tactic,
      maxPoints: options.maxPoints || 5000,
    });
    const metrics = collectMatchMetrics(state);
    // Converte o vencedor de volta à identidade original da dupla.
    metrics.originalWinner = swap
      ? (state.winner === 'A' ? 'B' : 'A')
      : state.winner;
    results.push(metrics);
  }

  const winsA = results.filter((row) => row.originalWinner === 'A').length;
  const winsB = matches - winsA;
  const energies = results.flatMap((row) => row.finalEnergies);
  const points = results.map((row) => row.points);
  const games = results.map((row) => row.games);
  const longestRallies = results.map((row) => row.longestRally);
  const winRateA = (winsA / matches) * 100;
  const sideBias = Math.abs(winRateA - 50);
  const lowEnergyRate = energies.length
    ? (energies.filter((energy) => energy < 10).length / energies.length) * 100
    : 0;
  const completedGames = results.reduce((sum, row) => sum + row.completedGames, 0);
  const breaks = results.reduce((sum, row) => sum + row.breaks, 0);
  const loveGames = results.reduce((sum, row) => sum + row.loveGames, 0);
  const allSets = results.reduce((sum, row) => sum + row.sets, 0);
  const tiebreakScores = results.flatMap(row => row.tiebreakEnds);

  const summary = {
    engineVersion: '0.4.0-alpha.7',
    matches,
    wins: { A: winsA, B: winsB },
    winRate: { A: round(winRateA), B: round(100 - winRateA) },
    sideBias: round(sideBias),
    averagePoints: round(average(points)),
    p95Points: round(percentile(points, 0.95)),
    maxPoints: Math.max(...points),
    averageGames: round(average(games)),
    averageRally: round(average(results.map((row) => row.averageRally))),
    averageLongestRally: round(average(longestRallies)),
    maxRally: Math.max(...longestRallies),
    averageFinalEnergy: round(average(energies)),
    lowEnergyRate: round(lowEnergyRate),
    averageWinners: round(average(results.map((row) => row.winners))),
    averageUnforcedErrors: round(average(results.map((row) => row.unforcedErrors))),
    averageCoordinationEvents: round(average(results.map((row) => row.coordinationEvents))),
    averageCoordinationErrors: round(average(results.map((row) => row.coordinationErrors))),
    superTiebreakRate: round((results.filter((row) => row.superTiebreak).length / matches) * 100),
    serviceHoldRate: round(completedGames ? (completedGames - breaks) / completedGames * 100 : 0),
    breakRate: round(completedGames ? breaks / completedGames * 100 : 0),
    loveGameRate: round(completedGames ? loveGames / completedGames * 100 : 0),
    sixAllSetRate: round(allSets ? results.reduce((sum, row) => sum + row.sixAllSets, 0) / allSets * 100 : 0),
    averageDeucePoints: round(average(results.map(row => row.deucePoints))),
    tiebreakScoreDistribution: Object.fromEntries([...new Set(tiebreakScores)].sort().map(score => [score, tiebreakScores.filter(value => value === score).length])),
  };

  summary.gates = evaluateBalanceGates(summary, options.gates);
  summary.success = Object.values(summary.gates).every(Boolean);
  return summary;
}

export function evaluateBalanceGates(summary, custom = {}) {
  const limits = {
    maxSideBias: custom?.maxSideBias ?? 12,
    minAverageFinalEnergy: custom?.minAverageFinalEnergy ?? 12,
    maxAverageFinalEnergy: custom?.maxAverageFinalEnergy ?? 90,
    maxLowEnergyRate: custom?.maxLowEnergyRate ?? 45,
    maxP95Points: custom?.maxP95Points ?? 350,
    minAverageRally: custom?.minAverageRally ?? 2,
    maxAverageRally: custom?.maxAverageRally ?? 20,
    minCoordinationEvents: custom?.minCoordinationEvents ?? 1,
  };
  return {
    fairSides: summary.sideBias <= limits.maxSideBias,
    energyWindow: summary.averageFinalEnergy >= limits.minAverageFinalEnergy && summary.averageFinalEnergy <= limits.maxAverageFinalEnergy,
    exhaustionControlled: summary.lowEnergyRate <= limits.maxLowEnergyRate,
    matchLengthControlled: summary.p95Points <= limits.maxP95Points,
    rallyLengthCoherent: summary.averageRally >= limits.minAverageRally && summary.averageRally <= limits.maxAverageRally,
    coordinationActive: summary.averageCoordinationEvents >= limits.minCoordinationEvents,
  };
}

export function compareBalanceBatches(first, second) {
  return JSON.stringify(first) === JSON.stringify(second);
}
