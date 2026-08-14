function ids(players = []) {
  return players.map((player) => String(player?.id || '')).filter(Boolean);
}

function sameIds(left = [], right = []) {
  return left.length === right.length && left.every((id, index) => String(id) === String(right[index]));
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
  const { careerId, careerDate, tournament, match, teamA, teamB } = context;
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
      issues,
    },
  };
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
