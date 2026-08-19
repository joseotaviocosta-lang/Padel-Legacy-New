/**
 * Regras puras para os atalhos de avanço do calendário.
 * Mantidas sem dependências para permitir testes rápidos fora do navegador.
 */
export function eventOccursOn(event, date) {
  if (!event || event.status !== 'scheduled' || !event.start_date || !date) return false;
  const end = event.end_date || event.start_date;
  return event.start_date <= date && end >= date;
}

export function isActionableCalendarDecision(event) {
  if (!event || event.status !== 'scheduled') return false;
  if (event.metadata?.planner_created) return false;
  // Somente eventos que declaram explicitamente uma decisão pendente podem
  // interromper avanços em lote. Campos legados como is_mandatory e
  // decision_type, isoladamente, não significam que o jogador precise agir.
  return event.requires_decision === true;
}

export const CALENDAR_DECISION_STATE = Object.freeze({
  FUTURE: 'future',
  DUE_TODAY: 'dueToday',
  OVERDUE: 'overdue',
});

const TERMINAL_TOURNAMENT_RUN_STATUSES = new Set(['eliminated', 'champion', 'finished']);

function toIsoCareerDate(value) {
  const match = String(value || '').match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] || null;
}

/**
 * Data oficial da pendencia de torneio.
 *
 * Saves anteriores podem conservar CalendarEvent.start_date na rodada ja
 * disputada. Quando ha um run ativo, a partida indicada por currentRound e a
 * fonte canonica; o evento externo permanece apenas como fallback legado.
 */
export function getTournamentCommitmentDate(event) {
  if (!event || event.event_type !== 'tournament') return null;
  const run = event.metadata?.tournament_run || null;
  if (run && TERMINAL_TOURNAMENT_RUN_STATUSES.has(run.status)) return null;
  const currentRound = Number(run?.currentRound || 0);
  const currentMatch = Array.isArray(run?.matches) ? run.matches[currentRound] : null;
  return toIsoCareerDate(currentMatch?.date)
    || toIsoCareerDate(event.metadata?.next_round_date)
    || toIsoCareerDate(event.start_date);
}

export function getCalendarDecisionState(event, careerDate) {
  if (!isActionableCalendarDecision(event)) return null;
  const currentDate = toIsoCareerDate(careerDate);
  const commitmentDate = event.event_type === 'tournament'
    ? getTournamentCommitmentDate(event)
    : toIsoCareerDate(event.start_date);
  if (!currentDate || !commitmentDate) return null;
  if (commitmentDate > currentDate) return CALENDAR_DECISION_STATE.FUTURE;
  if (commitmentDate === currentDate) return CALENDAR_DECISION_STATE.DUE_TODAY;
  return CALENDAR_DECISION_STATE.OVERDUE;
}

export function shouldBlockBeforeAdvance(event, date) {
  if (event?.event_type === 'tournament') {
    const state = getCalendarDecisionState(event, date);
    return state === CALENDAR_DECISION_STATE.DUE_TODAY
      || state === CALENDAR_DECISION_STATE.OVERDUE;
  }
  return eventOccursOn(event, date) && isActionableCalendarDecision(event);
}

export function getInjuryAutoResolution(event, date) {
  const occursOnDate = event?.event_type === 'tournament'
    ? getCalendarDecisionState(event, date) === CALENDAR_DECISION_STATE.DUE_TODAY
    : eventOccursOn(event, date);
  if (!occursOnDate) return null;

  if (event.event_type === 'tournament') {
    return {
      status: 'missed',
      requires_decision: false,
      injury_resolution: 'tournament_missed',
    };
  }

  if (event.metadata?.planner_created || event.event_type === 'training_camp') {
    return {
      status: 'cancelled',
      requires_decision: false,
      injury_resolution: 'activity_cancelled',
    };
  }

  return null;
}
