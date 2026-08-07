const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function createMatchMomentum() {
  return {
    value: 0,
    leader: null,
    streakTeam: null,
    streak: 0,
    peakA: 0,
    peakB: 0,
    swings: 0,
    lastValue: 0,
  };
}

export function updateMatchMomentumState(momentum, { winnerTeamId, scoreBefore, scoreAfter, servingTeamId, rallyLength = 0, importantBefore = null }) {
  const next = { ...(momentum || createMatchMomentum()) };
  const previousLeader = next.value > 12 ? 'A' : next.value < -12 ? 'B' : null;

  if (next.streakTeam === winnerTeamId) next.streak += 1;
  else {
    next.streakTeam = winnerTeamId;
    next.streak = 1;
  }

  let delta = 5;
  if (next.streak >= 3) delta += Math.min(5, next.streak - 2);
  if (Number(rallyLength) >= 14) delta += 2;
  if (importantBefore?.type === 'break_point') delta += 3;
  if (importantBefore?.type === 'set_point') delta += 4;
  if (importantBefore?.type === 'match_point') delta += 5;

  const gameWon = scoreBefore.gamesA !== scoreAfter.gamesA || scoreBefore.gamesB !== scoreAfter.gamesB;
  const setWon = scoreBefore.setsA !== scoreAfter.setsA || scoreBefore.setsB !== scoreAfter.setsB;
  if (gameWon) delta += 3;
  if (gameWon && winnerTeamId !== servingTeamId) delta += 5;
  if (setWon) delta += 7;

  next.lastValue = Number(next.value || 0);
  next.value = clamp(next.lastValue + (winnerTeamId === 'A' ? delta : -delta), -100, 100);
  next.leader = next.value > 12 ? 'A' : next.value < -12 ? 'B' : null;
  if (previousLeader && next.leader && previousLeader !== next.leader) next.swings = Number(next.swings || 0) + 1;
  next.peakA = Math.max(Number(next.peakA || 0), next.value);
  next.peakB = Math.max(Number(next.peakB || 0), -next.value);
  return next;
}

export function getPressureMoment(state) {
  if (!state || state.finished) return null;
  if (state.superTiebreak) {
    const a = Number(state.pointsA || 0);
    const b = Number(state.pointsB || 0);
    if (a >= 9 && a > b) return { type: 'match_point', team: 'A' };
    if (b >= 9 && b > a) return { type: 'match_point', team: 'B' };
    return { type: 'super_tiebreak', team: null };
  }
  if (state.inTiebreak) {
    const a = Number(state.pointsA || 0);
    const b = Number(state.pointsB || 0);
    const leader = a > b ? 'A' : b > a ? 'B' : null;
    if (leader && Math.max(a, b) >= 6) {
      const leaderSets = leader === 'A' ? state.setsA : state.setsB;
      return { type: leaderSets === 1 ? 'match_point' : 'set_point', team: leader };
    }
    return { type: 'tiebreak', team: null };
  }

  const aGamePoint = state.pointsA >= 3 && state.pointsA > state.pointsB;
  const bGamePoint = state.pointsB >= 3 && state.pointsB > state.pointsA;
  const team = aGamePoint ? 'A' : bGamePoint ? 'B' : null;
  if (!team) return null;
  const teamSets = team === 'A' ? state.setsA : state.setsB;
  const teamGames = team === 'A' ? state.gamesA : state.gamesB;
  const otherGames = team === 'A' ? state.gamesB : state.gamesA;
  if (teamGames >= 5 && teamGames - otherGames >= 1) {
    return { type: teamSets === 1 ? 'match_point' : 'set_point', team };
  }
  const receiving = state.servingTeam === 'A' ? 'B' : 'A';
  if (team === receiving) return { type: 'break_point', team };
  return { type: 'game_point', team };
}

