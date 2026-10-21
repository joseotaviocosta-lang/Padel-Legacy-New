import { getPendingInterviews } from '@/lib/pressData.js';
import { localGame } from '@/api/localGameClient.js';
import { buildCareerMemory } from '@/lib/careerMemory.js';
import { selectRelevantCareerNotifications } from '@/lib/notificationCenter.js';
import { tournamentReminderContextKey, TOURNAMENT_REMINDER_MILESTONES } from '@/lib/tournamentNotifications.js';
import { resolveNotificationDestination } from '@/lib/notificationDestinations.js';
import { getPlayerOpeningMatchFromCanonicalBracket } from '@/lib/tournamentBracketView.js';
import { getCanonicalTeamWorldRank } from '@/lib/teamRanking.js';
import { getActivePartnership } from '@/lib/partnershipSystem.js';
import { isPlayerRegisteredForTournament, evaluateTournamentRegistration, listTournamentRegistrations, getTournamentRegistrationWindow, daysBetweenGameDates } from '@/lib/tournamentRegistration.js';
import { getPlayerTournamentRegistrationState, TOURNAMENT_REGISTRATION_STATE } from '@/lib/tournamentRegistrationState.js';
import { REGISTRATION_REMINDER_MILESTONES, registrationReminderContextKey } from '@/lib/tournamentNotifications.js';
import { BOT_DIFFICULTIES, BOTS_BY_DIFFICULTY } from '@/lib/bots.js';
import { evaluateTournamentChoice } from '@/gameplay/worldTour/TournamentSelectionAI.js';

