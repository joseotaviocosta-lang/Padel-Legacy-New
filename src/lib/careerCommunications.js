import { getPendingInterviews } from '@/lib/pressData.js';
import { localGame } from '@/api/localGameClient.js';
import { buildCareerMemory } from '@/lib/careerMemory.js';
import { selectRelevantCareerNotifications } from '@/lib/notificationCenter.js';
import { getTournamentReminderMilestone, tournamentReminderContextKey } from '@/lib/tournamentNotifications.js';
import { resolveNotificationDestination } from '@/lib/notificationDestinations.js';
import {
  isPostMatchInterviewMessage,
  isValidPostMatchInterviewMessage,
  matchIdFromInterviewMessage,
} from '@/lib/postMatchInterview.js';
import { isInterviewActionable } from '@/lib/interviewLifecycle.js';
import { inspectResumableTournamentEngineState } from '@/game-core/tournamentMatchLifecycle.js';

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
  return selectRelevantCareerNotifications((rows || [])
    .map(normalizeCareerMessage)
    .filter((message) => isCareerCommunicationVisible(message, context)));
}

export async function markAllCommunicationsRead(profileId) {
  const rows = await listCareerCommunications(profileId, 200);
  const unread = rows.filter(isCareerMessageUnread);
  await Promise.all(unread.map((row) => markCareerCommunicationRead(row).catch(() => null)));
  return unread.length;
}

export function buildReadNotificationPatch(message = {}, readAt = new Date().toISOString()) {
  return {
    is_read: true,
    is_new: false,
    read_at: readAt,
    ...(message.status === 'nao_lida' || !message.status ? { status: 'lida' } : {}),
  };
}

export async function markCareerCommunicationRead(message) {
  if (!message?.id || !isCareerMessageUnread(message)) return normalizeCareerMessage(message);
  const patch = buildReadNotificationPatch(message);
  const updated = await localGame.entities.CareerMessage.update(message.id, patch);
  return normalizeCareerMessage({ ...message, ...updated, ...patch });
}

// Mobile M2 (docs/MOBILE_M2_SHELL.md): fonte única para "o que acontece quando
// o jogador toca em uma notificação com destino" — antes o sino navegava
// imediatamente e a Central de Comunicações só marcava como lida e abria um
// modal de detalhe (o jogador precisava de um segundo toque em "Abrir
// recurso" para navegar), então o mesmo dado podia "não navegar" dependendo
// de por onde foi acionado. markAsRead nunca substitui a navegação: mensagens
// sem destino específico (actionable=false) só marcam como lida, mensagens já
// lidas continuam navegando normalmente ao toque (estado de leitura e estado
// de navegação são independentes), e destinos que já não existem mais caem no
// fallback seguro que resolveNotificationDestination já define (rota de
// comunicações, sem lançar exceção).
export async function resolveAndOpenNotification(notification, { navigate, onBeforeNavigate } = {}) {
  const normalized = normalizeCareerMessage(notification);
  const destination = resolveNotificationDestination(normalized);
  if (isCareerMessageUnread(normalized)) {
    await markCareerCommunicationRead(normalized).catch(() => null);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('padel:communications-updated'));
      window.dispatchEvent(new CustomEvent('padel:communications-refresh'));
    }
  }
  if (destination.actionable && typeof navigate === 'function') {
    onBeforeNavigate?.();
    navigate(destination.route);
  }
  return destination;
}

// Encerra uma decisão pendente aplicando a ação escolhida pelo jogador. Uma
// mensagem resolvida deixa de aparecer como pendência ativa no sino/inbox.
export async function resolveMessage(messageId, chosenActionId) {
  try {
    return await localGame.entities.CareerMessage.update(messageId, { status: 'resolvida', chosen_action_id: chosenActionId, is_new: false });
  } catch { return null; }
}

