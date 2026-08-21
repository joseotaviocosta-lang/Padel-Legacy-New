import { localGame } from '@/api/localGameClient.js';
import { ATTRIBUTE_KEYS, DAILY_TRAINING_LIMIT, isInjured, isRetired, incrementMissionProgress, todayStr } from '@/lib/padel';
import {
  TRAINING_GROUPS, TRAINING_GROUP_ORDER, TRAINING_INTENSITIES, TRAINING_FOCUSES,
  getTrainingFocus, getTrainingWeights, migrateTrainingReference,
} from '@/lib/trainingCatalog';
import { getDifficultyModifier } from '@/gameplay/difficulty/difficultyConfig.js';
import { normalizeFatigue } from '@/game-core/physicalStats.js';
import { getTrainingCost } from '@/lib/trainingEconomy.js';
export { WEEKDAYS, createGoal, deleteGoal, checkGoalCompletion, getConditionScore, getConditionLabel, getOvertrainingStatus } from '@/lib/trainingSystem';

const COLORS = { court: ['text-cyan-400', 'bg-cyan-500'], physical: ['text-amber-400', 'bg-amber-500'], mental: ['text-green-400', 'bg-green-500'], tactical: ['text-purple-400', 'bg-purple-500'] };
export const TRAINING_CATEGORIES = Object.fromEntries(Object.values(TRAINING_GROUPS).map(group => [group.id, { ...group, color: COLORS[group.id][0], dot: COLORS[group.id][1] }]));
export const CATEGORY_ORDER = TRAINING_GROUP_ORDER;
export const INTENSITY_LEVELS = TRAINING_INTENSITIES;
export const TRAINING_ACTIVITIES = TRAINING_FOCUSES.map(item => ({ ...item, category: item.groupId, attribute: Object.keys(item.primaryAttributes)[0], attributes: getTrainingWeights(item) }));

const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, Number(value) || 0));
const round = (value, precision = 3) => Number(Number(value).toFixed(precision));
const parseDate = value => { const date = new Date(`${String(value || todayStr()).slice(0, 10)}T00:00:00Z`); return Number.isNaN(date.getTime()) ? new Date() : date; };


const STYLE_ATTRIBUTE_BONUSES = Object.freeze({
  offensive: new Set(['smash', 'volley', 'bandeja', 'serve']),
  defensive: new Set(['defense', 'agility', 'backhand', 'emotional_control']),
  control: new Set(['strategy', 'forehand', 'backhand', 'volley']),
  balanced: new Set(ATTRIBUTE_KEYS),
});

function getProfileStyleKey(profile) {
  const value = `${profile?.play_style || ''} ${profile?.tactical_role || ''}`.toLowerCase();
  if (/ofens|finaliz|pot[eê]ncia|agress/.test(value)) return 'offensive';
  if (/defens|contra/.test(value)) return 'defensive';
  if (/control|construtor|t[aá]tic/.test(value)) return 'control';
  return 'balanced';
}

// Fase 13.1 (docs/FASE_13_1_CAREER_PACE_VALIDATION.md, Parte 10/15, Caso 4):
// achado real confirmado por auditoria de código — nenhum ponto da criação
// real de carreira (CareerInitialDataService.js, ActiveCareerAdapter.js,
// initialCareerProfiles.js, o assistente de personagem) jamais define
// `profile.potential`. Todo jogador real caía no fallback antigo (72,
// teto ~82-84) — abaixo do próprio Overall dos bots do Top 100 (~85, ver
// rankingPopulation.js), tornando o Top 100+ estruturalmente inalcançável
// para QUALQUER carreira real, não só difícil. Os simuladores de pace
// (massive-v32/career-difficulty-pace) nunca expuseram esse problema
// porque SEMPRE injetam seu próprio `potential` (78-91) por cenário — eles
// testam builds mais talentosos do que qualquer perfil real recebe.
// Corrigido no MENOR ponto possível (só o fallback, nenhum campo novo
// persistido, nenhuma tela de criação de personagem alterada): 80 é o
// mesmo valor já usado e validado por um dos 10 cenários "saudáveis" do
// massive-v32 (economy-conservative), dá teto ~87 (acima do Top 100 real,
// ainda abaixo do Top 20-10 real de propósito — carreira excepcional
// continua exigindo mais do que a média, por design, Parte 12).
export function getAttributeDevelopmentCeiling(profile, attribute) {
  const potential = clamp(profile?.potential ?? 80, 45, 99);
  const base = 47 + potential * 0.48;
  const styleKey = getProfileStyleKey(profile);
  const preferred = STYLE_ATTRIBUTE_BONUSES[styleKey]?.has(attribute);
  const initial = Number(profile?.initial_attributes?.[attribute]);
  const initialModifier = Number.isFinite(initial) ? clamp((initial - 10) * 0.18, -2, 2) : 0;
  const specialization = styleKey === 'balanced' ? 0 : preferred ? 2.5 : -1.5;
  return Math.round(clamp(base + specialization + initialModifier, 65, 98));
}