export function buildContextualMoment({ scoreBefore, scoreAfter, result, momentum, pressureBefore }) {
  if (!result || !scoreBefore || !scoreAfter) return null;
  const winner = result.winnerTeamId;
  const gameWon = scoreBefore.gamesA !== scoreAfter.gamesA || scoreBefore.gamesB !== scoreAfter.gamesB;
  const setWon = scoreBefore.setsA !== scoreAfter.setsA || scoreBefore.setsB !== scoreAfter.setsB;
  const isBreak = gameWon && winner !== result.servingTeamId;
  const streak = Number(momentum?.streak || 0);
  const rally = Number(result.rallyLength || 0);

  if (scoreAfter.finished) return { kind: 'match_end', importance: 5, team: winner, message: winner === 'A' ? '🏆 Vitória confirmada. Sua dupla fecha a partida!' : 'Fim de jogo. Os rivais confirmam a vitória.' };
  if (setWon) return { kind: 'set_end', importance: 5, team: winner, message: winner === 'A' ? '🔥 Set para sua dupla. A pressão muda de lado.' : 'Os rivais fecham o set e aumentam a pressão.' };
  if (pressureBefore?.type === 'match_point') return { kind: 'match_point', importance: 5, team: winner, message: winner === pressureBefore.team ? '🏆 Match point convertido!' : '🛡 Match point salvo. A partida continua viva.' };
  if (pressureBefore?.type === 'set_point') return { kind: 'set_point', importance: 4, team: winner, message: winner === pressureBefore.team ? 'Set point convertido no momento certo.' : 'Set point salvo com muita pressão.' };
  if (pressureBefore?.type === 'break_point') return { kind: 'break_point', importance: 4, team: winner, message: winner === pressureBefore.team ? '⚡ Break point convertido. Quebra de saque!' : '🛡 Break point salvo. O saque resiste.' };
  if (isBreak) return { kind: 'break', importance: 4, team: winner, message: winner === 'A' ? '⚡ Sua dupla quebra o saque e assume a iniciativa.' : 'Os rivais conseguem a quebra e crescem no jogo.' };
  if (streak >= 4) return { kind: 'streak', importance: 3, team: winner, message: winner === 'A' ? `🔥 ${streak} pontos seguidos. Sua dupla assumiu o controle.` : `⚠ ${streak} pontos seguidos dos rivais. É hora de reagir.` };
  if (rally >= 18) return { kind: 'long_rally', importance: 3, team: winner, message: `Que troca! ${rally} golpes em um dos rallies mais intensos da partida.` };
  if (Math.abs(Number(momentum?.value || 0)) >= 55 && Math.abs(Number(momentum?.lastValue || 0)) < 55) {
    return { kind: 'momentum', importance: 3, team: momentum.leader, message: momentum.leader === 'A' ? '🔥 Sua dupla domina o momento da partida.' : '⚠ Os rivais assumiram o controle emocional do jogo.' };
  }
  return null;
}

export function buildMatchRecap(matchState) {
  if (!matchState) return null;
  const events = matchState.pointEvents || [];
  const stats = matchState.stats || {};
  const teamA = stats.teams?.A || {};
  const teamB = stats.teams?.B || {};
  const winnerTeam = matchState.winner || (matchState.setsA > matchState.setsB ? 'A' : 'B');
  const players = Object.values(stats.players || {});
  const mvp = players
    .map((player) => ({
      ...player,
      _score: Number(player.winners || 0) * 3 + Number(player.pointsWon || 0) + Number(player.decisivePointsWon || 0) * 2 - Number(player.unforcedErrors || 0) * 1.5,
    }))
    .sort((a, b) => b._score - a._score)[0] || null;

  const longestRally = events.reduce((best, event) => Number(event.rallyLength || 0) > Number(best?.rallyLength || 0) ? event : best, null);
  const smashes = events.filter((event) => event.shot === 'smash' && event.reason === 'winner');
  const breakMoments = events.filter((event) => {
    const before = event.scoreBefore || {};
    const after = event.scoreAfter || {};
    return (before.gamesA !== after.gamesA || before.gamesB !== after.gamesB) && event.winnerTeamId !== event.servingTeamId;
  });
  const streakA = Number(stats.longestTeamStreak?.A || teamA.maxPointStreak || 0);
  const streakB = Number(stats.longestTeamStreak?.B || teamB.maxPointStreak || 0);
  const comeback = matchState.setScores?.length >= 3 && matchState.setScores[0]?.winner !== winnerTeam;

  const highlights = [];
  if (longestRally) highlights.push({ icon: 'rally', title: 'Rally mais longo', value: `${longestRally.rallyLength} golpes`, pointNumber: longestRally.pointNumber });
  if (smashes.length) highlights.push({ icon: 'smash', title: 'Smashes vencedores', value: String(smashes.length) });
  if (breakMoments.length) highlights.push({ icon: 'break', title: 'Quebras de saque', value: String(breakMoments.length) });
  highlights.push({ icon: 'streak', title: 'Maior sequência', value: `${Math.max(streakA, streakB)} pontos` });
  if (comeback) highlights.push({ icon: 'comeback', title: 'Virada', value: 'Vitória após perder o 1º set' });
  if (mvp) highlights.push({ icon: 'mvp', title: 'MVP da partida', value: mvp.name });

  return {
    winnerTeam,
    wonByPlayer: winnerTeam === 'A',
    score: (matchState.setScores || []).map((set) => `${set.gamesA}-${set.gamesB}`).join(' · '),
    mvp,
    highlights: highlights.slice(0, 6),
    momentum: matchState.momentum || createMatchMomentum(),
    stats: {
      A: { winners: teamA.winners || 0, errors: teamA.errors || 0, breaks: teamA.breakPointsConverted || 0, breakChances: teamA.breakPointsCreated || 0 },
      B: { winners: teamB.winners || 0, errors: teamB.errors || 0, breaks: teamB.breakPointsConverted || 0, breakChances: teamB.breakPointsCreated || 0 },
      longestRally: Number(stats.longestRally || longestRally?.rallyLength || 0),
      averageRally: Number(stats.averageRally || 0),
    },
  };
}
