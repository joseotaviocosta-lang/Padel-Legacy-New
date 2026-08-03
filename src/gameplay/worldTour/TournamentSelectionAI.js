import { getTournamentChoiceProfile } from '@/lib/circuitCatalog.js';
import { evaluateTournamentEntry } from './EntryManager.js';

export const CAREER_STRATEGIES = Object.freeze({
  MONEY: 'money', RANKING: 'ranking', PRESTIGE: 'prestige', EXPERIENCE: 'experience', BALANCED: 'balanced',
});

const WEIGHTS = Object.freeze({
  money: { net: .55, points: .12, prestige: .08, title: .15, fatigue: .10 },
  ranking: { net: .08, points: .52, prestige: .12, title: .18, fatigue: .10 },
  prestige: { net: .05, points: .18, prestige: .52, title: .15, fatigue: .10 },
  experience: { net: .08, points: .16, prestige: .08, title: .50, fatigue: .18 },
  balanced: { net: .20, points: .25, prestige: .20, title: .25, fatigue: .10 },
});

export function evaluateTournamentChoice(tournament, athlete = {}, context = {}) {
  const entry = evaluateTournamentEntry(tournament, athlete);
  const profile = getTournamentChoiceProfile(tournament, athlete.rank || athlete.teamRank || 0);
  const energy = Number(athlete.energy ?? 100);
  const travelLoad = tournament?.world_region && context.currentRegion && tournament.world_region !== context.currentRegion ? 7 : 2;
  const duration = Math.max(3, Number(tournament?.end_date && tournament?.start_date ?
    (new Date(tournament.end_date) - new Date(tournament.start_date)) / 86400000 + 1 : 5));
  const fatigueIncrease = Math.round(Math.min(35, duration * 1.6 + travelLoad + Math.max(0, 60 - energy) * .12));
  const semifinalChance = Math.min(95, Math.round(profile.titleChance * 1.5 + 8));
  const finalChance = Math.min(88, Math.round(profile.titleChance * 1.23 + 4));
  return { tournament, entry, ...profile, semifinalChance, finalChance, fatigueIncrease };
}

export function chooseTournament(events = [], athlete = {}, context = {}) {
  const strategy = context.strategy || athlete.careerStrategy || CAREER_STRATEGIES.BALANCED;
  const weights = WEIGHTS[strategy] || WEIGHTS.balanced;
  const options = events.map((event) => evaluateTournamentChoice(event, athlete, context))
    .filter((option) => option.entry.eligible)
    .map((option) => ({ ...option, score: scoreOption(option, weights) }))
    .sort((a, b) => b.score - a.score);

  const restScore = Math.max(0, 80 - Number(athlete.energy ?? 100)) * 1.4 + Number(context.injuryRisk || 0);
  if (!options.length || (restScore > (options[0]?.score || 0) && context.allowRest !== false)) {
    return { decision: 'rest', reason: 'Recuperação oferece melhor valor para a carreira.', options, restScore };
  }
  return { decision: 'play', tournament: options[0].tournament, analysis: options[0], options, restScore };
}

function scoreOption(option, weights) {
  const normalizedNet = Math.max(0, Math.min(100, 50 + option.expectedNet / 150));
  const normalizedPoints = Math.max(0, Math.min(100, option.expectedPoints / 8));
  return Math.round(
    normalizedNet * weights.net + normalizedPoints * weights.points + option.prestige * weights.prestige +
    option.titleChance * weights.title - option.fatigueIncrease * weights.fatigue
  );
}
