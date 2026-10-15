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
import { findCommittedTournaments, resolveScheduledSeparationDate, PARTNERSHIP_EXIT_STATUSES } from '@/lib/committedRoster.js';
import { ensurePostSeparationPartnerMarket } from './postSeparationMarket.js';

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
      // 5.27-J: corte temporal da decisão de saída (primeira vez; nunca reescrito).
      ...(decision.outcome === 'refused' && !active.exit_decided_at ? { exit_decided_at: careerDate } : {}),
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
    // 5.27-J: renovado, não há mais saída decidida — o corte temporal anterior não vale.
    exit_decided_at: null,
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
    exit_decided_at: active.exit_decided_at || careerDate,
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
// Playthrough 5.17 (continuação), Partes A/B — ESTADO DA DECISÃO CONTRATUAL.
//
// Auditoria: existem 4 avisos (D-15, D-7, D-3, D-1), cada um com chave de
// contexto estável por marco — então nenhum deles duplica por dia nem por
// reload. O problema é outro: TODOS eram emitidos com
// `status: 'decisao_pendente'` mesmo DEPOIS de o jogador já ter decidido.
// "Decida o futuro da dupla" reaparecia como se nada tivesse acontecido.
//
// A fonte de verdade continua sendo `Partnership.contract_status` (Parte B:
// não duplicar source of truth). Esta função apenas o traduz para os estados
// nomeados que o relatório pede.
export const CONTRACT_DECISION_STATES = Object.freeze({
  UNDECIDED: 'UNDECIDED',
  RENEWED: 'RENEWED',
  ENDING_AT_EXPIRY: 'ENDING_AT_EXPIRY',
  ENDING_AFTER_COMMITMENTS: 'ENDING_AFTER_COMMITMENTS',
  ENDED: 'ENDED',
});

export function getContractDecisionState(partnership) {
  const status = String(partnership?.contract_status || '');
  if (!partnership || partnership.status !== 'ativa') return CONTRACT_DECISION_STATES.ENDED;
  if (status === 'encerra_apos_compromisso') return CONTRACT_DECISION_STATES.ENDING_AFTER_COMMITMENTS;
  if (['encerrar_ao_final', 'nao_renovara'].includes(status)) return CONTRACT_DECISION_STATES.ENDING_AT_EXPIRY;
  if (['renovado', 'renovada'].includes(status)) return CONTRACT_DECISION_STATES.RENEWED;
  return CONTRACT_DECISION_STATES.UNDECIDED;
}

export function isContractDecided(partnership) {
  return getContractDecisionState(partnership) !== CONTRACT_DECISION_STATES.UNDECIDED;
}

async function emitExpiryWarnings(profile, active, currentDate, warningDays) {
  // Parte B — uma decisão tomada permanece tomada. Com a decisão registrada,
  // o marco vira informativo (o jogador continua sabendo que a data se
  // aproxima) e NUNCA volta como pendência.
  const decided = isContractDecided(active);
  for (const daysBefore of warningDays) {
    const decisionState = getContractDecisionState(active);
    const decidedLabel = decisionState === CONTRACT_DECISION_STATES.RENEWED
      ? `Contrato renovado. Faltam ${daysBefore} dias para o marco anterior.`
      : decisionState === CONTRACT_DECISION_STATES.ENDING_AFTER_COMMITMENTS
        ? `Separação já agendada: a dupla segue até o último compromisso assumido.`
        : `Separação já decidida: o contrato termina em ${daysBefore} dias.`;
    const label = decided
      ? decidedLabel
      : daysBefore === 1 ? 'Decida o futuro da dupla.' : daysBefore <= 3 ? `Seu contrato termina em ${daysBefore} dias.` : daysBefore <= 7 ? 'Hora de pensar no futuro da dupla.' : `Seu contrato com ${active.partner_name} termina em ${daysBefore} dias.`;
    await upsertCareerMessage(profile.id, `partner-contract-expiry:${active.id}:${daysBefore}`, {
      sender_name: active.partner_name,
      sender_type: 'atleta',
      title: decided ? 'Contrato — decisão registrada' : daysBefore <= 3 ? 'Futuro da dupla' : 'Contrato se aproximando do fim',
      content: label,
      // Parte B: decidido => informativo, nunca pendente.
      status: decided ? 'nao_lida' : 'decisao_pendente',
      priority: decided ? 'normal' : daysBefore <= 3 ? 'alta' : 'normal',
      message_type: 'partner_contract_expiry',
      career_date: currentDate,
      actions: decided
        ? []
        // Playthrough 5.19, Parte E — o rótulo era "Conversar sobre o futuro",
        // o que prometia conversa e casava com o defeito que abria o diálogo de
        // pós-jogo. A ação sempre foi `view_partnership` (decisão contratual);
        // só o texto induzia ao erro.
        : [{ id: 'open_partner_contract', label: 'Decidir o contrato', type: 'view_partnership', payload: { partnershipId: active.id } }],
      metadata: { contract_decision_state: decisionState },
      destination: { type: 'CONTRACT', route: '/partners', params: { view: 'contract', focus: 'contract-future', partnership: active.id } },
    });
  }
}

