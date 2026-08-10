import { addTournamentDays } from '../../lib/tournamentSchedule.js';

export const TOURNAMENT_RUN_STATUSES = Object.freeze([
  'registered', 'preparing', 'scheduled', 'playing', 'between_rounds',
  'eliminated', 'champion', 'finished',
]);

export const TOURNAMENT_STRATEGY_OPTIONS = Object.freeze([
  Object.freeze({ id: 'balanced', label: 'Jogo equilibrado', matchTacticId: 'equilibrado', mentality: 'balanced', netPressure: 'medium', lobFrequency: 'medium', risk: 'medium' }),
  Object.freeze({ id: 'control', label: 'Priorizar controle', matchTacticId: 'tatico', mentality: 'control', netPressure: 'medium', lobFrequency: 'medium', risk: 'low' }),
  Object.freeze({ id: 'net', label: 'Pressionar a rede', matchTacticId: 'agressivo', mentality: 'attacking', netPressure: 'high', lobFrequency: 'low', risk: 'high' }),
  Object.freeze({ id: 'lobs', label: 'Usar mais lobs', matchTacticId: 'defensivo', mentality: 'patient', netPressure: 'low', lobFrequency: 'high', risk: 'low' }),
  Object.freeze({ id: 'safe', label: 'Jogar com segurança', matchTacticId: 'defensivo', mentality: 'safe', netPressure: 'low', lobFrequency: 'medium', risk: 'low' }),
  Object.freeze({ id: 'aggressive', label: 'Ser agressivo', matchTacticId: 'potencia', mentality: 'aggressive', netPressure: 'high', lobFrequency: 'low', risk: 'high' }),
]);

export const DEFAULT_TOURNAMENT_STRATEGY = Object.freeze({
  id: 'balanced', mentality: 'balanced', netPressure: 'medium', lobFrequency: 'medium',
  risk: 'medium', targetPlayer: null, matchTacticId: 'equilibrado', updatedAt: null,
});

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function nowIso(now) { return typeof now === 'string' ? now : (now instanceof Date ? now.toISOString() : new Date().toISOString()); }
function safeId(value) { return String(value || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '-'); }

export function strategyFromOption(optionId, previous = DEFAULT_TOURNAMENT_STRATEGY, now = new Date()) {
  const option = TOURNAMENT_STRATEGY_OPTIONS.find((item) => item.id === optionId) || TOURNAMENT_STRATEGY_OPTIONS[0];
  return { ...previous, ...option, targetPlayer: previous?.targetPlayer || null, updatedAt: nowIso(now) };
}

export function createTournamentRun({
  tournament,
  profileId,
  startDate,
  qualifyingRounds = [],
  mainRounds = [],
  qualifyingRequired = false,
  opponents = [],
  now = new Date(),
}) {
  const stages = [
    ...(qualifyingRequired ? qualifyingRounds.map((round, index) => ({ ...round, stage: 'qualifying', stageRoundIndex: index })) : []),
    ...mainRounds.map((round, index) => ({ ...round, stage: 'main', stageRoundIndex: index })),
  ];
  const createdAt = nowIso(now);
  const matches = stages.map((round, index) => {
    const opponentEntry = opponents[index] || [];
    const opponentMembers = Array.isArray(opponentEntry) ? opponentEntry : (opponentEntry.members || []);
    return ({
    id: `tournament-match-${safeId(profileId)}-${safeId(tournament?.id)}-${round.stage}-${round.stageRoundIndex}`,
    stage: round.stage,
    roundIndex: index,
    stageRoundIndex: round.stageRoundIndex,
    round: round.label || `Rodada ${index + 1}`,
    short: round.short || round.label || `R${index + 1}`,
    date: addTournamentDays(startDate, index),
    opponent: clone(opponentMembers),
    opponentRank: Number(opponentEntry?.rank || opponentEntry?.teamRank || 0) || null,
    status: 'scheduled',
    preparationCompleted: false,
    result: null,
    stats: null,
    pressImportance: null,
    completedAt: null,
  });
  });
  return {
    version: 2,
    tournamentId: tournament?.id,
    tournamentName: tournament?.name,
    status: 'preparing',
    currentRound: 0,
    strategy: { ...DEFAULT_TOURNAMENT_STRATEGY },
    meetingsCompleted: { preTournament: false, rounds: [] },
    matches,
    lastMatchStats: null,
    createdAt,
    updatedAt: createdAt,
    finishedAt: null,
  };
}

