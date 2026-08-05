import { localGame } from '@/api/localGameClient.js';
import { ATTRIBUTE_KEYS, isInjured, isRetired, incrementMissionProgress, todayStr } from '@/lib/padel';
import {
  TRAINING_GROUPS, TRAINING_GROUP_ORDER, TRAINING_INTENSITIES, TRAINING_FOCUSES,
  getTrainingFocus, getTrainingWeights, migrateTrainingReference,
} from '@/lib/trainingCatalog';
export { WEEKDAYS, createGoal, deleteGoal, checkGoalCompletion, getConditionScore, getConditionLabel, getOvertrainingStatus } from '@/lib/trainingSystem';

const COLORS = { court: ['text-cyan-400', 'bg-cyan-500'], physical: ['text-amber-400', 'bg-amber-500'], mental: ['text-green-400', 'bg-green-500'], tactical: ['text-purple-400', 'bg-purple-500'] };
export const TRAINING_CATEGORIES = Object.fromEntries(Object.values(TRAINING_GROUPS).map(group => [group.id, { ...group, color: COLORS[group.id][0], dot: COLORS[group.id][1] }]));
export const CATEGORY_ORDER = TRAINING_GROUP_ORDER;
export const INTENSITY_LEVELS = TRAINING_INTENSITIES;
export const TRAINING_ACTIVITIES = TRAINING_FOCUSES.map(item => ({ ...item, category: item.groupId, attribute: Object.keys(item.primaryAttributes)[0], attributes: getTrainingWeights(item) }));

const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, Number(value) || 0));
const round = (value, precision = 3) => Number(Number(value).toFixed(precision));
const parseDate = value => { const date = new Date(`${String(value || todayStr()).slice(0, 10)}T00:00:00Z`); return Number.isNaN(date.getTime()) ? new Date() : date; };

function isSameCareerWeek(session, date) {
  const reference = parseDate(date); const candidate = parseDate(session?.date || session?.created_date);
  const day = reference.getUTCDay() || 7; reference.setUTCDate(reference.getUTCDate() - day + 1);
  const end = new Date(reference); end.setUTCDate(end.getUTCDate() + 6);
  return candidate >= reference && candidate <= end;
}

export function getDiminishingMultiplier(count) {
  if (count <= 1) return 1;
  if (count === 2) return 0.82;
  if (count === 3) return 0.66;
  return 0.5;
}

function getStyleAffinity(profile, training) {
  const style = String(profile?.play_style || '').toLowerCase();
  const role = String(profile?.tactical_role || '').toLowerCase();
  const preferred = new Set();
  if (/ofens|finaliz/.test(`${style} ${role}`)) ['court-net-control', 'court-aerials', 'court-finishing', 'physical-power'].forEach(id => preferred.add(id));
  if (/control|construtor/.test(`${style} ${role}`)) ['court-groundstrokes', 'court-serve-return', 'mental-concentration', 'tactical-strategy'].forEach(id => preferred.add(id));
  if (/defens|contra/.test(`${style} ${role}`)) ['court-defense-transition', 'physical-agility', 'mental-pressure'].forEach(id => preferred.add(id));
  return preferred.has(training.id) ? { multiplier: 1.08, label: 'Alta' } : { multiplier: 1, label: 'Normal' };
}

