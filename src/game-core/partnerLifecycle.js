import { localGame } from '@/api/localGameClient.js';
import { addDays, CAREER_START_DATE } from '@/lib/career';
import {
  getActivePartnership,
  startPartnership,
  endPartnership,
  negotiatePrizeSplit,
} from '@/lib/partnershipSystem';
import { overallRating } from '@/lib/padel';
import { upsertCareerMessage } from '@/lib/careerCommunications.js';

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

  await endPartnership(active.id, 'encerrada_jogador', reason, careerDate);
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

// Fase 15 (docs/FASE_15_CIRCUITO_VIVO.md, Parte 7): interesse do parceiro
// em renovar — deriva de dados JÁ existentes na própria Partnership/
// profile (química, resultados compartilhados, moral, estabilidade),
// nunca um atributo persistido novo. Determinística (mesma entrada, mesma
// saída — Parte 7/38), sem número exposto na UI (Parte 8) — quem consome
// isto formata em ALTO/MÉDIO/BAIXO + fatores textuais.
export function calculatePartnerRenewalInterest(active, profile, { betterOpportunity = null } = {}) {
  const chemistry = clamp(active?.chemistry ?? profile?.partner_chemistry ?? 50, 0, 100);
  const matches = Number(active?.shared_matches || 0);
  const wins = Number(active?.shared_wins || 0);
  const winRate = matches > 0 ? wins / matches : 0.5;
  const morale = clamp(active?.partner_morale ?? 70, 0, 100);
  const startedDate = active?.started_career_date || active?.contract_started_date;
  const durationDays = startedDate && profile?.career_date ? Math.max(0, daysBetweenDates(startedDate, profile.career_date)) : 0;
  const stability = clamp((durationDays / 180) * 100, 0, 100); // até 6 meses juntos = estabilidade máxima

  const score = clamp(Math.round(
    chemistry * 0.35 +
    (winRate * 100) * 0.25 +
    morale * 0.20 +
    stability * 0.10 +
    (betterOpportunity ? -25 : 10) * 0.10
  ), 0, 100);

  const factors = [];
  if (chemistry >= 70) factors.push('ótima química'); else if (chemistry < 35) factors.push('química ruim');
  if (matches >= 5 && winRate >= 0.55) factors.push('bons resultados recentes'); else if (matches >= 5 && winRate < 0.35) factors.push('resultados recentes ruins');
  if (stability >= 70) factors.push('parceria estável há tempo');
  if (betterOpportunity) factors.push(`recebeu interesse de ${betterOpportunity.name || 'outro atleta'}, melhor ranqueado`);

  return {
    score,
    level: score >= 65 ? 'alto' : score >= 40 ? 'medio' : 'baixo',
    factors,
  };
}

function daysBetweenDates(from, to) {
  const start = new Date(`${String(from).slice(0, 10)}T00:00:00`).getTime();
  const end = new Date(`${String(to).slice(0, 10)}T00:00:00`).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.round((end - start) / 86400000);
}

// Fase 15 (Parte 5): thresholds de aviso idempotentes — cada um dispara no
// MÁXIMO uma vez (upsertCareerMessage já garante isso pela chave estável),
// mesmo em avanço de vários dias de uma vez (checa se o limiar foi
// CRUZADO entre previousDate e currentDate, não só "é exatamente esse
// dia" — um salto de 20 dias não pode pular o aviso D-15).
const EXPIRY_WARNING_THRESHOLDS = [15, 7, 3, 1];

async function emitExpiryWarnings(profile, active, previousDate, currentDate, endDate) {
  for (const daysBefore of EXPIRY_WARNING_THRESHOLDS) {
    const warningDate = addDays(endDate, -daysBefore);
    if (!(previousDate < warningDate && currentDate >= warningDate)) continue;
    const label = daysBefore === 1 ? 'Decida o futuro da dupla.' : daysBefore <= 3 ? `Seu contrato termina em ${daysBefore} dias.` : daysBefore <= 7 ? 'Hora de pensar no futuro da dupla.' : `Seu contrato com ${active.partner_name} termina em ${daysBefore} dias.`;
    await upsertCareerMessage(profile.id, `partner-contract-expiry:${active.id}:${daysBefore}`, {
      sender_name: active.partner_name,
      sender_type: 'atleta',
      title: daysBefore <= 3 ? 'Futuro da dupla' : 'Contrato se aproximando do fim',
      content: label,
      status: 'decisao_pendente',
      priority: daysBefore <= 3 ? 'alta' : 'normal',
      message_type: 'partner_contract_expiry',
      career_date: currentDate,
      actions: [{ id: 'open_partner_hub', label: 'Conversar sobre o futuro', type: 'view_partnership', payload: { partnershipId: active.id } }],
      destination: { type: 'PARTNERSHIP', route: '/partners', params: { view: 'contract' } },
    });
  }
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
  // Fase 15 (Parte 2/4/5): bug real confirmado pela auditoria — este bloco
  // já implementava o vencimento (vencido -> 7 dias de carência ->
  // encerramento + partner_id null) corretamente, mas NUNCA criava
  // nenhuma CareerMessage em nenhum dos 2 pontos — o único sistema de
  // contrato do jogo (junto com staff/coach) sem cobertura de aviso
  // nenhuma. "Simplesmente desapareceu" era exatamente isso: lifecycle
  // real, zero UX.
  if (endDate) {
    await emitExpiryWarnings(profile, active, previousDate, currentDate, endDate);
  }
  if (endDate && currentDate >= endDate) {
    const wasAlreadyVencido = active.contract_status === 'vencido';
    updates.renewal_available = true;
    updates.contract_status = 'vencido';
    if (!wasAlreadyVencido) {
      await upsertCareerMessage(profile.id, `partner-contract-vencido:${active.id}`, {
        sender_name: active.partner_name,
        sender_type: 'atleta',
        title: 'Contrato vencido',
        content: `Nosso contrato chegou ao fim. Temos 7 dias para decidir: renovar ou seguir caminhos separados.`,
        status: 'decisao_pendente',
        priority: 'alta',
        message_type: 'partner_contract_expiry',
        career_date: currentDate,
        actions: [{ id: 'open_partner_hub', label: 'Resolver agora', type: 'view_partnership', payload: { partnershipId: active.id } }],
        destination: { type: 'PARTNERSHIP', route: '/partners', params: { view: 'contract' } },
      });
    }
    if (currentDate > addDays(endDate, 7)) {
      const partnerName = active.partner_name;
      await endPartnership(active.id, 'encerrada_contrato', 'Contrato não renovado', currentDate);
      await upsertCareerMessage(profile.id, `partner-contract-ended:${active.id}`, {
        sender_name: partnerName,
        sender_type: 'atleta',
        title: 'Fim da parceria',
        content: `Nosso contrato com ${partnerName} chegou ao fim. ${Number(active.shared_matches) || 0} partidas, ${Number(active.shared_wins) || 0} vitórias${Number(active.shared_titles) ? `, ${active.shared_titles} título${active.shared_titles === 1 ? '' : 's'}` : ''} juntos.`,
        status: 'nao_lida',
        priority: 'alta',
        message_type: 'partner_contract_ended',
        career_date: currentDate,
        actions: [{ id: 'find_partner', label: 'Buscar nova dupla', type: 'view_partnership', payload: {} }],
        destination: { type: 'PARTNER_OFFER', route: '/partners', params: { view: 'offers' } },
      });
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
