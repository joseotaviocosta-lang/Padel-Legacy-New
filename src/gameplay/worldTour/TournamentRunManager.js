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
    // 5.26-D — identidade da dupla adversária (Bloco D): pair_id canônico do
    // mundo quando o adversário veio do campo real, e a origem do campo
    // (world-pair / fallback-synthetic / qualifying). Nunca inventado.
    opponentPairId: opponentEntry?.pair_id || null,
    opponentSource: opponentEntry?.source || null,
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
  // Fase 15.2 (Bug 7/B2): a rodada nunca pode parecer "pronta" (preparação
  // ou jogável) antes da própria data chegar — a checagem de data precisa
  // vir ANTES de `preparationCompleted`. Antes desta correção, ao terminar
  // uma rodada e avançar `currentRound`, a nova partida (preparationCompleted
  // sempre false) retornava 'round_preparation' mesmo com `match.date` dias
  // no futuro, o que fazia `round_result` (TournamentModal.jsx) oferecer
  // "Jogar {rodada} agora" um dia (ou vários dias) cedo demais.
  if (careerDate < match.date) return 'waiting';
  if (!match.preparationCompleted) return 'round_preparation';
  if (careerDate > match.date) return 'missed';
  if (match.status === 'playing' || run.status === 'playing') return 'playing';
  return 'playable';
}

// Playthrough 5.9, BUG 1 — o Centro da Carreira escolhia o torneio "ativo"
// com `events.find(e => e.metadata?.tournament_run)` e derivava o CTA de
// `getCurrentTournamentMatch(run)` CRU, sem nenhuma guarda de status/data.
// Três consequências, todas reproduzidas em carreira real
// (test-careerhub-stale-tournament-action-v59.mjs): (1) a busca traz TODO
// evento de torneio da carreira, inclusive encerrados, e `.find` devolve o
// MAIS ANTIGO — Roma Pré-Temporada ficava "ativa" mesmo depois de Londres
// e Dubai; (2) `getCurrentTournamentMatch` devolve `matches[currentRound]`
// mesmo com `run.status === 'eliminated'` (numa derrota o currentRound NÃO
// avança, então ele aponta pra sempre à rodada perdida); (3) a condição de
// data era `match.date <= career_date`, aberta pra sempre.
//
// `getTournamentRunPhase` JÁ era a autoridade correta (trata terminal,
// 'waiting', 'missed'); faltava alguém usá-la. Esta função é o seletor
// único: devolve `{ event, run, match, phase }` SÓ quando existe uma ação
// real de torneio hoje, e `null` em qualquer outro caso.
const PLAYABLE_RUN_PHASES = new Set(['pre_tournament', 'round_preparation', 'playable', 'playing']);
const CLOSED_CALENDAR_EVENT_STATUSES = new Set(['completed', 'missed', 'cancelled']);

export function selectActiveTournamentRun(events, careerDate) {
  if (!careerDate) return null;
  const candidates = [];
  for (const event of events || []) {
    if (!event || event.event_type !== 'tournament') continue;
    if (CLOSED_CALENDAR_EVENT_STATUSES.has(String(event.status || '').toLowerCase())) continue;
    const run = event.metadata?.tournament_run;
    if (!run) continue;
    const phase = getTournamentRunPhase(run, careerDate);
    if (!PLAYABLE_RUN_PHASES.has(phase)) continue;
    const match = getCurrentTournamentMatch(run);
    if (!match || match.status === 'completed' || match.status === 'cancelled') continue;
    candidates.push({ event, run, match, phase });
  }
  if (!candidates.length) return null;
  // Mais de um torneio jogável no mesmo dia é anômalo (exclusividade de
  // agenda), mas se acontecer a ação de HOJE vence a de preparação, e entre
  // iguais vence a partida de data mais próxima — nunca "a primeira da
  // lista", que era justamente o critério que fixava o torneio mais antigo.
  candidates.sort((a, b) => {
    const aToday = a.match.date === careerDate ? 0 : 1;
    const bToday = b.match.date === careerDate ? 0 : 1;
    if (aToday !== bToday) return aToday - bToday;
    return String(a.match.date || '').localeCompare(String(b.match.date || ''));
  });
  return candidates[0];
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
  const allMatches = run?.matches || [];
  // Playthrough 4, item 3 (Roma Pré-Temporada, "dados corrompidos"): o run
  // pré-gera TODAS as rodadas do caminho do jogador já no sorteio, inclusive
  // as que ele nunca vai disputar. Quando a campanha termina numa derrota, as
  // rodadas seguintes continuavam no bracket_history como partidas agendadas
  // da dupla do jogador — e a projeção temporal de tournamentBracketView, ao
  // promover o vencedor da rodada anterior para a seguinte, desenhava o algoz
  // do jogador contra "Vencedor Jogo 2" em rodadas que nunca aconteceram. Não
  // era dado corrompido: era o caminho futuro de uma dupla já eliminada. A
  // chave passa a terminar onde a campanha terminou. `is_final` preserva qual
  // rodada ERA a final do torneio, informação que o truncamento apagaria —
  // sem ela, quem lê a chave trataria a rodada da eliminação como decisão do
  // título (ver getVisibleTournamentBracketState).
  const lostIndex = allMatches.findIndex((match) => match.status === 'completed' && match.result && !match.result.won);
  const lastIndex = allMatches.length - 1;
  const visibleMatches = lostIndex >= 0 ? allMatches.slice(0, lostIndex + 1) : allMatches;
  return visibleMatches.map((match, index) => ({
    round: match.round,
    date: match.date,
    status: match.status,
    is_final: index === lastIndex,
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

// Playthrough 4.6B, item 3 — `worldRank` (antes chamado `teamRank`, nome que
// convidava a confundir com o seed/slot do sorteio sintético) é SEMPRE um
// rank factual (getCanonicalTeamWorldRank, teamRanking.js) ou `null`/
// unranked — nunca mais o número de posição no bracket. Um adversário sem
// rank canônico (o caso comum: bots procedurais do catálogo não disputam o
// circuito de duplas) simplesmente não mostra `ranking` nenhum — a UI trata
// isso como "Sem ranking", nunca inventa um valor.
export function buildOpponentAnalysis(opponent = [], { worldRank = null, analysisLevel = 0 } = {}) {
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
    // Playthrough 5.15 (continuação), Partes A/B/C/E — AUTORIDADE ÚNICA do
    // ranking exibido do adversário.
    //
    // O chamador (TournamentModal) já resolve o rank CANÔNICO via
    // `getCanonicalTeamWorldRank` e passa `null` quando a dupla não tem
    // TeamRanking — exatamente o caso dos adversários de
    // `BOTS_BY_DIFFICULTY`, que vivem no catálogo e não no mundo. Mas aqui
    // havia um fallback que descia no próprio bot e lia
    // `ranking_position`/`world_rank`, campos do CATÁLOGO. O resultado era
    // a tela anunciar "#20/#30/#40" para uma dupla que a fonte canônica
    // classifica como "Sem ranking" — posição inventada, sem nenhuma
    // sustentação competitiva (medido: 0 de 200 adversários iniciais
    // existem como AthleteProfile do mundo).
    //
    // Sem TeamRanking canônico não há posição a mostrar. `null` faz a UI
    // renderizar "Sem ranking", que é a verdade. Seed de chave, slot de
    // bracket e bucket de dificuldade continuam existindo internamente —
    // só não viram "#37" na tela.
    ranking: Number(worldRank) > 0 ? Number(worldRank) : null,
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
