import { localGame } from '@/api/localGameClient.js';
import { addDays, CAREER_START_DATE } from '@/lib/career';
import {
  getActivePartnership,
  startPartnership,
  endPartnership,
  negotiatePrizeSplit,
} from '@/lib/partnershipSystem';
import { overallRating } from '@/lib/padel';

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function monthKey(date) {
  return String(date || '').slice(0, 7);
}

function defaultSalary(bot) {
  const ovr = overallRating(bot || {});
  return Math.max(80, Math.round((ovr * ovr) / 18));
}

export function getSuggestedPartnerTerms(profile, bot) {
  const ovr = overallRating(bot || {});
  const playerOvr = overallRating(profile || {});
  const gap = Math.max(0, ovr - playerOvr);
  return {
    durationDays: gap >= 15 ? 30 : gap >= 8 ? 45 : 60,
    prizeSplit: clamp(50 + Math.round(gap / 3), 45, 65),
    monthlySalary: defaultSalary(bot),
    morale: 70,
  };
}

export async function formPartnerContract(profile, bot, requestedTerms = {}) {
  if (!profile?.id || !bot?.id) throw new Error('Perfil ou parceiro inválido.');
  const suggested = getSuggestedPartnerTerms(profile, bot);
  const terms = {
    durationDays: clamp(requestedTerms.durationDays ?? suggested.durationDays, 30, 180),
    prizeSplit: clamp(requestedTerms.prizeSplit ?? suggested.prizeSplit, 35, 70),
    monthlySalary: clamp(requestedTerms.monthlySalary ?? suggested.monthlySalary, 0, 999999),
    morale: clamp(requestedTerms.morale ?? suggested.morale, 0, 100),
  };

  const result = await startPartnership(profile, bot, terms.durationDays, terms.prizeSplit);
  const careerDate = profile.career_date || CAREER_START_DATE;
  const partnership = await localGame.entities.Partnership.update(result.partnership.id, {
    contract_status: 'ativo',
    monthly_salary: terms.monthlySalary,
    partner_morale: terms.morale,
    contract_started_date: careerDate,
    contract_end_date: addDays(careerDate, terms.durationDays),
    last_salary_month: null,
    renewal_available: false,
  });

  await Promise.allSettled([
    localGame.entities.HistoryEntry.create({
      profile_id: profile.id,
      year: Number(careerDate.slice(0, 4)),
      event_date: careerDate,
      title: `Nova dupla: ${bot.name}`,
      description: `Contrato de ${terms.durationDays} dias, divisão de ${terms.prizeSplit}% da premiação e salário mensal de ${terms.monthlySalary} moedas.`,
      category: 'parceria',
    }),
    localGame.entities.CareerMessage.create({
      profile_id: profile.id,
      sender_name: bot.name,
      subject: 'Contrato de dupla confirmado',
      body: `Nossa parceria está confirmada até ${partnership.contract_end_date}. Vamos construir resultados juntos.`,
      status: 'nao_lida',
      message_type: 'partner_contract',
      created_date: new Date().toISOString(),
    }),
  ]);

  return { ...result, partnership };
}

export async function renewPartnerContract(profile, terms = {}) {
  const active = await getActivePartnership(profile?.id);
  if (!active) throw new Error('Nenhuma parceria ativa.');
  const careerDate = profile.career_date || CAREER_START_DATE;
  const durationDays = clamp(terms.durationDays ?? 60, 30, 180);
  const prizeSplit = clamp(terms.prizeSplit ?? active.prize_split_pct ?? 50, 35, 70);
  const monthlySalary = clamp(terms.monthlySalary ?? active.monthly_salary ?? 100, 0, 999999);

  await negotiatePrizeSplit(active.id, prizeSplit);
  const partnership = await localGame.entities.Partnership.update(active.id, {
    status: 'ativa',
    contract_status: 'renovado',
    negotiated_duration_days: durationDays,
    scheduled_end_date: addDays(careerDate, durationDays),
    contract_end_date: addDays(careerDate, durationDays),
    monthly_salary: monthlySalary,
    renewal_available: false,
    partner_morale: clamp((active.partner_morale ?? 70) + 5, 0, 100),
  });
  const updatedProfile = await localGame.entities.PlayerProfile.update(profile.id, {
    partner_locked_until: partnership.contract_end_date,
  });
  await Promise.allSettled([
    localGame.entities.HistoryEntry.create({
      profile_id: profile.id,
      year: Number(careerDate.slice(0, 4)),
      event_date: careerDate,
      title: `Contrato renovado com ${active.partner_name}`,
      description: `Novo vínculo de ${durationDays} dias, salário mensal de ${monthlySalary} moedas e ${prizeSplit}% da premiação para o jogador.`,
      category: 'parceria',
    }),
    localGame.entities.CareerMessage.create({
      profile_id: profile.id,
      sender_name: active.partner_name,
      subject: 'Renovação confirmada',
      body: `Nosso contrato foi renovado até ${partnership.contract_end_date}.`,
      status: 'nao_lida',
      message_type: 'partner_contract',
      created_date: new Date().toISOString(),
    }),
  ]);
  return { partnership, profile: updatedProfile };
}

