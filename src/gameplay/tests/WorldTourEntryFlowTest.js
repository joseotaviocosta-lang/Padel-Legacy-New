import { buildAthleteEntryContext, ENTRY_PATHS, evaluateTournamentEntry } from '../worldTour/EntryManager.js';
import { hasScheduleConflict } from '@/lib/calendarSystem.js';

export function runWorldTourEntryFlowTest() {
  const elite = { id: 'elite-1', tier: 'Elite', min_ranking: 120, qualifying_size: 16, country: 'Espanha', start_date: '2028-03-10' };
  const direct = evaluateTournamentEntry(elite, buildAthleteEntryContext({ age: 25 }, 80, elite));
  const qualifying = evaluateTournamentEntry(elite, buildAthleteEntryContext({ age: 25 }, 180, elite));
  const blocked = evaluateTournamentEntry(elite, buildAthleteEntryContext({ age: 25 }, 500, elite));
  const wildcard = evaluateTournamentEntry(elite, buildAthleteEntryContext({ age: 25, wildcard_tokens: 1 }, 500, elite));
  const conflicts = hasScheduleConflict([
    { id: 'a', status: 'scheduled', start_date: '2028-03-10', end_date: '2028-03-16' },
  ], '2028-03-12', '2028-03-15');

  const checks = {
    direct: direct.path === ENTRY_PATHS.DIRECT && direct.eligible,
    qualifying: qualifying.path === ENTRY_PATHS.QUALIFYING && qualifying.eligible,
    blocked: blocked.path === ENTRY_PATHS.INELIGIBLE && !blocked.eligible,
    wildcard: wildcard.path === ENTRY_PATHS.WILDCARD && wildcard.eligible,
    conflict: conflicts.length === 1,
  };
  return { passed: Object.values(checks).every(Boolean), checks };
}

if (typeof window !== 'undefined') window.PadelWorldTourEntryFlowTest = { run: runWorldTourEntryFlowTest };
