import { getCurrentTournamentMatch } from '@/gameplay/worldTour/TournamentRunManager.js';

function ids(players = []) {
  return players.map((player) => String(player?.id || '')).filter(Boolean);
}

function sameIds(left = [], right = []) {
  return left.length === right.length && left.every((id, index) => String(id) === String(right[index]));
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Valida o contrato efetivamente consumido por LiveMatch e pelo próximo ponto
 * do engine. A checagem do repositório cobre apenas o envelope persistido;
 * esta cobre a compatibilidade semântica antes de montar a UI.
 */
export function inspectResumableTournamentEngineState(engineState, expectedTeams = {}) {
  const issues = [];
  const numericFields = ['setsA', 'setsB', 'currentSet', 'gamesA', 'gamesB', 'pointsA', 'pointsB', 'pointNumber', 'randomState'];
  const arrayFields = ['teamANames', 'teamBNames', 'setScores', 'narration', 'pointEvents', 'tacticsTimeline'];

  if (!isPlainObject(engineState)) return { valid: false, issues: ['engine_state'] };
  for (const field of numericFields) if (!isFiniteNumber(engineState[field])) issues.push(`engine_${field}`);
  for (const field of arrayFields) if (!Array.isArray(engineState[field])) issues.push(`engine_${field}`);
  if (!['A', 'B'].includes(engineState.servingTeam)) issues.push('engine_serving_team');
  if (!isPlainObject(engineState.teams) || !Array.isArray(engineState.teams?.A) || !Array.isArray(engineState.teams?.B)) issues.push('engine_teams');
  if (!isPlainObject(engineState.stats) || !isPlainObject(engineState.stats?.players) || !isPlainObject(engineState.stats?.teams)) issues.push('engine_stats');
  if (!isPlainObject(engineState.activeTactics) || !engineState.activeTactics?.A || !engineState.activeTactics?.B) issues.push('engine_tactics');
  if (!isPlainObject(engineState.serverPlayerIndices)) issues.push('engine_servers');
  if (engineState.finished === true) issues.push('finished');

  const expectedA = ids(expectedTeams.A);
  const expectedB = ids(expectedTeams.B);
  if (expectedA.length && !sameIds(ids(engineState.teams?.A), expectedA)) issues.push('engine_participants_a');
  if (expectedB.length && !sameIds(ids(engineState.teams?.B), expectedB)) issues.push('engine_participants_b');

  return { valid: issues.length === 0, issues };
}

export function buildTournamentMatchCheckpoint({ tournament, match, teamA, teamB, engineState }) {
  if (!match?.id || !tournament?.id || !engineState) throw new Error('Contexto incompleto para checkpoint de torneio.');
  return {
    match_id: match.id,
    type: 'tournament',
    tournament_id: tournament.id,
    round: match.round,
    match_date: match.date,
    checkpoint_status: 'active',
    participant_ids: { A: ids(teamA), B: ids(teamB) },
    started_at: match.startedAt || new Date().toISOString(),
    engine_state: engineState,
  };
}

/** @param {any} checkpoint @param {any} context */
export function inspectTournamentMatchCheckpoint(checkpoint, context = {}) {
  const { careerId, careerDate, tournament, match, run, teamA, teamB } = context;
  const expectedA = ids(teamA);
  const expectedB = ids(teamB);
  const engineA = ids(checkpoint?.engine_state?.teams?.A);
  const engineB = ids(checkpoint?.engine_state?.teams?.B);
  const issues = [];
  if (!checkpoint) issues.push('missing');
  if (checkpoint?.career_id !== careerId) issues.push('career_id');
  if (checkpoint?.type !== 'tournament') issues.push('type');
  if (String(checkpoint?.tournament_id) !== String(tournament?.id)) issues.push('tournament_id');
  if (String(checkpoint?.match_id) !== String(match?.id)) issues.push('match_id');
  if (String(checkpoint?.round) !== String(match?.round)) issues.push('round');
  if (checkpoint?.checkpoint_status !== 'active') issues.push('status');
  if (checkpoint?.engine_state?.finished === true) issues.push('finished');
  if (!sameIds(checkpoint?.participant_ids?.A, expectedA) || !sameIds(checkpoint?.participant_ids?.B, expectedB)) issues.push('participants');
  if (!sameIds(engineA, expectedA) || !sameIds(engineB, expectedB)) issues.push('engine_participants');
  const currentRunMatch = getCurrentTournamentMatch(run);
  if (run && !['playing'].includes(run.status)) issues.push('tournament_status');
  if (run && currentRunMatch?.status !== 'playing') issues.push('tournament_match_status');
  if (run && String(currentRunMatch?.id) !== String(match?.id)) issues.push('tournament_current_match');
  const engineInspection = inspectResumableTournamentEngineState(checkpoint?.engine_state, { A: teamA, B: teamB });
  issues.push(...engineInspection.issues.filter((issue) => !issues.includes(issue)));
  return {
    valid: issues.length === 0,
    issues,
    diagnostic: {
      code: issues.length ? 'tournament_match_checkpoint_invalid' : 'tournament_match_checkpoint_valid',
      careerId: careerId || null,
      tournamentId: tournament?.id || null,
      careerDate: careerDate || null,
      round: match?.round || null,
      matchId: match?.id || null,
      checkpointMatchId: checkpoint?.match_id || null,
      checkpointRound: checkpoint?.round || null,
      checkpointStatus: checkpoint?.checkpoint_status || null,
      checkpointParticipants: checkpoint?.participant_ids || null,
      expectedParticipants: { A: expectedA, B: expectedB },
      hasEngineState: Boolean(checkpoint?.engine_state),
      issues,
    },
  };
}

/**
 * Entidade canônica consumida por todos os caminhos de resume. Nenhum caller
 * precisa recompor participantes pelo torneio e engine_state pelo checkpoint.
 */
export function buildTournamentRecoverySession(checkpoint, context = {}) {
  const { careerId, tournament, run, match = getCurrentTournamentMatch(run), teamA = [], teamB = [] } = context;
  const terminal = ['eliminated', 'champion', 'finished'].includes(run?.status) || match?.status === 'completed';
  const tournamentRecognizesMatch = Boolean(
    tournament?.id
    && match?.id
    && String(getCurrentTournamentMatch(run)?.id) === String(match.id)
    && !terminal,
  );
  const inspection = inspectTournamentMatchCheckpoint(checkpoint, { ...context, match, run, teamA, teamB });
  const status = inspection.valid
    ? 'resumable'
    : tournamentRecognizesMatch && (run?.status === 'playing' || match?.status === 'playing')
      ? 'restart_required'
      : 'orphaned';

  return {
    careerId: careerId || null,
    tournamentId: tournament?.id || null,
    matchId: match?.id || null,
    round: match?.round || checkpoint?.round || null,
    participants: { teamA, teamB, ids: { A: ids(teamA), B: ids(teamB) } },
    engineState: inspection.valid ? checkpoint.engine_state : null,
    checkpoint,
    status,
    issues: inspection.issues,
    diagnostic: inspection.diagnostic,
  };
}

export function shouldBlockCareerAdvanceForMatchRecovery(session) {
  return ['resumable', 'restart_required', 'resume_failed'].includes(session?.status);
}

export function buildTournamentRoundCoreOperations({
  matchRecord,
  profileId,
  playerPatch,
  event,
  eventPatch,
  tournament,
  tournamentPatch,
  mediaOperations = [],
}) {
  if (!matchRecord?.id || !profileId || !event?.id || !tournament?.id) throw new Error('Transição de rodada incompleta.');
  return [
    { type: 'upsert', entityName: 'Match', id: matchRecord.id, data: matchRecord },
    { type: 'playerUpdate', id: profileId, data: playerPatch || {} },
    { type: 'update', entityName: 'CalendarEvent', id: event.id, data: eventPatch || {} },
    { type: 'update', entityName: 'Tournament', id: tournament.id, data: tournamentPatch || {} },
    ...mediaOperations,
  ];
}

export function buildTournamentReturnRoute(tournamentId) {
  const query = new URLSearchParams({ tournament: String(tournamentId), mode: 'run' });
  return `/tournaments?${query.toString()}`;
}
