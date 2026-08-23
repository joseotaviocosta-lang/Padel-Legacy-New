const COMPLETED_INTERVIEW_STATUSES = new Set([
  'answered',
  'completed',
  'concluida',
  'concluido',
  'published',
  'resolvida',
]);

const UNAVAILABLE_INTERVIEW_STATUSES = new Set([
  ...COMPLETED_INTERVIEW_STATUSES,
  'cancelled',
  'cancelada',
  'expired',
  'expirada',
  'invalidated',
  'invalidada',
]);

function dateToken(value) {
  const token = String(value || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(token) ? token : null;
}

function normalizedStatus(interview) {
  return String(interview?.interview_status || interview?.status || '').trim().toLocaleLowerCase('pt-BR');
}

/**
 * Regra canônica de disponibilidade de entrevistas derivadas do estado da
 * carreira. Não consulta storage e pode ser reutilizada em geração, lista,
 * deep-link e CTA.
 */
export function isInterviewActionable(interview, careerDate) {
  if (!interview || typeof interview !== 'object') return false;
  if (!interview.id || !interview.sourceId || !interview.questionCategory) return false;
  if (!['interview', 'press_conference'].includes(interview.type)) return false;
  if (interview.actionable === false || interview.completed === true || interview.answered === true) return false;
  if (UNAVAILABLE_INTERVIEW_STATUSES.has(normalizedStatus(interview))) return false;

  const today = dateToken(careerDate);
  const availableFrom = dateToken(interview.availableFrom || interview.available_from || interview.available_career_date);
  const expiresAt = dateToken(interview.expiresAt || interview.expires_at || interview.expires_career_date);
  if (today && availableFrom && today < availableFrom) return false;
  if (today && expiresAt && today > expiresAt) return false;
  return true;
}

export function isInterviewCompleted(interview) {
  if (!interview || typeof interview !== 'object') return false;
  return interview.completed === true
    || interview.answered === true
    || COMPLETED_INTERVIEW_STATUSES.has(normalizedStatus(interview));
}

export function interviewContextKey(interview = {}) {
  if (interview.contextKey) return String(interview.contextKey);
  return interview.sourceId ? `press-interview:${interview.sourceId}` : null;
}

export function interviewNotificationIdentity(profileId, interview = {}) {
  const contextKey = interviewContextKey(interview);
  if (!profileId || !contextKey) return null;
  return {
    contextKey,
    messageId: `career-message-${profileId}-${contextKey}`
      .replace(/[^a-zA-Z0-9_-]/g, '-')
      .slice(0, 180),
  };
}

export function buildCompletedInterviewMessagePatch(interview, completedAt = new Date().toISOString(), existingMetadata = {}) {
  return {
    status: 'resolvida',
    is_read: true,
    is_new: false,
    resolved_at: completedAt,
    metadata: {
      ...existingMetadata,
      interview_id: interview?.id || null,
      interview_source_id: interview?.sourceId || null,
      interview_completed: true,
      interview_completed_at: completedAt,
    },
  };
}