// Mesma busca pura de `getPartnerBot` (career.js) — reimplementada aqui (não
// importada) porque career.js importa calendarSystem.js, que importa este
// próprio arquivo: importar career.js aqui fecharia um ciclo de 3 módulos
// (career.js -> calendarSystem.js -> careerCommunications.js -> career.js),
// arriscando um `getPartnerBot` parcialmente inicializado dependendo da
// ordem de carga do ESM. `BOTS_BY_DIFFICULTY`/`BOT_DIFFICULTIES` (bots.js)
// não participam desse ciclo.
function findPartnerBot(profile) {
  if (!profile?.partner_id) return null;
  for (const diff of BOT_DIFFICULTIES) {
    const bot = BOTS_BY_DIFFICULTY[diff.id]?.find((item) => item.id === profile.partner_id);
    if (bot) return bot;
  }
  return null;
}
import { formatDate } from '@/lib/padel.js';
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
// Playthrough 4.6D, itens 1/5/6 — antes, esta notificação só nascia dentro
// de ensureContextualCareerCommunications, gated por
// `getTournamentReminderMilestone(daysUntil) !== null` (só o dia EXATO
// D-3). Se nenhuma tela que chama ensureContextualCareerCommunications
// (CommunicationBell.jsx/CareerHub.jsx/Communications.jsx) estivesse
// montada/atualizando naquele dia exato — carreira avançada em lote, app
// fechado, ou o torneio já sorteado (`Tournament.status` mudou de
// 'inscricoes' pra 'chaveamento' no sorteio, Playthrough 4.6C — e essas
// três telas filtram Tournament por `status:'inscricoes'`, então o torneio
// já sorteado simplesmente PARA de aparecer como `nextTournament` depois
// do próprio sorteio) — a janela se perdia para sempre, sem nenhum reparo.
// Extraído como função própria, idempotente por id estável
// (upsertCareerMessage) e condicionada só ao FATO persistido (chave
// existe, ainda não notificado) — nunca à data ou a qual tela está aberta.
// Chamada tanto pelo lifecycle do dia (processCalendarEvents,
// calendarSystem.js — sem nenhuma UI) quanto de dentro de
// ensureContextualCareerCommunications (mantém o comportamento das telas
// que já chamavam isso, agora self-healing: se a mensagem não nasceu a
// tempo, a próxima chamada — em QUALQUER dia — ainda cria a notificação
// atrasada, uma única vez).
// Playthrough 4.6E — três lacunas comprovadas no playtest real além da
// própria persistência (que a 4.6D já resolvia corretamente):
// (a) PARTE E/F — o texto era genérico ("Confira seu adversário da
//     estreia...") em vez de conter o adversário/rodada/data REAIS, lidos
//     só de bracket_history (nome canônico da dupla) + tournament_run
//     (IDs reais dos membros do adversário, pra resolver o world rank
//     factual — getPlayerOpeningMatchFromCanonicalBracket,
//     tournamentBracketView.js — nunca recalculado via tournamentDraw.js);
// (b) PARTE G — `destination.type:'TOURNAMENT_RUN'` só abre a chave quando
//     `activeRunEvents` já inclui o torneio (Tournaments.jsx) — no D-3 o
//     jogador não tem partida ativa ainda, então caía silenciosamente no
//     modo DETAILS (só o modal de detalhes, nunca a chave). Corrigido com
//     `openBracket:true` explícito, que Tournaments.jsx passa a respeitar
//     independente do modo resolvido;
// (c) PARTE D — nada disparava um alerta perceptível (toast) no instante em
//     que a mensagem nascia; o jogador só via a mensagem se abrisse a
//     Central manualmente depois. `padel:draw-notification` (evento novo,
//     mesmo padrão dos outros dispatches deste arquivo) carrega o conteúdo
//     pronto pra um toast — só no tick em que o sorteio REALMENTE aconteceu
//     agora (nunca num reparo de self-healing atrasado, Parte I).
export async function ensureTournamentDrawNotification(profile, tournament, calendarEvent = null) {
  if (!profile?.id || !tournament?.id) return null;
  if (tournament.world_tour_cancelled || tournament.status === 'cancelado' || tournament.current_phase === 'cancelado') return null;
  const hasDraw = Number(tournament.bracket_schema_version) >= 2
    && Array.isArray(tournament.bracket_history) && tournament.bracket_history.length > 0;
  if (!hasDraw) return null;
  // Playthrough 4.9, Parte A/F/B (invariante 2) — bug real de produção: um
  // jogador NÃO inscrito recebia "Sorteio definido — [torneio]" com uma
  // dupla de IA qualquer como "sua dupla". Causa raiz composta: (a) esta
  // função nunca confirmava inscrição antes de personalizar a mensagem, e
  // (b) getPlayerOpeningMatchFromCanonicalBracket tinha um fallback que
  // fabricava um match quando o jogador não estava na chave (já corrigido,
  // tournamentBracketView.js). Este guard é a segunda camada, por ID
  // canônico (nunca por nome/texto): sem uma TournamentRegistration
  // 'confirmed' real, a função encerra aqui — nunca chega a construir
  // conteúdo nenhum, personalizado ou não.
  const registered = calendarEvent?.metadata?.registration_id
    ? true
    : Boolean(await isPlayerRegisteredForTournament(profile.id, tournament.id).catch(() => null));
  if (!registered) return null;
  const contextKey = tournamentReminderContextKey(tournament.id, TOURNAMENT_REMINDER_MILESTONES[0]);
  const stableId = buildStableMessageId(profile.id, contextKey);
  const alreadyExists = await localGame.entities.CareerMessage.get(stableId).catch(() => null);
  if (alreadyExists) return null;

  // Parte F — o run pode já ter sido lido pelo chamador (calendarSystem.js/
  // calendarLifecycle.js sempre têm o CalendarEvent em mãos); sem isso,
  // busca aqui — nunca reconstrói nada, só lê o que já está persistido.
  const event = calendarEvent || (await localGame.entities.CalendarEvent
    .filter({ profile_id: profile.id, related_id: tournament.id })
    .catch(() => []))
    .find((item) => item.event_type === 'tournament' && item.metadata?.tournament_run) || null;
  const run = event?.metadata?.tournament_run || null;
  const opening = getPlayerOpeningMatchFromCanonicalBracket({ tournament, run });

  let opponentRank = null;
  if (opening?.opponentMemberIds?.length >= 2) {
    const rank = await getCanonicalTeamWorldRank(opening.opponentMemberIds).catch(() => null);
    if (rank && !rank.unranked && Number(rank.rank) > 0) opponentRank = rank.rank;
  }

  const finalRound = Array.isArray(tournament.bracket_history) ? tournament.bracket_history.at(-1) : null;
  const drawSize = Number(tournament.main_draw_size) || null;
  const title = `Sorteio definido — ${tournament.name || 'Próximo torneio'}`;
  let content = 'A chave foi sorteada. Confira seu adversário da estreia e os compromissos no calendário.';
  if (opening) {
    const opponentLabel = opening.opponentTeam
      ? `${opening.opponentTeam}${opponentRank ? ` (#${opponentRank})` : ' (Sem ranking)'}`
      : 'um adversário a definir';
    const roundText = opening.roundLabel ? ` na ${opening.roundLabel}` : '';
    const dateText = opening.matchDate ? `, em ${formatDate(opening.matchDate)}` : '';
    content = `A chave oficial foi sorteada. Sua dupla, ${opening.playerTeam || 'sua dupla'}, estreia contra ${opponentLabel}${roundText}${dateText}.`;
    if (drawSize) {
      const finalDateLabel = finalRound?.date ? formatDate(finalRound.date) : null;
      content += ` ${drawSize} duplas disputam o título.${finalDateLabel ? ` A final está prevista para ${finalDateLabel}.` : ''}`;
    }
  }

  // Parte I — origem inferida pelo próprio fato persistido (draw_date), nunca
  // por um parâmetro que o chamador precisaria lembrar de passar certo: se o
  // sorteio aconteceu HOJE, é alerta novo (same_tick); qualquer outro dia é
  // reparo de uma mensagem que deveria ter nascido antes (self_healing) — o
  // toast (abaixo) só dispara no primeiro caso.
  const sameTick = Boolean(tournament.draw_date) && tournament.draw_date === profile.career_date;

  const created = await upsertCareerMessage(profile.id, contextKey, {
    message_type: 'tournament_upcoming',
    notification_type: 'TOURNAMENT_UPCOMING',
    sender_type: 'federacao', sender_name: 'Federação do Circuito',
    title,
    content,
    related_entity_type: 'Tournament', related_entity_id: tournament.id, related_entity_name: tournament.name,
    // Parte G — TOURNAMENT_DETAILS é sempre resolvível (TOURNAMENT_RUN
    // exige uma sessão ativa que não existe ainda no D-3); openBracket:true
    // é o sinal explícito que Tournaments.jsx usa pra abrir a chave direto,
    // não só os detalhes.
    destination: {
      type: 'TOURNAMENT_DETAILS', route: '/tournaments',
      params: { tournament: tournament.id, mode: 'details', openBracket: true },
    },
    metadata: {
      tournament_id: tournament.id, notification_type: 'TOURNAMENT_UPCOMING',
      notification_origin: sameTick ? 'same_tick' : 'self_healing',
      opponent_team: opening?.opponentTeam || null, opponent_rank: opponentRank,
      round_label: opening?.roundLabel || null, match_date: opening?.matchDate || null,
    },
  });

  if (created && sameTick && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('padel:draw-notification', {
      detail: {
        messageId: stableId, title, content,
        tournamentId: tournament.id, tournamentName: tournament.name,
        route: `/tournaments?tournament=${encodeURIComponent(tournament.id)}&mode=details&openBracket=true`,
      },
    }));
  }
  return created;
}

