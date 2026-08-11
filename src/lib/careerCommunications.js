import { getPendingInterviews } from '@/lib/pressData.js';
import { localGame } from '@/api/localGameClient.js';
import { buildCareerMemory, getCareerAgent } from '@/lib/careerMemory.js';
import { getTournamentReminderMilestone, tournamentReminderContextKey } from '@/lib/tournamentNotifications.js';
import {
  isPostMatchInterviewMessage,
  isValidPostMatchInterviewMessage,
  matchIdFromInterviewMessage,
} from '@/lib/postMatchInterview.js';

export const COMMUNICATION_CATEGORIES = [
  { id: 'all', label: 'Todas' },
  { id: 'treinador', label: 'Treinador' },
  { id: 'atleta', label: 'Parceiro' },
  { id: 'empresario', label: 'Empresário' },
  { id: 'federacao', label: 'Federação' },
  { id: 'patrocinador', label: 'Patrocinadores' },
  { id: 'clube', label: 'Clube' },
  { id: 'imprensa', label: 'Imprensa' },
  { id: 'sistema', label: 'Sistema' },
];

export function normalizeCareerMessage(message = {}) {
  const status = message.status || (message.is_read ? 'lida' : 'nao_lida');
  const isRead = message.is_read === true
    || message.is_new === false
    || ['lida', 'resolvida', 'ignorada'].includes(status);
  return {
    ...message,
    title: message.title || message.subject || message.sender_name || 'Nova comunicação',
    content: message.content || message.body || message.message || '',
    sender_name: message.sender_name || senderLabel(message.sender_type),
    sender_type: message.sender_type || 'sistema',
    status,
    is_read: isRead,
    is_new: !isRead,
    priority: message.priority || 'normal',
  };
}

export function isCareerMessageUnread(message = {}) {
  return !normalizeCareerMessage(message).is_read;
}

export function isCareerCommunicationVisible(message, context = {}) {
  if (message?.status === 'invalidada' || message?.metadata?.interview_invalidated === true) return false;
  if (!isPostMatchInterviewMessage(message)) return true;
  if (!Array.isArray(context.matches) || !context.profile) return true;
  return isValidPostMatchInterviewMessage(message, context.matches, context.profile);
}

export async function listCareerCommunications(profileId, limit = 120, context = {}) {
  if (!profileId) return [];
  const rows = await localGame.entities.CareerMessage.filter({ profile_id: profileId }, '-created_date', limit).catch(() => []);
  return (rows || [])
    .map(normalizeCareerMessage)
    .filter((message) => isCareerCommunicationVisible(message, context));
}

export async function markAllCommunicationsRead(profileId) {
  const rows = await listCareerCommunications(profileId, 200);
  const unread = rows.filter(isCareerMessageUnread);
  await Promise.all(unread.map((row) => markCareerCommunicationRead(row).catch(() => null)));
  return unread.length;
}

export async function markCareerCommunicationRead(message) {
  if (!message?.id || !isCareerMessageUnread(message)) return normalizeCareerMessage(message);
  const patch = {
    is_read: true,
    is_new: false,
    ...(message.status === 'nao_lida' || !message.status ? { status: 'lida' } : {}),
  };
  const updated = await localGame.entities.CareerMessage.update(message.id, patch);
  return normalizeCareerMessage({ ...message, ...updated, ...patch });
}