export function calculateTrainingGainBudget({ profile, training, intensityId = 'moderado', repetitionCount = 0, coachBonus = {} }) {
  const intensity = TRAINING_INTENSITIES.find(item => item.id === intensityId) || TRAINING_INTENSITIES[1];
  const weights = getTrainingWeights(training);
  const weightedLevel = Object.entries(weights).reduce((sum, [key, weight]) => sum + clamp(profile?.[key]) * weight, 0) / Math.max(1, Object.values(weights).reduce((a, b) => a + b, 0));
  const levelMultiplier = clamp(1.18 - weightedLevel * 0.0065, 0.42, 1.12);
  const fatigueMultiplier = clamp(1 - clamp(profile?.fatigue) * 0.006, 0.45, 1);
  const potentialMultiplier = clamp(0.9 + (Number(profile?.potential) || 60) / 600, 0.9, 1.08);
  const age = profile?.birth_date ? Math.max(16, Math.floor((parseDate(profile.career_date) - parseDate(profile.birth_date)) / 31557600000)) : 25;
  const ageMultiplier = age <= 23 ? 1.08 : age <= 30 ? 1 : age <= 35 ? 0.9 : 0.78;
  const repetitionMultiplier = getDiminishingMultiplier(repetitionCount + 1);
  const affinity = getStyleAffinity(profile, training);
  const clubMultiplier = 1 + clamp(profile?.club_training_bonus, 0, 0.2);
  const coachValues = Object.entries(weights).map(([key, weight]) => Math.max(0, Number(coachBonus?.[key]) || 0) * weight);
  const coachMultiplier = 1 + Math.min(0.15, coachValues.reduce((a, b) => a + b, 0) * 0.012);
  const groupMultiplier = training.groupId === 'court'
    ? Number(profile?.staff_court_training_multiplier || 1)
    : training.groupId === 'physical'
      ? Number(profile?.staff_physical_training_multiplier || 1)
      : training.groupId === 'mental'
        ? Number(profile?.staff_mental_training_multiplier || 1)
        : training.groupId === 'tactical'
          ? Number(profile?.staff_tactical_training_multiplier || 1)
          : 1;
  const staffMultiplier = Math.max(1, Number(profile?.staff_training_gain_multiplier || 1)) * Math.max(1, groupMultiplier);
  const budget = training.baseGainBudget * intensity.gainMult * levelMultiplier * fatigueMultiplier * potentialMultiplier * ageMultiplier * repetitionMultiplier * affinity.multiplier * clubMultiplier * coachMultiplier * staffMultiplier;
  return { budget: round(Math.max(0.08, budget)), levelMultiplier, fatigueMultiplier, potentialMultiplier, ageMultiplier, repetitionMultiplier, affinity, coachMultiplier, staffMultiplier, intensity };
}

export function distributeTrainingGain(profile, training, budget) {
  const weights = getTrainingWeights(training);
  const adjusted = Object.fromEntries(Object.entries(weights).map(([key, weight]) => [key, weight * (1 + Math.max(0, 45 - clamp(profile?.[key])) * 0.004)]));
  const totalWeight = Object.values(adjusted).reduce((a, b) => a + b, 0);
  return Object.fromEntries(Object.entries(adjusted).map(([key, weight]) => [key, round(budget * weight / totalWeight)]));
}

export function previewTraining(profile, activity, intensityId = 'moderado', repetitionCount = 0, coachBonus = {}) {
  const training = getTrainingFocus(activity?.id) || activity;
  const calculation = calculateTrainingGainBudget({ profile, training, intensityId, repetitionCount, coachBonus });
  const secondSessionMultiplier = (profile?.trainings_today || 0) > 0 ? 1.5 : 1;
  const staffEnergyMultiplier = Math.max(0.72, Math.min(1, Number(profile?.staff_training_energy_multiplier || 1)));
  const energyCost = Math.max(1, Math.round(calculation.intensity.energyCost * secondSessionMultiplier * staffEnergyMultiplier));
  const fatigueCost = calculation.intensity.fatigueCost + (training.fatigueExtra || 0);
  const staffInjuryMultiplier = Math.max(0.42, Math.min(1, Number(profile?.staff_injury_risk_multiplier || 1)));
  const injuryRisk = (calculation.intensity.injuryRisk + Math.max(0, clamp(profile?.fatigue) - 35) * 0.001) * staffInjuryMultiplier;
  return { ...calculation, gains: distributeTrainingGain(profile, training, calculation.budget), energyCost, energyAfter: Math.max(0, Number(profile?.energy ?? 100) - energyCost), fatigueCost, duration: Math.round(training.duration * calculation.intensity.durationMult), injuryRisk };
}

export function getPredictedGain(profile, activity, intensityId, weeklyCount = 0, coachBonus = {}) {
  const preview = previewTraining(profile, activity, intensityId, weeklyCount, coachBonus);
  return { expected: preview.budget, gains: preview.gains, chance: 100, diminishing: preview.repetitionMultiplier, fatiguePenalty: round((preview.fatigueMultiplier - 1) * 100), currentVal: Number(profile?.[activity.attribute]) || 0, ...preview };
}