export function getCurrentTournamentMatch(run) {
  return run?.matches?.[Number(run.currentRound || 0)] || null;
}

export function getTournamentRunPhase(run, careerDate) {
  if (!run) return 'loading';
  if (run.status === 'eliminated') return 'eliminated';
  if (run.status === 'champion') return 'champion';
  if (run.status === 'finished') return 'finished';
  const match = getCurrentTournamentMatch(run);
  if (!run.meetingsCompleted?.preTournament) return 'pre_tournament';
  if (!match) return 'finished';
  if (!match.preparationCompleted) return 'round_preparation';
  if (careerDate < match.date) return 'waiting';
  if (careerDate > match.date) return 'missed';
  if (match.status === 'playing' || run.status === 'playing') return 'playing';
  return 'playable';
}

export function completePreTournamentMeeting(run, optionId, now = new Date()) {
  if (!run) throw new Error('Estado do torneio ausente.');
  if (run.meetingsCompleted?.preTournament) return { run, idempotent: true };
  const next = clone(run);
  next.strategy = strategyFromOption(optionId, next.strategy, now);
  next.meetingsCompleted = { ...(next.meetingsCompleted || {}), preTournament: true, rounds: [...(next.meetingsCompleted?.rounds || [])] };
  const match = getCurrentTournamentMatch(next);
  if (match) {
    match.preparationCompleted = true;
    match.strategy = clone(next.strategy);
  }
  next.status = 'scheduled';
  next.updatedAt = nowIso(now);
  return { run: next, idempotent: false };
}

export function completeRoundPreparation(run, { optionId = null, keepPlan = false } = {}, now = new Date()) {
  if (!run) throw new Error('Estado do torneio ausente.');
  const next = clone(run);
  const match = getCurrentTournamentMatch(next);
  if (!match) throw new Error('Rodada atual ausente.');
  if (match.preparationCompleted) return { run, idempotent: true };
  if (!keepPlan && optionId) next.strategy = strategyFromOption(optionId, next.strategy, now);
  match.preparationCompleted = true;
  match.strategy = clone(next.strategy);
  const roundKey = `${match.stage}:${match.stageRoundIndex}`;
  const rounds = new Set(next.meetingsCompleted?.rounds || []);
  rounds.add(roundKey);
  next.meetingsCompleted = { ...(next.meetingsCompleted || {}), preTournament: true, rounds: [...rounds] };
  next.status = 'scheduled';
  next.updatedAt = nowIso(now);
  return { run: next, idempotent: false };
}

export function startTournamentMatch(run, careerDate, now = new Date()) {
  const phase = getTournamentRunPhase(run, careerDate);
  if (phase !== 'playable') throw new Error(phase === 'waiting' ? 'A partida ainda não chegou ao calendário.' : 'A rodada não está pronta para começar.');
  const next = clone(run);
  const match = getCurrentTournamentMatch(next);
  match.status = 'playing';
  match.startedAt = nowIso(now);
  next.status = 'playing';
  next.updatedAt = nowIso(now);
  return next;
}

/**
 * @param {{ tournament?: any, match?: any, won?: boolean, upset?: boolean }} options
 */
export function getRoundPressImportance({ tournament = {}, match = {}, won = false, upset = false } = {}) {
  const tierScore = { Silver: 1, Gold: 2, Platinum: 3, Masters: 4, Elite: 5, Crown: 6 }[tournament.tier] || 1;
  const label = String(match.round || '').toLowerCase();
  const roundScore = label.includes('final') && !label.includes('semi') ? 4 : label.includes('semi') ? 3 : label.includes('quart') ? 2 : 1;
  const score = tierScore + roundScore + (upset ? 2 : 0) + (won ? 1 : 0);
  return score >= 11 ? 'global' : score >= 8 ? 'high' : score >= 5 ? 'medium' : 'simple';
}

