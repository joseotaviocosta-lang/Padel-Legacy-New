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
import { calculateRenewalInterest, decideRenewal, getPartnershipContractTransition, seededChance, seededHash } from './livingCircuitRules.js';

const entities = /** @type {any} */ (localGame.entities);

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

async function resolvePartnerDecisionMessages(profileId, partnershipId, outcome) {
  if (!profileId || !partnershipId) return 0;
  const rows = await entities.CareerMessage.filter({ profile_id: profileId }, '-created_date', 160).catch(() => []);
  const pending = rows.filter((row) => {
    const contextKey = String(row.metadata?.context_key || '');
    return !['resolvida', 'ignorada', 'invalidada'].includes(row.status)
      && contextKey.includes(partnershipId)
      && (contextKey.startsWith('partner-contract-') || contextKey.startsWith('partner-renewal:'));
  });
  if (!pending.length) return 0;
  await localGame.batch(pending.map((row) => ({
    type: 'update', entityName: 'CareerMessage', id: row.id,
    data: { status: 'resolvida', is_read: true, is_new: false, chosen_action_id: outcome },
  })));
  return pending.length;
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
  const partnership = await entities.Partnership.update(result.partnership.id, {
    contract_status: 'ativo',
    monthly_salary: terms.monthlySalary,
    partner_morale: terms.morale,
    contract_started_date: careerDate,
    contract_end_date: addDays(careerDate, terms.durationDays),
    last_salary_month: null,
    renewal_available: false,
  });

  await Promise.allSettled([
    entities.HistoryEntry.create({
      profile_id: profile.id,
      year: Number(careerDate.slice(0, 4)),
      event_date: careerDate,
      title: `Nova dupla: ${bot.name}`,
      description: `Contrato de ${terms.durationDays} dias, divisão de ${terms.prizeSplit}% da premiação e salário mensal de ${terms.monthlySalary} moedas.`,
      category: 'parceria',
    }),
    entities.CareerMessage.create({
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
  const partnerRows = await entities.AthleteProfile.filter({ id: active.partner_bot_id }, null, 1).catch(() => []);
  const partner = partnerRows[0] || { id: active.partner_bot_id, name: active.partner_name, expected_salary: active.monthly_salary };
  const decisionKey = `${careerDate}:${durationDays}:${prizeSplit}:${monthlySalary}`;
  if (active.last_renewal_decision_key === decisionKey && active.last_renewal_decision) {
    return { partnership: active, profile, decision: active.last_renewal_decision, idempotent: true };
  }
  const decision = decideRenewal(active, profile, partner, { durationDays, prizeSplit, monthlySalary }, careerDate, active.partner_market_offer || null);

  if (decision.outcome === 'wait' || decision.outcome === 'refused') {
    const contractStatus = decision.outcome === 'wait' ? 'negociacao' : 'nao_renovara';
    const partnership = await entities.Partnership.update(active.id, {
      contract_status: contractStatus,
      renewal_available: decision.outcome === 'wait',
      last_renewal_decision_key: decisionKey,
      last_renewal_decision: decision,
      renewal_interest_snapshot: decision.interest,
    });
    await upsertCareerMessage(profile.id, `partner-renewal:${active.id}:${decisionKey}`, {
      sender_name: active.partner_name,
      sender_type: 'atleta',
      title: decision.outcome === 'wait' ? 'Futuro da dupla em aberto' : 'Parceiro não renovará o contrato',
      content: decision.outcome === 'wait'
        ? 'Quero esperar um pouco antes de confirmar a renovação. Podemos conversar novamente mais perto do vencimento.'
        : 'Decidi não renovar quando o contrato terminar. Até lá, seguiremos cumprindo nosso calendário normalmente.',
      status: 'decisao_pendente', priority: 'alta', message_type: 'partner_renewal_decision', career_date: careerDate,
      destination: { type: 'PARTNERSHIP', route: '/partners', params: { view: 'contract' } },
    });
    if (decision.outcome === 'refused') await resolvePartnerDecisionMessages(profile.id, active.id, 'renewal_refused');
    return { partnership, profile, decision };
  }

  const acceptedTerms = decision.conditions
    ? { durationDays, prizeSplit: Math.min(prizeSplit, decision.conditions.maximumPlayerPrizeSplit), monthlySalary: Math.max(monthlySalary, decision.conditions.minimumSalary) }
    : { durationDays, prizeSplit, monthlySalary };

  await negotiatePrizeSplit(active.id, acceptedTerms.prizeSplit);
  const partnership = await entities.Partnership.update(active.id, {
    status: 'ativa',
    contract_status: 'renovado',
    negotiated_duration_days: acceptedTerms.durationDays,
    scheduled_end_date: addDays(careerDate, acceptedTerms.durationDays),
    contract_end_date: addDays(careerDate, acceptedTerms.durationDays),
    monthly_salary: acceptedTerms.monthlySalary,
    prize_split_pct: acceptedTerms.prizeSplit,
    renewal_available: false,
    partner_morale: clamp((active.partner_morale ?? 70) + 5, 0, 100),
    last_renewal_decision_key: decisionKey,
    last_renewal_decision: decision,
    renewal_interest_snapshot: decision.interest,
    partner_market_offer: null,
    renewal_count: Number(active.renewal_count || 0) + 1,
    history: [...(active.history || []), { date: careerDate, event: 'renewed', outcome: decision.outcome, duration_days: acceptedTerms.durationDays }].slice(-30),
  });
  const updatedProfile = await entities.PlayerProfile.update(profile.id, {
    partner_locked_until: partnership.contract_end_date,
  });
  await resolvePartnerDecisionMessages(profile.id, active.id, 'renewed');
  await Promise.allSettled([
    entities.HistoryEntry.create({
      profile_id: profile.id,
      year: Number(careerDate.slice(0, 4)),
      event_date: careerDate,
      title: `Contrato renovado com ${active.partner_name}`,
      description: `Novo vínculo de ${acceptedTerms.durationDays} dias, salário mensal de ${acceptedTerms.monthlySalary} moedas e ${acceptedTerms.prizeSplit}% da premiação para o jogador.`,
      category: 'parceria',
    }),
    entities.CareerMessage.create({
      profile_id: profile.id,
      sender_name: active.partner_name,
      subject: 'Renovação confirmada',
      body: `Nosso contrato foi renovado até ${partnership.contract_end_date}.`,
      status: 'nao_lida',
      message_type: 'partner_contract',
      created_date: new Date().toISOString(),
    }),
  ]);
  return { partnership, profile: updatedProfile, decision, terms: acceptedTerms };
}

export async function releasePartner(profile, reason = 'Decisão do jogador') {
  const active = await getActivePartnership(profile?.id);
  if (!active) return { profile, penalty: 0 };
  const careerDate = profile.career_date || CAREER_START_DATE;
  const early = active.contract_end_date && active.contract_end_date > careerDate;
  const penalty = early ? Math.min(Number(profile.coins) || 0, Math.max(50, Math.round((active.monthly_salary || 100) * 0.5))) : 0;

  await endPartnership(active.id, 'encerrada_jogador', reason, careerDate);
  const updatedProfile = await entities.PlayerProfile.update(profile.id, {
    partner_id: null,
    partner_name: null,
    partner_locked_until: null,
    partner_chemistry: 50,
    coins: Math.max(0, (Number(profile.coins) || 0) - penalty),
  });
  await resolvePartnerDecisionMessages(profile.id, active.id, 'released');
  if (penalty > 0) {
    await entities.FinancialTransaction.create({
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

export async function schedulePartnerSeparation(profile, reason = 'Fim de ciclo decidido pelo jogador') {
  const active = await getActivePartnership(profile?.id);
  if (!active) throw new Error('Nenhuma parceria ativa.');
  const careerDate = profile.career_date || CAREER_START_DATE;
  const endDate = active.contract_end_date || active.scheduled_end_date || careerDate;
  const partnership = await entities.Partnership.update(active.id, {
    contract_status: 'encerrar_ao_final', renewal_available: false,
    planned_end_reason: reason,
    history: [...(active.history || []), { date: careerDate, event: 'end_scheduled', reason }].slice(-30),
  });
  await upsertCareerMessage(profile.id, `partner-end-scheduled:${active.id}`, {
    sender_name: active.partner_name, sender_type: 'atleta', title: 'Fim de ciclo combinado',
    content: `A parceria seguirá normalmente até ${endDate}. Depois disso, cada atleta ficará livre para buscar uma nova dupla.`,
    status: 'nao_lida', priority: 'normal', message_type: 'partner_contract', career_date: careerDate,
    destination: { type: 'CONTRACT', route: '/partners', params: { view: 'contract', focus: 'contract-future', partnership: active.id } },
  });
  await resolvePartnerDecisionMessages(profile.id, active.id, 'end_scheduled');
  return { partnership, profile };
}

export async function processPartnerMarketInterest(profile, previousDate, currentDate) {
  if (!profile?.id || !profile.partner_id || monthKey(previousDate) === monthKey(currentDate)) return profile;
  const active = await getActivePartnership(profile.id);
  if (!active || active.last_partner_market_month === monthKey(currentDate)) return profile;
  const partnerRows = await entities.AthleteProfile.filter({ id: active.partner_bot_id }, null, 1).catch(() => []);
  const partner = partnerRows[0];
  if (!partner) return profile;
  const interest = calculateRenewalInterest(active, profile, partner, null);
  const chance = interest.level === 'baixo' ? 20 : interest.level === 'medio' ? 9 : 3;
  const month = monthKey(currentDate);
  const mark = { last_partner_market_month: month };
  if (!seededChance(`${profile.id}:${active.id}:${month}:partner-market`, chance)) {
    await entities.Partnership.update(active.id, mark);
    return profile;
  }

  const candidates = (await entities.AthleteProfile.filter({ market_status: 'livre' }, 'ranking_position', 80).catch(() => []))
    .filter((candidate) => candidate.id && candidate.id !== partner.id && candidate.career_status !== 'aposentado');
  if (!candidates.length) {
    await entities.Partnership.update(active.id, mark);
    return profile;
  }
  const ordered = candidates.sort((a, b) => {
    const scoreA = Math.abs(Number(a.ranking_position || 999) - Number(partner.ranking_position || 999)) - (seededHash(`${month}:${a.id}`) % 12);
    const scoreB = Math.abs(Number(b.ranking_position || 999) - Number(partner.ranking_position || 999)) - (seededHash(`${month}:${b.id}`) % 12);
    return scoreA - scoreB;
  });
  const suitor = ordered[0];
  const offerId = `partner-poaching-${active.id}-${month}`;
  const offer = await entities.PartnerOffer.upsert(offerId, {
    profile_id: profile.id, candidate_player_id: suitor.id, athlete_id: suitor.id, athlete_name: suitor.name,
    recipient_athlete_id: partner.id, recipient_athlete_name: partner.name, offer_type: 'partner_poaching',
    direction: 'to_player_partner', status: 'pending_partner', created_career_date: currentDate,
    expires_career_date: active.contract_end_date || active.scheduled_end_date, source: 'living-partnership-market',
    candidate_snapshot: suitor, schema_version: 2,
  });
  const opportunity = { id: offer.id, name: suitor.name, ranking_position: suitor.ranking_position, offer_date: currentDate };
  await entities.Partnership.update(active.id, { ...mark, partner_market_offer: opportunity });
  await upsertCareerMessage(profile.id, `partner-market-interest:${active.id}:${month}`, {
    sender_name: 'Empresário', sender_type: 'empresario', title: 'Seu parceiro recebeu uma sondagem',
    content: `${suitor.name} demonstrou interesse em formar dupla com ${partner.name}. Isso não encerra seu contrato, mas pode influenciar a próxima renovação.`,
    status: 'decisao_pendente', priority: 'alta', message_type: 'partner_market_interest', career_date: currentDate,
    related_entity_type: 'partner_offer', related_entity_id: offer.id,
    actions: [{ id: 'talk_future', label: 'Conversar sobre o futuro', type: 'view_partnership', payload: { partnershipId: active.id } }],
    destination: { type: 'PARTNERSHIP', route: '/partners', params: { view: 'contract' } },
  });
  return profile;
}

// Fase 15 (docs/FASE_15_CIRCUITO_VIVO.md, Parte 7): interesse do parceiro
// em renovar — deriva de dados JÁ existentes na própria Partnership/
// profile (química, resultados compartilhados, moral, estabilidade),
// nunca um atributo persistido novo. Determinística (mesma entrada, mesma
// saída — Parte 7/38), sem número exposto na UI (Parte 8) — quem consome
// isto formata em ALTO/MÉDIO/BAIXO + fatores textuais.
export function calculatePartnerRenewalInterest(active, profile, { betterOpportunity = null } = {}) {
  return calculateRenewalInterest(active, profile, {}, betterOpportunity);
}

// Fase 15 (Parte 5): thresholds de aviso idempotentes — cada um dispara no
// MÁXIMO uma vez (upsertCareerMessage já garante isso pela chave estável),
// mesmo em avanço de vários dias de uma vez (checa se o limiar foi
// CRUZADO entre previousDate e currentDate, não só "é exatamente esse
// dia" — um salto de 20 dias não pode pular o aviso D-15).
async function emitExpiryWarnings(profile, active, currentDate, warningDays) {
  for (const daysBefore of warningDays) {
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
      destination: { type: 'CONTRACT', route: '/partners', params: { view: 'contract', focus: 'contract-future', partnership: active.id } },
    });
  }
}

export async function processPartnerDay(profile, previousDate, currentDate) {
  const active = await getActivePartnership(profile?.id);
  if (!active) return profile;

  const partnerRows = await entities.AthleteProfile.filter({ id: active.partner_bot_id }, null, 1).catch(() => []);
  const partnerStatus = String(partnerRows[0]?.career_status || partnerRows[0]?.status || '').toLowerCase();
  if (partnerRows[0]?.retired || ['aposentado', 'retired'].includes(partnerStatus)) {
    await endPartnership(active.id, 'encerrada_parceiro', 'Aposentadoria do parceiro', currentDate);
    await upsertCareerMessage(profile.id, `partner-retirement:${active.id}`, {
      sender_name: active.partner_name, sender_type: 'atleta', title: 'Fim da parceria',
      content: `${active.partner_name} encerrou a carreira competitiva. O histórico da dupla foi preservado e você já pode buscar um novo parceiro.`,
      status: 'nao_lida', priority: 'alta', message_type: 'partner_contract_ended', career_date: currentDate,
      destination: { type: 'PARTNER_OFFER', route: '/partners', params: { view: 'offers' } },
    });
    await resolvePartnerDecisionMessages(profile.id, active.id, 'partner_retired');
    return entities.PlayerProfile.update(profile.id, { partner_id: null, partner_name: null, partner_locked_until: null, partner_chemistry: 50 });
  }

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
        await entities.FinancialTransaction.create({
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
        await entities.CareerMessage.create({
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
  const transition = getPartnershipContractTransition(active, previousDate, currentDate);
  // Fase 15 (Parte 2/4/5): bug real confirmado pela auditoria — este bloco
  // já implementava o vencimento (vencido -> 7 dias de carência ->
  // encerramento + partner_id null) corretamente, mas NUNCA criava
  // nenhuma CareerMessage em nenhum dos 2 pontos — o único sistema de
  // contrato do jogo (junto com staff/coach) sem cobertura de aviso
  // nenhuma. "Simplesmente desapareceu" era exatamente isso: lifecycle
  // real, zero UX.
  if (endDate) {
    await emitExpiryWarnings(profile, active, currentDate, transition.warningDays);
    const daysRemaining = transition.daysRemaining;
    if (daysRemaining <= 15 && daysRemaining > 0 && !['encerrar_ao_final', 'nao_renovara'].includes(active.contract_status)) {
      updates.contract_status = 'renovacao_proxima';
      updates.renewal_available = true;
    }
  }
  if (endDate && currentDate >= endDate) {
    const wasAlreadyVencido = active.contract_status === 'vencido';
    const plannedEnd = ['encerrar_ao_final', 'nao_renovara'].includes(active.contract_status);
    updates.renewal_available = !plannedEnd;
    updates.contract_status = plannedEnd ? active.contract_status : 'vencido';
    if (!wasAlreadyVencido && !plannedEnd) {
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
        destination: { type: 'CONTRACT', route: '/partners', params: { view: 'contract', focus: 'contract-future', partnership: active.id } },
      });
    }
    if (transition.shouldEnd) {
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
      await resolvePartnerDecisionMessages(profile.id, active.id, 'contract_ended');
      return entities.PlayerProfile.update(profile.id, {
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

  await entities.Partnership.update(active.id, updates);
  if (Object.keys(profileUpdates).length > 0) {
    return entities.PlayerProfile.update(profile.id, profileUpdates);
  }
  return profile;
}
