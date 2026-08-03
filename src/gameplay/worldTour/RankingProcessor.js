const ROUND_MULTIPLIERS = Object.freeze({ entry: .04, qualifying: .06, r64: .08, r32: .12, r16: .20, quarterfinal: .34, semifinal: .52, final: .72, champion: 1 });

export function calculateRankingAward(tournament, finish = 'entry') {
  const base = Number(tournament?.rank_points || 0);
  return Math.round(base * (ROUND_MULTIPLIERS[finish] ?? ROUND_MULTIPLIERS.entry));
}

export function processWeeklyRanking({ ranking = [], tournamentResults = [], week, year } = {}) {
  const pointsByAthlete = new Map(ranking.map((row) => [row.athleteId, Number(row.points || 0)]));
  const history = [];
  tournamentResults.forEach((result) => {
    const athleteId = result.athleteId;
    const awarded = calculateRankingAward(result.tournament, result.finish);
    pointsByAthlete.set(athleteId, (pointsByAthlete.get(athleteId) || 0) + awarded);
    history.push({ athleteId, tournamentId: result.tournament?.id, finish: result.finish, points: awarded, week, year });
  });
  const updatedRanking = [...pointsByAthlete.entries()]
    .map(([athleteId, points]) => ({ athleteId, points }))
    .sort((a, b) => b.points - a.points)
    .map((row, index) => ({ ...row, rank: index + 1 }));
  return { ranking: updatedRanking, history };
}
