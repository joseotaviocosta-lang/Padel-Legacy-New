export function createStatistics(teams) {
  const players = {};
  Object.values(teams).flat().forEach((player) => {
    players[player.id] = {
      id: player.id, name: player.name, team: player.team,
      shots: {}, winners: 0, errors: 0, forcedErrors: 0, distance: 0,
      energyStart: player.energy, energyEnd: player.energy,
    };
  });
  return { players, points: { A: 0, B: 0 }, rallies: 0, rallyShots: 0, longestRally: 0 };
}

export function recordShot(stats, player, shot) {
  const row = stats.players[player.id];
  row.shots[shot] = (row.shots[shot] || 0) + 1;
  row.distance += player.position.zone === 'net' ? 1.2 : 1.8;
}

export function recordPoint(stats, winner, finisher, result, rallyLength, teams) {
  stats.points[winner] += 1;
  stats.rallies += 1;
  stats.rallyShots += rallyLength;
  stats.longestRally = Math.max(stats.longestRally, rallyLength);
  const row = stats.players[finisher.id];
  if (result === 'winner') row.winners += 1;
  else row.errors += 1;
  Object.values(teams).flat().forEach((player) => { stats.players[player.id].energyEnd = player.energy; });
}
