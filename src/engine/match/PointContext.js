export const POINT_OUTCOMES = Object.freeze({
  WINNER: 'WINNER',
  FORCED_ERROR: 'FORCED_ERROR',
  UNFORCED_ERROR: 'UNFORCED_ERROR',
  DOUBLE_FAULT: 'DOUBLE_FAULT',
  SERVICE_ERROR: 'SERVICE_ERROR',
  OTHER: 'OTHER',
});

const otherTeam = (team) => team === 'A' ? 'B' : 'A';
const valueFor = (state, team, key) => Number(state?.[`${key}${team}`] || 0);

export function isNormalGamePoint(state, team) {
  if (!state || state.inTiebreak || !['A', 'B'].includes(team)) return false;
  const opponent = otherTeam(team);
  return valueFor(state, team, 'points') >= 3
    && valueFor(state, team, 'points') > valueFor(state, opponent, 'points');
}

export function getPointContext(state, servingTeam = state?.servingTeam) {
  const receivingTeam = otherTeam(servingTeam);
  if (state?.inTiebreak) {
    const target = state.superTiebreak ? 10 : 7;
    const leadingTeam = valueFor(state, 'A', 'points') > valueFor(state, 'B', 'points') ? 'A'
      : valueFor(state, 'B', 'points') > valueFor(state, 'A', 'points') ? 'B' : null;
    const closesTiebreak = Boolean(leadingTeam && valueFor(state, leadingTeam, 'points') >= target - 1);
    const matchPointTeam = closesTiebreak && (state.superTiebreak || valueFor(state, leadingTeam, 'sets') >= 1) ? leadingTeam : null;
    const setPointTeam = closesTiebreak ? leadingTeam : null;
    return {
      pointsA: valueFor(state, 'A', 'points'), pointsB: valueFor(state, 'B', 'points'),
      gamesA: valueFor(state, 'A', 'games'), gamesB: valueFor(state, 'B', 'games'),
      setsA: valueFor(state, 'A', 'sets'), setsB: valueFor(state, 'B', 'sets'),
      inTiebreak: true, superTiebreak: Boolean(state.superTiebreak), servingTeam, receivingTeam,
      gamePointTeam: null, isGamePoint: false, isBreakPoint: false, breakPoint: false, breakPointTeam: null,
      isSetPoint: closesTiebreak, setPointTeam,
      isMatchPoint: Boolean(matchPointTeam), matchPointTeam,
      importantPoint: true,
    };
  }
  const gamePointTeam = isNormalGamePoint(state, 'A') ? 'A' : isNormalGamePoint(state, 'B') ? 'B' : null;
  const isBreakPoint = Boolean(gamePointTeam && gamePointTeam === receivingTeam);
  const teamGames = gamePointTeam ? valueFor(state, gamePointTeam, 'games') : 0;
  const opponentGames = gamePointTeam ? valueFor(state, otherTeam(gamePointTeam), 'games') : 0;
  const closesSet = Boolean(gamePointTeam && teamGames >= 5 && teamGames - opponentGames >= 1);
  const teamSets = gamePointTeam ? valueFor(state, gamePointTeam, 'sets') : 0;
  const isSetPoint = closesSet;
  const isMatchPoint = closesSet && teamSets >= 1;

  return {
    pointsA: valueFor(state, 'A', 'points'),
    pointsB: valueFor(state, 'B', 'points'),
    gamesA: valueFor(state, 'A', 'games'),
    gamesB: valueFor(state, 'B', 'games'),
    setsA: valueFor(state, 'A', 'sets'),
    setsB: valueFor(state, 'B', 'sets'),
    inTiebreak: Boolean(state?.inTiebreak),
    superTiebreak: Boolean(state?.superTiebreak),
    servingTeam,
    receivingTeam,
    gamePointTeam,
    isGamePoint: Boolean(gamePointTeam),
    isBreakPoint,
    breakPoint: isBreakPoint,
    breakPointTeam: isBreakPoint ? receivingTeam : null,
    isSetPoint,
    setPointTeam: isSetPoint ? gamePointTeam : null,
    isMatchPoint,
    matchPointTeam: isMatchPoint ? gamePointTeam : null,
    importantPoint: Boolean(state?.inTiebreak || gamePointTeam),
  };
}
