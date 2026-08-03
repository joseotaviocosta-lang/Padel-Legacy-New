import { overallRating, levelForXp } from '@/lib/padel';
import { buildAthleteCatalog } from '@/players/athleteCatalog.js';

export const BOT_DIFFICULTIES = [
  { id: 'iniciante', label: 'Iniciante', base: 12, min: 1, max: 24, pill: 'bg-slate-500/15 text-slate-300' },
  { id: 'amador', label: 'Amador', base: 28, min: 25, max: 39, pill: 'bg-green-500/15 text-green-300' },
  { id: 'competitivo', label: 'Competitivo', base: 42, min: 40, max: 54, pill: 'bg-cyan-500/15 text-cyan-300' },
  { id: 'avancado', label: 'Avançado', base: 58, min: 55, max: 69, pill: 'bg-blue-500/15 text-blue-300' },
  { id: 'elite', label: 'Elite', base: 75, min: 70, max: 84, pill: 'bg-purple-500/15 text-purple-300' },
  { id: 'lenda', label: 'Lenda', base: 90, min: 85, max: 100, pill: 'bg-amber-500/15 text-amber-300' },
];

const catalog = buildAthleteCatalog();
const compatibilityBot = athlete => ({
  ...athlete,
  bot_id: athlete.template_id,
  position: athlete.position,
  level: BOT_DIFFICULTIES.find(tier => athlete.overall_rating >= tier.min && athlete.overall_rating <= tier.max)?.label || 'Iniciante',
  ...athlete.attributes,
});

export const BOTS_BY_DIFFICULTY = Object.fromEntries(BOT_DIFFICULTIES.map(tier => [
  tier.id,
  catalog.filter(athlete => athlete.overall_rating >= tier.min && athlete.overall_rating <= tier.max).map(compatibilityBot),
]));

export function getDifficultyForPlayer(profile) {
  const index = Math.max(0, BOT_DIFFICULTIES.findIndex(tier => tier.label === levelForXp(profile?.xp || 0)));
  return BOT_DIFFICULTIES[Math.max(0, index + (Math.random() < 0.5 ? 0 : -1))].id;
}

export function getRandomBots(difficultyId, count = 2, excludeIds = []) {
  const pool = BOTS_BY_DIFFICULTY[difficultyId] || BOTS_BY_DIFFICULTY.iniciante;
  return pool.filter(bot => !excludeIds.includes(bot.id)).map(bot => ({ bot, order: Math.random() })).sort((a, b) => a.order - b.order).slice(0, count).map(item => item.bot);
}

export function getDifficulty(difficultyId) { return BOT_DIFFICULTIES.find(tier => tier.id === difficultyId) || BOT_DIFFICULTIES[0]; }

export function simulateMatch(teamA, teamB) {
  const strength = team => team?.length ? team.reduce((sum, player) => sum + overallRating(player), 0) / team.length : 10;
  const strengthA = strength(teamA);
  const strengthB = strength(teamB);
  const difference = strengthA - strengthB;
  const winnerA = Math.random() < 1 / (1 + Math.exp(-difference / 12));
  const loserScore = Math.floor(Math.random() * (Math.min(5, Math.max(0, Math.round(5 - Math.abs(difference) / 8))) + 1));
  return { winner: winnerA ? 'A' : 'B', score_a: winnerA ? 6 : loserScore, score_b: winnerA ? loserScore : 6, strengthA: Math.round(strengthA), strengthB: Math.round(strengthB) };
}

const XP_FORMULAS = {
  iniciante: rating => Math.round(rating * 30), amador: rating => Math.round(500 + (rating - 26) * 150),
  competitivo: rating => Math.round(3000 + (rating - 40) * 400), avancado: rating => Math.round(10000 + (rating - 56) * 800),
  elite: rating => Math.round(25000 + (rating - 70) * 1200), lenda: rating => Math.round(50000 + (rating - 81) * 1500),
};

export function getAllBotsAsProfiles() {
  return BOT_DIFFICULTIES.flatMap(tier => (BOTS_BY_DIFFICULTY[tier.id] || []).map(bot => ({ ...bot, sport_name: bot.name, xp: XP_FORMULAS[tier.id](overallRating(bot)) || 0 })));
}

export { applyMatchRewards } from '@/lib/padel';
