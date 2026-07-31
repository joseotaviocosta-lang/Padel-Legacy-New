import { base44 } from '@/api/base44Client';
import {
  ATTRIBUTES, ATTRIBUTE_KEYS, calculateTrainingGain, trainingGainChance,
  rollInjury, calculateAge, isInjured, isRetired,
  MAX_ENERGY, DAILY_TRAINING_LIMIT,
  incrementMissionProgress, todayStr,
} from '@/lib/padel';

// ── Training Categories ──────────────────────────────────────────────────
export const TRAINING_CATEGORIES = {
  technical: { id: 'technical', label: 'Técnico', icon: 'Target', color: 'text-cyan-400', dot: 'bg-cyan-500', description: 'Golpes e fundamentos específicos' },
  physical:  { id: 'physical', label: 'Físico', icon: 'Dumbbell', color: 'text-amber-400', dot: 'bg-amber-500', description: 'Condicionamento, força e agilidade' },
  tactical:  { id: 'tactical', label: 'Tático', icon: 'Brain', color: 'text-purple-400', dot: 'bg-purple-500', description: 'Estratégia e leitura de jogo' },
  mental:    { id: 'mental', label: 'Mental', icon: 'Flame', color: 'text-green-400', dot: 'bg-green-500', description: 'Controle emocional e foco' },
};

export const CATEGORY_ORDER = ['technical', 'physical', 'tactical', 'mental'];

// ── Intensity Levels ──────────────────────────────────────────────────────
// Each intensity has its own tradeoff: higher intensity = more gain but more
// fatigue, energy cost, injury risk, and potential morale hit.
export const INTENSITY_LEVELS = [
  {
    id: 'leve',
    label: 'Leve',
    energyCost: 8,
    fatigueCost: 8,
    gainMult: 0.6,
    injuryRisk: 0.01,
    moraleImpact: 3,
    color: 'text-green-400',
    description: 'Baixo desgaste, recuperação rápida',
  },
  {
    id: 'moderado',
    label: 'Moderado',
    energyCost: 12,
    fatigueCost: 16,
    gainMult: 1.0,
    injuryRisk: 0.03,
    moraleImpact: 0,
    color: 'text-primary',
    description: 'Equilíbrio entre ganho e desgaste',
  },
  {
    id: 'intenso',
    label: 'Intenso',
    energyCost: 18,
    fatigueCost: 28,
    gainMult: 1.5,
    injuryRisk: 0.07,
    moraleImpact: -4,
    color: 'text-red-400',
    description: 'Máximo ganho, alto desgaste e risco',
  },
];