export async function getWeeklyTrainingCounts(profileId, careerDate) {
  try {
    const sessions = await localGame.entities.TrainingSession.filter({ profile_id: profileId });
    const counts = {};
    for (const raw of sessions || []) {
      if (!isSameCareerWeek(raw, careerDate)) continue;
      const session = migrateTrainingReference(raw);
      const key = session?.training_type;
      if (key) counts[key] = (counts[key] || 0) + 1;
    }
    return counts;
  } catch { return {}; }
}

export async function executeTraining(profile, activity, intensityId, coachBonus = {}) {
  const training = getTrainingFocus(activity?.id);
  if (!training) return { error: 'Treino inválido ou desatualizado.' };
  if (isRetired(profile)) return { error: 'Sua carreira como jogador terminou.' };
  if (isInjured(profile)) return { error: 'Você está lesionado e ainda não foi liberado para treinar.' };
  if (training.requiresPartner && !profile?.partner_id) return { error: 'Este foco exige um parceiro ativo.' };
  const doneToday = Number(profile?.trainings_today) || 0;
  if (doneToday >= 2) return { error: 'Limite diário de treino atingido. Avance o dia.' };
  const counts = await getWeeklyTrainingCounts(profile.id, profile.career_date);
  const preview = previewTraining(profile, training, intensityId, counts[training.id] || 0, coachBonus);
  if (Number(profile?.energy ?? 0) < preview.energyCost) return { error: `Energia insuficiente: são necessários ${preview.energyCost} pontos.` };

  const oldProgress = { ...(profile.attribute_progress || {}) };
  const progress = { ...oldProgress };
  const updates = {};
  const appliedGains = {};
  for (const [attribute, gain] of Object.entries(preview.gains)) {
    const total = (Number(progress[attribute]) || 0) + gain;
    const levelGain = Math.floor(total + 1e-9);
    progress[attribute] = round(total - levelGain);
    updates[attribute] = Math.min(100, (Number(profile[attribute]) || 0) + levelGain);
    appliedGains[attribute] = { progress: gain, levels: updates[attribute] - (Number(profile[attribute]) || 0) };
  }
  const conditionBefore = { energy: Number(profile.energy ?? 100), fatigue: Number(profile.fatigue || 0), morale: Number(profile.morale ?? 70), confidence: Number(profile.confidence ?? 50), form: Number(profile.form ?? 50) };
  const injured = Math.random() < preview.injuryRisk;
  const recoveryDays = injured ? 5 + Math.floor(Math.random() * 7) : 0;
  Object.assign(updates, {
    attribute_progress: progress,
    xp: (Number(profile.xp) || 0) + training.xp,
    coins: (Number(profile.coins) || 0) + training.coins,
    trainings_today: doneToday + 1,
    last_training_date: profile.career_date || todayStr(),
    energy: Math.max(0, conditionBefore.energy - preview.energyCost),
    fatigue: Math.min(100, conditionBefore.fatigue + preview.fatigueCost),
    morale: clamp(conditionBefore.morale + (preview.intensity.moraleImpact || 0) + (training.moraleBoost || 0)),
    confidence: clamp(conditionBefore.confidence + (training.confidenceBoost || 0)),
    form: clamp(conditionBefore.form + (training.formBoost || 0)),
    training_schema_version: 2,
  });
  if (training.chemistryGain && profile.partner_id) updates.partner_chemistry = clamp((profile.partner_chemistry ?? 50) + training.chemistryGain);
  if (injured) {
    const release = parseDate(profile.career_date); release.setUTCDate(release.getUTCDate() + recoveryDays);
    updates.injured_until = release.toISOString().slice(0, 10); updates.energy = 0; updates.fatigue = Math.min(100, updates.fatigue + 18);
  }
  const conditionAfter = { energy: updates.energy, fatigue: updates.fatigue, morale: updates.morale, confidence: updates.confidence, form: updates.form };
  await localGame.entities.TrainingSession.create({
    profile_id: profile.id, training_type: training.id, training_label: training.label, category: training.groupId,
    group_id: training.groupId, focus_id: training.focusId, intensity: preview.intensity.id,
    attribute_target: Object.keys(training.primaryAttributes)[0], attribute_gain: preview.budget,
    attribute_gains: appliedGains, progress_before: oldProgress, progress_after: progress,
    xp_reward: training.xp, coins_reward: training.coins, energy_cost: preview.energyCost, fatigue_cost: preview.fatigueCost,
    injury_risk: preview.injuryRisk, condition_before: conditionBefore, condition_after: conditionAfter,
    duration_min: preview.duration, date: profile.career_date || todayStr(), partner_id: training.requiresPartner ? profile.partner_id : null,
    coach_id: profile.coach_id || null, training_schema_version: 2,
  });
  const updated = await localGame.entities.PlayerProfile.update(profile.id, updates);
  await incrementMissionProgress(profile.id, 'complete_training');
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('padel:onboarding-refresh'));
  return { profile: updated, gain: preview.budget, gains: appliedGains, injured, recoveryDays, activity: { ...training, category: training.groupId, attribute: Object.keys(training.primaryAttributes)[0] }, intensity: preview.intensity, conditionBefore, conditionAfter, diminishing: preview.repetitionMultiplier, fatiguePenalty: preview.fatigueMultiplier < 1 ? round((preview.fatigueMultiplier - 1) * 100) : 0 };
}