export function getDevelopmentWindow(profile, attributes = ATTRIBUTE_KEYS) {
  const current = attributes.reduce((sum, key) => sum + clamp(profile?.[key]), 0) / Math.max(1, attributes.length);
  const ceiling = attributes.reduce((sum, key) => sum + getAttributeDevelopmentCeiling(profile, key), 0) / Math.max(1, attributes.length);
  const remaining = Math.max(0, ceiling - current);
  const multiplier = remaining >= 15 ? 1 : remaining >= 8 ? 0.82 : remaining >= 4 ? 0.58 : remaining >= 1 ? 0.3 : 0.08;
  return { current, ceiling, remaining, multiplier };
}

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
  // Fase 13.1 (Parte 10/15): mesmo fallback de getAttributeDevelopmentCeiling
  // acima (80, não mais 60) — os dois liam profile.potential com defaults
  // diferentes para o mesmo campo ausente, uma inconsistência que só não
  // aparecia porque nenhum perfil real jamais tinha o campo definido.
  const potentialMultiplier = clamp(0.9 + (Number(profile?.potential) || 80) / 520, 0.92, 1.11);
  const age = profile?.birth_date ? Math.max(16, Math.floor((parseDate(profile.career_date) - parseDate(profile.birth_date)) / 31557600000)) : 25;
  // A maior janela de evolução acontece dos 16 aos 22 anos. O auge chega
  // entre 23 e 26; depois disso a progressão vira manutenção e especialização.
  const ageMultiplier = age <= 18 ? 1.34 : age <= 22 ? 1.24 : age <= 26 ? 1.06 : age <= 30 ? 0.86 : age <= 35 ? 0.68 : 0.48;
  const development = getDevelopmentWindow(profile, Object.keys(weights));
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
  const difficultyMultiplier = getDifficultyModifier(profile, 'trainingGainMultiplier');
  const budget = training.baseGainBudget * intensity.gainMult * levelMultiplier * fatigueMultiplier * potentialMultiplier * ageMultiplier * development.multiplier * repetitionMultiplier * affinity.multiplier * clubMultiplier * coachMultiplier * staffMultiplier * difficultyMultiplier;
  return { budget: round(Math.max(0.03, budget)), levelMultiplier, fatigueMultiplier, potentialMultiplier, ageMultiplier, development, repetitionMultiplier, affinity, coachMultiplier, staffMultiplier, intensity };
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
  const fatigueCost = normalizeFatigue((calculation.intensity.fatigueCost + (training.fatigueExtra || 0)) * getDifficultyModifier(profile, 'fatigueGainMultiplier'));
  const staffInjuryMultiplier = Math.max(0.42, Math.min(1, Number(profile?.staff_injury_risk_multiplier || 1)));
  const fatigue = clamp(profile?.fatigue);
  const energyAfter = Math.max(0, Number(profile?.energy ?? 100) - energyCost);
  // Treinos normais devem ser seguros. O risco cresce de forma não linear apenas
  // quando o atleta insiste em treinar com fadiga alta ou energia muito baixa.
  const fatigueRisk = fatigue <= 55 ? 0 : fatigue <= 75
    ? (fatigue - 55) * 0.00005
    : 0.001 + (fatigue - 75) * 0.00014;
  const lowEnergyRisk = energyAfter >= 30 ? 0 : (30 - energyAfter) * 0.00007;
  const secondSessionRisk = (profile?.trainings_today || 0) > 0 ? 0.0004 : 0;
  const injuryRisk = Math.min(0.022, (calculation.intensity.injuryRisk + fatigueRisk + lowEnergyRisk + secondSessionRisk) * staffInjuryMultiplier * getDifficultyModifier(profile, 'injuryRiskMultiplier'));
  // M4.2.1 (Parte 9/32): custo visível no preview, ANTES de qualquer
  // confirmação — mesma função getTrainingCost usada na execução real
  // (Parte 41, fonte única), nunca recalculada separadamente na UI.
  const cost = getTrainingCost(profile, calculation.intensity.id);
  return { ...calculation, gains: distributeTrainingGain(profile, training, calculation.budget), energyCost, energyAfter: Math.max(0, Number(profile?.energy ?? 100) - energyCost), fatigueCost, duration: Math.round(training.duration * calculation.intensity.durationMult), injuryRisk, cost };
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
  if (Number(profile?.tournament_matches_today || 0) > 0) return { error: 'Dia de torneio: treinos ficam bloqueados após a partida oficial.' };
  if (training.requiresPartner && !profile?.partner_id) return { error: 'Este foco exige um parceiro ativo.' };
  const doneToday = Number(profile?.trainings_today) || 0;
  if (doneToday >= DAILY_TRAINING_LIMIT) return { error: 'Limite diário de treino atingido. Avance o dia.' };
  const counts = await getWeeklyTrainingCounts(profile.id, profile.career_date);
  const preview = previewTraining(profile, training, intensityId, counts[training.id] || 0, coachBonus);
  if (Number(profile?.energy ?? 0) < preview.energyCost) return { error: `Energia insuficiente: são necessários ${preview.energyCost} pontos.` };
  // M4.2.1 (Parte 11/42): revalida saldo no momento da execução real —
  // nunca confia só no saldo mostrado na UI (que pode estar desatualizado
  // por outra aba/ação concorrente). Mesma função de custo do preview
  // (Parte 41), chamada de novo aqui contra o `profile` fresco recebido.
  const currentCoins = Number(profile?.coins) || 0;
  if (currentCoins < preview.cost) return { error: `Moedas insuficientes: este treino custa ${preview.cost}, você tem ${currentCoins}.` };

  const oldProgress = { ...(profile.attribute_progress || {}) };
  const progress = { ...oldProgress };
  const updates = {};
  const appliedGains = {};
  for (const [attribute, gain] of Object.entries(preview.gains)) {
    const current = Number(profile[attribute]) || 0;
    const ceiling = getAttributeDevelopmentCeiling(profile, attribute);
    const remainingLevels = Math.max(0, ceiling - current);
    const effectiveGain = remainingLevels <= 0 ? 0 : gain * clamp(remainingLevels / 6, 0.15, 1);
    const total = (Number(progress[attribute]) || 0) + effectiveGain;
    const levelGain = Math.min(remainingLevels, Math.floor(total + 1e-9));
    progress[attribute] = remainingLevels <= 0 ? 0 : round(total - levelGain);
    updates[attribute] = Math.min(ceiling, current + levelGain);
    appliedGains[attribute] = { progress: round(effectiveGain), levels: updates[attribute] - current, ceiling };
  }
  const conditionBefore = { energy: Number(profile.energy ?? 100), fatigue: normalizeFatigue(profile.fatigue), morale: Number(profile.morale ?? 70), confidence: Number(profile.confidence ?? 50), form: Number(profile.form ?? 50) };
  const injured = Math.random() < preview.injuryRisk;
  const recoveryDays = injured ? 5 + Math.floor(Math.random() * 7) : 0;
  const scaledXp = Math.round(training.xp * getDifficultyModifier(profile, 'careerXpMultiplier'));
  Object.assign(updates, {
    attribute_progress: progress,
    xp: (Number(profile.xp) || 0) + scaledXp,
    // M4.2.1 (Parte 2/3/13): treino deixa de PAGAR moedas e passa a CUSTAR —
    // débito faz parte da MESMA atualização atômica de perfil que aplica os
    // ganhos (nunca uma escrita separada), preservando a garantia de
    // "validar → debitar → aplicar → salvar" em uma única operação.
    coins: currentCoins - preview.cost,
    trainings_today: doneToday + 1,
    last_training_date: profile.career_date || todayStr(),
    energy: Math.max(0, conditionBefore.energy - preview.energyCost),
    fatigue: normalizeFatigue(conditionBefore.fatigue + preview.fatigueCost),
    morale: clamp(conditionBefore.morale + (preview.intensity.moraleImpact || 0) + (training.moraleBoost || 0)),
    confidence: clamp(conditionBefore.confidence + (training.confidenceBoost || 0)),
    form: clamp(conditionBefore.form + (training.formBoost || 0)),
    training_schema_version: 2,
  });
  if (training.chemistryGain && profile.partner_id) updates.partner_chemistry = clamp((profile.partner_chemistry ?? 50) + training.chemistryGain);
  if (injured) {
    const release = parseDate(profile.career_date); release.setUTCDate(release.getUTCDate() + recoveryDays);
    updates.injured_until = release.toISOString().slice(0, 10); updates.energy = 0; updates.fatigue = normalizeFatigue(updates.fatigue + 18);
  }
  const conditionAfter = { energy: updates.energy, fatigue: updates.fatigue, morale: updates.morale, confidence: updates.confidence, form: updates.form };
  // Fase 11 (docs/RANKING_INTEGRITY_PHASE11.md): a escrita que define se o
  // treino REALMENTE aconteceu (PlayerProfile.update — ganhos, energia, xp)
  // vai primeiro. TrainingSession.create é só o registro histórico/auditoria
  // e vem depois: se ela falhar, o jogador já recebeu o ganho de verdade
  // (perda mínima, só falta um item no histórico). Na ordem antiga (sessão
  // primeiro), uma falha exatamente entre as duas escritas deixava uma
  // TrainingSession órfã — que por si só já bloqueia reaplicação futura
  // daquele dia (calendarSystem.js: `sessions.some(s => s.date === date)`)
  // — sem que os ganhos tivessem sido aplicados: perda silenciosa e
  // permanente. Nenhuma outra parte do código depende da sessão existir
  // antes do perfil ser atualizado.
  const updated = await localGame.entities.PlayerProfile.update(profile.id, updates);
  await localGame.entities.TrainingSession.create({
    profile_id: profile.id, training_type: training.id, training_label: training.label, category: training.groupId,
    group_id: training.groupId, focus_id: training.focusId, intensity: preview.intensity.id,
    attribute_target: Object.keys(training.primaryAttributes)[0], attribute_gain: preview.budget,
    attribute_gains: appliedGains, progress_before: oldProgress, progress_after: progress,
    // M4.2.1 (Parte 2/34): treino não paga mais moedas — coins_reward fica
    // 0 daqui em diante (histórico antigo com valor >0 continua intacto,
    // sem migração). coins_cost é o campo novo com o débito real.
    xp_reward: scaledXp, coins_reward: 0, coins_cost: preview.cost, energy_cost: preview.energyCost, fatigue_cost: preview.fatigueCost,
    injury_risk: preview.injuryRisk, condition_before: conditionBefore, condition_after: conditionAfter,
    duration_min: preview.duration, date: profile.career_date || todayStr(), partner_id: training.requiresPartner ? profile.partner_id : null,
    coach_id: profile.coach_id || null, training_schema_version: 2,
  });
  await incrementMissionProgress(profile.id, 'complete_training');
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('padel:onboarding-refresh'));
  return { profile: updated, gain: preview.budget, gains: appliedGains, injured, recoveryDays, cost: preview.cost, activity: { ...training, category: training.groupId, attribute: Object.keys(training.primaryAttributes)[0] }, intensity: preview.intensity, conditionBefore, conditionAfter, diminishing: preview.repetitionMultiplier, fatiguePenalty: preview.fatigueMultiplier < 1 ? round((preview.fatigueMultiplier - 1) * 100) : 0 };
}

export async function saveWeeklyPlan(profile, plan, enabled = true) {
  const normalized = Object.fromEntries(Object.entries(plan || {}).map(([day, entry]) => [day, migrateTrainingReference(entry)]));
  return localGame.entities.PlayerProfile.update(profile.id, { weekly_training_plan: normalized, weekly_training_enabled: Boolean(enabled), training_schema_version: 2 });
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