// ── Training Activities ──────────────────────────────────────────────────
// Each activity targets a specific attribute. Activities in the same category
// share thematic effects (e.g. mental activities boost morale/confidence).
export const TRAINING_ACTIVITIES = [
  // Technical — one per technical attribute
  { id: 'serve_drill',     category: 'technical', label: 'Treino de Saque',     attribute: 'serve',           icon: 'Zap',          duration: 45, coins: 10, xp: 15, baseGain: 2 },
  { id: 'forehand_drill',  category: 'technical', label: 'Treino de Forehand',  attribute: 'forehand',        icon: 'ArrowUpRight', duration: 45, coins: 10, xp: 15, baseGain: 2 },
  { id: 'backhand_drill', category: 'technical', label: 'Treino de Backhand',  attribute: 'backhand',         icon: 'ArrowUpLeft', duration: 45, coins: 10, xp: 15, baseGain: 2 },
  { id: 'volley_drill',    category: 'technical', label: 'Treino de Voleio',    attribute: 'volley',           icon: 'Waves',       duration: 45, coins: 10, xp: 15, baseGain: 2 },
  { id: 'bandeja_drill',   category: 'technical', label: 'Treino de Bandeja',   attribute: 'bandeja',          icon: 'Circle',      duration: 45, coins: 10, xp: 15, baseGain: 2 },
  { id: 'smash_drill',     category: 'technical', label: 'Treino de Smash',     attribute: 'smash',            icon: 'Hammer',      duration: 45, coins: 10, xp: 15, baseGain: 2 },
  { id: 'defense_drill',   category: 'technical', label: 'Treino de Defesa',   attribute: 'defense',          icon: 'Shield',      duration: 45, coins: 10, xp: 15, baseGain: 2 },

  // Physical — agility + form
  { id: 'sprint_training',   category: 'physical', label: 'Treino de Velocidade', attribute: 'agility', icon: 'Gauge',     duration: 60, coins: 15, xp: 20, baseGain: 2, formBoost: 4 },
  { id: 'strength_training',  category: 'physical', label: 'Musculação',          attribute: 'agility', icon: 'Dumbbell',  duration: 60, coins: 15, xp: 20, baseGain: 1, formBoost: 6 },
  { id: 'endurance_training', category: 'physical', label: 'Resistência',         attribute: 'agility', icon: 'Heart',     duration: 75, coins: 15, xp: 20, baseGain: 1, formBoost: 5 },

  // Tactical — strategy + confidence
  { id: 'match_analysis',     category: 'tactical', label: 'Análise de Jogos',       attribute: 'strategy', icon: 'Brain', duration: 30, coins: 15, xp: 20, baseGain: 2, confidenceBoost: 3 },
  { id: 'court_positioning',  category: 'tactical', label: 'Posicionamento de Quadra', attribute: 'strategy', icon: 'Map',  duration: 45, coins: 15, xp: 20, baseGain: 2 },
  { id: 'opponent_study',     category: 'tactical', label: 'Estudo de Adversários',  attribute: 'strategy', icon: 'Eye',  duration: 30, coins: 15, xp: 20, baseGain: 1, confidenceBoost: 4 },

  // Mental — emotional_control + morale/confidence
  { id: 'meditation',       category: 'mental', label: 'Meditação',             attribute: 'emotional_control', icon: 'Flame', duration: 30, coins: 15, xp: 20, baseGain: 2, moraleBoost: 5, confidenceBoost: 2 },
  { id: 'pressure_drills',  category: 'mental', label: 'Simulação de Pressão',  attribute: 'emotional_control', icon: 'Zap',  duration: 45, coins: 15, xp: 20, baseGain: 2, fatigueExtra: 5 },
  { id: 'visualization',    category: 'mental', label: 'Visualização',         attribute: 'emotional_control', icon: 'Eye',  duration: 20, coins: 15, xp: 20, baseGain: 1, moraleBoost: 3, confidenceBoost: 3, fatigueReduction: 3 },
];

export const WEEKDAYS = [
  { id: 'seg', label: 'Seg', full: 'Segunda' },
  { id: 'ter', label: 'Ter', full: 'Terça' },
  { id: 'qua', label: 'Qua', full: 'Quarta' },
  { id: 'qui', label: 'Qui', full: 'Quinta' },
  { id: 'sex', label: 'Sex', full: 'Sexta' },
  { id: 'sab', label: 'Sáb', full: 'Sábado' },
  { id: 'dom', label: 'Dom', full: 'Domingo' },
];

// ── Diminishing Returns ───────────────────────────────────────────────────
// The more you train the same attribute in a week, the less you gain.
// This prevents spamming one attribute and encourages balanced training.
export function getDiminishingMultiplier(trainingsThisWeekOnAttr) {
  if (trainingsThisWeekOnAttr <= 1) return 1.0;
  if (trainingsThisWeekOnAttr === 2) return 0.75;
  if (trainingsThisWeekOnAttr === 3) return 0.50;
  return 0.30; // 4+ trainings on same attribute in a week = heavy diminishing
}

// ── Fatigue Effects ───────────────────────────────────────────────────────
export function getFatiguePenalty(fatigue) {
  if (fatigue < 20) return 0;
  if (fatigue < 40) return -1;
  if (fatigue < 60) return -2;
  if (fatigue < 80) return -3;
  return -5;
}

export function getFatigueInjuryModifier(fatigue) {
  if (fatigue < 30) return 0;
  if (fatigue < 50) return 0.02;
  if (fatigue < 70) return 0.05;
  return 0.10;
}

