import { createBehaviorProfile } from './PersonalityModel.js';

const ATTRIBUTE_KEYS = ['serve', 'forehand', 'backhand', 'volley', 'bandeja', 'smash', 'defense', 'agility', 'strategy', 'emotional_control'];

function overallRating(profile) {
  if (!profile) return 0;
  const sum = ATTRIBUTE_KEYS.reduce((total, key) => total + (Number(profile[key]) || 0), 0);
  let rating = Math.round(sum / ATTRIBUTE_KEYS.length);
  if (profile._chemistryBonus) rating += Number(profile._chemistryBonus) || 0;
  if (profile._energyPenalty) rating += Number(profile._energyPenalty) || 0;
  return Math.max(1, Math.min(100, rating));
}

const number = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, value));

export function normalizePlayer(raw, team, index) {
  const overall = overallRating(raw) || 50;
  const style = String(raw?.play_style || raw?.style || 'Equilibrado').toLowerCase();
  const behavior = createBehaviorProfile(raw);

  return {
    id: raw?.id || `${team}-${index}`,
    name: raw?.sport_name || raw?.name || `Jogador ${index + 1}`,
    team,
    side: index === 0 ? 'left' : 'right',
    style,
    overall,
    attributes: {
      serve: number(raw?.serve, overall),
      forehand: number(raw?.forehand, overall),
      backhand: number(raw?.backhand, overall),
      volley: number(raw?.volley, overall),
      bandeja: number(raw?.bandeja, overall),
      smash: number(raw?.smash, overall),
      defense: number(raw?.defense, overall),
      agility: number(raw?.agility, overall),
      strategy: number(raw?.strategy, overall),
      emotional: number(raw?.emotional_control, overall),
    },
    personality: {
      courage: behavior.axes.courage,
      discipline: behavior.axes.discipline,
      creativity: behavior.axes.creativity,
      aggression: behavior.axes.aggression,
      consistency: behavior.axes.consistency,
      emotionalStability: behavior.axes.emotional_stability,
      teamwork: behavior.axes.teamwork,
      tacticalIntelligence: behavior.axes.tactical_intelligence,
      riskTolerance: behavior.axes.risk_tolerance,
      adaptability: behavior.axes.adaptability,
    },
    behavior,
    energy: clamp(number(raw?.energy, 100)),
    confidence: clamp(number(raw?.morale ?? raw?.confidence, 70)),
    chemistry: clamp(number(raw?.chemistry ?? raw?.entrosamento ?? raw?.team_chemistry, 50)),
    position: { zone: 'back', side: index === 0 ? 'left' : 'right', lane: index === 0 ? 'left' : 'right' },
  };
}

export function createTeams(teamA = [], teamB = []) {
  return {
    A: teamA.map((player, index) => normalizePlayer(player, 'A', index)),
    B: teamB.map((player, index) => normalizePlayer(player, 'B', index)),
  };
}
