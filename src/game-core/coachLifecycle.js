import { localGame } from '@/api/localGameClient.js';
import { COACHES_DATA, canHireCoach, getCoachEffects } from '@/lib/coaches.js';

function normalizeName(value) { return String(value || '').trim().toLocaleLowerCase('pt-BR'); }
function addMonths(date, months) {
  const d = new Date(`${String(date || '2026-01-01').slice(0,10)}T12:00:00`);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0,10);
}

export async function ensureCoachCatalog() {
  let coaches = (await localGame.entities.Coach.list('-reputation', 500)) || [];
  const byName = new Map(coaches.map(coach => [normalizeName(coach.name), coach]));
  const missing = COACHES_DATA.filter(coach => !byName.has(normalizeName(coach.name)));
  if (missing.length) {
    await localGame.entities.Coach.bulkCreate(missing.map(coach => ({ ...coach })));
    coaches = (await localGame.entities.Coach.list('-reputation', 500)) || [];
  }
  const catalogByName = new Map(COACHES_DATA.map(coach => [normalizeName(coach.name), coach]));
  const updates = coaches.map(existing => {
    const catalog = catalogByName.get(normalizeName(existing.name));
    if (!catalog || !existing.id) return null;
    return { id: existing.id, tier: catalog.tier, specialty: catalog.specialty, competencies: catalog.competencies, overall: catalog.overall, potential: catalog.potential, monthly_cost: catalog.monthly_cost, sign_on_bonus: catalog.sign_on_bonus, performance_bonus_pct: catalog.performance_bonus_pct, training_bonus: catalog.training_bonus, specializations: catalog.specializations, preferred_styles: catalog.preferred_styles, demands: catalog.demands };
  }).filter(Boolean);
  if (updates.length && localGame.entities.Coach.bulkUpdate) {
    await localGame.entities.Coach.bulkUpdate(updates);
    coaches = (await localGame.entities.Coach.list('-reputation', 500)) || [];
  }
  return coaches;
}

export function isCoachActive(profile) {
  return Boolean(profile?.coach_id && !['terminated','expired'].includes(profile?.coach_contract_status));
}

export async function ensureStarterCoach(profile) {
  if (!profile?.id) return { profile, coach:null, created:false };
  const coaches = await ensureCoachCatalog();
  if (isCoachActive(profile)) {
    const current = coaches.find(coach => coach.id === profile.coach_id) || await localGame.entities.Coach.get(profile.coach_id).catch(() => null);
    if (current) return { profile, coach:current, created:false };
  }
  const starter = coaches
    .filter(coach => coach.tier === 'iniciante')
    .sort((a,b) => (a.monthly_cost || 9999) - (b.monthly_cost || 9999) || (b.reputation || 0) - (a.reputation || 0))[0] || coaches[0];
  if (!starter) return { profile, coach:null, created:false };
  const currentDate = profile.career_date || '2026-01-01';
  const updated = await localGame.entities.PlayerProfile.update(profile.id, {
    coach_id: starter.id,
    coach_name: starter.name,
    coach_hired_date: currentDate,
    coach_contract_started_date: currentDate,
    coach_contract_end_date: addMonths(currentDate, 12),
    coach_contract_months: 12,
    coach_monthly_salary: 0,
    coach_signing_cost: 0,
    coach_contract_status: 'active',
    coach_paid_by_club: true,
    coach_trust: Number(profile.coach_trust) || 55,
    coach_relationship_months: Number(profile.coach_relationship_months) || 0,
    coach_tactical_understanding: Number(profile.coach_tactical_understanding) || 25,
    coach_last_report_date: profile.coach_last_report_date || null,
  });
  return { profile:updated, coach:starter, created:true };
}

export async function hirePrimaryCoach(profile, coach, months = 12) {
  if (!profile?.id || !coach?.id) throw new Error('Dados do treinador incompletos.');
  const check = canHireCoach(coach, profile);
  if (!check.allowed) throw new Error(check.reason || 'Treinador indisponível.');
  const salary = Math.max(1, Number(coach.market_salary ?? coach.monthly_cost) || 1);
  const signing = Math.max(0, Number(coach.market_signing_bonus ?? coach.sign_on_bonus) || 0);
  if ((Number(profile.coins) || 0) < signing) throw new Error(`São necessárias ${signing} moedas para o bônus de assinatura.`);
  const date = profile.career_date || '2026-01-01';
  const effects = getCoachEffects(coach, profile);
  return localGame.entities.PlayerProfile.update(profile.id, {
    coins: Math.max(0, (Number(profile.coins) || 0) - signing),
    coach_id: coach.id,
    coach_name: coach.name,
    coach_hired_date: date,
    coach_contract_started_date: date,
    coach_contract_end_date: addMonths(date, months),
    coach_contract_months: months,
    coach_monthly_salary: salary,
    coach_signing_cost: signing,
    coach_contract_status: 'active',
    coach_paid_by_club: false,
    coach_trust: 50,
    coach_relationship_months: 0,
    coach_tactical_understanding: 20,
    coach_affinity: effects?.affinity || 50,
    coach_training_bonus: effects?.trainingBoost || 1,
    coach_strategy_bonus: effects?.strategyBonus || 0,
    coach_partnership_bonus: effects?.partnershipBonus || 0,
  });
}

export async function replaceWithStarterCoach(profile) {
  if (!profile?.id) return { profile, coach:null };
  const cleared = await localGame.entities.PlayerProfile.update(profile.id, {
    coach_id:null, coach_name:null, coach_monthly_salary:0, coach_contract_status:'terminated', coach_paid_by_club:false,
    coach_trust:45, coach_relationship_months:0, coach_tactical_understanding:15,
  });
  return ensureStarterCoach(cleared);
}

export async function renewPrimaryCoach(profile, coach, months = 12) {
  if (!profile?.id || !coach?.id) throw new Error('Treinador não encontrado.');
  const salary = Math.max(1, Math.round((Number(profile.coach_monthly_salary) || Number(coach.monthly_cost) || 1) * 1.06));
  const date = profile.career_date || '2026-01-01';
  return localGame.entities.PlayerProfile.update(profile.id, {
    coach_contract_started_date: date,
    coach_contract_end_date: addMonths(date, months),
    coach_contract_months: months,
    coach_monthly_salary: profile.coach_paid_by_club ? 0 : salary,
    coach_contract_status:'active',
  });
}
