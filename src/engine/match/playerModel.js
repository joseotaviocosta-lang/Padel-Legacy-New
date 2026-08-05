import { createBehaviorProfile } from './PersonalityModel.js';

const ATTRIBUTE_KEYS = ['serve', 'forehand', 'backhand', 'volley', 'bandeja', 'smash', 'defense', 'agility', 'strategy', 'emotional_control'];

function overallRating(profile) {
  if (!profile) return 0;
  const sum = ATTRIBUTE_KEYS.reduce((total, key) => total + (Number(profile[key]) || 0), 0);
  let rating = Math.round(sum / ATTRIBUTE_KEYS.length);
  if (profile._chemistryBonus) rating += Number(profile._chemistryBonus) || 0;
  if (profile._energyPenalty) rating += Number(profile._energyPenalty) || 0;
  if (profile._coachMatchBonus) rating += Math.max(0, Math.min(3, Number(profile._coachMatchBonus) || 0));
  if (profile._partnerBondBonus) rating += Math.max(0, Math.min(2.5, Number(profile._partnerBondBonus) || 0));
  return Math.max(1, Math.min(100, rating));
}

const number = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, value));

export function normalizePlayer(raw, team, index) {
  const overall = overallRating(raw) || 50;
  const style = String(raw?.play_style || raw?.style || 'Equilibrado').toLowerCase();
  const behavior = createBehaviorProfile(raw);
  const rawSide = String(raw?.preferred_side || raw?.court_side || '').toLowerCase();
  const side = rawSide === 'left' || rawSide === 'esquerda' ? 'left' : rawSide === 'right' || rawSide === 'direita' ? 'right' : (index === 0 ? 'left' : 'right');

  return {
    id: raw?.id || `${team}-${index}`,
    name: raw?.sport_name || raw?.name || `Jogador ${index + 1}`,
    team,
    side,
    style,
    handedness: raw?.handedness || raw?.dominant_hand || 'right',
    tacticalRole: raw?.tactical_role || null,
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
    position: { zone: 'back', side, lane: side },
  };
}

export function createTeams(teamA = [], teamB = []) {
  return {
    A: teamA.map((player, index) => normalizePlayer(player, 'A', index)),
    B: teamB.map((player, index) => normalizePlayer(player, 'B', index)),
  };
}
