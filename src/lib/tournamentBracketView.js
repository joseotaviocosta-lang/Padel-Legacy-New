const COMPLETED_STATUSES = new Set(['finalizado', 'completed', 'concluido', 'finished', 'champion']);

function normalizeDate(value) {
  const date = String(value || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

export function isTournamentCompletedAt(tournament, careerDate) {
  const status = String(tournament?.status || '').toLowerCase();
  const phase = String(tournament?.current_phase || '').toLowerCase();
  const date = normalizeDate(tournament?.start_date);
  const today = normalizeDate(careerDate);
  if (today && date && date > today) return false;
  return COMPLETED_STATUSES.has(status)
    || COMPLETED_STATUSES.has(phase)
    || Boolean(tournament?.champion && (!today || !date || date < today))
    || Boolean(tournament?.completed_date && (!today || tournament.completed_date <= today));
}

export function isTournamentFutureOrPending(tournament, careerDate) {
  return !isTournamentCompletedAt(tournament, careerDate);
}

export function sanitizeBracketHistory(tournament, careerDate) {
  const history = Array.isArray(tournament?.bracket_history) ? tournament.bracket_history : [];
  const pending = isTournamentFutureOrPending(tournament, careerDate);
  return history.map((round) => ({
    ...round,
    status: pending ? 'scheduled' : round.status,
    matches: (Array.isArray(round?.matches) ? round.matches : []).map((match) => pending ? {
      ...match,
      score: null,
      winner: null,
      eliminated: null,
      champion: null,
      status: 'scheduled',
    } : { ...match }),
  }));
}

export function visibleTournamentChampion(tournament, careerDate) {
  return isTournamentCompletedAt(tournament, careerDate) ? tournament?.champion || null : null;
}
