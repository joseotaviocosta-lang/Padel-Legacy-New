export const TOURNAMENT_REMINDER_MILESTONES = Object.freeze([7, 3, 1, 0]);

export function getTournamentReminderMilestone(daysUntilTournament) {
  const days = Number(daysUntilTournament);
  return TOURNAMENT_REMINDER_MILESTONES.includes(days) ? days : null;
}

export function tournamentReminderContextKey(tournamentId, milestone) {
  return `federation-tournament:${tournamentId}:upcoming:${milestone}-days`;
}

