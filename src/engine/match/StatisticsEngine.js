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
      shotForcedErrorsDrawn: emptyShotMap(),
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
      coverages: 0,
      supportActions: 0,
      coordinationErrors: 0,
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
    forcedErrorsCommitted: 0,
    unforcedErrorsCommitted: 0,
    serviceErrors: 0,
    netPointsPlayed: 0,
    netPointsWon: 0,
    baselinePointsPlayed: 0,
    baselinePointsWon: 0,
    decisivePointsPlayed: 0,
    decisivePointsWon: 0,
    breakPointsCreated: 0,
    breakPointsConverted: 0,
    breakPointsFaced: 0,
    breakPointsSaved: 0,
    maxPointStreak: 0,
    coverages: 0,
    coordinatedAdvances: 0,
    netRecoveries: 0,
    fatigueCompensations: 0,
    spacingCorrections: 0,
    communicationSuccesses: 0,
    coordinationErrors: 0,
    coordinationQualityTotal: 0,
    coordinationEvents: 0,
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
  const breakPoint = Boolean(metadata.match?.isBreakPoint ?? metadata.match?.breakPoint);
  const zone = metadata.zone || finisher.position?.zone || 'back';
  const outcome = metadata.outcome || (result === 'winner' ? 'WINNER' : metadata.forcedError ? 'FORCED_ERROR' : 'UNFORCED_ERROR');
  const forcedError = outcome === 'FORCED_ERROR';
  const winnerPlayer = metadata.winnerPlayer || (finisher.team === winner ? finisher : null);
  const errorPlayer = metadata.errorPlayer || (finisher.team !== winner ? finisher : null);

  stats.points[winner] += 1;
  stats.rallies += 1;
  stats.rallyShots += rallyLength;
  stats.longestRally = Math.max(stats.longestRally, rallyLength);
  stats.averageRally = Math.round((stats.rallyShots / stats.rallies) * 10) / 10;
  winnerTeam.pointsWon += 1;
  if (winnerPlayer) stats.players[winnerPlayer.id].pointsWon += 1;

  if (outcome === 'WINNER' && winnerPlayer) {
    const winnerRow = stats.players[winnerPlayer.id];
    winnerRow.winners += 1;
    winnerRow.shotWinners[metadata.endingShot || metadata.shot || 'drive'] = (winnerRow.shotWinners[metadata.endingShot || metadata.shot || 'drive'] || 0) + 1;
    winnerTeam.winners += 1;
  } else {
    const errorRow = errorPlayer ? stats.players[errorPlayer.id] : row;
    errorRow.errors += 1;
    errorRow.pointsLost += 1;
    errorRow.shotErrors[metadata.errorShot || metadata.shot || 'drive'] = (errorRow.shotErrors[metadata.errorShot || metadata.shot || 'drive'] || 0) + 1;
    loserTeam.errors += 1;
    if (forcedError) {
      errorRow.forcedErrors += 1;
      loserTeam.forcedErrorsCommitted += 1;
      winnerTeam.forcedErrorsDrawn += 1;
      if (winnerPlayer) {
        const winnerRow = stats.players[winnerPlayer.id];
        winnerRow.shotForcedErrorsDrawn[metadata.endingShot || 'drive'] = (winnerRow.shotForcedErrorsDrawn[metadata.endingShot || 'drive'] || 0) + 1;
      }
    } else {
      errorRow.unforcedErrors += 1;
      loserTeam.unforcedErrorsCommitted += 1;
      if (['DOUBLE_FAULT', 'SERVICE_ERROR'].includes(outcome)) loserTeam.serviceErrors += 1;
    }
  }

  registerCourtZone(stats, winner, winnerPlayer || finisher, metadata.winnerPosition || zone);
  registerServeReturn(stats, winner, metadata.servingTeam, metadata.serverPlayerId, teams);
  registerImportantPoint(stats, winner, loser, winnerPlayer || finisher, importantPoint, breakPoint, metadata.servingTeam, metadata.serverPlayerId, teams);
  registerStreak(stats, winner, teams);

  Object.values(teams).flat().forEach((player) => {
    const playerRow = stats.players[player.id];
    playerRow.energyEnd = player.energy;
    playerRow.energyByPoint.push(Math.round(player.energy * 10) / 10);
  });
}

function registerCourtZone(stats, winner, finisher, zone) {
  const row = stats.players[finisher.id];
  const team = stats.teams[winner];
  if (zone === 'NET' || zone === 'net') {
    row.netPointsPlayed += 1;
    team.netPointsPlayed += 1;
    row.netPointsWon += 1;
    team.netPointsWon += 1;
  } else {
    row.baselinePointsPlayed += 1;
    team.baselinePointsPlayed += 1;
    row.baselinePointsWon += 1;
    team.baselinePointsWon += 1;
  }
}

