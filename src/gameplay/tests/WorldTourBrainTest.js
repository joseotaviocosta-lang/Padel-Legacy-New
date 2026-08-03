import { generateWorldTourSeason, chooseTournament, evaluateTournamentEntry, buildSeedings, resolveWorldTourWeek, processWeeklyRanking } from '@/gameplay/worldTour/index.js';

export function runWorldTourBrainTest() {
  const season = generateWorldTourSeason({ year: 2028, seasonId: 'brain-test' });
  const conflictWeek = season.weeks.find((item) => item.events.length === 3) || season.weeks.find((item) => item.events.length === 2);
  const athlete = { id:'a-180', rank:180, energy:82, age:24, careerStrategy:'ranking', currentRegion:'Europa' };
  const choice = chooseTournament(conflictWeek.events, athlete, { strategy:'ranking', currentRegion:'Europa' });
  const elite = season.tournaments.find((event) => event.tier === 'Elite');
  const entry = evaluateTournamentEntry(elite, athlete);
  const seeded = buildSeedings(Array.from({length:40}, (_, i) => ({ id:`a${i+1}`, rank:i+1 })), 32);
  const weekResult = resolveWorldTourWeek({ week: conflictWeek.week, tournaments:season.tournaments, athletes:[athlete, {...athlete,id:'a-40',rank:40,careerStrategy:'prestige'}] });
  const ranking = processWeeklyRanking({ ranking:[{athleteId:'a-180',points:100}], tournamentResults:[{athleteId:'a-180',tournament:conflictWeek.events[0],finish:'semifinal'}], week:conflictWeek.week, year:2028 });
  const result = {
    success:true, version:'0.6.1-alpha.1',
    modularSeason: season.tournaments.length >= 100 && season.weeks.length >= 45,
    weeklyChoice: conflictWeek.events.length >= 2,
    aiDecision: ['play','rest'].includes(choice.decision),
    entryPaths: Boolean(entry.path),
    correctSeeds: seeded.filter((x) => x.seed).length === 8,
    parallelResolution: weekResult.results.length === conflictWeek.events.length,
    rankingUpdated: ranking.ranking[0].points > 100 && ranking.history.length === 1,
    sample:{ week:conflictWeek.week, choice, entry, ranking:ranking.ranking[0] },
  };
  result.success = ['modularSeason','weeklyChoice','aiDecision','entryPaths','correctSeeds','parallelResolution','rankingUpdated'].every((key) => result[key]);
  return result;
}

export function setupWorldTourBrainTest() {
  if (typeof window !== 'undefined') window.PadelWorldTourBrainTest = { run:runWorldTourBrainTest };
}
