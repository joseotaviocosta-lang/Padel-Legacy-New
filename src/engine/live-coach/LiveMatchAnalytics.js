const emptyShots = () => ({ serve: 0, drive: 0, backhand: 0, lob: 0, volley: 0, bandeja: 0, smash: 0, chiquita: 0 });
const average = (values) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
const gameEnded = (before, after) => before.gamesA !== after.gamesA || before.gamesB !== after.gamesB || before.setsA !== after.setsA || before.setsB !== after.setsB;

export class LiveMatchAnalytics {
  constructor(snapshot) {
    this.state = snapshot || { points: [], shots: { A: emptyShots(), B: emptyShots() }, players: {}, sets: {}, games: 0 };
    if (!Array.isArray(this.state.points)) throw new Error('Snapshot analítico inválido.');
  }

  ingest({ pointNumber, result, teams, scoreBefore, scoreAfter, setNumber }) {
    const shots = result.rallyMemory || [];
    for (const shot of shots) {
      this.state.shots[shot.team][shot.shot] = (this.state.shots[shot.team][shot.shot] || 0) + 1;
      const row = this.state.players[shot.playerId] || (this.state.players[shot.playerId] = { shots: 0, targets: 0, errors: 0, winners: 0 });
      row.shots += 1;
      if (shot.targetPlayerId) {
        const target = this.state.players[shot.targetPlayerId] || (this.state.players[shot.targetPlayerId] = { shots: 0, targets: 0, errors: 0, winners: 0 });
        target.targets += 1;
      }
    }
    const outcome = result.outcome || (result.result === 'winner' ? 'WINNER' : result.forcedError ? 'FORCED_ERROR' : 'UNFORCED_ERROR');
    const terminalPlayerId = result.errorPlayer?.id || result.finisher?.id;
    if (terminalPlayerId) {
      const finisher = this.state.players[terminalPlayerId] || (this.state.players[terminalPlayerId] = { shots: 0, targets: 0, errors: 0, winners: 0 });
      if (outcome === 'WINNER') finisher.winners += 1;
      else finisher.errors += 1;
    }
    const energies = Object.fromEntries(Object.values(teams).flat().map((player) => [player.id, Math.round(player.energy * 10) / 10]));
    const completed = gameEnded(scoreBefore, scoreAfter);
    const point = {
      pointNumber,
      gameIndex: this.state.games,
      setNumber,
      gameCompleted: completed,
      gameWinnerTeamId: completed ? result.winnerTeamId : null,
      servingTeamId: result.servingTeamId,
      winnerTeamId: result.winnerTeamId,
      winnerPlayerId: result.winnerPlayer?.id || null,
      errorPlayerId: result.errorPlayer?.id || (outcome !== 'WINNER' ? result.finisher?.id : null),
      result: result.result,
      outcome,
      shot: result.shot,
      errorShot: result.errorShot || null,
      rallyLength: result.rallyLength,
      pressure: result.pressure,
      forcedError: outcome === 'FORCED_ERROR',
      winnerPosition: result.winnerPosition || 'BASELINE',
      pointEndingContext: result.pointEndingContext || 'BASELINE_ATTACK',
      isBreakPoint: Boolean(result.match?.isBreakPoint),
      breakPointTeam: result.match?.breakPointTeam || null,
      shots,
      energies,
      scoreBefore,
      scoreAfter,
    };
    this.state.points.push(point);
    if (this.state.points.length > 240) this.state.points.shift();
    if (completed) this.state.games += 1;
    return point;
  }

  completedGames(limit = 3) {
    const endings = this.state.points.filter((point) => point.gameCompleted);
    return endings.slice(-limit).map((ending) => ({
      gameIndex: ending.gameIndex,
      winnerTeamId: ending.gameWinnerTeamId,
      servingTeamId: ending.servingTeamId,
      points: this.state.points.filter((point) => point.gameIndex === ending.gameIndex),
    }));
  }

  window(name) {
    if (name === 'last_game') return this.completedGames(1).at(-1)?.points || [];
    if (name === 'last_2_games') return this.completedGames(2).flatMap((game) => game.points);
    const count = { last_3_points: 3, last_5_points: 5, current_set: 80, match: 240 }[name] || 5;
    const points = this.state.points.slice(-count);
    if (name === 'current_set' && points.length) {
      const currentSet = points.at(-1).setNumber;
      return points.filter((point) => point.setNumber === currentSet);
    }
    return points;
  }

  summary(name = 'last_5_points', team = 'A') {
    const points = this.window(name);
    const opponent = team === 'A' ? 'B' : 'A';
    const shots = points.flatMap((point) => point.shots);
    const teamShots = shots.filter((shot) => shot.team === team);
    const opponentShots = shots.filter((shot) => shot.team === opponent);
    const teamPlayerIds = new Set(teamShots.map((shot) => shot.playerId));
    return {
      window: name,
      points: points.length,
      observedEvents: shots.length,
      pointsWon: points.filter((point) => point.winnerTeamId === team).length,
      pointsLost: points.filter((point) => point.winnerTeamId !== team).length,
      errors: points.filter((point) => point.errorPlayerId && teamPlayerIds.has(point.errorPlayerId)).length,
      unforcedErrors: points.filter((point) => point.outcome === 'UNFORCED_ERROR' && teamPlayerIds.has(point.errorPlayerId)).length,
      forcedErrorsDrawn: points.filter((point) => point.outcome === 'FORCED_ERROR' && point.winnerTeamId === team).length,
      netPointsWon: points.filter((point) => point.winnerTeamId === team && point.winnerPosition === 'NET').length,
      pressureErrors: points.filter((point) => point.errorPlayerId && teamPlayerIds.has(point.errorPlayerId) && point.pressure >= 62).length,
      longRallies: points.filter((point) => point.rallyLength >= 12).length,
      shots: teamShots,
      opponentShots,
      averageEnergy: average(points.flatMap((point) => Object.entries(point.energies).filter(([id]) => teamPlayerIds.has(id)).map(([, value]) => value))),
      averageRally: average(points.map((point) => Number(point.rallyLength || 0))),
      shotDistribution: Object.fromEntries(Object.keys(emptyShots()).map((type) => [type, teamShots.filter((shot) => shot.shot === type).length])),
    };
  }

  snapshot() { return JSON.parse(JSON.stringify(this.state)); }
}