function registerServeReturn(stats, winner, servingTeam, serverPlayerId, teams) {
  if (!servingTeam) return;
  const returningTeam = servingTeam === 'A' ? 'B' : 'A';
  teams[returningTeam].forEach((player) => { stats.players[player.id].returns += 1; });
  if (winner === servingTeam) {
    const server = teams[servingTeam].find((player) => player.id === serverPlayerId) || teams[servingTeam][0];
    if (server) stats.players[server.id].servePointsWon += 1;
  } else {
    teams[returningTeam].forEach((player) => { stats.players[player.id].returnPointsWon += 1; });
  }
}

function registerImportantPoint(stats, winner, loser, finisher, importantPoint, breakPoint, servingTeam, serverPlayerId, teams) {
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
  stats.teams[servingTeam].breakPointsFaced += 1;
  const server = teams[servingTeam].find((player) => player.id === serverPlayerId);
  if (server) stats.players[server.id].breakPointsFaced += 1;
  if (finisher?.team === receivingTeam) stats.players[finisher.id].breakPointsCreated += 1;
  if (winner === receivingTeam) {
    stats.breakPoints.converted[receivingTeam] += 1;
    stats.teams[receivingTeam].breakPointsConverted += 1;
    if (finisher?.team === receivingTeam) stats.players[finisher.id].breakPointsConverted += 1;
  } else {
    stats.teams[servingTeam].breakPointsSaved += 1;
    if (server) stats.players[server.id].breakPointsSaved += 1;
  }
}

