const OFFICIAL_TOURNAMENT_MATCH_TYPES = new Set([
  'tournament',
  'official_tournament',
  'official-tournament',
  'qualifying',
]);

const NON_OFFICIAL_MATCH_TYPES = new Set([
  'practice',
  'training',
  'training_match',
  'friendly',
  'sparring',
  'exhibition',
  'simulated',
  'simulation',
  'simulada',
  'amistoso',
  'treino',
  'pratica',
]);

const COMPLETED_MATCH_STATUSES = new Set([
  'completed',
  'finished',
  'played',
  'concluido',
  'finalizado',
]);

const CANCELLED_MATCH_STATUSES = new Set([
  'cancelled',
  'canceled',
  'cancelado',
  'scheduled',
  'agendado',
  'registered',
  'inscrito',
]);

const NON_PLAYED_RESULT_METHODS = new Set([
  'walkover',
  'wo',
  'w/o',
  'no_show',
  'absence',
  'ausencia',
]);

function normalizeToken(value) {
  return String(value || '')
    .trim()
    .toLocaleLowerCase('pt-BR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_');
}

function structuredMatchType(match = {}) {
  return normalizeToken(
    match.match_type
    || match.matchType
    || match.competition_type
    || match.competitionType
    || match.event_type
    || match.eventType
    || match.mode
    || match.type
  );
}

/**
 * Whitelist canônica para entrevistas pós-jogo.
 *
 * O fluxo atual persiste partidas oficiais com `match_type` igual a
 * `tournament`/`qualifying` e com `tournament_id`. Flags estruturadas antigas
 * continuam aceitas para não quebrar saves, mas nomes/títulos nunca entram na
 * decisão.
 */
export function isOfficialTournamentMatch(match = {}) {
  if (!match || typeof match !== 'object') return false;
  if (match.is_official === false || match.isOfficial === false) return false;

  const type = structuredMatchType(match);
  if (NON_OFFICIAL_MATCH_TYPES.has(type)) return false;
  if (OFFICIAL_TOURNAMENT_MATCH_TYPES.has(type)) return true;

  return Boolean(
    match.is_tournament === true
    || match.isTournament === true
    || match.official_tournament === true
    || match.officialTournament === true
    || match.tournament_id
    || match.tournamentId
    || match.registration_id
    || match.registrationId
  );
}

export function resolveOfficialPlayerOutcome(match = {}) {
  const explicit = normalizeToken(match.result || match.player_result || match.playerResult || match.outcome);
  if (['vitoria', 'win', 'won'].includes(explicit)) return 'win';
  if (['derrota', 'loss', 'lost'].includes(explicit)) return 'loss';
  if (match.player_won === true || match.is_winner === true) return 'win';
  if (match.player_won === false || match.is_winner === false) return 'loss';
  if (match.profile_id && (match.winner_id === match.profile_id || match.winner_player_id === match.profile_id)) return 'win';
  if (match.profile_id && (match.loser_id === match.profile_id || match.loser_player_id === match.profile_id)) return 'loss';
  return null;
}

export function didOfficialMatchOccur(match = {}) {
  const status = normalizeToken(match.status);
  if (CANCELLED_MATCH_STATUSES.has(status) || match.match_occurred === false || match.matchOccurred === false) return false;

  const resultMethod = normalizeToken(match.result_method || match.resultMethod || match.completion_reason);
  if (NON_PLAYED_RESULT_METHODS.has(resultMethod) && match.match_occurred !== true && match.matchOccurred !== true) return false;

  const outcome = resolveOfficialPlayerOutcome(match);
  if (!outcome) return false;
  const hasRecordedResult = Boolean(
    match.result
    || match.player_result
    || match.playerResult
    || match.outcome
    || match.winner_id
    || match.winner_player_id
    || match.loser_id
    || match.loser_player_id
    || match.score
    || (Array.isArray(match.set_scores) && match.set_scores.length > 0)
    || (Array.isArray(match.sets) && match.sets.length > 0)
  );
  return hasRecordedResult && (COMPLETED_MATCH_STATUSES.has(status) || Boolean(status) === false || match.match_occurred === true || match.matchOccurred === true);
}

export function isOfficialPlayerTournamentResult(match, profile) {
  if (!profile?.id || !match?.id) return false;
  return match.profile_id === profile.id
    && isOfficialTournamentMatch(match)
    && didOfficialMatchOccur(match);
}

export function postMatchInterviewIdentity(matchId) {
  if (!matchId) return null;
  const key = String(matchId);
  return {
    id: `interview_match_${key}`,
    sourceId: `match:${key}`,
    relatedEvent: `Partida:${key}`,
    contextKey: `press-interview:match:${key}`,
  };
}

export function postMatchInterviewMessageId(profileId, matchId) {
  const identity = postMatchInterviewIdentity(matchId);
  if (!profileId || !identity) return null;
  return `career-message-${profileId}-${identity.contextKey}`
    .replace(/[^a-zA-Z0-9_-]/g, '-')
    .slice(0, 180);
}

export function isPostMatchInterview(interview = {}) {
  return ['post_win', 'post_loss'].includes(interview.questionCategory)
    || String(interview.sourceId || '').startsWith('match:')
    || String(interview.id || '').startsWith('interview_match_');
}

export function matchIdFromInterview(interview = {}) {
  if (interview.matchId) return String(interview.matchId);
  if (String(interview.sourceId || '').startsWith('match:')) return String(interview.sourceId).slice(6);
  if (String(interview.id || '').startsWith('interview_match_')) return String(interview.id).slice(16);
  return null;
}

export function matchIdFromInterviewMessage(message = {}) {
  const metadata = message.metadata || {};
  if (metadata.match_id) return String(metadata.match_id);
  const sourceId = metadata.interview_source_id;
  if (String(sourceId || '').startsWith('match:')) return String(sourceId).slice(6);
  if (message.related_entity_type === 'PressInterview' && String(message.related_entity_id || '').startsWith('interview_match_')) {
    return String(message.related_entity_id).slice(16);
  }
  return null;
}

export function isPostMatchInterviewMessage(message = {}) {
  return message.related_entity_type === 'PressInterview'
    && Boolean(matchIdFromInterviewMessage(message));
}

export function findOfficialInterviewMatch(interview, matches = [], profile) {
  if (!isPostMatchInterview(interview)) return null;
  const matchId = matchIdFromInterview(interview);
  const match = (matches || []).find((item) => String(item?.id) === matchId);
  return isOfficialPlayerTournamentResult(match, profile) ? match : null;
}

export function isValidPostMatchInterviewMessage(message, matches = [], profile) {
  if (!isPostMatchInterviewMessage(message)) return true;
  const matchId = matchIdFromInterviewMessage(message);
  const match = (matches || []).find((item) => String(item?.id) === matchId);
  // Uma janela parcial de partidas não autoriza invalidar histórico antigo.
  // Só descartamos quando o registro-fonte existe e prova que era não oficial.
  if (!match) return true;
  return isOfficialPlayerTournamentResult(match, profile);
}

export function buildOfficialInterviewProgressPatch(profile, interview, matches = []) {
  if (!findOfficialInterviewMatch(interview, matches, profile)) return {};
  if ((profile.processed_press_interview_sources || []).includes(interview.sourceId)) return {};
  return {
    interviews_given: Number(profile.interviews_given || 0) + 1,
    media_appearances: Number(profile.media_appearances || 0) + 1,
  };
}
