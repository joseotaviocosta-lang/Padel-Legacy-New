import { localGame } from '@/api/localGameClient.js';
import { calculateDailyRecovery } from '@/gameplay/worldTour/PhysicalConditionManager.js';
import { getDifficultyModifier } from '@/gameplay/difficulty/difficultyConfig.js';
import { normalizeFatigue } from './physicalStats.js';
import { upsertCareerMessage } from '@/lib/careerCommunications.js';

const INJURIES = [
  { type: 'Sobrecarga muscular', severity: 'leve', days: [2, 4], risk: 1.0 },
  { type: 'Inflamação no ombro', severity: 'moderada', days: [5, 9], risk: 0.72 },
  { type: 'Entorse no tornozelo', severity: 'moderada', days: [7, 12], risk: 0.52 },
  { type: 'Distensão na panturrilha', severity: 'grave', days: [12, 20], risk: 0.28 },
];

function hash(text) {
  let value = 2166136261;
  for (let i = 0; i < String(text).length; i += 1) {
    value ^= String(text).charCodeAt(i);
    value = Math.imul(value, 16777619);
  }
  return (value >>> 0) / 4294967295;
}

function isWeeklyBoundary(previousDate, currentDate) {
  const previous = new Date(`${previousDate}T12:00:00`);
  const current = new Date(`${currentDate}T12:00:00`);
  return previous.getUTCDay() !== current.getUTCDay() && current.getUTCDay() === 1;
}

// Upsert por chave de contexto (data + tipo) — protege o gerador contra
// duplicação mesmo se processInjuryRecoveryDay for chamado mais de uma vez
// para a mesma transição de data no futuro.
async function createMessage(profile, contextKey, title, content, type) {
  try {
    await upsertCareerMessage(profile.id, contextKey, {
      sender_name: 'Departamento Médico',
      sender_type: 'sistema',
      title,
      content,
      status: 'nao_lida',
      message_type: type,
      notification_type: type === 'injury_report' ? 'INJURY' : 'INJURY_CLEARANCE',
      destination: { type: 'INJURY', route: '/game/calendar', params: { focus: 'recovery' } },
    });
  } catch (error) {
    console.warn('[Game Core] Mensagem médica não criada:', error);
  }
}

export function getInjuryStatus(profile) {
  const days = Math.max(0, Number(profile?.injury_days_remaining) || 0);
  return {
    injured: Boolean(profile?.injury_status === 'lesionado' && days > 0),
    type: profile?.injury_type || null,
    severity: profile?.injury_severity || null,
    daysRemaining: days,
    returnDate: profile?.injury_return_date || null,
    history: Array.isArray(profile?.injury_history) ? profile.injury_history : [],
  };
}