export async function saveWeeklyPlan(profile, plan) {
  const normalized = Object.fromEntries(Object.entries(plan || {}).map(([day, entry]) => [day, migrateTrainingReference(entry)]));
  return localGame.entities.PlayerProfile.update(profile.id, { weekly_training_plan: normalized, training_schema_version: 2 });
}

export function getPlanSummary(plan) {
  const summary = { totalActivities: 0, totalFatigue: 0, totalEnergy: 0, attributesFocused: {} };
  for (const raw of Object.values(plan || {})) {
    const entry = migrateTrainingReference(raw); const training = getTrainingFocus(entry?.activity_id); if (!training) continue;
    const intensity = TRAINING_INTENSITIES.find(item => item.id === entry.intensity) || TRAINING_INTENSITIES[1];
    summary.totalActivities += 1; summary.totalFatigue += intensity.fatigueCost + (training.fatigueExtra || 0); summary.totalEnergy += intensity.energyCost;
    for (const attribute of Object.keys(getTrainingWeights(training))) summary.attributesFocused[attribute] = (summary.attributesFocused[attribute] || 0) + 1;
  }
  return summary;
}

export function getRecommendedTrainings(player, careerState = {}) {
  return TRAINING_ACTIVITIES.map(training => {
    const weights = getTrainingWeights(training);
    const weakness = Object.keys(weights).reduce((sum, key) => sum + (100 - clamp(player?.[key])) * weights[key], 0) / Object.values(weights).reduce((a, b) => a + b, 0);
    const preview = previewTraining(player, training, Number(player?.energy) < 35 ? 'leve' : 'moderado', Number(careerState.recentCounts?.[training.id]) || 0);
    let score = weakness + (preview.affinity.multiplier - 1) * 100 - (training.requiresPartner && !player?.partner_id ? 100 : 0);
    if (careerState.nextTournamentDays <= 2 && preview.intensity.id === 'intenso') score -= 30;
    return { training, score, intensity: Number(player?.energy) < 35 ? 'leve' : 'moderado', reason: weakness > 55 ? 'Corrige atributos abaixo da média.' : preview.affinity.label === 'Alta' ? 'Combina com seu estilo e arquétipo.' : 'Amplia a variedade do plano.' };
  }).filter(item => item.score > -50).sort((a, b) => b.score - a.score).slice(0, 3);
}

export function chooseBotTraining(bot, careerState = {}) {
  const recommendations = getRecommendedTrainings(bot, careerState);
  if (!recommendations.length || Number(bot?.energy) < 8 || isInjured(bot)) return { action: 'recovery', reason: 'Recuperação necessária.' };
  const days = Number(careerState.nextTournamentDays);
  const selected = recommendations[0];
  const intensity = days <= 2 || Number(bot?.energy) < 45 ? 'leve' : Number(bot?.energy) >= 75 && Number(bot?.fatigue || 0) < 30 ? 'intenso' : selected.intensity;
  return { action: 'training', training: selected.training, intensity, reason: selected.reason };
}