export async function ensureContextualCareerCommunications(profile, context = {}) {
  if (!profile?.id) return [];
  const created = [];
  // Cada condição de comunicação gravava seu próprio upsert individual —
  // até 8-9 escritas completas do save por chamada, disparada a cada
  // montagem de tela/refresh do sino de notificações. Acumula as operações
  // e grava tudo em uma única transação via localGame.batch ao final.
  const operations = [];
  const careerDate = profile.career_date || '2026-01-01';
  const existing = await listCareerCommunications(profile.id, 200);
  const existingKeys = new Set(existing.map((row) => row.metadata?.context_key).filter(Boolean));
  const existingInterviewMatchIds = new Set(existing.map(matchIdFromInterviewMessage).filter(Boolean));
  const memory = buildCareerMemory(profile, context);
  const agent = getCareerAgent(profile);

  const createOnce = (contextKey, payload) => {
    if (!contextKey || existingKeys.has(contextKey)) return null;
    const stableId = `career-message-${profile.id}-${contextKey}`.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 180);
    const data = {
      id: stableId,
      profile_id: profile.id,
      message_type: payload.message_type || 'mensagem',
      notification_type: payload.notification_type,
      sender_name: payload.sender_name || senderLabel(payload.sender_type),
      sender_type: payload.sender_type || 'sistema',
      title: payload.title,
      content: payload.content,
      status: payload.status || 'nao_lida',
      is_read: false,
      is_new: true,
      priority: payload.priority || 'normal',
      career_date: careerDate,
      related_entity_type: payload.related_entity_type,
      related_entity_id: payload.related_entity_id,
      related_entity_name: payload.related_entity_name,
      actions: payload.actions || [],
      destination: payload.destination,
      metadata: { ...(payload.metadata || {}), context_key: contextKey },
    };
    operations.push({ type: 'upsert', entityName: 'CareerMessage', id: stableId, data });
    created.push(normalizeCareerMessage(data));
    existingKeys.add(contextKey);
    return data;
  };

  // Saves antigos podiam conter mensagens pós-jogo derivadas de treino. Elas
  // são invalidadas no mesmo lote de reconciliação e deixam de aparecer em
  // qualquer UI, sem apagar artigos/histórico válido de torneios.
  if (Array.isArray(context.matches)) {
    for (const message of existing) {
      if (!isPostMatchInterviewMessage(message)) continue;
      if (isValidPostMatchInterviewMessage(message, context.matches, profile)) continue;
      operations.push({
        type: 'update',
        entityName: 'CareerMessage',
        id: message.id,
        data: {
          status: 'invalidada',
          is_read: true,
          is_new: false,
          metadata: {
            ...(message.metadata || {}),
            interview_invalidated: true,
            invalidation_reason: 'non_official_match',
          },
        },
      });
    }
  }

  if (profile.coach_id) {
    const fatigue = Number(profile.fatigue) || 0;
    const energy = Number(profile.energy) || 0;
    if (fatigue >= 65 || energy <= 30) {
      await createOnce(`coach-condition:${careerDate}:${fatigue >= 65 ? 'fatigue' : 'energy'}`, {
        sender_type: 'treinador', sender_name: profile.coach_name || 'Treinador principal',
        title: fatigue >= 65 ? 'Precisamos reduzir a carga' : 'Sua energia está baixa',
        content: fatigue >= 65
          ? `Sua fadiga chegou a ${Math.round(fatigue)}. Recomendo priorizar recuperação e evitar treinos intensos nos próximos dias.`
          : `Sua energia está em ${Math.round(energy)}. Um dia livre agora pode melhorar a qualidade dos próximos treinos.`,
        priority: fatigue >= 80 || energy <= 15 ? 'alta' : 'normal',
        related_entity_type: 'Coach', related_entity_id: profile.coach_id, related_entity_name: profile.coach_name,
        status: 'decisao_pendente',
        actions: [
          { id: 'follow_recovery', label: 'Seguir recomendação', description: 'Fortalece a confiança com o treinador.', effect: { coachTrust: 2 } },
          { id: 'review_later', label: 'Revisar depois', description: 'Sem impacto imediato.', effect: {} },
        ],
        metadata: { memory_type: 'physical_condition', fatigue, energy },
      });
    }
  }

  const nextTournament = context.nextTournament;
  if (nextTournament?.id && nextTournament.start_date) {
    const days = daysBetween(careerDate, nextTournament.start_date);
    const milestone = getTournamentReminderMilestone(days);
    if (milestone !== null) {
      await createOnce(tournamentReminderContextKey(nextTournament.id, milestone), {
        message_type: 'tournament_upcoming',
        notification_type: 'TOURNAMENT_UPCOMING',
        sender_type: 'federacao', sender_name: 'Federação do Circuito',
        title: `${nextTournament.name || 'Próximo torneio'} se aproxima`,
        content: days === 0 ? 'A competição começa hoje. Confira sua inscrição, energia e planejamento.' : `Faltam ${days} dia${days === 1 ? '' : 's'} para o início. Revise sua preparação e os compromissos no calendário.`,
        related_entity_type: 'Tournament', related_entity_id: nextTournament.id, related_entity_name: nextTournament.name,
        destination: { type: 'TOURNAMENT_DETAILS', route: '/tournaments', params: { tournament: nextTournament.id, mode: 'details' } },
        metadata: { tournament_id: nextTournament.id, reminder_milestone_days: milestone, notification_type: 'TOURNAMENT_UPCOMING' },
      });
    }
  }

  const recentWins = Number(context.recentWins ?? memory.recentWins ?? 0);
  if (profile.partner_id && recentWins >= 3) {
    await createOnce(`partner-streak:${careerDate}:${recentWins}`, {
      sender_type: 'atleta', sender_name: context.partnerName || profile.partner_name || 'Seu parceiro',
      title: 'Estamos em uma boa sequência',
      content: `Vencemos ${recentWins} partidas recentes. Sinto que nossa comunicação em quadra está evoluindo.`,
      status: 'decisao_pendente',
      actions: [
        { id: 'celebrate_together', label: 'Valorizar a parceria', description: 'Fortalece confiança e moral da dupla.', effect: { partnerTrust: 2, partnerMorale: 2 } },
        { id: 'stay_focused', label: 'Manter o foco', description: 'Resposta profissional, com pequeno ganho de confiança.', effect: { partnerTrust: 1 } },
      ],
      metadata: { memory_type: 'recent_form', recent_wins: recentWins },
    });
  }

  if (profile.partner_id && memory.partnershipMonths >= 6) {
    const milestone = Math.floor(memory.partnershipMonths / 6) * 6;
    await createOnce(`partner-longevity:${profile.partner_id}:${milestone}`, {
      sender_type: 'atleta', sender_name: context.partnerName || profile.partner_name || 'Seu parceiro',
      title: `${milestone} meses construindo esta dupla`,
      content: `Já são ${milestone} meses trabalhando juntos${memory.partnershipMatches ? ` e ${memory.partnershipMatches} partidas compartilhadas` : ''}. Essa continuidade está criando uma identidade própria para nossa dupla.`,
      status: 'decisao_pendente',
      actions: [
        { id: 'renew_commitment', label: 'Reafirmar compromisso', description: 'Aumenta a confiança da parceria.', effect: { partnerTrust: 3, partnerMorale: 1 } },
        { id: 'acknowledge', label: 'Reconhecer o momento', description: 'Mantém a relação positiva.', effect: { partnerTrust: 1 } },
      ],
      metadata: { memory_type: 'partnership_milestone', months: milestone },
    });
  }

  const contractEnd = profile.coach_contract_end_date;
  if (contractEnd) {
    const days = daysBetween(careerDate, contractEnd);
    if (days >= 0 && days <= 30) {
      await createOnce(`manager-coach-contract:${contractEnd}`, {
        sender_type: 'empresario', sender_name: profile.agent_name || 'Seu empresário',
        title: 'Contrato do treinador perto do fim',
        content: `O vínculo com ${profile.coach_name || 'seu treinador'} termina em ${days} dia${days === 1 ? '' : 's'}. Planeje a renovação ou avalie o mercado.`,
        priority: days <= 7 ? 'alta' : 'normal',
        related_entity_type: 'CoachContract', related_entity_id: profile.coach_id, related_entity_name: profile.coach_name,
        metadata: { coach_id: profile.coach_id, contract_end_date: contractEnd },
      });
    }
  }

  if (memory.activeSponsorContracts === 0 && Number(profile.reputation || 0) >= 8) {
    const month = careerDate.slice(0, 7);
    await createOnce(`agent-sponsor-search:${month}`, {
      sender_type: 'empresario', sender_name: agent.name,
      title: 'Vou mapear oportunidades comerciais',
      content: `Sua reputação já permite iniciar conversas com marcas compatíveis. Meu perfil ${agent.personalityLabel.toLowerCase()} priorizará propostas que façam sentido para o momento da carreira.`,
      status: 'decisao_pendente',
      actions: [
        { id: 'prioritize_value', label: 'Priorizar melhor valor', description: 'Aumenta a confiança do empresário.', effect: { agentTrust: 1 } },
        { id: 'prioritize_fit', label: 'Priorizar marcas compatíveis', description: 'Fortalece a relação de longo prazo.', effect: { agentTrust: 2 } },
      ],
      metadata: { memory_type: 'agent_strategy', agent_personality: agent.personality },
      related_entity_type: 'Sponsor',
    });
  }

  // A imprensa passa a procurar o jogador quando existe uma entrevista
  // realmente disponível. A comunicação leva diretamente à ferramenta e usa
  // o ID do fato gerador para não reaparecer após ser respondida.
  const pendingInterviews = getPendingInterviews(profile, context.matches || [], {
    calendarEvents: context.calendarEvents || [],
    partnership: context.partnership || null,
    registrations: context.registrations || [],
  });
  const answeredSources = new Set((context.pressArticles || []).map(article => article.source_event_id).filter(Boolean));
  for (const interview of pendingInterviews.filter(item => !answeredSources.has(item.sourceId)).slice(0, 3)) {
    const interviewMatchId = /** @type {any} */ (interview).matchId;
    if (interviewMatchId && existingInterviewMatchIds.has(String(interviewMatchId))) continue;
    await createOnce(`press-interview:${interview.sourceId}`, {
      sender_type: 'imprensa',
      sender_name: 'Assessoria de Imprensa',
      title: `Entrevista disponível: ${interview.title}`,
      content: `${interview.description} Esta é uma oportunidade de influenciar sua reputação, a torcida e futuros patrocinadores.`,
      priority: interview.questionCategory === 'post_win' || interview.questionCategory === 'post_loss' ? 'alta' : 'normal',
      related_entity_type: 'PressInterview',
      related_entity_id: interview.id,
      related_entity_name: interview.title,
      destination: {
        type: 'PRESS_INTERVIEW',
        route: '/press',
        params: { tab: 'interviews', interview: interview.id, source: interview.sourceId },
      },
      metadata: {
        route: `/press?tab=interviews&interview=${encodeURIComponent(interview.id)}&source=${encodeURIComponent(interview.sourceId)}`,
        interview_id: interview.id,
        interview_source_id: interview.sourceId,
        match_id: interviewMatchId || null,
        memory_type: 'press_opportunity',
      },
    });
  }

  if (memory.matchesPlayed >= 10) {
    const milestone = Math.floor(memory.matchesPlayed / 10) * 10;
    await createOnce(`coach-match-memory:${milestone}`, {
      sender_type: 'treinador', sender_name: profile.coach_name || 'Treinador principal',
      title: `${milestone} partidas analisadas`,
      content: memory.recentWinRate >= 60
        ? `Nosso aproveitamento recente está em ${memory.recentWinRate}%. O padrão de jogo está mais consistente; vamos preservar o que funciona e ajustar os detalhes.`
        : `Já reunimos dados de ${milestone} partidas. O aproveitamento recente está em ${memory.recentWinRate}%, então vou reforçar decisões mais seguras no próximo plano semanal.`,
      metadata: { memory_type: 'match_milestone', matches: milestone, recent_win_rate: memory.recentWinRate },
    });
  }

  if (operations.length) {
    try { await localGame.batch(operations); }
    catch (error) { console.warn('[CareerCommunications] falha ao gravar comunicações em lote:', error?.message || error); }
  }

  return created;
}