export async function processInjuryRecoveryDay(profile, previousDate, currentDate) {
  if (!profile?.id) return { profile, injured: false, recovered: false, newInjury: false };

  const current = getInjuryStatus(profile);
  if (current.injured) {
    const recovery = calculateDailyRecovery(profile, { restDay: Boolean(profile.last_day_was_rest) });
    const remaining = Math.max(0, current.daysRemaining - Math.max(1, Number(recovery.injuryDayReduction) || 1));
    const recovered = remaining === 0;
    const patch = recovered
      ? {
          injury_status: 'apto',
          injury_type: null,
          injury_severity: null,
          injury_days_remaining: 0,
          injury_return_date: currentDate,
          energy: Math.max(45, Number(profile.energy) || 45),
          confidence: Math.max(45, Number(profile.confidence) || 45),
        }
      : {
          injury_days_remaining: remaining,
          energy: Math.min(100, (Number(profile.energy) || 0) + recovery.energyGain),
          fatigue: normalizeFatigue((Number(profile.fatigue) || 0) - recovery.fatigueReduction),
        };

    const updated = await localGame.entities.PlayerProfile.update(profile.id, patch);
    if (recovered) {
      await createMessage(
        updated,
        `injury-clearance:${profile.id}:${currentDate}`,
        'Liberado para competir',
        'A recuperação foi concluída. Você está novamente disponível para treinos e partidas.',
        'medical_clearance',
      );
    }
    return { profile: updated, injured: !recovered, recovered, newInjury: false };
  }

  const recovery = calculateDailyRecovery(profile, { restDay: Boolean(profile.last_day_was_rest) });
  let recoveredProfile = profile;
  if ((Number(profile.energy) || 0) < 100 || (Number(profile.fatigue) || 0) > 0 || (Number(profile.matches_this_week) || 0) > 0) {
    recoveredProfile = await localGame.entities.PlayerProfile.update(profile.id, {
      energy: Math.min(100, (Number(profile.energy) || 0) + recovery.energyGain),
      fatigue: normalizeFatigue((Number(profile.fatigue) || 0) - recovery.fatigueReduction),
      matches_this_week: isWeeklyBoundary(previousDate, currentDate) ? 0 : (Number(profile.matches_this_week) || 0),
    });
  }

  if (!isWeeklyBoundary(previousDate, currentDate)) {
    return { profile: recoveredProfile, injured: false, recovered: false, newInjury: false, dailyRecovery: recovery };
  }

  profile = recoveredProfile;
  const energy = Number(profile.energy) || 100;
  const fatigue = Number(profile.fatigue) || Math.max(0, 100 - energy);
  const condition = Number(profile.condition) || 70;
  const baseRisk = 0.015;
  const fatigueRisk = Math.max(0, fatigue - 35) * 0.0012;
  const energyRisk = Math.max(0, 45 - energy) * 0.0015;
  const conditionProtection = Math.max(0, condition - 60) * 0.00035;
  const medical = (await import('@/gameplay/worldTour/MedicalCenterManager.js')).getMedicalModifiers(profile);
  const risk = Math.min(0.18, Math.max(0.006, (baseRisk + fatigueRisk + energyRisk - conditionProtection) * (1 - medical.injuryReduction) * getDifficultyModifier(profile, 'injuryRiskMultiplier') + Number(profile?.early_return_relapse_risk || 0)));
  const roll = hash(`${profile.id}:${currentDate}:injury`);

  if (roll >= risk) {
    return { profile, injured: false, recovered: false, newInjury: false, risk };
  }

  const injuryRoll = hash(`${profile.id}:${currentDate}:type`);
  let cumulative = 0;
  const totalWeight = INJURIES.reduce((sum, item) => sum + item.risk, 0);
  const injury = INJURIES.find((item) => {
    cumulative += item.risk / totalWeight;
    return injuryRoll <= cumulative;
  }) || INJURIES[0];
  const durationRoll = hash(`${profile.id}:${currentDate}:duration`);
  const days = Math.round(injury.days[0] + (injury.days[1] - injury.days[0]) * durationRoll);
  const returnDate = new Date(`${currentDate}T12:00:00`);
  returnDate.setUTCDate(returnDate.getUTCDate() + days);
  const history = [...current.history, { type: injury.type, severity: injury.severity, date: currentDate, days }].slice(-20);

  const updated = await localGame.entities.PlayerProfile.update(profile.id, {
    injury_status: 'lesionado',
    injury_type: injury.type,
    injury_severity: injury.severity,
    injury_days_remaining: days,
    injury_return_date: returnDate.toISOString().slice(0, 10),
    injury_history: history,
    energy: Math.min(energy, 35),
    confidence: Math.max(20, (Number(profile.confidence) || 60) - 8),
  });

  await createMessage(
    updated,
    `injury-report:${profile.id}:${currentDate}:${injury.type}`,
    `Lesão: ${injury.type}`,
    `O departamento médico estima ${days} dias de recuperação. Descanso e recuperação serão priorizados automaticamente.`,
    'injury_report',
  );
  return { profile: updated, injured: true, recovered: false, newInjury: true, risk, injury, days };
}
