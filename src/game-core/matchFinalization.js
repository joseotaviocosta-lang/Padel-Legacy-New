import { buildMatchRecap } from '../lib/matchExperience.js';

const PROFILE_STAGES = [
  'finalizeScore', 'aggregateStats', 'createMatchRecord', 'updateCareer', 'ranking',
  'tournament', 'finances', 'energy', 'missions', 'press', 'notifications',
  'analytics', 'persistSave', 'buildRecap',
];

export function isMatchEndDebugEnabled() {
  return globalThis.__PADEL_MATCH_END_DEBUG__ === true;
}

export function createMatchEndProfiler({ enabled = isMatchEndDebugEnabled(), logger = console.debug } = {}) {
  const startedAt = performance.now();
  const timings = {};
  const measure = async (stage, task) => {
    const stageStartedAt = performance.now();
    try { return await task(); }
    finally {
      timings[stage] = Number((performance.now() - stageStartedAt).toFixed(3));
    }
  };
  const finish = () => {
    PROFILE_STAGES.forEach((stage) => { if (!(stage in timings)) timings[stage] = 0; });
    timings.TOTAL = Number((performance.now() - startedAt).toFixed(3));
    if (enabled) {
      PROFILE_STAGES.forEach((stage) => logger(`[MatchEnd] ${stage}: ${timings[stage]}ms`));
      logger(`[MatchEnd] TOTAL: ${timings.TOTAL}ms`);
    }
    return { ...timings };
  };
  return { measure, finish, timings };
}

export function compactMatchStatistics(stats = {}) {
  const players = Object.fromEntries(Object.entries(stats.players || {}).map(([id, row]) => [id, {
    id: row.id,
    name: row.name,
    team: row.team,
    winners: Number(row.winners || 0),
    unforcedErrors: Number(row.unforcedErrors || 0),
    forcedErrors: Number(row.forcedErrors || 0),
    pointsWon: Number(row.pointsWon || 0),
    netEfficiency: Number(row.netEfficiency || 0),
    decisivePointsWon: Number(row.decisivePointsWon || 0),
    energyUsed: Number(row.energyUsed || 0),
  }]));
  return {
    players,
    teams: stats.teams || {},
    points: stats.points || { A: 0, B: 0 },
    rallies: Number(stats.rallies || 0),
    averageRally: Number(stats.averageRally || 0),
    longestRally: Number(stats.longestRally || 0),
    decisivePoints: Number(stats.decisivePoints || 0),
    breakPoints: stats.breakPoints || null,
    momentumSwings: Number(stats.momentumSwings || 0),
  };
}

export function buildCompactMatchRecord({ profile, matchState, partnerName, opponents, matchType = 'simulada', tournamentName = 'Partida Treino', location = 'Arena Virtual', id }) {
  const recapSnapshot = matchState.matchRecapSnapshot || buildMatchRecap(matchState);
  const date = profile.career_date || new Date().toISOString().slice(0, 10);
  return {
    id,
    profile_id: profile.id,
    career_date: date,
    date,
    location,
    tournament_name: tournamentName,
    team_a: [profile.sport_name || profile.name || 'Jogador', partnerName],
    team_b: opponents,
    score_a: matchState.setsA,
    score_b: matchState.setsB,
    winner: matchState.winner,
    engine_version: matchState.engineVersion,
    seed: String(matchState.seed),
    set_scores: matchState.setScores,
    point_event_count: Number(matchState.pointEvents?.length || matchState.stats?.rallies || 0),
    core_stats: compactMatchStatistics(matchState.stats),
    recap_snapshot: recapSnapshot,
    live_coach_report: matchState.liveCoachReport || null,
    tactical_adjustment_history: (matchState.liveCoach?.adjustments || []).slice(-20),
    result: matchState.winner === 'A' ? 'vitória' : 'derrota',
    match_type: matchType,
    competition_type: 'practice',
    is_official: false,
    is_tournament: false,
    match_occurred: true,
    notes: `Sets: ${(matchState.setScores || []).map((set) => `${set.gamesA}-${set.gamesB}`).join(', ')}`,
  };
}

export function makeMatchFinalizationKey(profile, matchState, prefix = 'practice') {
  const seed = String(matchState?.seed || 'no-seed').replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 80);
  return `${prefix}:${profile?.id || 'player'}:${profile?.career_date || 'date'}:${seed}`;
}

export function scheduleSecondaryMatchWork(task, onError = (error) => console.error('[MatchEnd] secondary', error)) {
  let resolveTask;
  const completion = new Promise((resolve) => { resolveTask = resolve; });
  queueMicrotask(async () => {
    try { resolveTask(await task()); }
    catch (error) { onError(error); resolveTask({ ok: false, error }); }
  });
  return completion;
}
