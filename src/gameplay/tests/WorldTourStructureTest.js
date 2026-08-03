import {
  WORLD_PLAYER_CAPACITY,
  buildSeasonTournaments,
  getSeasonCircuitSummary,
  getTournamentChoiceProfile,
  groupTournamentConflicts,
} from '@/lib/circuitCatalog.js';
import { getTournamentRewards, getTournamentRounds } from '@/lib/career.js';

export function runWorldTourStructureTest() {
  const events = buildSeasonTournaments(2027, 'season-world-tour-test');
  const summary = getSeasonCircuitSummary(events);
  const conflicts = groupTournamentConflicts(events);
  const tiers = new Set(events.map((event) => event.tier));
  const countries = new Set(events.map((event) => event.country));
  const regions = new Set(events.map((event) => event.world_region));
  const silver = events.find((event) => event.tier === 'Silver');
  const crown = events.find((event) => event.tier === 'Crown');
  const conflict = conflicts.find((group) => group.events.some((event) => event.tier === 'Elite' || event.tier === 'Crown')) || conflicts[0];
  const lowChoice = getTournamentChoiceProfile(conflict.events.find(e => ['Silver','Gold','Platinum'].includes(e.tier)) || conflict.events.at(-1), 320);
  const highChoice = getTournamentChoiceProfile(conflict.events.find(e => ['Elite','Crown','Masters'].includes(e.tier)) || conflict.events[0], 320);
  const silverEntry = getTournamentRewards('Silver', 0);
  const silverTitle = getTournamentRewards('Silver', getTournamentRounds(silver).length);
  const crownTitle = getTournamentRewards('Crown', getTournamentRounds(crown).length);

  const result = {
    success: true,
    version: '0.5.0-alpha.1',
    tournamentCount: events.length,
    allTiersReady: ['Silver','Gold','Platinum','Masters','Elite','Crown'].every(tier => tiers.has(tier)),
    globalCoverage: countries.size >= 25 && regions.size >= 6,
    countries: countries.size,
    regions: regions.size,
    conflictWeeks: conflicts.length,
    choicesRequired: conflicts.length >= 30 && conflicts.every(group => group.events.length >= 2),
    noRegionalScope: events.every(event => event.world_tour_event === true && !/regional/i.test(event.name)),
    scalablePlayerPool: events.every(event => event.expected_world_player_pool >= 5000 && event.participant_generation_mode === 'lazy'),
    capacityReady: WORLD_PLAYER_CAPACITY >= 5000,
    accessibleEntryTier: silver.min_ranking === 0 && silverEntry.rankPoints > 0,
    progressionCoherent: silverTitle.rankPoints < crownTitle.rankPoints,
    strategicTradeoff: lowChoice.titleChance > highChoice.titleChance && highChoice.prestige > lowChoice.prestige,
    deterministic: JSON.stringify(events) === JSON.stringify(buildSeasonTournaments(2027, 'season-world-tour-test')),
    summary,
    sampleConflict: conflict?.events.map(event => ({ name:event.name, tier:event.tier, date:event.start_date })) || [],
    choiceComparison: { accessible: lowChoice, prestige: highChoice },
  };
  result.success = Object.entries(result)
    .filter(([key]) => !['success','version','tournamentCount','countries','regions','conflictWeeks','summary','sampleConflict','choiceComparison'].includes(key))
    .every(([,value]) => value === true);
  return result;
}

export function setupWorldTourStructureTest() {
  if (typeof window === 'undefined') return;
  window.PadelWorldTourTest = { run: runWorldTourStructureTest };
  window.PadelCircuitSeasonTest = window.PadelWorldTourTest;
}
