import { fnv1aHash } from '@/lib/hashUtils.js';

const AXIS_NAMES = [
  'aggression',
  'discipline',
  'creativity',
  'courage',
  'consistency',
  'emotional_stability',
  'teamwork',
  'tactical_intelligence',
  'risk_tolerance',
  'adaptability',
  'net_preference',
  'lob_preference',
  'control_preference',
];

const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, Number(value) || 0));
const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;

function hashText(input) {
  return fnv1aHash(String(input || 'athlete'));
}

function seededAxis(key, axis, min = 38, max = 72) {
  return min + (hashText(`${key}:${axis}`) % (max - min + 1));
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function applyModifier(profile, axis, amount) {
  profile[axis] = clamp(profile[axis] + amount);
}

function applyPersonalityLabel(profile, label) {
  const value = normalizeText(label);
  if (!value) return;

  if (value.includes('compet')) {
    applyModifier(profile, 'aggression', 10);
    applyModifier(profile, 'courage', 9);
    applyModifier(profile, 'risk_tolerance', 4);
  }
  if (value.includes('calm') || value.includes('frio')) {
    applyModifier(profile, 'emotional_stability', 15);
    applyModifier(profile, 'consistency', 8);
    applyModifier(profile, 'risk_tolerance', -6);
  }
  if (value.includes('impuls') || value.includes('emocional')) {
    applyModifier(profile, 'aggression', 8);
    applyModifier(profile, 'risk_tolerance', 15);
    applyModifier(profile, 'consistency', -10);
    applyModifier(profile, 'emotional_stability', -12);
  }
  if (value.includes('lider')) {
    applyModifier(profile, 'teamwork', 14);
    applyModifier(profile, 'tactical_intelligence', 8);
    applyModifier(profile, 'courage', 5);
  }
  if (value.includes('perfeccion')) {
    applyModifier(profile, 'discipline', 14);
    applyModifier(profile, 'consistency', 12);
    applyModifier(profile, 'adaptability', -3);
  }
  if (value.includes('carism')) {
    applyModifier(profile, 'teamwork', 9);
    applyModifier(profile, 'emotional_stability', 4);
  }
  if (value.includes('reserv')) {
    applyModifier(profile, 'discipline', 6);
    applyModifier(profile, 'consistency', 5);
    applyModifier(profile, 'teamwork', -3);
  }
}

function applyPlayStyle(profile, style) {
  const value = normalizeText(style);
  if (value.includes('agress')) {
    applyModifier(profile, 'aggression', 13);
    applyModifier(profile, 'risk_tolerance', 9);
    applyModifier(profile, 'net_preference', 10);
  }
  if (value.includes('ofens') || value.includes('finaliz')) {
    applyModifier(profile, 'aggression', 12);
    applyModifier(profile, 'net_preference', 14);
    applyModifier(profile, 'courage', 7);
    applyModifier(profile, 'risk_tolerance', 8);
  }
  if (value.includes('construtor')) {
    applyModifier(profile, 'tactical_intelligence', 13);
    applyModifier(profile, 'control_preference', 13);
    applyModifier(profile, 'teamwork', 8);
  }
  if (value.includes('contra')) {
    applyModifier(profile, 'lob_preference', 10);
    applyModifier(profile, 'consistency', 9);
    applyModifier(profile, 'adaptability', 9);
  }
  if (value.includes('defens')) {
    applyModifier(profile, 'aggression', -8);
    applyModifier(profile, 'consistency', 10);
    applyModifier(profile, 'lob_preference', 14);
    applyModifier(profile, 'control_preference', 7);
  }
  if (value.includes('tatic')) {
    applyModifier(profile, 'tactical_intelligence', 15);
    applyModifier(profile, 'adaptability', 10);
    applyModifier(profile, 'risk_tolerance', -4);
    applyModifier(profile, 'control_preference', 10);
  }
  if (value.includes('pot')) {
    applyModifier(profile, 'aggression', 10);
    applyModifier(profile, 'courage', 6);
    applyModifier(profile, 'net_preference', 11);
    applyModifier(profile, 'risk_tolerance', 7);
  }
  if (value.includes('equilibr')) {
    applyModifier(profile, 'adaptability', 7);
    applyModifier(profile, 'teamwork', 4);
    applyModifier(profile, 'control_preference', 4);
  }
  if (value.includes('controle')) {
    applyModifier(profile, 'discipline', 8);
    applyModifier(profile, 'consistency', 8);
    applyModifier(profile, 'control_preference', 15);
    applyModifier(profile, 'risk_tolerance', -6);
  }
  if (value.includes('rede')) {
    applyModifier(profile, 'net_preference', 18);
    applyModifier(profile, 'aggression', 7);
  }
  if (value.includes('lob')) {
    applyModifier(profile, 'lob_preference', 18);
    applyModifier(profile, 'tactical_intelligence', 5);
  }
}

function resolveArchetype(profile) {
  const candidates = [
    ['finalizador', profile.aggression + profile.net_preference + profile.courage],
    ['estrategista', profile.tactical_intelligence + profile.adaptability + profile.control_preference],
    ['muralha', profile.consistency + profile.discipline + profile.lob_preference],
    ['criador', profile.creativity + profile.risk_tolerance + profile.adaptability],
    ['lider', profile.teamwork + profile.emotional_stability + profile.courage],
  ].sort((a, b) => b[1] - a[1]);

  const [id] = candidates[0];
  const labels = {
    finalizador: 'Finalizador',
    estrategista: 'Estrategista',
    muralha: 'Muralha',
    criador: 'Criador',
    lider: 'Líder de dupla',
  };
  return { id, label: labels[id] };
}

function createTendencies(profile) {
  return {
    attack: clamp(Math.round(profile.aggression * 0.55 + profile.courage * 0.25 + profile.net_preference * 0.2)),
    defense: clamp(Math.round(profile.consistency * 0.45 + profile.discipline * 0.3 + profile.lob_preference * 0.25)),
    control: clamp(Math.round(profile.control_preference * 0.45 + profile.tactical_intelligence * 0.35 + profile.discipline * 0.2)),
    improvisation: clamp(Math.round(profile.creativity * 0.6 + profile.risk_tolerance * 0.25 + profile.adaptability * 0.15)),
    pressure_resistance: clamp(Math.round(profile.emotional_stability * 0.5 + profile.courage * 0.3 + profile.consistency * 0.2)),
    partnership: clamp(Math.round(profile.teamwork * 0.65 + profile.adaptability * 0.2 + profile.emotional_stability * 0.15)),
  };
}

export function createBehaviorProfile(raw = {}) {
  const key = raw.bot_id || raw.id || raw.sport_name || raw.name || 'athlete';
  const explicit = raw.behavior_axes || raw.behavior || {};
  const profile = {};

  for (const axis of AXIS_NAMES) {
    const snake = explicit[axis];
    const direct = raw[axis];
    profile[axis] = clamp(finite(snake ?? direct, seededAxis(key, axis)));
  }

  profile.discipline = clamp(finite(raw.discipline, profile.discipline));
  profile.creativity = clamp(finite(raw.creativity, profile.creativity));
  profile.courage = clamp(finite(raw.courage, profile.courage));
  profile.emotional_stability = clamp(
    finite(raw.emotional_stability ?? raw.emotional_control, profile.emotional_stability),
  );
  profile.tactical_intelligence = clamp(
    finite(raw.tactical_intelligence ?? raw.strategy, profile.tactical_intelligence),
  );

  applyPersonalityLabel(profile, raw.personality_label || raw.personality || raw.temperament);
  applyPlayStyle(profile, raw.play_style || raw.style);
  applyPlayStyle(profile, raw.tactical_role);

  for (const axis of AXIS_NAMES) profile[axis] = clamp(Math.round(profile[axis]));

  const inferredArchetype = resolveArchetype(profile);
  const archetype = raw.archetype_id
    ? { id: raw.archetype_id, label: raw.archetype_label || inferredArchetype.label }
    : inferredArchetype;
  const tendencies = createTendencies(profile);

  return {
    version: '0.4.0',
    axes: profile,
    archetype,
    tendencies,
    preferredSide: raw.preferred_side || raw.court_side || null,
    pressureProfile: raw.pressure_profile || (
      tendencies.pressure_resistance >= 75
        ? 'Especialista em decisões'
        : tendencies.pressure_resistance >= 60
          ? 'Confiável sob pressão'
          : tendencies.pressure_resistance >= 45
            ? 'Oscila em momentos grandes'
            : 'Vulnerável sob pressão'
    ),
  };
}

export function behaviorProfileEquals(a, b) {
  return JSON.stringify(createBehaviorProfile(a)) === JSON.stringify(createBehaviorProfile(b));
}

export { AXIS_NAMES };