/**
 * @param {any} run
 * @param {{ matchId?: string, won?: boolean, score?: string, result?: any, stats?: any, tournament?: any, upset?: boolean, now?: Date }} options
 */
export function recordTournamentMatchResult(run, {
  matchId,
  won,
  score,
  result,
  stats = null,
  tournament = {},
  upset = false,
  now = new Date(),
} = {}) {
  if (!run) throw new Error('Estado do torneio ausente.');
  const current = getCurrentTournamentMatch(run);
  if (!current || (matchId && current.id !== matchId)) throw new Error('A partida não corresponde à rodada atual.');
  if (current.status === 'completed') return { run, idempotent: true, terminal: ['eliminated', 'champion'].includes(run.status) };
  const next = clone(run);
  const match = getCurrentTournamentMatch(next);
  match.status = 'completed';
  match.result = { won: Boolean(won), score: score || null, ...(result || {}) };
  match.stats = stats ? clone(stats) : null;
  match.pressImportance = getRoundPressImportance({ tournament, match, won, upset });
  match.completedAt = nowIso(now);
  next.lastMatchStats = stats ? clone(stats) : null;

  let terminal = false;
  if (!won) {
    next.status = 'eliminated';
    terminal = true;
  } else if (Number(next.currentRound || 0) + 1 >= next.matches.length) {
    next.status = match.stage === 'main' ? 'champion' : 'finished';
    terminal = true;
  } else {
    next.currentRound = Number(next.currentRound || 0) + 1;
    next.status = 'between_rounds';
  }
  next.updatedAt = nowIso(now);
  next.finishedAt = terminal ? nowIso(now) : null;
  return { run: next, idempotent: false, terminal, nextMatch: terminal ? null : getCurrentTournamentMatch(next) };
}

export function withdrawTournamentRun(run, reason = 'Abandono', now = new Date()) {
  if (!run) throw new Error('Estado do torneio ausente.');
  if (['eliminated', 'champion', 'finished'].includes(run.status)) return { run, idempotent: true };
  const next = clone(run);
  const match = getCurrentTournamentMatch(next);
  if (match && match.status !== 'completed') {
    match.status = 'cancelled';
    match.result = { won: false, withdrawn: true, reason };
    match.completedAt = nowIso(now);
  }
  next.status = 'eliminated';
  next.finishReason = reason;
  next.updatedAt = nowIso(now);
  next.finishedAt = nowIso(now);
  return { run: next, idempotent: false };
}

export function buildTournamentBracketHistory(run, playerTeamName = 'Sua dupla') {
  return (run?.matches || []).map((match) => ({
    round: match.round,
    date: match.date,
    status: match.status,
    matches: [{
      match_id: match.id,
      date: match.date,
      status: match.status,
      team_a: playerTeamName,
      team_b: Array.isArray(match.opponent) && match.opponent.length
        ? match.opponent.map((item) => item.name).filter(Boolean).join(' & ')
        : 'Adversário a definir',
      winner: match.result ? (match.result.won ? playerTeamName : (match.opponent || []).map((item) => item.name).join(' & ')) : null,
      score: match.result?.score || null,
    }],
  }));
}

export function summarizeTournamentMatch(matchState) {
  const team = matchState?.stats?.teams?.A || {};
  const players = Object.values(matchState?.stats?.players || {}).filter((row) => row.team === 'A');
  const shotTotals = players.flatMap((row) => Object.values(row.shots || {}));
  const byShot = (shot) => players.reduce((sum, row) => sum + Number(row.shots?.[shot] || 0), 0);
  return {
    winners: Number(team.winners || 0),
    errors: Number(team.unforcedErrorsCommitted ?? team.errors ?? 0),
    net: Math.round(Number(team.netEfficiency ?? team.netPointWinShare ?? team.netPointsWonPct ?? 0)),
    lobs: byShot('lob'),
    smashes: byShot('smash'),
    pointsWon: Number(team.pointsWon || 0),
    shotsRecorded: shotTotals.length,
  };
}

