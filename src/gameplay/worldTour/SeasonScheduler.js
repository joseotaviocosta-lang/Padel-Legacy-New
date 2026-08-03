import { buildWeeklyCalendar } from './TournamentGenerator.js';
import { chooseTournament } from './TournamentSelectionAI.js';

export function resolveWorldTourWeek({ week, tournaments = [], athletes = [], simulateTournament } = {}) {
  const weekEvents = tournaments.filter((event) => Number(event.week) === Number(week));
  const assignments = new Map(weekEvents.map((event) => [event.id, []]));
  const resting = [];

  athletes.forEach((athlete) => {
    const choice = chooseTournament(weekEvents, athlete, { strategy: athlete.careerStrategy, currentRegion: athlete.currentRegion });
    if (choice.decision === 'play' && assignments.has(choice.tournament.id)) assignments.get(choice.tournament.id).push(athlete);
    else resting.push({ athlete, reason: choice.reason || 'Descanso estratégico.' });
  });

  const results = weekEvents.map((event) => ({
    tournament: event,
    entrants: assignments.get(event.id) || [],
    result: typeof simulateTournament === 'function' ? simulateTournament(event, assignments.get(event.id) || []) : null,
  }));

  return { week, events: weekEvents, results, resting, assignments };
}

export function getSeasonWeeks(tournaments = []) { return buildWeeklyCalendar(tournaments); }
