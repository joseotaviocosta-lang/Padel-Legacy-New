import { overallRating } from '@/lib/padel';

const number = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, value));

export function normalizePlayer(raw, team, index) {
  const overall = overallRating(raw) || 50;
  const style = String(raw?.play_style || raw?.style || 'Equilibrado').toLowerCase();
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
      courage: clamp(number(raw?.courage, style.includes('agress') ? 72 : 52)),
      discipline: clamp(number(raw?.discipline, style.includes('defens') ? 72 : 58)),
      creativity: clamp(number(raw?.creativity, style.includes('tát') ? 72 : 55)),
    },
    energy: clamp(number(raw?.energy, 100)),
    confidence: clamp(number(raw?.morale ?? raw?.confidence, 70)),
    position: { zone: 'back', side: index === 0 ? 'left' : 'right' },
  };
}

export function createTeams(teamA = [], teamB = []) {
  return {
    A: teamA.map((player, index) => normalizePlayer(player, 'A', index)),
    B: teamB.map((player, index) => normalizePlayer(player, 'B', index)),
  };
}
