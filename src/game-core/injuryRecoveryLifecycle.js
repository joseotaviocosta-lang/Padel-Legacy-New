import { localGame } from '@/api/localGameClient.js';

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

async function createMessage(profile, subject, body, type) {
  try {
    if (!localGame.entities?.CareerMessage?.create) return;
    await localGame.entities.CareerMessage.create({
      profile_id: profile.id,
      sender_name: 'Departamento Médico',
      subject,
      body,
      status: 'nao_lida',
      message_type: type,
      created_date: new Date().toISOString(),
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
    const remaining = Math.max(0, current.daysRemaining - 1);
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
          energy: Math.min(100, (Number(profile.energy) || 0) + 8),
        };

    const updated = await localGame.entities.PlayerProfile.update(profile.id, patch);
    if (recovered) {
      await createMessage(updated, 'Liberado para competir', 'A recuperação foi concluída. Você está novamente disponível para treinos e partidas.', 'medical_clearance');
    }
    return { profile: updated, injured: !recovered, recovered, newInjury: false };
  }

  if (!isWeeklyBoundary(previousDate, currentDate)) {
    return { profile, injured: false, recovered: false, newInjury: false };
  }

  const energy = Number(profile.energy) || 100;
  const fatigue = Number(profile.fatigue) || Math.max(0, 100 - energy);
  const condition = Number(profile.condition) || 70;
  const baseRisk = 0.015;
  const fatigueRisk = Math.max(0, fatigue - 35) * 0.0012;
  const energyRisk = Math.max(0, 45 - energy) * 0.0015;
  const conditionProtection = Math.max(0, condition - 60) * 0.00035;
  const risk = Math.min(0.18, Math.max(0.006, baseRisk + fatigueRisk + energyRisk - conditionProtection));
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

  await createMessage(updated, `Lesão: ${injury.type}`, `O departamento médico estima ${days} dias de recuperação. Descanso e recuperação serão priorizados automaticamente.`, 'injury_report');
  return { profile: updated, injured: true, recovered: false, newInjury: true, risk, injury, days };
}
