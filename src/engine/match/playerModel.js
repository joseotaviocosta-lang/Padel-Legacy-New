import { createBehaviorProfile } from './PersonalityModel.js';
import { baseOverallRating } from '../../lib/attributes.js';

// Playthrough 5.26-B — o OVR-base vem da MESMA autoridade da UI
// (attributes.js:baseOverallRating). Antes, a média aqui dividia por 10
// chaves planas e tinha piso 1: o parceiro materializado e todo atleta do
// mundo (só `overall_rating`, sem atributos planos) entravam na partida com
// OVR 1, e templates parciais (6/10 atributos) com ~60% do OVR real.
// Só o INPUT mudou: os modificadores de contexto e o clamp abaixo são os
// mesmos de antes, e nenhuma fórmula de rally/probabilidade foi tocada.
function overallRating(profile) {
  if (!profile) return 0;
  const base = baseOverallRating(profile);
  // Sem nenhuma fonte de OVR: 0 → normalizePlayer aplica o fallback já
  // existente (`|| 50`), em vez de mascarar como OVR 1.
  if (base == null) return 0;
  let rating = base;
  if (profile._chemistryBonus) rating += Number(profile._chemistryBonus) || 0;
  // Playthrough 5.27-F — `_energyPenalty` NÃO entra mais aqui: a energia já é
  // aplicada por golpe no RallyEngine (`player.energy`). Somar também ao OVR
  // contava o mesmo conceito duas vezes, e só para o lado do jogador (o modal
  // monta `_energyPenalty`; parceiro e adversários não o recebem).
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