// ── Overtraining Detection ────────────────────────────────────────────────
export function getOvertrainingStatus(profile) {
  const fatigue = profile?.fatigue || 0;
  const energy = profile?.energy || 100;

  if (fatigue >= 80 || energy <= 15) {
    return { level: 'critical', label: 'Sobrecarga Crítica', color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/40', message: 'Risco altíssimo de lesão. Descanse imediatamente!' };
  }
  if (fatigue >= 60 || energy <= 30) {
    return { level: 'high', label: 'Sobrecarga Alta', color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/40', message: 'Fadiga elevada. Considere descansar ou treinar leve.' };
  }
  if (fatigue >= 40) {
    return { level: 'moderate', label: 'Fadiga Moderada', color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/40', message: 'Monitore sua carga de treino.' };
  }
  return { level: 'none', label: 'Em Forma', color: 'text-green-400', bg: 'bg-green-500/10', border: 'border-green-500/40', message: 'Pronto para treinar com intensidade.' };
}

// ── Condition Score ───────────────────────────────────────────────────────
export function getConditionScore(profile) {
  const energy = profile?.energy || 100;
  const fatigue = profile?.fatigue || 0;
  const morale = profile?.morale || 70;
  const confidence = profile?.confidence || 50;
  const form = profile?.form || 50;
  const score = (energy * 0.25) + ((100 - fatigue) * 0.25) + (morale * 0.20) + (confidence * 0.15) + (form * 0.15);
  return Math.round(score);
}

export function getConditionLabel(score) {
  if (score >= 80) return { label: 'Excelente', color: 'text-green-400' };
  if (score >= 60) return { label: 'Boa', color: 'text-primary' };
  if (score >= 40) return { label: 'Razoável', color: 'text-amber-400' };
  return { label: 'Ruim', color: 'text-red-400' };
}

// ── Predicted Gain ────────────────────────────────────────────────────────
// Shows the player what they can expect before committing to a training.
export function getPredictedGain(profile, activity, intensityId, trainingsThisWeekOnAttr = 0) {
  const intensity = INTENSITY_LEVELS.find(i => i.id === intensityId) || INTENSITY_LEVELS[1];
  const currentVal = Number(profile?.[activity.attribute]) || 0;
  const baseChance = trainingGainChance(currentVal) / 100;
  const dimMult = getDiminishingMultiplier(trainingsThisWeekOnAttr + 1);
  const fatigue = profile?.fatigue || 0;
  const fatiguePen = getFatiguePenalty(fatigue);

  const expectedBase = activity.baseGain * intensity.gainMult * dimMult;
  const expectedWithChance = expectedBase * baseChance;
  const adjusted = Math.max(0, expectedWithChance + fatiguePen);

  return {
    expected: Math.round(adjusted * 10) / 10,
    chance: Math.round(baseChance * dimMult * 100),
    diminishing: dimMult,
    fatiguePenalty: fatiguePen,
    currentVal,
    intensityMult: intensity.gainMult,
  };
}

// ── Career Calendar Week Helpers ─────────────────────────────────────────
// Training history must follow the in-game career calendar, not the computer's
// real date. A career week runs from Monday through Sunday.
function parseCareerDate(value) {
  if (!value) return null;
  const raw = String(value).slice(0, 10);
  const parts = raw.split('-').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
  const [year, month, day] = parts;
  const date = new Date(Date.UTC(year, month - 1, day));
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatCareerDate(date) {
  return date.toISOString().slice(0, 10);
}

function getCareerWeekRange(careerDate) {
  const reference = parseCareerDate(careerDate) || parseCareerDate(todayStr());
  const day = reference.getUTCDay(); // 0 = Sunday, 1 = Monday
  const daysSinceMonday = day === 0 ? 6 : day - 1;
  const start = new Date(reference);
  start.setUTCDate(start.getUTCDate() - daysSinceMonday);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  return { start, end, startStr: formatCareerDate(start), endStr: formatCareerDate(end) };
}

function sessionCareerDate(session) {
  return parseCareerDate(session?.date || session?.career_date || session?.created_date);
}

function isSessionInCareerWeek(session, careerDate) {
  const sessionDate = sessionCareerDate(session);
  if (!sessionDate) return false;
  const { start, end } = getCareerWeekRange(careerDate);
  return sessionDate >= start && sessionDate <= end;
}

// ── Count Trainings This Week on an Attribute ─────────────────────────────
export async function countTrainingsThisWeek(profileId, attribute, careerDate) {
  try {
    const sessions = await base44.entities.TrainingSession.filter({
      profile_id: profileId,
      attribute_target: attribute,
    });
    if (!sessions || sessions.length === 0) return 0;
    return sessions.filter(session => isSessionInCareerWeek(session, careerDate)).length;
  } catch {
    return 0;
  }
}

// ── Get Weekly Training Counts per Attribute ─────────────────────────────
export async function getWeeklyTrainingCounts(profileId, careerDate) {
  try {
    const sessions = await base44.entities.TrainingSession.filter({ profile_id: profileId });
    if (!sessions) return {};
    const counts = {};
    for (const session of sessions) {
      if (!isSessionInCareerWeek(session, careerDate)) continue;
      const attr = session.attribute_target;
      if (!attr) continue;
      counts[attr] = (counts[attr] || 0) + 1;
    }
    return counts;
  } catch {
    return {};
  }
}

// ── Execute Training Activity ─────────────────────────────────────────────
// Main entry point. Validates, calculates gains with diminishing returns and
// fatigue penalties, rolls for injury, persists everything, and returns
// a result object for the UI to display.
export async function executeTraining(profile, activity, intensityId, coachBonus = {}) {
  const intensity = INTENSITY_LEVELS.find(i => i.id === intensityId) || INTENSITY_LEVELS[1];
  const today = profile?.career_date || todayStr();

  // ── Validation ──
  if (isRetired(profile)) return { error: 'Você está aposentado! Sua carreira como jogador profissional terminou.' };
  if (isInjured(profile)) return { error: `Você está lesionado! Recupera em ${injuryRecoveryDays(profile)} dias.` };

  const doneToday = profile.trainings_today || 0;
  if (doneToday >= DAILY_TRAINING_LIMIT) return { error: 'Limite diário de treino atingido. Avance o dia!' };

  // Second training of the day costs 50% more energy
  const energyCost = Math.round(intensity.energyCost + (doneToday > 0 ? intensity.energyCost * 0.5 : 0));
  if ((profile.energy || 0) < energyCost) return { error: 'Energia insuficiente. Avance o dia para recuperar.' };

  // ── Calculate Gains ──
  const currentAttrVal = Number(profile[activity.attribute]) || 0;
  const baseGain = calculateTrainingGain(currentAttrVal);
  const fatigue = profile.fatigue || 0;

  const weekCount = await countTrainingsThisWeek(profile.id, activity.attribute, today);
  const dimMult = getDiminishingMultiplier(weekCount + 1);
  const fatiguePen = getFatiguePenalty(fatigue);

  let actualGain = Math.round(baseGain * intensity.gainMult * dimMult);
  actualGain = Math.max(0, actualGain + fatiguePen);

  // Coach bonus (extra gain on specialized attributes)
  if (coachBonus?.[activity.attribute]) {
    actualGain += Number(coachBonus[activity.attribute]) || 0;
  }

  const newAttrValue = Math.min(100, currentAttrVal + actualGain);

  // ── Condition Changes ──
  const conditionBefore = {
    energy: profile.energy || 100,
    fatigue: profile.fatigue || 0,
    morale: profile.morale || 70,
    confidence: profile.confidence || 50,
    form: profile.form || 50,
  };

  const newEnergy = Math.max(0, conditionBefore.energy - energyCost);
  const newFatigue = Math.min(100, fatigue + intensity.fatigueCost + (activity.fatigueExtra || 0) - (activity.fatigueReduction || 0));
  const moraleChange = (intensity.moraleImpact || 0) + (activity.moraleBoost || 0);
  const newMorale = Math.max(0, Math.min(100, conditionBefore.morale + moraleChange));
  const newConfidence = Math.max(0, Math.min(100, conditionBefore.confidence + (activity.confidenceBoost || 0)));
  const newForm = Math.max(0, Math.min(100, conditionBefore.form + (activity.formBoost || 0)));

  const conditionAfter = {
    energy: newEnergy,
    fatigue: newFatigue,
    morale: newMorale,
    confidence: newConfidence,
    form: newForm,
  };

  // ── Injury Roll ──
  let injured = false;
  let recoveryDays = 0;
  const injuryRisk = intensity.injuryRisk + getFatigueInjuryModifier(fatigue);
  if (Math.random() < injuryRisk) {
    injured = true;
    recoveryDays = 7 + Math.floor(Math.random() * 8);
  }

  // ── Persist Training Session ──
  await base44.entities.TrainingSession.create({
    profile_id: profile.id,
    training_type: activity.id,
    training_label: activity.label,
    category: activity.category,
    intensity: intensity.id,
    attribute_target: activity.attribute,
    attribute_gain: actualGain,
    xp_reward: activity.xp,
    coins_reward: activity.coins,
    energy_cost: energyCost,
    fatigue_cost: intensity.fatigueCost + (activity.fatigueExtra || 0),
    injury_risk: injuryRisk,
    condition_before: conditionBefore,
    condition_after: conditionAfter,
    duration_min: activity.duration,
    date: today,
  });

  // ── Update Profile ──
  const updates = {
    [activity.attribute]: newAttrValue,
    xp: (profile.xp || 0) + activity.xp,
    coins: (profile.coins || 0) + activity.coins,
    trainings_today: doneToday + 1,
    last_training_date: today,
    energy: newEnergy,
    fatigue: newFatigue,
    morale: newMorale,
    confidence: newConfidence,
    form: newForm,
  };

  if (injured) {
    const careerD = new Date((profile.career_date || '2026-01-01') + 'T00:00:00');
    const recoveryDate = new Date(careerD);
    recoveryDate.setDate(recoveryDate.getDate() + recoveryDays);
    updates.injured_until = recoveryDate.toISOString().slice(0, 10);
    updates.energy = 0;
    updates.fatigue = Math.min(100, newFatigue + 20);
  }

  const updated = await base44.entities.PlayerProfile.update(profile.id, updates);

  // ── Mission Progress ──
  await incrementMissionProgress(profile.id, 'complete_training');

  return {
    profile: updated,
    gain: actualGain,
    injured,
    recoveryDays,
    activity,
    intensity,
    conditionBefore,
    conditionAfter,
    diminishing: dimMult,
    fatiguePenalty: fatiguePen,
  };
}

// ── Development Goals ─────────────────────────────────────────────────────
export async function createGoal(profile, attribute, target, deadline) {
  const goals = profile.development_goals || [];
  const newGoal = {
    id: `goal_${Date.now()}`,
    attribute,
    target,
    deadline,
    created_date: profile.career_date || todayStr(),
    completed: false,
  };
  const updated = await base44.entities.PlayerProfile.update(profile.id, {
    development_goals: [...goals, newGoal],
  });
  return updated;
}

export async function deleteGoal(profile, goalId) {
  const goals = (profile.development_goals || []).filter(g => g.id !== goalId);
  const updated = await base44.entities.PlayerProfile.update(profile.id, {
    development_goals: goals,
  });
  return updated;
}

export function checkGoalCompletion(profile) {
  const goals = profile.development_goals || [];
  const completed = goals.filter(g => {
    if (g.completed) return false;
    const currentVal = Number(profile[g.attribute]) || 0;
    return currentVal >= g.target;
  });
  return completed;
}

// ── Weekly Planner Helpers ────────────────────────────────────────────────
export async function saveWeeklyPlan(profile, plan) {
  const updated = await base44.entities.PlayerProfile.update(profile.id, {
    weekly_training_plan: plan,
  });
  return updated;
}

export function getPlanSummary(plan) {
  if (!plan) return { totalActivities: 0, totalFatigue: 0, totalEnergy: 0, attributesFocused: {} };
  let totalActivities = 0;
  let totalFatigue = 0;
  let totalEnergy = 0;
  const attributesFocused = {};

  for (const day of WEEKDAYS) {
    const entry = plan[day.id];
    if (!entry || !entry.activity_id) continue;
    const activity = TRAINING_ACTIVITIES.find(a => a.id === entry.activity_id);
    const intensity = INTENSITY_LEVELS.find(i => i.id === entry.intensity) || INTENSITY_LEVELS[1];
    if (!activity) continue;
    totalActivities++;
    totalFatigue += intensity.fatigueCost + (activity.fatigueExtra || 0);
    totalEnergy += intensity.energyCost;
    attributesFocused[activity.attribute] = (attributesFocused[activity.attribute] || 0) + 1;
  }

  return { totalActivities, totalFatigue, totalEnergy, attributesFocused };
}

// Helper for injury recovery days (imported from padel.js to avoid circular deps)
function injuryRecoveryDays(profile) {
  if (!isInjured(profile)) return 0;
  const careerDate = new Date((profile?.career_date || '2026-01-01') + 'T00:00:00');
  const injuredUntil = new Date(profile.injured_until + 'T00:00:00');
  return Math.max(0, Math.ceil((injuredUntil - careerDate) / (1000 * 60 * 60 * 24)));
}