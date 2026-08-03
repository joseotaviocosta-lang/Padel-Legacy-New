import { buildSeasonTournaments, getSeasonCircuitSummary, groupTournamentConflicts } from '@/lib/circuitCatalog.js';

export function generateWorldTourSeason({ year, seasonId = null } = {}) {
  if (!Number.isInteger(year)) throw new Error('TournamentGenerator: year inválido.');
  const tournaments = buildSeasonTournaments(year, seasonId);
  return {
    year,
    seasonId,
    tournaments,
    weeks: buildWeeklyCalendar(tournaments),
    summary: getSeasonCircuitSummary(tournaments),
    conflictWeeks: groupTournamentConflicts(tournaments),
  };
}

export function buildWeeklyCalendar(tournaments = []) {
  const weeks = new Map();
  tournaments.forEach((event) => {
    const week = Number(event.week || 0);
    if (!weeks.has(week)) weeks.set(week, []);
    weeks.get(week).push(event);
  });
  return [...weeks.entries()]
    .sort(([a], [b]) => a - b)
    .map(([week, events]) => ({
      week,
      conflictGroup: events[0]?.conflict_group || null,
      events: [...events].sort((a, b) => b.circuit_level - a.circuit_level),
      requiresChoice: events.length > 1,
    }));
}
