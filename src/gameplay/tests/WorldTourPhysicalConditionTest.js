import { calculateTournamentMatchLoad, buildPhysicalPatch, getCoachPhysicalRecommendation, calculateDailyRecovery } from '../worldTour/PhysicalConditionManager.js';
export function runWorldTourPhysicalConditionTest() {
  const profile = { id:'test', energy:42, fatigue:58, condition:70, age:31, matches_this_week:2, career_date:'2028-03-10' };
  const tournament = { id:'elite-test', name:'Legacy Elite Test', tier:'Elite', region:'Europa' };
  const load = calculateTournamentMatchLoad({ profile, tournament, roundLabel:'Semifinal', matchesThisWeek:2 });
  const report = buildPhysicalPatch({ profile, tournament, roundLabel:'Semifinal', won:true, matchesThisWeek:2, date:'2028-03-10' });
  const coach = getCoachPhysicalRecommendation(profile, tournament, 'Semifinal');
  const recovery = calculateDailyRecovery(profile);
  const result = { ok: load.energyCost > 20 && report.patch.energy < profile.energy && coach.injuryRisk > 0 && recovery.energyGain > 0, load, report, coach, recovery };
  console.table({ energyCost:load.energyCost, energyAfter:report.patch.energy, fatigueAfter:report.patch.fatigue, injuryRisk:Math.round(coach.injuryRisk*100)+'%', recovery:recovery.energyGain });
  return result;
}
if (typeof window !== 'undefined') window.PadelWorldTourPhysicalConditionTest = { run: runWorldTourPhysicalConditionTest };
