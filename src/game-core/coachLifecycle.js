import { localGame } from '@/api/localGameClient.js';
import { COACHES_DATA, canHireCoach, getCoachEffects, resolveCoachCanonicalSalary } from '@/lib/coaches.js';
import { incrementMissionProgress } from '@/lib/padel.js';

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
  // Tutorial 4.1 (docs/TUTORIAL_4_1_EXPANDED_ONBOARDING_AND_COACH_CLARITY.md,
  // Parte H): saves antigos podem ter linhas de Coach de um seed legado
  // (nome fora de COACHES_DATA, sem monthly_cost real) — a raiz do bug
  // "salário mensal de 1 moedas". Nunca deletamos a linha (histórico do
  // save é preservado), só paramos de oferecê-la no mercado: sem
  // correspondência no catálogo real e sem um monthly_cost válido, ela
  // não tem como ser exibida ou contratada com segurança.
  return coaches.filter(coach => catalogByName.has(normalizeName(coach.name)) || Number(coach.monthly_cost) > 0);
}

export function isCoachActive(profile) {
  return Boolean(profile?.coach_id && !['terminated','expired'].includes(profile?.coach_contract_status));
}

// Hotfix "Starter Coach Flow" (docs/STARTER_COACH_FLOW.md): uma carreira
// nova não deve receber um treinador contratado silenciosamente. Esta
// função só RESOLVE um treinador já ativo (se houver) — nunca cria um
// contrato. Auditoria confirmou que nenhum sistema (treino, partidas,
// Live Coach, painel de comissão, fechamento mensal) exige um coach
// sempre presente — todos já tratam `coach: null`/`coach_id` ausente
// corretamente (`coach ? x : 0`), então não existe necessidade técnica de
// um "fallback" a preservar internamente.
export async function resolveActiveCoach(profile) {
  if (!profile?.id || !isCoachActive(profile)) return { profile, coach: null };
  const coaches = await ensureCoachCatalog();
  const current = coaches.find(coach => coach.id === profile.coach_id) || await localGame.entities.Coach.get(profile.coach_id).catch(() => null);
  // Tutorial 4.1 (Parte H/I): correção única e não-destrutiva para saves já
  // afetados pelo bug "salário mensal de 1 moedas" (herdado do seed legado
  // removido) — corrige só o dado quebrado, nunca concede nem revoga
  // nenhuma recompensa/coins.
  if (current && !profile.coach_paid_by_club && Number(profile.coach_monthly_salary) <= 1) {
    const corrected = resolveCoachCanonicalSalary(current);
    if (corrected != null && corrected !== Number(profile.coach_monthly_salary)) {
      const updated = await localGame.entities.PlayerProfile.update(profile.id, { coach_monthly_salary: corrected }).catch(() => profile);
      return { profile: updated, coach: current };
    }
  }
  return { profile, coach: current || null };
}

export async function hirePrimaryCoach(profile, coach, months = 12) {
  if (!profile?.id || !coach?.id) throw new Error('Dados do treinador incompletos.');
  const check = canHireCoach(coach, profile);
  if (!check.allowed) throw new Error(check.reason || 'Treinador indisponível.');
  // Tutorial 4.1 (Parte H/I): nunca cair silenciosamente em 1 moeda —
  // resolveCoachCanonicalSalary já cobre o catálogo real como fallback;
  // se mesmo assim não resolver, falha de forma diagnosticável em vez de
  // prosseguir com um valor inventado.
  const salary = resolveCoachCanonicalSalary(coach);
  if (salary == null) throw new Error(`Salário do treinador "${coach.name || coach.id}" não encontrado no catálogo — contratação cancelada.`);
  const signing = Math.max(0, Number(coach.market_signing_bonus ?? coach.sign_on_bonus) || 0);
  if ((Number(profile.coins) || 0) < signing) throw new Error(`São necessárias ${signing} moedas para o bônus de assinatura.`);
  const date = profile.career_date || '2026-01-01';
  const effects = getCoachEffects(coach, profile);
  const updated = await localGame.entities.PlayerProfile.update(profile.id, {
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
  // Hotfix "Starter Coach Flow" (docs/STARTER_COACH_FLOW.md, Parte B/G): a
  // etapa coaches-known do tutorial virou DECISION — só conclui numa
  // contratação real, nunca por visitar /coaches. objectiveType continua
  // 'visit_coaches' de propósito (não renomeado): é a mesma chave que a
  // linha de missão do tutorial já tinha persistida antes desta fase, e
  // incrementMissionProgress exige objective_type idêntico ao da missão
  // já gravada mesmo quando um missionId é passado — trocar o nome exigiria
  // uma migração de save que esta fase não precisa.
  // allowDuringHydration: true — contratar é uma ação explícita do jogador
  // (clique em "Contratar"), mesmo padrão já usado por completeTutorialStep
  // para os botões de confirmação do Guia.
  await incrementMissionProgress(profile.id, 'visit_coaches', 1, date, { onlyMissionTypes: ['tutorial'], allowDuringHydration: true }).catch(() => {});
  return updated;
}

export async function renewPrimaryCoach(profile, coach, months = 12) {
  if (!profile?.id || !coach?.id) throw new Error('Treinador não encontrado.');
  const baseline = Number(profile.coach_monthly_salary) > 0 ? Number(profile.coach_monthly_salary) : resolveCoachCanonicalSalary(coach);
  if (!(baseline > 0)) throw new Error(`Salário do treinador "${coach.name || coach.id}" não encontrado no catálogo — renovação cancelada.`);
  const salary = Math.round(baseline * 1.06);
  const date = profile.career_date || '2026-01-01';
  return localGame.entities.PlayerProfile.update(profile.id, {
    coach_contract_started_date: date,
    coach_contract_end_date: addMonths(date, months),
    coach_contract_months: months,
    coach_monthly_salary: profile.coach_paid_by_club ? 0 : salary,
    coach_contract_status:'active',
  });
}
