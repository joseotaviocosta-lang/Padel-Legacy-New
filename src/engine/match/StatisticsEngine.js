const SHOT_TYPES = ['serve', 'drive', 'backhand', 'lob', 'volley', 'bandeja', 'smash', 'chiquita'];

const emptyShotMap = () => Object.fromEntries(SHOT_TYPES.map((shot) => [shot, 0]));
const percentage = (made, total) => total > 0 ? Math.round((made / total) * 1000) / 10 : 0;

export function createStatistics(teams) {
  const players = {};
  Object.values(teams).flat().forEach((player) => {
    players[player.id] = {
      id: player.id,
      name: player.name,
      team: player.team,
      archetype: player.behavior?.archetype?.label || null,
      shots: emptyShotMap(),
      shotWinners: emptyShotMap(),
      shotErrors: emptyShotMap(),
      winners: 0,
      errors: 0,
      unforcedErrors: 0,
      forcedErrors: 0,
      pointsWon: 0,
      pointsLost: 0,
      netPointsPlayed: 0,
      netPointsWon: 0,
      baselinePointsPlayed: 0,
      baselinePointsWon: 0,
      serves: 0,
      servePointsWon: 0,
      returns: 0,
      returnPointsWon: 0,
      decisivePointsPlayed: 0,
      decisivePointsWon: 0,
      breakPointsFaced: 0,
      breakPointsSaved: 0,
      breakPointsCreated: 0,
      breakPointsConverted: 0,
      currentPointStreak: 0,
      maxPointStreak: 0,
      distance: 0,
      energyStart: player.energy,
      energyEnd: player.energy,
      energyByPoint: [],
    };
  });

  return {
    players,
    teams: {
      A: createTeamRow('A'),
      B: createTeamRow('B'),
    },
    points: { A: 0, B: 0 },
    rallies: 0,
    rallyShots: 0,
    longestRally: 0,
    averageRally: 0,
    decisivePoints: 0,
    breakPoints: { created: { A: 0, B: 0 }, converted: { A: 0, B: 0 } },
    momentumSwings: 0,
    lastPointWinner: null,
    currentTeamStreak: { team: null, length: 0 },
    longestTeamStreak: { A: 0, B: 0 },
  };
}

function createTeamRow(team) {
  return {
    team,
    pointsWon: 0,
    winners: 0,
    errors: 0,
    forcedErrorsDrawn: 0,
    netPointsPlayed: 0,
    netPointsWon: 0,
    baselinePointsPlayed: 0,
    baselinePointsWon: 0,
    decisivePointsPlayed: 0,
    decisivePointsWon: 0,
    breakPointsCreated: 0,
    breakPointsConverted: 0,
    maxPointStreak: 0,
  };
}

export function recordShot(stats, player, shot) {
  const row = stats.players[player.id];
  if (!row) return;
  row.shots[shot] = (row.shots[shot] || 0) + 1;
  row.distance += player.position.zone === 'net' ? 1.2 : 1.8;
  if (shot === 'serve') row.serves += 1;
}

export function recordPoint(stats, winner, finisher, result, rallyLength, teams, metadata = {}) {
  const loser = winner === 'A' ? 'B' : 'A';
  const row = stats.players[finisher.id];
  const winnerTeam = stats.teams[winner];
  const loserTeam = stats.teams[loser];
  const importantPoint = Boolean(metadata.match?.importantPoint);
  const breakPoint = Boolean(metadata.match?.breakPoint);
  const zone = metadata.zone || finisher.position?.zone || 'back';
  const forcedError = result === 'error' && Boolean(metadata.forcedError);

  stats.points[winner] += 1;
  stats.rallies += 1;
  stats.rallyShots += rallyLength;
  stats.longestRally = Math.max(stats.longestRally, rallyLength);
  stats.averageRally = Math.round((stats.rallyShots / stats.rallies) * 10) / 10;
  winnerTeam.pointsWon += 1;

  if (result === 'winner') {
    row.winners += 1;
    row.pointsWon += 1;
    row.shotWinners[metadata.shot || 'drive'] = (row.shotWinners[metadata.shot || 'drive'] || 0) + 1;
    winnerTeam.winners += 1;
  } else {
    row.errors += 1;
    row.pointsLost += 1;
    row.shotErrors[metadata.shot || 'drive'] = (row.shotErrors[metadata.shot || 'drive'] || 0) + 1;
    loserTeam.errors += 1;
    if (forcedError) {
      row.forcedErrors += 1;
      winnerTeam.forcedErrorsDrawn += 1;
    } else {
      row.unforcedErrors += 1;
    }
  }

  registerCourtZone(stats, winner, finisher, result, zone);
  registerServeReturn(stats, winner, metadata.servingTeam, teams);
  registerImportantPoint(stats, winner, loser, finisher, importantPoint, breakPoint, metadata.servingTeam);
  registerStreak(stats, winner, teams);

  Object.values(teams).flat().forEach((player) => {
    const playerRow = stats.players[player.id];
    playerRow.energyEnd = player.energy;
    playerRow.energyByPoint.push(Math.round(player.energy * 10) / 10);
  });
}

