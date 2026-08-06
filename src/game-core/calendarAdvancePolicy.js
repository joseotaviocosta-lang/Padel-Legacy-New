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

export function shouldBlockBeforeAdvance(event, date) {
  return eventOccursOn(event, date) && isActionableCalendarDecision(event);
}

export function getInjuryAutoResolution(event, date) {
  if (!eventOccursOn(event, date)) return null;

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
