import { createDefaultBalanceTeams } from '../src/engine/match/BalanceSimulator.js';
import { createMatch, decideLiveCoachSuggestion, playPoint } from '../src/engine/match/MatchEngine.js';

const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, value = 'true'] = arg.replace(/^--/, '').split('=');
  return [key, value];
}));
const matches = Math.max(1, Number(args.get('matches') || 1000));
const seedPrefix = args.get('seed') || 'match-realism-rc';
const jsonOnly = args.has('json');
const coachSample = Math.min(matches, Math.max(0, Number(args.get('coach-sample') || 100)));

const round = (value, digits = 2) => {
  const factor = 10 ** digits;
  return Math.round(Number(value || 0) * factor) / factor;
};
const average = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
const percentile = (values, ratio) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) * ratio)];
};
const exactBreakPoint = (event) => {
  if (event.scoreBefore?.inTiebreak || !event.servingTeamId) return false;
  const receivingTeam = event.servingTeamId === 'A' ? 'B' : 'A';
  const receiver = Number(receivingTeam === 'A' ? event.scoreBefore.pointsA : event.scoreBefore.pointsB);
  const server = Number(receivingTeam === 'A' ? event.scoreBefore.pointsB : event.scoreBefore.pointsA);
  return receiver >= 3 && receiver > server;
};
const eventOutcome = (event) => event.outcome
  || (event.reason === 'winner' ? 'WINNER'
    : event.forcedError ? 'FORCED_ERROR'
      : event.shot === 'serve' && Number(event.rallyLength || 0) <= 1 ? 'DOUBLE_FAULT' : 'UNFORCED_ERROR');

function simulate(index) {
  const teams = createDefaultBalanceTeams();
  const swap = index % 2 === 1;
  let state = createMatch(
    swap ? teams.teamB : teams.teamA,
    swap ? teams.teamA : teams.teamB,
    {
      seed: `${seedPrefix}:${Math.floor(index / 2)}:${swap ? 'swap' : 'base'}`,
      coach: index < coachSample ? { id: 'audit-coach', level: 4, tier: 'elite', specialty: 'estratega' } : null,
      liveCoachSettings: { suggestionFrequency: 'normal', allowMinorAutoAdjustments: false },
    },
  );
  let safety = 5000;
  while (!state.finished && safety-- > 0) {
    state = playPoint(state);
    if (state.liveCoach?.pendingSuggestion) state = decideLiveCoachSuggestion(state, 'apply');
  }
  if (!state.finished) throw new Error(`Partida ${index} excedeu 5000 pontos.`);
  return state;
}

const rows = [];
const shotWinners = {};
const shotTotals = {};
const scorelines = {};
for (let index = 0; index < matches; index += 1) {
  const state = simulate(index);
  const events = state.pointEvents || [];
  const outcomes = events.map(eventOutcome);
  const breakEvents = events.filter(exactBreakPoint);
  const legacyBreakCreated = Object.values(state.stats.teams || {}).reduce((sum, row) => sum + Number(row.breakPointsCreated || 0), 0);
  const netWins = events.filter((event) => event.winnerPosition === 'NET').length
    || Object.values(state.stats.teams || {}).reduce((sum, row) => sum + Number(row.netPointsWon || 0), 0);
  Object.values(state.stats.players || {}).forEach((player) => Object.keys(player.shots || {}).forEach((shot) => {
    const row = shotTotals[shot] || (shotTotals[shot] = { attempts: 0, winners: 0, forcedErrorsDrawn: 0, errors: 0 });
    row.attempts += Number(player.shots?.[shot] || 0);
    row.winners += Number(player.shotWinners?.[shot] || 0);
    row.forcedErrorsDrawn += Number(player.shotForcedErrorsDrawn?.[shot] || 0);
    row.errors += Number(player.shotErrors?.[shot] || 0);
  }));
  events.filter((event) => eventOutcome(event) === 'WINNER').forEach((event) => {
    const shot = event.shot || 'unknown';
    shotWinners[shot] = (shotWinners[shot] || 0) + 1;
  });
  const scoreline = state.setScores.map((set) => `${set.gamesA}-${set.gamesB}`).join(' ');
  scorelines[scoreline] = (scorelines[scoreline] || 0) + 1;
  rows.push({
    seed: `${seedPrefix}:${Math.floor(index / 2)}:${index % 2 ? 'swap' : 'base'}`,
    scoreline,
    points: events.length,
    averageRally: Number(state.stats.averageRally || 0),
    winners: outcomes.filter((value) => value === 'WINNER').length,
    forcedErrors: outcomes.filter((value) => value === 'FORCED_ERROR').length,
    unforcedErrors: outcomes.filter((value) => value === 'UNFORCED_ERROR').length,
    serviceErrors: outcomes.filter((value) => ['DOUBLE_FAULT', 'SERVICE_ERROR'].includes(value)).length,
    breakPoints: breakEvents.length,
    breakPointsConverted: breakEvents.filter((event) => event.winnerTeamId !== event.servingTeamId).length,
    breakPointsSaved: breakEvents.filter((event) => event.winnerTeamId === event.servingTeamId).length,
    legacyBreakCreated,
    netWins,
    suggestions: Number(state.liveCoachReport?.suggestionsReceived || 0),
    suggestionsApplied: Number(state.liveCoachReport?.suggestionsApplied || 0),
    inconsistentOutcomeTotal: outcomes.length !== events.length ? 1 : 0,
  });
}

