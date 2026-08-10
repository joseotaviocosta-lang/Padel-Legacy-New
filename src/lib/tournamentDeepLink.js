export const TOURNAMENT_DEEP_LINK_MODES = Object.freeze({
  DETAILS: 'details',
  RUN: 'run',
});

export const TOURNAMENT_DETAILS_NOTIFICATION_TYPES = Object.freeze([
  'TOURNAMENT_UPCOMING',
  'TOURNAMENT_REMINDER',
  'TOURNAMENT_AVAILABLE',
]);

export const TOURNAMENT_RUN_NOTIFICATION_TYPES = Object.freeze([
  'TOURNAMENT_MATCH_READY',
  'TOURNAMENT_ROUND_READY',
  'TOURNAMENT_CONTINUE',
]);

function declaredTournamentType(notification = {}) {
  const metadata = notification.metadata || {};
  return String(
    notification.notification_type
      || notification.destination?.type
      || metadata.notification_type
      || metadata.destination?.type
      || metadata.type
      || notification.message_type
      || '',
  ).trim().toUpperCase().replace(/[\s-]+/g, '_');
}

export function getTournamentNotificationMode(notification = {}) {
  const declaredType = declaredTournamentType(notification);
  if (TOURNAMENT_RUN_NOTIFICATION_TYPES.includes(declaredType)) return TOURNAMENT_DEEP_LINK_MODES.RUN;
  return TOURNAMENT_DEEP_LINK_MODES.DETAILS;
}

export function resolveTournamentOpenMode(requestedMode, hasActiveRun = false) {
  return requestedMode === TOURNAMENT_DEEP_LINK_MODES.RUN && hasActiveRun
    ? TOURNAMENT_DEEP_LINK_MODES.RUN
    : TOURNAMENT_DEEP_LINK_MODES.DETAILS;
}