export async function applyCareerCommunicationAction(profile, message, action) {
  if (!profile?.id || !action) return profile;
  const current = { ...profile };
  const patch = {};
  const effect = action.effect || {};
  if (effect.coachTrust) patch.coach_trust = Math.max(0, Math.min(100, Number(current.coach_trust ?? 55) + effect.coachTrust));
  if (effect.partnerTrust) patch.partner_trust = Math.max(0, Math.min(100, Number(current.partner_trust ?? 50) + effect.partnerTrust));
  if (effect.partnerMorale) patch.partner_morale = Math.max(0, Math.min(100, Number(current.partner_morale ?? 70) + effect.partnerMorale));
  if (effect.agentTrust) patch.agent_trust = Math.max(0, Math.min(100, Number(current.agent_trust ?? 55) + effect.agentTrust));
  if (effect.confidence) patch.confidence = Math.max(0, Math.min(100, Number(current.confidence ?? 60) + effect.confidence));
  if (Object.keys(patch).length === 0) return current;
  return await localGame.entities.PlayerProfile.update(profile.id, patch).catch(() => ({ ...current, ...patch }));
}

export function senderLabel(senderType) {
  const labels = {
    treinador: 'Treinador principal', atleta: 'Parceiro', empresario: 'Empresário', federacao: 'Federação',
    patrocinador: 'Patrocinador', clube: 'Clube', imprensa: 'Imprensa', sistema: 'Sistema',
  };
  return labels[senderType] || 'Sistema';
}

function daysBetween(from, to) {
  if (!from || !to) return 0;
  return Math.ceil((new Date(`${to}T00:00:00`) - new Date(`${from}T00:00:00`)) / 86400000);
}