export function buildTournamentCoachSuggestion(run, profile = {}, opponentAnalysis = null) {
  const stats = run?.lastMatchStats;
  if (Number(profile.energy || 0) < 38 || Number(profile.fatigue || 0) >= 68) {
    return { optionId: 'safe', text: 'A carga física está alta. Quero reduzir o risco e escolher melhor os momentos de acelerar.' };
  }
  if (stats && stats.errors > stats.winners) {
    return { optionId: 'control', text: `Produzimos ${stats.winners} winners, mas cedemos ${stats.errors} erros. Amanhã precisamos controlar melhor o risco.` };
  }
  if (stats && stats.net > 0 && stats.net < 45) {
    return { optionId: 'lobs', text: `Nosso aproveitamento na rede ficou em ${stats.net}%. Use mais lobs para construir a subida com espaço.` };
  }
  if (opponentAnalysis?.weakness?.key === 'defense' || opponentAnalysis?.style === 'defensivo') {
    return { optionId: 'net', text: 'A próxima dupla cede terreno sob pressão. Podemos tomar a rede mais cedo.' };
  }
  return { optionId: run?.strategy?.id || 'balanced', text: 'O plano-base continua coerente. Ajustaremos apenas os gatilhos contra o próximo adversário.' };
}

export function buildOpponentAnalysis(opponent = [], { teamRank = null, analysisLevel = 0 } = {}) {
  const members = Array.isArray(opponent) ? opponent.filter(Boolean) : [];
  const attributeKeys = ['smash', 'volley', 'serve', 'lob', 'defense', 'speed', 'control', 'tactics'];
  const averages = attributeKeys.map((key) => ({
    key,
    value: members.length ? Math.round(members.reduce((sum, item) => sum + Number(item?.[key] ?? item?.attributes?.[key] ?? 0), 0) / members.length) : 0,
  })).filter((item) => item.value > 0).sort((a, b) => b.value - a.value);
  const style = members.map((item) => item.play_style).find(Boolean) || 'equilibrado';
  const knownForm = analysisLevel >= 2 ? members.map((item) => Number(item.form)).filter(Number.isFinite) : [];
  return {
    name: members.map((item) => item.name).filter(Boolean).join(' / ') || 'Adversário a definir',
    ranking: teamRank || members.map((item) => Number(item.ranking_position || item.world_rank)).find((value) => value > 0) || null,
    dominantSide: members.map((item) => item.preferred_side || item.court_side || item.position).filter(Boolean).join(' / ') || 'não informada',
    handedness: members.map((item) => item.handedness || item.dominant_hand).filter(Boolean).join(' / ') || 'não informada',
    style,
    strengths: averages.slice(0, analysisLevel >= 1 ? 3 : 2),
    weakness: analysisLevel >= 1 ? averages.at(-1) || null : null,
    recentForm: knownForm.length ? Math.round(knownForm.reduce((sum, value) => sum + value, 0) / knownForm.length) : null,
  };
}

export function countMainDrawWins(run) {
  return (run?.matches || []).filter((match) => match.stage === 'main' && match.result?.won).length;
}

export function validateTournamentRun(run) {
  const issues = [];
  if (!run || run.version !== 2) issues.push('invalid-version');
  if (!TOURNAMENT_RUN_STATUSES.includes(run?.status)) issues.push('invalid-status');
  const ids = new Set(); const dates = new Set();
  for (const match of run?.matches || []) {
    if (ids.has(match.id)) issues.push('duplicate-match');
    ids.add(match.id);
    if (dates.has(match.date)) issues.push('two-player-matches-same-day');
    dates.add(match.date);
  }
  if (Number(run?.currentRound || 0) >= (run?.matches?.length || 0) && !['champion', 'eliminated', 'finished'].includes(run?.status)) issues.push('invalid-current-round');
  return { valid: issues.length === 0, issues };
}