const total = (key) => rows.reduce((sum, row) => sum + row[key], 0);
const pointTotal = total('points');
const opportunities = total('breakPoints');
const report = {
  version: 'match-realism-rc',
  matches,
  metrics: {
    averagePointsPerMatch: round(average(rows.map((row) => row.points))),
    p95PointsPerMatch: percentile(rows.map((row) => row.points), 0.95),
    averageRally: round(average(rows.map((row) => row.averageRally))),
    outcomesPerMatch: {
      winners: round(total('winners') / matches),
      forcedErrorsDrawn: round(total('forcedErrors') / matches),
      unforcedErrorsCommitted: round(total('unforcedErrors') / matches),
      serviceErrors: round(total('serviceErrors') / matches),
    },
    breakPointsPerMatch: round(opportunities / matches),
    breakPointConversionRate: round(opportunities ? total('breakPointsConverted') / opportunities * 100 : 0),
    breakPointsSavedPerMatch: round(total('breakPointsSaved') / matches),
    recordedToExactBreakPointRatio: round(opportunities ? total('legacyBreakCreated') / opportunities : 0),
    netPointWinShare: round(pointTotal ? total('netWins') / pointTotal * 100 : 0),
    coachSampleMatches: coachSample,
    coachSuggestionsPerCoachedMatch: round(total('suggestions') / Math.max(1, coachSample)),
    coachSuggestionsAppliedPerCoachedMatch: round(total('suggestionsApplied') / Math.max(1, coachSample)),
    winnerShotDistribution: Object.fromEntries(Object.entries(shotWinners).sort((a, b) => b[1] - a[1]).map(([shot, count]) => [shot, round(count / Math.max(1, total('winners')) * 100)])),
    shotOutcomes: Object.fromEntries(Object.entries(shotTotals).sort((a, b) => b[1].attempts - a[1].attempts).map(([shot, row]) => [shot, {
      attemptsPerMatch: round(row.attempts / matches),
      winnerRate: round(row.attempts ? row.winners / row.attempts * 100 : 0),
      forcedErrorDrawRate: round(row.attempts ? row.forcedErrorsDrawn / row.attempts * 100 : 0),
      errorRate: round(row.attempts ? row.errors / row.attempts * 100 : 0),
    }])),
    commonScorelines: Object.entries(scorelines).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([scoreline, count]) => ({ scoreline, count, rate: round(count / matches * 100) })),
  },
  outliers: {
    zeroWinnerMatches: rows.filter((row) => row.winners === 0).length,
    zeroNetWinMatches: rows.filter((row) => row.netWins === 0).length,
    breakPointInflationMatches: rows.filter((row) => row.legacyBreakCreated > row.breakPoints).length,
    outcomeConsistencyFailures: total('inconsistentOutcomeTotal'),
    veryShortMatches: rows.filter((row) => row.points < 70).length,
    veryLongMatches: rows.filter((row) => row.points > 280).length,
    examples: rows.filter((row) => row.points < 70 || row.points > 280 || row.winners === 0 || row.netWins === 0 || row.legacyBreakCreated > row.breakPoints).slice(0, 12).map((row) => ({ seed: row.seed, scoreline: row.scoreline, points: row.points, winners: row.winners, netWins: row.netWins, exactBreakPoints: row.breakPoints, recordedBreakPoints: row.legacyBreakCreated })),
  },
};

report.checks = {
  eventTotalsConsistent: report.outliers.outcomeConsistencyFailures === 0,
  breakPointsExact: report.metrics.recordedToExactBreakPointRatio === 1 && total('breakPointsConverted') + total('breakPointsSaved') === total('breakPoints'),
  winnersPresent: report.outliers.zeroWinnerMatches / matches <= 0.02,
  netContextPresent: report.outliers.zeroNetWinMatches / matches <= 0.02 && report.metrics.netPointWinShare >= 25 && report.metrics.netPointWinShare <= 75,
  rallyWindowPlausible: report.metrics.averageRally >= 3 && report.metrics.averageRally <= 12,
  matchLengthPlausible: report.metrics.averagePointsPerMatch >= 60 && report.metrics.averagePointsPerMatch <= 180,
  coachActiveWithoutSpam: coachSample === 0 || (report.metrics.coachSuggestionsPerCoachedMatch >= 0.5 && report.metrics.coachSuggestionsPerCoachedMatch <= 7),
};
report.success = Object.values(report.checks).every(Boolean);

if (!jsonOnly) console.log(`Auditoria de realismo: ${matches} partidas determinísticas`);
console.log(JSON.stringify(report, null, 2));
if (!report.success) process.exitCode = 1;