export async function processPartnerDay(profile, previousDate, currentDate) {
  const active = await getActivePartnership(profile?.id);
  if (!active) {
    // Playthrough 5.17, Parte F — o ciclo de parceria saía DAQUI sem fazer
    // nada, e era exatamente por isso que o mundo ficava mudo depois de uma
    // separação: todo o lifecycle estava condicionado a JÁ ter dupla. Sem
    // parceiro, nenhum sistema procurava ninguém, e a busca manual deixava
    // de ser uma opção para virar o único caminho.
    await ensurePostSeparationPartnerMarket(profile, currentDate).catch((error) => {
      console.warn('[Parceria] mercado pós-separação:', error?.message || error);
    });
    return profile;
  }

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

  // Playthrough 5.17, Parte C — a outra metade da separação agendada: o
  // encerramento REAL, quando o último compromisso protegido termina.
  // Idempotente: só dispara quando a data já passou, e `endPartnership` é o
  // mesmo caminho canônico de sempre.
  if (active.contract_status === 'encerra_apos_compromisso' && active.separation_scheduled_date) {
    if (String(currentDate).slice(0, 10) > String(active.separation_scheduled_date).slice(0, 10)) {
      const partnerName = active.partner_name;
      await endPartnership(active.id, 'encerrada_contrato', 'Contrato não renovado', currentDate);
      await upsertCareerMessage(profile.id, `partner-contract-ended:${active.id}`, {
        sender_name: partnerName,
        sender_type: 'atleta',
        title: 'Fim da parceria',
        content: `Nossa parceria com ${partnerName} chegou ao fim após o último compromisso assumido. ${Number(active.shared_matches) || 0} partidas, ${Number(active.shared_wins) || 0} vitórias juntos.`,
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
    if (daysRemaining <= 15 && daysRemaining > 0 && !PARTNERSHIP_EXIT_STATUSES.includes(active.contract_status)) {
      updates.contract_status = 'renovacao_proxima';
      updates.renewal_available = true;
    }
  }
  if (endDate && currentDate >= endDate) {
    const wasAlreadyVencido = active.contract_status === 'vencido';
    // 5.27-J: `encerra_apos_compromisso` também é saída decidida. Antes ele caía
    // aqui em `vencido` (carência com renovação disponível) no dia seguinte —
    // a dupla voltava a "não decidida", se inscrevia de novo e, ao fim da
    // carência, a separação era recalculada incluindo os torneios novos.
    const plannedEnd = PARTNERSHIP_EXIT_STATUSES.includes(active.contract_status);
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
      // Playthrough 5.17, Parte C — SEPARAÇÃO AGENDADA.
      //
      // Antes desta guarda, o fim do contrato encerrava a parceria na data
      // nominal mesmo que a dupla já estivesse inscrita num torneio futuro.
      // O compromisso continuava salvo, mas sem dupla: era exatamente a
      // origem do "<jogador> & Parceiro" na chave de Casablanca e da perda
      // de crédito no settlement.
      //
      // Regra: um compromisso já assumido não pode ficar órfão. A parceria
      // sobrevive até o ÚLTIMO evento já confirmado terminar — nem um dia
      // além. Isso não é renovação: `canRegisterNewTournamentWithPartnership`
      // impede inscrever qualquer coisa nova depois da data nominal.
      const [committedTournaments, committedRegistrations] = await Promise.all([
        entities.Tournament.list('start_date', 3000).catch(() => []),
        entities.TournamentRegistration.filter({ profile_id: profile.id }).catch(() => []),
      ]);
      const pending = findCommittedTournaments({
        registrations: committedRegistrations || [],
        tournaments: committedTournaments || [],
        careerDate: currentDate,
        partnerId: active.partner_bot_id || active.partner_id || null,
      });
      if (pending.length) {
        const schedule = resolveScheduledSeparationDate(endDate, pending);
        const last = schedule.until || pending[pending.length - 1];
        await entities.Partnership.update(active.id, {
          contract_status: 'encerra_apos_compromisso',
          exit_decided_at: active.exit_decided_at || currentDate,
          separation_scheduled_after_tournament_id: last.tournamentId,
          separation_scheduled_date: last.endDate,
          renewal_available: false,
        }).catch(() => {});
        // Uma mensagem por compromisso-alvo (id estável): a decisão não
        // renasce a cada dia enquanto o torneio não chega.
        await upsertCareerMessage(profile.id, `partner-separation-scheduled:${active.id}:${last.tournamentId}`, {
          sender_name: active.partner_name,
          sender_type: 'atleta',
          title: 'Separação agendada',
          content: `Nosso contrato terminou, mas ainda temos um compromisso assumido. A parceria será encerrada após ${last.name}.`,
          status: 'nao_lida',
          priority: 'normal',
          message_type: 'partner_separation_scheduled',
          career_date: currentDate,
          actions: [{ id: 'open_partner_hub', label: 'Ver parceria', type: 'view_partnership', payload: { partnershipId: active.id } }],
          destination: { type: 'CONTRACT', route: '/partners', params: { view: 'contract', partnership: active.id } },
        });
        return entities.PlayerProfile.update(profile.id, profileUpdates);
      }

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
    // 5.27-J: moral baixa não apaga uma saída já decidida. Antes, `insatisfeito`
    // sobrescrevia `nao_renovara`/`encerrar_ao_final`/`encerra_apos_compromisso`;
    // no vencimento a dupla caía em `vencido` (carência com renovação
    // disponível) e voltava a se inscrever — a decisão de saída sumia.
    if (!PARTNERSHIP_EXIT_STATUSES.includes(active.contract_status)) updates.contract_status = 'insatisfeito';
  }

  await entities.Partnership.update(active.id, updates);
  if (Object.keys(profileUpdates).length > 0) {
    return entities.PlayerProfile.update(profile.id, profileUpdates);
  }
  return profile;
}