export async function releasePartner(profile, reason = 'Decisão do jogador') {
  const active = await getActivePartnership(profile?.id);
  if (!active) return { profile, penalty: 0 };
  const careerDate = profile.career_date || CAREER_START_DATE;
  const early = active.contract_end_date && active.contract_end_date > careerDate;
  const penalty = early ? Math.min(Number(profile.coins) || 0, Math.max(50, Math.round((active.monthly_salary || 100) * 0.5))) : 0;

  await endPartnership(active.id, 'encerrada_jogador', reason);
  const updatedProfile = await localGame.entities.PlayerProfile.update(profile.id, {
    partner_id: null,
    partner_name: null,
    partner_locked_until: null,
    partner_chemistry: 50,
    coins: Math.max(0, (Number(profile.coins) || 0) - penalty),
  });
  if (penalty > 0) {
    await localGame.entities.FinancialTransaction.create({
      profile_id: profile.id,
      date: careerDate,
      type: 'expense',
      category: 'parceria',
      description: `Rescisão antecipada com ${active.partner_name}`,
      amount: penalty,
    });
  }
  return { profile: updatedProfile, penalty };
}

export async function processPartnerDay(profile, previousDate, currentDate) {
  const active = await getActivePartnership(profile?.id);
  if (!active) return profile;

  const updates = {};
  const profileUpdates = {};
  const oldMorale = active.partner_morale ?? 70;
  const chemistry = active.chemistry ?? profile.partner_chemistry ?? 50;
  const salaryMonth = monthKey(currentDate);

  if (monthKey(previousDate) !== salaryMonth && active.last_salary_month !== salaryMonth) {
    const salary = Math.max(0, Number(active.monthly_salary) || 0);
    if (salary > 0) {
      const balance = Number(profile.coins) || 0;
      if (balance >= salary) {
        profileUpdates.coins = balance - salary;
        updates.partner_morale = clamp(oldMorale + 2, 0, 100);
        await localGame.entities.FinancialTransaction.create({
          profile_id: profile.id,
          date: currentDate,
          type: 'expense',
          category: 'parceria',
          description: `Salário mensal de ${active.partner_name}`,
          amount: salary,
        });
      } else {
        updates.partner_morale = clamp(oldMorale - 15, 0, 100);
        // Polish editorial (docs/NOTIFICATION_EDITORIAL_POLISH.md): um
        // problema financeiro real com a dupla é ação necessária, não uma
        // atualização qualquer — priority ficava sem valor (caía em
        // 'normal') apesar de precisar de atenção.
        await localGame.entities.CareerMessage.create({
          profile_id: profile.id,
          sender_name: active.partner_name,
          subject: 'Salário da dupla em atraso',
          body: 'O pagamento mensal não foi realizado. Minha moral caiu e precisamos resolver isso.',
          status: 'nao_lida',
          priority: 'alta',
          message_type: 'partner_warning',
          created_date: new Date().toISOString(),
        });
      }
      updates.last_salary_month = salaryMonth;
    }
  }

  const endDate = active.contract_end_date || active.scheduled_end_date;
  if (endDate && currentDate >= endDate) {
    updates.renewal_available = true;
    updates.contract_status = 'vencido';
    if (currentDate > addDays(endDate, 7)) {
      await endPartnership(active.id, 'encerrada_contrato', 'Contrato não renovado');
      return localGame.entities.PlayerProfile.update(profile.id, {
        ...profileUpdates,
        partner_id: null,
        partner_name: null,
        partner_locked_until: null,
        partner_chemistry: 50,
      });
    }
  }

  const moraleDelta = chemistry >= 75 ? 1 : chemistry < 30 ? -2 : 0;
  updates.partner_morale = clamp((updates.partner_morale ?? oldMorale) + moraleDelta, 0, 100);
  if (updates.partner_morale < 15) {
    updates.renewal_available = false;
    updates.contract_status = 'insatisfeito';
  }

  await localGame.entities.Partnership.update(active.id, updates);
  if (Object.keys(profileUpdates).length > 0) {
    return localGame.entities.PlayerProfile.update(profile.id, profileUpdates);
  }
  return profile;
}