// Playthrough 4.9, Parte E — o jogo não tinha NENHUM aviso prévio de
// inscrição: o único lembrete (ensureTournamentDrawNotification, acima)
// nasce depois do sorteio, ou seja, depois que a janela de inscrição já
// fechou. O jogador só descobria o fechamento no próprio dia, sem nenhuma
// chance real de agir — exatamente a queixa desta fase ("o sistema exige
// que o jogador se lembre sozinho de abrir a tela"). Roda no lifecycle do
// dia (calendarSystem.js), nunca depende de nenhuma tela React montada;
// dedup por tournament_id + marco nomeado (registrationReminderContextKey),
// nunca por contagem de dias solta — cada marco nasce no máximo uma vez por
// carreira. Reaproveita evaluateTournamentRegistration (a MESMA validação
// que registerTournament usa de verdade) pra decidir elegibilidade — nunca
// reimplementa a checagem.
function coachToneForTournamentChoice(choice) {
  if (!choice?.entry?.eligible) return 'fora de alcance no momento';
  if (choice.titleChance >= 30 || choice.expectedNet >= 400) return 'recomendado';
  if (choice.expectedNet < 0 || choice.fatigueIncrease >= 28) return 'arriscado';
  return 'adequado';
}

// Playthrough 4.9, Parte E — perf: rodando uma vez por torneio por DIA
// (calendarSystem.js), o caminho comum (marco já criado ontem, nada novo
// hoje) precisa ser barato. As checagens sem I/O (data, marcos devidos)
// vêm primeiro; o `alreadyExists` de CADA marco é checado ANTES de buscar
// registrations/tournaments (caro) — só paga esse custo quando existe
// alguma chance real de criar mensagem nova. `registrations`/`tournaments`
// também podem ser passados pelo chamador (já os tem, varrendo vários
// torneios no mesmo dia) para nunca buscar a mesma lista duas vezes.
export async function ensureTournamentRegistrationReminders(profile, tournament, { teamRank = 0, registrations: providedRegistrations = null, tournaments: providedTournaments = null } = {}) {
  if (!profile?.id || !tournament?.id || !tournament.start_date) return [];
  if (tournament.world_tour_cancelled || tournament.status === 'cancelado' || tournament.current_phase === 'cancelado') return [];
  const careerDate = profile.career_date;
  const daysUntilStart = daysBetweenGameDates(careerDate, tournament.start_date);
  if (daysUntilStart == null || daysUntilStart < 0) return [];
  const dueMilestones = Object.values(REGISTRATION_REMINDER_MILESTONES).filter((milestone) => daysUntilStart <= milestone.daysBeforeStart);
  if (!dueMilestones.length) return [];
  const pendingMilestones = [];
  for (const milestone of dueMilestones) {
    const stableId = buildStableMessageId(profile.id, registrationReminderContextKey(tournament.id, milestone.id));
    const exists = await localGame.entities.CareerMessage.get(stableId).catch(() => null);
    if (!exists) pendingMilestones.push(milestone);
  }
  if (!pendingMilestones.length) return [];

  const [registrations, tournaments] = await Promise.all([
    providedRegistrations || listTournamentRegistrations(profile.id),
    providedTournaments || localGame.entities.Tournament.list('-start_date', 500).catch(() => []),
  ]);
  const registration = registrations.find((item) => item.tournament_id === tournament.id) || null;
  const state = getPlayerTournamentRegistrationState({ tournament, registration, careerDate });
  // Só faz sentido lembrar o jogador de se inscrever enquanto a janela
  // realmente está aberta — nunca antes (ainda não abriu) nem depois
  // (fechada/já resolvido de outra forma).
  if (state !== TOURNAMENT_REGISTRATION_STATE.REGISTRATION_OPEN) return [];

  const partner = findPartnerBot(profile);
  // 5.27-J: mesma autoridade de saída da parceria que a inscrição aplica.
  const partnership = await getActivePartnership(profile.id).catch(() => null);
  const validation = evaluateTournamentRegistration({ player: profile, partner, tournament, currentDate: careerDate, registrations, tournaments, teamRank, partnership });
  if (!validation.allowed && !validation.reasons.every((item) => item.code === 'INSUFFICIENT_FUNDS')) {
    // Inelegibilidade esportiva/estrutural real (nível, entrada, conflito de
    // agenda) — avisar de um torneio que o jogador nem pode disputar seria
    // ruído, não ajuda. Falta de moedas é a única exceção: o jogador ainda
    // pode juntar recursos até o prazo, então o aviso continua útil.
    return [];
  }

  const window = getTournamentRegistrationWindow(tournament);
  const choice = evaluateTournamentChoice(tournament, { ...profile, rank: teamRank, teamRank }, {});
  const tone = coachToneForTournamentChoice(choice);
  const deadlineLabel = window.closesAt ? formatDate(window.closesAt) : null;

  const created = [];
  for (const milestone of pendingMilestones) {
    const contextKey = registrationReminderContextKey(tournament.id, milestone.id);
    let title; let content;
    if (milestone.id === 'registration_open') {
      title = `Inscrições abertas — ${tournament.name}`;
      content = `Você está elegível para disputar o ${tournament.name}.${deadlineLabel ? ` As inscrições encerram em ${deadlineLabel}.` : ''} Premiação: ${(tournament.prize_coins || 0).toLocaleString('pt-BR')} moedas. Pontos: ${tournament.rank_points || 0}. Seu treinador considera este torneio ${tone}.`;
    } else if (milestone.id === 'registration_reminder') {
      title = `Prazo de inscrição se aproxima — ${tournament.name}`;
      content = `As inscrições para o ${tournament.name} encerram em ${deadlineLabel || 'breve'}. Garanta sua vaga antes do fechamento.`;
    } else {
      title = `Última chance — inscrições encerram hoje (${tournament.name})`;
      content = `Hoje é o último dia para se inscrever no ${tournament.name}. Depois disso a chave é sorteada sem sua dupla.`;
    }

    // Playthrough 4.9, Parte J — "Ver torneio" (marco de abertura) abre só os
    // detalhes; "Inscrever" (reminder/último dia) abre o MODAL DE INSCRIÇÃO
    // direto (openRegistration:true, tratado em Tournaments.jsx), reaproveitando
    // o mesmo TournamentRegistrationModal/registerTournament() do card — nunca
    // uma lógica de registro paralela aqui.
    const openRegistration = milestone.id !== 'registration_open';
    const message = await upsertCareerMessage(profile.id, contextKey, {
      message_type: 'tournament_registration_reminder',
      notification_type: 'TOURNAMENT_REGISTRATION_REMINDER',
      sender_type: 'federacao', sender_name: 'Federação do Circuito',
      title, content,
      priority: milestone.id === 'registration_last_day' ? 'alta' : 'normal',
      related_entity_type: 'Tournament', related_entity_id: tournament.id, related_entity_name: tournament.name,
      destination: { type: 'TOURNAMENT_DETAILS', route: '/tournaments', params: { tournament: tournament.id, mode: 'details', ...(openRegistration ? { openRegistration: true } : {}) } },
      actions: [{ id: 'register', label: openRegistration ? 'Inscrever' : 'Ver torneio', type: 'register_tournament', payload: { tournamentId: tournament.id } }],
      metadata: { tournament_id: tournament.id, milestone: milestone.id, days_until_start: daysUntilStart },
    });
    if (message) created.push(message);
  }
  return created;
}

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
  const existingInterviewRecords = await localGame.entities.PressInterview
    .filter({ profile_id: profile.id }, '-created_date', 200)
    .catch(() => []);
  const interviewRecordsBySource = new Map((existingInterviewRecords || []).map((row) => [row.source_id, row]));
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
    // Playthrough 4.6D, itens 1/5/6 — condição movida pra
    // ensureTournamentDrawNotification (acima): nasce assim que a chave
    // está persistida, não mais só no dia exato D-3 — self-healing, nunca
    // perde a janela por causa de quando a tela foi aberta.
    const notif = await ensureTournamentDrawNotification(profile, nextTournament);
    if (notif) created.push(normalizeCareerMessage(notif));
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
    const persistedInterview = interviewRecordsBySource.get(sourceId);
    const staleDerivedInterview = !isPostMatchInterviewMessage(message)
      && !actionableInterviewSources.has(sourceId)
      && !persistedInterview;
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
    const interviewRecordId = `press-interview-${profile.id}-${interview.sourceId}`.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 180);
    const interviewRecord = {
      id: interviewRecordId,
      profile_id: profile.id,
      source_id: interview.sourceId,
      interview_id: interview.id,
      type: interview.type,
      title: interview.title,
      question_category: interview.questionCategory,
      interview_status: 'available',
      available_career_date: interview.availableFrom || careerDate,
      expires_career_date: interview.expiresAt || interview.expires_career_date || null,
      payload: interview,
    };
    // LOCAL-8G (8D-13): grava só quando o registro não existe ou mudou de
    // fato. Antes, toda abertura da Home/Central regravava cada entrevista
    // pendente (mesmo conteúdo, só updated_date) — uma serialização do save
    // por visita. Uma entrevista já respondida nunca volta a "available".
    const persistedRecord = interviewRecordsBySource.get(interview.sourceId);
    const recordChanged = !persistedRecord || Object.keys(interviewRecord)
      .some((field) => JSON.stringify(persistedRecord[field] ?? null) !== JSON.stringify(interviewRecord[field] ?? null));
    if (recordChanged && persistedRecord?.interview_status !== 'answered') {
      operations.push({ type: 'upsert', entityName: 'PressInterview', id: interviewRecordId, data: interviewRecord });
    }
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
        route: '/world/circuit',
        params: { tab: 'press', interview: interview.id, source: interview.sourceId },
      },
      metadata: {
        route: `/world/circuit?tab=press&interview=${encodeURIComponent(interview.id)}&source=${encodeURIComponent(interview.sourceId)}`,
        interview_id: interview.id,
        interview_source_id: interview.sourceId,
        match_id: interviewMatchId || null,
        memory_type: 'press_opportunity',
        interview_record_id: interviewRecordId,
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