function registerCourtZone(stats, winner, finisher, result, zone) {
  const row = stats.players[finisher.id];
  const team = stats.teams[finisher.team];
  const finisherWon = result === 'winner' && finisher.team === winner;
  if (zone === 'net') {
    row.netPointsPlayed += 1;
    team.netPointsPlayed += 1;
    if (finisherWon) {
      row.netPointsWon += 1;
      team.netPointsWon += 1;
    }
  } else {
    row.baselinePointsPlayed += 1;
    team.baselinePointsPlayed += 1;
    if (finisherWon) {
      row.baselinePointsWon += 1;
      team.baselinePointsWon += 1;
    }
  }
}

function registerServeReturn(stats, winner, servingTeam, teams) {
  if (!servingTeam) return;
  const returningTeam = servingTeam === 'A' ? 'B' : 'A';
  teams[returningTeam].forEach((player) => { stats.players[player.id].returns += 1; });
  if (winner === servingTeam) {
    const server = teams[servingTeam][0];
    if (server) stats.players[server.id].servePointsWon += 1;
  } else {
    teams[returningTeam].forEach((player) => { stats.players[player.id].returnPointsWon += 1; });
  }
}

function registerImportantPoint(stats, winner, loser, finisher, importantPoint, breakPoint, servingTeam) {
  if (importantPoint) {
    stats.decisivePoints += 1;
    stats.teams[winner].decisivePointsPlayed += 1;
    stats.teams[winner].decisivePointsWon += 1;
    stats.teams[loser].decisivePointsPlayed += 1;
    const row = stats.players[finisher.id];
    row.decisivePointsPlayed += 1;
    if (finisher.team === winner) row.decisivePointsWon += 1;
  }

  if (!breakPoint || !servingTeam) return;
  const receivingTeam = servingTeam === 'A' ? 'B' : 'A';
  stats.breakPoints.created[receivingTeam] += 1;
  stats.teams[receivingTeam].breakPointsCreated += 1;
  if (winner === receivingTeam) {
    stats.breakPoints.converted[receivingTeam] += 1;
    stats.teams[receivingTeam].breakPointsConverted += 1;
  }
}

function registerStreak(stats, winner, teams) {
  if (stats.currentTeamStreak.team === winner) {
    stats.currentTeamStreak.length += 1;
  } else {
    if (stats.currentTeamStreak.team && stats.currentTeamStreak.length >= 3) stats.momentumSwings += 1;
    stats.currentTeamStreak = { team: winner, length: 1 };
  }
  stats.lastPointWinner = winner;
  stats.longestTeamStreak[winner] = Math.max(stats.longestTeamStreak[winner], stats.currentTeamStreak.length);
  stats.teams[winner].maxPointStreak = Math.max(stats.teams[winner].maxPointStreak, stats.currentTeamStreak.length);

  teams[winner].forEach((player) => {
    const row = stats.players[player.id];
    row.currentPointStreak += 1;
    row.maxPointStreak = Math.max(row.maxPointStreak, row.currentPointStreak);
  });
  const loser = winner === 'A' ? 'B' : 'A';
  teams[loser].forEach((player) => { stats.players[player.id].currentPointStreak = 0; });
}

export function buildStatisticsSummary(stats) {
  const players = Object.fromEntries(Object.entries(stats.players).map(([id, row]) => [id, {
    ...row,
    netEfficiency: percentage(row.netPointsWon, row.netPointsPlayed),
    baselineEfficiency: percentage(row.baselinePointsWon, row.baselinePointsPlayed),
    serveEfficiency: percentage(row.servePointsWon, row.serves),
    returnEfficiency: percentage(row.returnPointsWon, row.returns),
    decisiveEfficiency: percentage(row.decisivePointsWon, row.decisivePointsPlayed),
    energyUsed: Math.round((row.energyStart - row.energyEnd) * 10) / 10,
  }]));

  const teams = Object.fromEntries(Object.entries(stats.teams).map(([team, row]) => [team, {
    ...row,
    netEfficiency: percentage(row.netPointsWon, row.netPointsPlayed),
    baselineEfficiency: percentage(row.baselinePointsWon, row.baselinePointsPlayed),
    decisiveEfficiency: percentage(row.decisivePointsWon, row.decisivePointsPlayed),
    breakPointEfficiency: percentage(row.breakPointsConverted, row.breakPointsCreated),
  }]));

  return { ...stats, players, teams };
}