// Descarta uma decisão pendente sem aplicar nenhuma ação.
export async function dismissMessage(messageId) {
  try {
    return await localGame.entities.CareerMessage.update(messageId, { status: 'ignorada', is_new: false });
  } catch { return null; }
}

// Chave estável usada para upsert idempotente de CareerMessage: a mesma
// contextKey nunca produz uma segunda linha, mesmo se chamada novamente após
// reload ou após um avanço de calendário repetir a mesma condição.
export function buildStableMessageId(profileId, contextKey) {
  return `career-message-${profileId}-${contextKey}`.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 180);
}

// Upsert de uma CareerMessage isolada (fora do lote de reconciliação
// contextual) usando o mesmo esquema de id estável. Usado por geradores que
// disparam fora do fluxo de ensureContextualCareerCommunications (ex.:
// resumo semanal, relatórios de lesão) para que ganhem a mesma proteção
// contra duplicação sem reimplementar a lógica de dedupe.
export async function upsertCareerMessage(profileId, contextKey, payload = {}) {
  if (!profileId || !contextKey) return null;
  const id = buildStableMessageId(profileId, contextKey);
  // Espalha o payload primeiro (preserva expires_career_date e qualquer outro
  // campo específico de um gerador) e só então normaliza os campos que têm
  // um valor padrão — nunca descarta um campo silenciosamente.
  const data = {
    ...payload,
    id,
    profile_id: profileId,
    message_type: payload.message_type || 'mensagem',
    sender_name: payload.sender_name || senderLabel(payload.sender_type),
    sender_type: payload.sender_type || 'sistema',
    status: payload.status || 'nao_lida',
    is_read: false,
    is_new: true,
    priority: payload.priority || 'normal',
    actions: payload.actions || [],
    metadata: { ...(payload.metadata || {}), context_key: contextKey },
  };
  return localGame.entities.CareerMessage.upsert(id, data);
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

  const createOnce = (contextKey, payload) => {
    if (!contextKey || existingKeys.has(contextKey)) return null;
    const stableId = buildStableMessageId(profile.id, contextKey);
    // Espalha o payload primeiro para nunca descartar silenciosamente um
    // campo específico do gerador (ex.: expires_career_date), e só então
    // normaliza os campos que têm um valor padrão.
    const data = {
      ...payload,
      id: stableId,
      profile_id: profile.id,
      message_type: payload.message_type || 'mensagem',
      sender_name: payload.sender_name || senderLabel(payload.sender_type),
      sender_type: payload.sender_type || 'sistema',
      status: payload.status || 'nao_lida',
      is_read: false,
      is_new: true,
      priority: payload.priority || 'normal',
      career_date: payload.career_date || careerDate,
      actions: payload.actions || [],
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

  // Decisões pendentes com prazo vencido e lembretes de torneio cujo alvo já
  // não é mais o próximo torneio relevante são marcados como expirados no
  // mesmo lote — assim o clique em uma notificação obsoleta nunca tenta abrir
  // um recurso que não existe mais (ver resolveNotificationDestination).
  const activeTournamentId = context.nextTournament?.id || null;
  const activeTournamentEvent = (context.calendarEvents || []).find((event) => {
    const run = event?.metadata?.tournament_run;
    const match = run?.matches?.[Number(run?.currentRound || 0)];
    return event.status === 'scheduled' && event.event_type === 'tournament' && run?.status === 'playing' && match?.status === 'playing';
  }) || null;
  const activeTournamentRun = activeTournamentEvent?.metadata?.tournament_run || null;
  const activeTournamentMatch = activeTournamentRun?.matches?.[Number(activeTournamentRun?.currentRound || 0)] || null;
  const recoveryTournamentId = activeTournamentEvent?.related_id || activeTournamentRun?.tournamentId || null;
  const activeMatchCheckpoint = context.activeMatchCheckpoint;
  const expectedRecoveryTeamA = [
    { id: profile.id },
    (profile.partner_id || activeMatchCheckpoint?.participant_ids?.A?.[1]) ? { id: profile.partner_id || activeMatchCheckpoint.participant_ids.A[1] } : null,
  ].filter(Boolean);
  const recoveryEngineInspection = inspectResumableTournamentEngineState(activeMatchCheckpoint?.engine_state, {
    A: expectedRecoveryTeamA,
    B: activeTournamentMatch?.opponent || [],
  });
  const checkpointMatchesActiveRound = Boolean(
    activeMatchCheckpoint?.type === 'tournament'
    && String(activeMatchCheckpoint.tournament_id) === String(recoveryTournamentId)
    && String(activeMatchCheckpoint.match_id) === String(activeTournamentMatch?.id)
    && String(activeMatchCheckpoint.round) === String(activeTournamentMatch?.round)
    && activeMatchCheckpoint.checkpoint_status === 'active'
    && recoveryEngineInspection.valid,
  );
  for (const message of existing) {
    if (['resolvida', 'ignorada', 'invalidada', 'expirada'].includes(message.status)) continue;
    let shouldExpire = false;
    if (message.status === 'decisao_pendente' && message.expires_career_date && message.expires_career_date < careerDate) {
      shouldExpire = true;
    } else if (message.metadata?.tournament_id && message.notification_type === 'TOURNAMENT_UPCOMING') {
      // Só expira quando sabemos com certeza que existe um próximo torneio
      // diferente — se a busca de torneios falhar/retornar vazia, o lembrete
      // antigo permanece intacto em vez de ser expirado por engano.
      shouldExpire = (Boolean(activeTournamentId) && message.metadata.tournament_id !== activeTournamentId)
        || (Boolean(recoveryTournamentId) && String(message.metadata.tournament_id) === String(recoveryTournamentId));
    } else if (message.notification_type === 'TOURNAMENT_RESUME') {
      shouldExpire = !activeTournamentMatch || String(message.metadata?.match_id) !== String(activeTournamentMatch.id);
    }
    if (!shouldExpire) continue;
    operations.push({
      type: 'update',
      entityName: 'CareerMessage',
      id: message.id,
      data: {
        status: 'expirada',
        is_read: true,
        is_new: false,
        metadata: { ...(message.metadata || {}), expired_reason: message.status === 'decisao_pendente' ? 'deadline_passed' : 'target_no_longer_relevant' },
      },
    });
  }

  const nextTournament = context.nextTournament;
  if (nextTournament?.id && nextTournament.start_date && String(nextTournament.id) !== String(recoveryTournamentId)) {
    const days = daysBetween(careerDate, nextTournament.start_date);
    const milestone = getTournamentReminderMilestone(days);
    // Hotfix 15.5.4 (complemento — sorteio em D-3): esta notificação passou
    // a estar semanticamente ligada ao sorteio real, não só à contagem de
    // dias. `nextTournament` já é a linha bruta de Tournament (todos os
    // chamadores — CommunicationBell.jsx/Communications.jsx/CareerHub.jsx —
    // buscam `Tournament.filter(...)` e passam o registro completo), então
    // `bracket_history` já reflete se ensureTournamentDraw (chamado pela
    // pipeline de avanço de dia, nunca por este código) já persistiu o
    // sorteio. Se D-3 chegou mas a criação/persistência ainda não
    // aconteceu ou falhou, NENHUMA notificação é criada agora — ela só
    // aparece quando o sorteio realmente existe, nunca antes.
    const drawn = Array.isArray(nextTournament.bracket_history) && nextTournament.bracket_history.length > 0;
    if (milestone !== null && drawn) {
      await createOnce(tournamentReminderContextKey(nextTournament.id, milestone), {
        message_type: 'tournament_upcoming',
        notification_type: 'TOURNAMENT_UPCOMING',
        sender_type: 'federacao', sender_name: 'Federação do Circuito',
        title: `Sorteio definido — ${nextTournament.name || 'Próximo torneio'}`,
        content: `A chave foi sorteada. Confira seu adversário da estreia e os compromissos no calendário.`,
        related_entity_type: 'Tournament', related_entity_id: nextTournament.id, related_entity_name: nextTournament.name,
        destination: { type: 'TOURNAMENT_RUN', route: '/tournaments', params: { tournament: nextTournament.id, mode: 'run' } },
        metadata: { tournament_id: nextTournament.id, reminder_milestone_days: milestone, notification_type: 'TOURNAMENT_UPCOMING' },
      });
    }
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

  // A imprensa passa a procurar o jogador quando existe uma entrevista
  // realmente disponível. A comunicação leva diretamente à ferramenta e usa
  // o ID do fato gerador para não reaparecer após ser respondida.
  const pendingInterviews = getPendingInterviews(profile, context.matches || [], {
    calendarEvents: context.calendarEvents || [],
    partnership: context.partnership || null,
    registrations: context.registrations || [],
    pressArticles: context.pressArticles || [],
  });
  const answeredSources = new Set((context.pressArticles || [])
    .filter((article) => article?.interview_status === 'answered')
    .map((article) => article.source_event_id)
    .filter(Boolean));
  const completedSources = new Set([
    ...(profile.processed_press_interview_sources || []),
    ...answeredSources,
  ]);
  const actionableInterviewSources = new Set(pendingInterviews
    .filter((interview) => isInterviewActionable(interview, careerDate))
    .map((interview) => interview.sourceId));
  for (const message of existing) {
    if (message.related_entity_type !== 'PressInterview') continue;
    const sourceId = message.metadata?.interview_source_id;
    if (!sourceId || ['resolvida', 'invalidada', 'expirada'].includes(message.status)) continue;
    const completed = completedSources.has(sourceId);
    const staleDerivedInterview = !isPostMatchInterviewMessage(message) && !actionableInterviewSources.has(sourceId);
    if (!completed && !staleDerivedInterview) continue;
    operations.push({
      type: 'update',
      entityName: 'CareerMessage',
      id: message.id,
      data: {
        status: completed ? 'resolvida' : 'expirada',
        is_read: true,
        is_new: false,
        metadata: {
          ...(message.metadata || {}),
          ...(completed
            ? { interview_completed: true, interview_completed_source_id: sourceId }
            : { interview_expired: true, expired_reason: 'interview_no_longer_actionable' }),
        },
      },
    });
  }

  if (activeTournamentMatch?.id && recoveryTournamentId) {
    await createOnce(`tournament-resume:${recoveryTournamentId}:${activeTournamentMatch.id}`, {
      message_type: 'tournament_resume',
      notification_type: 'TOURNAMENT_RESUME',
      sender_type: 'federacao', sender_name: 'Federação do Circuito',
      title: checkpointMatchesActiveRound ? `Continue ${activeTournamentMatch.round}` : `Recupere ${activeTournamentMatch.round}`,
      content: checkpointMatchesActiveRound
        ? 'A partida foi interrompida e pode ser retomada com o placar preservado.'
        : 'O estado interrompido precisa ser validado ou reiniciado. O bracket e as rodadas anteriores estão preservados.',
      priority: 'alta',
      related_entity_type: 'Tournament', related_entity_id: recoveryTournamentId,
      related_entity_name: activeTournamentRun?.tournamentName || activeTournamentEvent.related_name,
      destination: { type: 'TOURNAMENT_RUN', route: '/tournaments', params: { tournament: recoveryTournamentId, mode: 'run' } },
      metadata: {
        tournament_id: recoveryTournamentId,
        match_id: activeTournamentMatch.id,
        round: activeTournamentMatch.round,
        notification_type: 'TOURNAMENT_RESUME',
        checkpoint_resumable_candidate: checkpointMatchesActiveRound,
      },
    });
  }
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
