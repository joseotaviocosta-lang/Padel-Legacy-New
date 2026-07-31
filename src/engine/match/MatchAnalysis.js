import { buildStatisticsSummary } from './StatisticsEngine.js';

const topBy = (rows, selector) => rows.reduce((best, row) => !best || selector(row) > selector(best) ? row : best, null);

export function buildMatchAnalysis(state) {
  const stats = buildStatisticsSummary(state.stats);
  const players = Object.values(stats.players);
  const winner = state.winner;
  const winnerNames = winner === 'A' ? state.teamANames : state.teamBNames;
  const topWinner = topBy(players, (row) => row.winners);
  const mostConsistent = topBy(players, (row) => row.shots && (Object.values(row.shots).reduce((a, b) => a + b, 0) - row.unforcedErrors));
  const keyMoments = state.narration
    .filter((event) => Number(event.narrative?.importance || 0) >= 3 || ['set', 'match', 'tiebreak_end'].includes(event.type))
    .slice(-8)
    .map((event) => ({
      type: event.type,
      message: event.msg,
      importance: event.narrative?.importance || 3,
      tags: event.narrative?.tags || [],
      setsA: event.setsA,
      setsB: event.setsB,
      gamesA: event.gamesA,
      gamesB: event.gamesB,
    }));

  return {
    winner,
    winnerNames,
    score: `${state.setsA}-${state.setsB}`,
    totalPoints: stats.points.A + stats.points.B,
    averageRally: stats.averageRally,
    longestRally: stats.longestRally,
    momentumSwings: stats.momentumSwings,
    playerOfTheMatch: topWinner ? { id: topWinner.id, name: topWinner.name, winners: topWinner.winners, archetype: topWinner.archetype } : null,
    mostConsistent: mostConsistent ? { id: mostConsistent.id, name: mostConsistent.name, unforcedErrors: mostConsistent.unforcedErrors } : null,
    tacticalSummary: buildTacticalSummary(stats, winner),
    keyMoments,
    statistics: stats,
  };
}

function buildTacticalSummary(stats, winner) {
  const winning = stats.teams[winner];
  const loser = stats.teams[winner === 'A' ? 'B' : 'A'];
  const notes = [];
  if (winning.winners > loser.winners) notes.push('A dupla vencedora produziu mais winners.');
  if (winning.netEfficiency > loser.netEfficiency + 5) notes.push('O domínio da rede foi um fator decisivo.');
  if (winning.decisiveEfficiency > loser.decisiveEfficiency + 10) notes.push('A eficiência nos pontos decisivos fez a diferença.');
  if (winning.breakPointEfficiency > loser.breakPointEfficiency) notes.push('A dupla aproveitou melhor as oportunidades de break.');
  if (winning.coordinationEfficiency > loser.coordinationEfficiency + 8) notes.push('A coordenação e as coberturas da dupla foram determinantes.');
  if (winning.coordinatedAdvances > loser.coordinatedAdvances) notes.push('A dupla recuperou a rede com mais movimentos coordenados.');
  if (loser.coordinationErrors > winning.coordinationErrors) notes.push('Os adversários sofreram mais com falhas de comunicação e ocupação de espaço.');
  if (notes.length === 0) notes.push('A partida foi decidida pelo equilíbrio e pela regularidade ao longo dos sets.');
  return notes;
}
