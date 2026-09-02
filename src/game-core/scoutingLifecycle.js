import { localGame } from '@/api/localGameClient.js';
import { fnv1aHash } from '@/lib/hashUtils.js';

const LEVELS = {
  basico: { label: 'Básico', cost: 250, accuracy: 55 },
  completo: { label: 'Completo', cost: 750, accuracy: 78 },
  elite: { label: 'Elite', cost: 1800, accuracy: 94 },
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function hash(text) {
  return Math.abs(fnv1aHash(String(text)));
}

function noise(seed, amplitude) {
  const ratio = (hash(seed) % 10001) / 10000;
  return Math.round((ratio * 2 - 1) * amplitude);
}

function monthKey(date) {
  return String(date || new Date().toISOString().slice(0, 10)).slice(0, 7);
}

function estimatedRange(realValue, accuracy, seed) {
  const spread = Math.max(1, Math.round((100 - accuracy) / 5));
  const center = clamp(Number(realValue) + noise(seed, spread), 1, 100);
  return {
    min: clamp(center - spread, 1, 100),
    max: clamp(center + spread, 1, 100),
  };
}

export function getScoutingLevels() {
  return LEVELS;
}

export async function getPlayerScoutingReports(profileId) {
  if (!profileId) return [];
  const reports = await localGame.entities.PlayerScoutingReport.filter({ profile_id: profileId });
  return reports || [];
}

export async function toggleShortlist(profile, athlete, enabled) {
  if (!profile?.id || !athlete?.id) throw new Error('Perfil ou atleta inválido.');
  const existing = await localGame.entities.PlayerScoutingReport.filter({
    profile_id: profile.id,
    athlete_id: athlete.id,
  });
  const report = existing?.[0];
  const data = {
    profile_id: profile.id,
    athlete_id: athlete.id,
    athlete_name: athlete.name,
    is_shortlisted: Boolean(enabled),
    updated_at: new Date().toISOString(),
  };
  if (report) return localGame.entities.PlayerScoutingReport.update(report.id, data);
  return localGame.entities.PlayerScoutingReport.create({
    ...data,
    scouting_level: null,
    scouted_month: null,
  });
}

export async function scoutAthlete(profile, athlete, levelKey = 'basico') {
  if (!profile?.id || !athlete?.id) throw new Error('Perfil ou atleta inválido.');
  const level = LEVELS[levelKey];
  if (!level) throw new Error('Nível de observação inválido.');
  const currentCoins = Number(profile.coins) || 0;
  if (currentCoins < level.cost) throw new Error(`Saldo insuficiente. Este relatório custa ${level.cost.toLocaleString('pt-BR')} moedas.`);

  const careerDate = profile.career_date || new Date().toISOString().slice(0, 10);
  const seed = `${profile.id}:${athlete.id}:${monthKey(careerDate)}:${levelKey}`;
  const overall = Number(athlete.overall_rating) || 50;
  const potential = Number(athlete.potential) || overall;
  const form = Number(athlete.current_form) || 60;
  const overallRange = estimatedRange(overall, level.accuracy, `${seed}:overall`);
  const potentialRange = estimatedRange(potential, level.accuracy, `${seed}:potential`);
  const formRange = estimatedRange(form, level.accuracy, `${seed}:form`);
  const fitScore = clamp(
    50 + noise(`${seed}:fit`, 18) + Math.round((form - 50) * 0.25) + Math.round((potential - overall) * 0.35),
    1,
    100,
  );
  const riskScore = clamp(
    28 + noise(`${seed}:risk`, 20) + Math.max(0, (Number(athlete.age) || 25) - 32) * 4 + (athlete.current_injury ? 25 : 0),
    1,
    100,
  );

  const existing = await localGame.entities.PlayerScoutingReport.filter({
    profile_id: profile.id,
    athlete_id: athlete.id,
  });
  const old = existing?.[0];
  const reportData = {
    profile_id: profile.id,
    athlete_id: athlete.id,
    athlete_name: athlete.name,
    scouting_level: levelKey,
    scouting_label: level.label,
    scouting_accuracy: level.accuracy,
    scouted_month: monthKey(careerDate),
    overall_min: overallRange.min,
    overall_max: overallRange.max,
    potential_min: potentialRange.min,
    potential_max: potentialRange.max,
    form_min: formRange.min,
    form_max: formRange.max,
    tactical_fit: fitScore,
    risk_score: riskScore,
    recommendation: fitScore >= 75 && riskScore <= 45 ? 'prioridade' : fitScore >= 58 ? 'acompanhar' : 'cautela',
    is_shortlisted: old?.is_shortlisted || false,
    updated_at: new Date().toISOString(),
  };

  const report = old
    ? await localGame.entities.PlayerScoutingReport.update(old.id, reportData)
    : await localGame.entities.PlayerScoutingReport.create(reportData);

  const updatedProfile = await localGame.entities.PlayerProfile.update(profile.id, {
    coins: currentCoins - level.cost,
  });

  try {
    await localGame.entities.FinancialTransaction.create({
      profile_id: profile.id,
      month: monthKey(careerDate),
      type: 'despesa',
      category: 'scouting',
      description: `Relatório ${level.label} de ${athlete.name}`,
      amount: -level.cost,
      net: -level.cost,
      date: careerDate,
    });
  } catch (error) {
    console.warn('Não foi possível registrar a despesa de scouting:', error);
  }

  return { report, profile: updatedProfile, cost: level.cost };
}