export function synchronizePointStatistics(stats, pointEvents = []) {
  const canonicalPlayerFields = ['winners', 'errors', 'unforcedErrors', 'forcedErrors', 'pointsWon', 'pointsLost', 'netPointsPlayed', 'netPointsWon', 'baselinePointsPlayed', 'baselinePointsWon', 'serves', 'servePointsWon', 'returns', 'returnPointsWon', 'decisivePointsPlayed', 'decisivePointsWon', 'breakPointsFaced', 'breakPointsSaved', 'breakPointsCreated', 'breakPointsConverted'];
  const canonicalTeamFields = ['pointsWon', 'winners', 'errors', 'forcedErrorsDrawn', 'forcedErrorsCommitted', 'unforcedErrorsCommitted', 'serviceErrors', 'netPointsPlayed', 'netPointsWon', 'baselinePointsPlayed', 'baselinePointsWon', 'decisivePointsPlayed', 'decisivePointsWon', 'breakPointsCreated', 'breakPointsConverted', 'breakPointsFaced', 'breakPointsSaved'];
  Object.values(stats.players).forEach((row) => {
    canonicalPlayerFields.forEach((field) => { row[field] = 0; });
    row.shots = emptyShotMap(); row.shotWinners = emptyShotMap(); row.shotErrors = emptyShotMap(); row.shotForcedErrorsDrawn = emptyShotMap();
  });
  Object.values(stats.teams).forEach((row) => canonicalTeamFields.forEach((field) => { row[field] = 0; }));
  stats.points = { A: 0, B: 0 };
  stats.breakPoints = { created: { A: 0, B: 0 }, converted: { A: 0, B: 0 } };
  stats.rallies = pointEvents.length;
  stats.rallyShots = pointEvents.reduce((sum, event) => sum + Number(event.rallyLength || 0), 0);
  stats.longestRally = pointEvents.reduce((longest, event) => Math.max(longest, Number(event.rallyLength || 0)), 0);
  stats.averageRally = stats.rallies ? Math.round((stats.rallyShots / stats.rallies) * 10) / 10 : 0;
  stats.decisivePoints = 0;

  pointEvents.forEach((event) => {
    const winner = event.winnerTeamId;
    const loser = event.loserTeamId;
    const outcome = event.outcome || (event.reason === 'winner' ? 'WINNER' : event.forcedError ? 'FORCED_ERROR' : 'UNFORCED_ERROR');
    const winnerRow = stats.players[event.winnerPlayerId];
    const errorRow = stats.players[event.errorPlayerId];
    (event.shots || []).forEach((shot) => {
      const shotRow = stats.players[shot.playerId];
      if (!shotRow) return;
      shotRow.shots[shot.shot] = (shotRow.shots[shot.shot] || 0) + 1;
      if (shot.shot === 'serve') shotRow.serves += 1;
    });
    stats.points[winner] += 1;
    stats.teams[winner].pointsWon += 1;
    if (winnerRow) winnerRow.pointsWon += 1;
    if (outcome === 'WINNER') {
      stats.teams[winner].winners += 1;
      if (winnerRow) { winnerRow.winners += 1; winnerRow.shotWinners[event.shot || 'drive'] = (winnerRow.shotWinners[event.shot || 'drive'] || 0) + 1; }
    } else {
      stats.teams[loser].errors += 1;
      if (errorRow) { errorRow.errors += 1; errorRow.pointsLost += 1; }
      if (outcome === 'FORCED_ERROR') {
        stats.teams[winner].forcedErrorsDrawn += 1;
        stats.teams[loser].forcedErrorsCommitted += 1;
        if (errorRow) errorRow.forcedErrors += 1;
        if (winnerRow) winnerRow.shotForcedErrorsDrawn[event.shot || 'drive'] = (winnerRow.shotForcedErrorsDrawn[event.shot || 'drive'] || 0) + 1;
      } else {
        stats.teams[loser].unforcedErrorsCommitted += 1;
        if (['DOUBLE_FAULT', 'SERVICE_ERROR'].includes(outcome)) stats.teams[loser].serviceErrors += 1;
        if (errorRow) errorRow.unforcedErrors += 1;
      }
      if (errorRow) errorRow.shotErrors[event.errorShot || event.shot || 'drive'] = (errorRow.shotErrors[event.errorShot || event.shot || 'drive'] || 0) + 1;
    }
    const net = event.winnerPosition === 'NET';
    const courtPrefix = net ? 'net' : 'baseline';
    stats.teams[winner][`${courtPrefix}PointsPlayed`] += 1;
    stats.teams[winner][`${courtPrefix}PointsWon`] += 1;
    if (winnerRow) { winnerRow[`${courtPrefix}PointsPlayed`] += 1; winnerRow[`${courtPrefix}PointsWon`] += 1; }
    const returning = event.servingTeamId === 'A' ? 'B' : 'A';
    const server = stats.players[event.serverPlayerId];
    const returningRows = Object.values(stats.players).filter((row) => row.team === returning);
    returningRows.forEach((row) => { row.returns += 1; });
    if (winner === event.servingTeamId && server) server.servePointsWon += 1;
    if (winner === returning) returningRows.forEach((row) => { row.returnPointsWon += 1; });
    if (event.isGamePoint || event.isSetPoint || event.isMatchPoint) {
      stats.decisivePoints += 1;
      stats.teams[winner].decisivePointsPlayed += 1; stats.teams[winner].decisivePointsWon += 1;
      stats.teams[loser].decisivePointsPlayed += 1;
      if (winnerRow) { winnerRow.decisivePointsPlayed += 1; winnerRow.decisivePointsWon += 1; }
    }
    if (event.isBreakPoint) {
      const receiving = event.breakPointTeam;
      const serving = event.servingTeamId;
      stats.breakPoints.created[receiving] += 1;
      stats.teams[receiving].breakPointsCreated += 1;
      stats.teams[serving].breakPointsFaced += 1;
      if (server) server.breakPointsFaced += 1;
      if (winnerRow?.team === receiving) winnerRow.breakPointsCreated += 1;
      if (event.breakPointConverted) {
        stats.breakPoints.converted[receiving] += 1;
        stats.teams[receiving].breakPointsConverted += 1;
        if (winnerRow?.team === receiving) winnerRow.breakPointsConverted += 1;
      } else {
        stats.teams[serving].breakPointsSaved += 1;
        if (server) server.breakPointsSaved += 1;
      }
    }
  });
  return stats;
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


export function recordCoordination(stats, event) {
  if (!event || !stats?.teams?.[event.team]) return;
  const team = stats.teams[event.team];
  const actor = stats.players[event.actorId];
  const partner = stats.players[event.partnerId];
  team.coordinationEvents += 1;
  team.coordinationQualityTotal += Number(event.quality || 0);
  if (event.positive) team.communicationSuccesses += 1;
  if (event.type === 'center_cover') team.coverages += 1;
  if (event.type === 'coordinated_advance') team.coordinatedAdvances += 1;
  if (event.type === 'net_recovery') team.netRecoveries += 1;
  if (event.type === 'fatigue_cover') team.fatigueCompensations += 1;
  if (event.type === 'spacing_correction') team.spacingCorrections += 1;
  if (event.type === 'coordination_error') team.coordinationErrors += 1;
  if (partner && ['center_cover', 'fatigue_cover', 'spacing_correction'].includes(event.type)) {
    partner.coverages += 1;
    partner.supportActions += 1;
  }
  if (actor && ['coordinated_advance', 'net_recovery'].includes(event.type)) actor.supportActions += 1;
  if (event.type === 'coordination_error') {
    if (actor) actor.coordinationErrors += 1;
    if (partner) partner.coordinationErrors += 1;
  }
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
    coordinationEfficiency: percentage(row.communicationSuccesses, row.coordinationEvents),
    averageCoordinationQuality: row.coordinationEvents > 0 ? Math.round((row.coordinationQualityTotal / row.coordinationEvents) * 10) / 10 : 0,
  }]));

  return { ...stats, players, teams };
}
