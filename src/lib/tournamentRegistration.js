import { localGame } from '@/api/localGameClient.js';
import { incrementMissionProgress } from '@/lib/padel.js';
import { buildAthleteEntryContext, evaluateTournamentEntry, getEntryPathLabel, ENTRY_PATHS } from '@/gameplay/worldTour/EntryManager.js';
import { getTournamentCampaignDates } from '@/lib/tournamentSchedule.js';
import { getActivePartnership } from '@/lib/partnershipSystem.js';
import { evaluatePartnershipRegistrationAuthority } from '@/lib/committedRoster.js';

export const TOURNAMENT_REGISTRATION_RULES = Object.freeze({
  defaultOpenDaysBeforeStart: 30,
  // Proposta A (ritmo do calendário): fechar em D-4, não D-1. O sorteio da
  // chave acontece em D-3 (TOURNAMENT_DRAW_LEAD_DAYS, tournamentDraw.js) —
  // uma inscrição aceita em D-1 nascia com a janela de preparação já
  // vencida, e a sequência inscrição -> entrevista -> sorteio -> jogo
  // colapsava. Fechar em D-4 preserva essa cronologia E satisfaz o
  // invariante obrigatório da Playthrough 4.9 (Parte C):
  // registration_deadline < draw_date, NUNCA igual. Antes desta fase os
  // dois caiam no MESMO dia (D-3 == D-3) — tecnicamente "fechado" só depois
  // que o sorteio já tinha rodado no mesmo tick, uma corrida sem vencedor
  // definido dependendo da ordem de processamento do dia. D-4/D-3 dá 1 dia
  // de folga real entre o fechamento e o sorteio oficial.
  defaultCloseDaysBeforeStart: 4,
  allowSameDayRegistration: false,
  preventOverlappingEvents: true,
  cancellationRefundRate: 1,
  // Proposta B (piso de descanso) — dias mínimos entre o FIM de um torneio
  // já disputado e o INÍCIO do próximo. Sem isso o jogador encadeia eventos
  // sem espaço para treinar, comissão técnica ou loja: medido em 47
  // torneios/ano com folga média de 3,7 dias no meio de carreira (mín. 2) e
  // 2,8 dias no topo. Energia não cria barreira nenhuma aqui (custo 20
  // contra recuperação de 84 em 7 dias), então o piso é a barreira.
  //
  // N=7 escolhido sobre a curva medida. Ela é uma função DEGRAU, não uma
  // rampa: o calendário é alinhado por semana (eventos de 4 dias em cadências
  // de 7 e 14), então todo N de 5 a 11 produz o MESMO resultado — ~24
  // torneios/ano com ~10 dias de folga, 1,5× a meta de ≥15 da Fase 0. N≤4 não
  // muda nada frente ao estado atual; N≥12 cai para 16/ano, encostando no
  // piso da meta. 7 fica no meio do patamar, tolerando variação futura do
  // calendário sem mudar de faixa.
  restFloorDays: 7,
});
const CAREER_START_DATE = '2026-01-01';
function addDays(value, amount) {
  const [year, month, day] = String(value).slice(0, 10).split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + Number(amount || 0)));
  return date.toISOString().slice(0, 10);
}

export const ACTIVE_REGISTRATION_STATUSES = new Set(['pending', 'confirmed']);
// `missed` (hotfix) — torneio ultrapassado sem disputa. Estado TERMINAL
// explícito: antes a inscrição ficava 'confirmed' para sempre (limbo, nem
// ativa nem encerrada) e o torneio sumia de todas as telas sem rastro.
export const REGISTRATION_STATUSES = new Set(['pending', 'confirmed', 'cancelled', 'withdrawn', 'rejected', 'completed', 'missed']);
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export function normalizeGameDate(value) {
  const date = String(value || '').slice(0, 10);
  return ISO_DAY.test(date) ? date : null;
}

export function getTournamentEffectiveInterval(tournament) {
  const start = normalizeGameDate(tournament?.effective_start_date || tournament?.qualifying_start_date || tournament?.qualifyingStartDate || tournament?.start_date || tournament?.startDate);
  const campaign = getTournamentCampaignDates({ ...tournament, start_date: start, qualifying_start_date: null }, { qualifyingRequired: false });
  const explicitEnd = normalizeGameDate(tournament?.effective_end_date || tournament?.end_date || tournament?.endDate);
  const end = explicitEnd || campaign.end || start;
  return { start, end: end && start && end >= start ? end : start };
}

export function daysBetweenGameDates(from, to) {
  const start = normalizeGameDate(from);
  const end = normalizeGameDate(to);
  if (!start || !end) return null;
  return Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000);
}

// Proposta B — status de inscrição que contam como "a dupla entrou em quadra".
// `missed` fica de fora de propósito: o torneio foi ultrapassado sem disputa,
// não houve desgaste físico a respeitar. `cancelled`/`withdrawn` idem.
const PLAYED_REGISTRATION_STATUSES = new Set(['completed']);

// A exibição de pré-temporada não entra no piso de descanso, em nenhuma das
// duas pontas. O catálogo já a modela como aquecimento de baixo impacto
// (rankPoints 0, entryFee 0, difficultyModifier -3, "primeiro contato do
// circuito"), e ela ocupa a folga imediatamente anterior à primeira onda do
// calendário: cobrar 7 dias de descanso por ela custaria ao jogador
// justamente a primeira semana de circuito que a abertura deveria preparar.
const REST_FLOOR_EXEMPT_TIERS = new Set(['Exibição']);

export function findRestFloorConflict({ player, partner, tournament, interval, registrations = [], tournaments = [], restFloorDays = 0 }) {
  if (!(restFloorDays > 0) || !interval?.start) return null;
  if (REST_FLOOR_EXEMPT_TIERS.has(tournament?.tier)) return null;
  for (const registration of registrations) {
    if (!PLAYED_REGISTRATION_STATUSES.has(registration?.status)) continue;
    if (registration.tournament_id === tournament?.id) continue;
    const belongsToTeam = [registration.profile_id, registration.partner_id]
      .some((id) => id && (id === player?.id || id === partner?.id));
    if (!belongsToTeam) continue;
    const other = tournaments.find((item) => item.id === registration.tournament_id);
    if (other && REST_FLOOR_EXEMPT_TIERS.has(other.tier)) continue;
    const end = normalizeGameDate(registration.effective_end_date)
      || (other ? getTournamentEffectiveInterval(other).end : null);
    if (!end) continue;
    const rest = daysBetweenGameDates(end, interval.start);
    // rest < 0 significa sobreposição — já coberta por DATE_CONFLICT, não é
    // caso de descanso; não reporta duas vezes o mesmo problema.
    if (rest == null || rest < 0 || rest >= restFloorDays) continue;
    return { rest, end, registration };
  }
  return null;
}

export function doTournamentDatesOverlap(a, b) {
  const first = getTournamentEffectiveInterval(a); const second = getTournamentEffectiveInterval(b);
  return Boolean(first.start && first.end && second.start && second.end && first.start <= second.end && second.start <= first.end);
}

export function getTournamentRegistrationWindow(tournament, rules = TOURNAMENT_REGISTRATION_RULES) {
  const { start } = getTournamentEffectiveInterval(tournament);
  if (!start) return { opensAt: null, closesAt: null };
  return {
    opensAt: normalizeGameDate(tournament.registration_open_date || tournament.registrationOpensAt) || addDays(start, -Math.max(0, Number(tournament.registration_open_days_before ?? rules.defaultOpenDaysBeforeStart))),
    closesAt: normalizeGameDate(tournament.registration_deadline || tournament.registrationClosesAt) || addDays(start, -Math.max(0, Number(tournament.registration_close_days_before ?? rules.defaultCloseDaysBeforeStart))),
  };
}

// Grupo A do playthrough — o calendário canônico coloca 6 eventos em
// 2026-01-01, exatamente o dia em que toda carreira começa. A inscrição deles
// fecha em 2025-12-31, antes de a carreira existir: são estruturalmente
// inalcançáveis. Como são `world_tour_event`, a IA os resolve normalmente e
// eles viram "ENCERRADOS" já no dia 1, aparecendo na lista do jogador como um
// histórico que ele nunca teve chance de disputar.
//
// Não é vazamento de seed de demonstração (hipótese inicial, descartada: os
// nomes vêm de buildSeasonTournaments, não de localSeed/demoData) e o volume
// do calendário NÃO é alterado — os eventos continuam existindo no mundo e
// contam nos totais do Circuito. Eles só deixam de ser apresentados como
// arquivo do JOGADOR, porque nunca estiveram ao alcance dele.
export function wasTournamentUnreachableAtCareerStart(tournament, careerStartDate = CAREER_START_DATE) {
  const start = normalizeGameDate(careerStartDate) || CAREER_START_DATE;
  const { closesAt } = getTournamentRegistrationWindow(tournament);
  return Boolean(closesAt && closesAt < start);
}

export function deterministicRegistrationId(profileId, tournamentId) {
  const safe = value => String(value || '').replace(/[^a-zA-Z0-9_-]/g, '-');
  return `registration-${safe(profileId)}-${safe(tournamentId)}`;
}

export function isConfirmedRegistration(registration, profileId, tournamentId) {
  return Boolean(registration && registration.profile_id === profileId && registration.tournament_id === tournamentId && registration.status === 'confirmed');
}

function reason(code, message, details = {}) { return { code, message, ...details }; }

export function evaluateTournamentRegistration({ player, partner, tournament, currentDate, registrations = [], tournaments = [], teamRank = 0, priorityWindowRemaining = 0, partnership = null, rules = TOURNAMENT_REGISTRATION_RULES }) {
  const date = normalizeGameDate(currentDate || player?.career_date || CAREER_START_DATE);
  const interval = getTournamentEffectiveInterval(tournament);
  const window = getTournamentRegistrationWindow(tournament, rules);
  const reasons = []; const warnings = [];
  const active = registrations.filter(item => ACTIVE_REGISTRATION_STATUSES.has(item?.status));
  const existing = active.find(item => item.profile_id === player?.id && item.tournament_id === tournament?.id);
  if (!interval.start) reasons.push(reason('INVALID_TOURNAMENT_DATE', 'O torneio não possui uma data válida.'));
  else if (date >= interval.start) reasons.push(reason('TOURNAMENT_STARTED', 'O torneio já começou e não aceita novas inscrições.'));
  if (window.opensAt && date < window.opensAt) reasons.push(reason('REGISTRATION_NOT_OPEN', `As inscrições abrem em ${window.opensAt}.`));
  if (window.closesAt && date > window.closesAt) reasons.push(reason('REGISTRATION_CLOSED', `As inscrições encerraram em ${window.closesAt}.`));
  if (existing) reasons.push(reason('ALREADY_REGISTERED', 'Sua dupla já possui inscrição ativa neste torneio.', { registrationId: existing.id }));
  if (!player?.id || player?.retired) reasons.push(reason('PLAYER_INACTIVE', 'O atleta não está ativo para competir.'));
  if (!partner?.id || partner?.unavailable || partner?.status === 'indisponivel') reasons.push(reason('PARTNER_UNAVAILABLE', 'É necessário um parceiro ativo e disponível.'));
  if (player?.partner_id && partner?.id && player.partner_id !== partner.id) reasons.push(reason('PARTNER_CHANGED', 'O parceiro selecionado não corresponde à dupla ativa.'));
  // Playthrough 5.27-J — autoridade única de saída da parceria (committedRoster):
  // dupla com saída decidida não cria compromisso novo que a estenda.
  const exitAuthority = evaluatePartnershipRegistrationAuthority(partnership, { careerDate: date, tournament });
  if (!exitAuthority.allowed) reasons.push(reason(exitAuthority.code, exitAuthority.reason, { nominalEnd: exitAuthority.nominalEnd ?? null }));
  // Fase 8.1, item 2 — `priority_window_remaining` vive na Partnership
  // ativa do jogador (mesmo campo que a IA usa, Fase 7.4), não em
  // PlayerProfile; mesclado aqui como qualquer outro campo que
  // buildAthleteEntryContext já lê de `profile` (wildcard_tokens,
  // protected_ranking, etc.), sem mudar a assinatura dessa função.
  const entry = evaluateTournamentEntry(tournament, buildAthleteEntryContext({ ...player, priority_window_remaining: priorityWindowRemaining }, teamRank, tournament));
  if (!entry.eligible) reasons.push(reason('SPORTING_INELIGIBLE', entry.reason || 'A dupla não atende aos critérios esportivos.'));
  const fee = Math.max(0, Number(tournament?.entry_fee) || 0);
  if (Number(player?.coins || 0) < fee) reasons.push(reason('INSUFFICIENT_FUNDS', `São necessárias ${fee} moedas para a inscrição.`));
  const confirmedCount = registrations.filter(item => item.tournament_id === tournament?.id && item.status === 'confirmed').length;
  if (Number(tournament?.max_participants) > 0 && confirmedCount >= Number(tournament.max_participants)) reasons.push(reason('TOURNAMENT_FULL', 'Não há vagas disponíveis.'));
  if (Number(player?.energy ?? 100) < 30) warnings.push(reason('LOW_ENERGY', 'Sua energia está baixa para este compromisso.'));

  if (rules.preventOverlappingEvents) {
    for (const registration of active) {
      if (registration.tournament_id === tournament?.id) continue;
      if (registration.profile_id !== player?.id && registration.partner_id !== player?.id && registration.profile_id !== partner?.id && registration.partner_id !== partner?.id) continue;
      const other = tournaments.find(item => item.id === registration.tournament_id) || { start_date: registration.effective_start_date, end_date: registration.effective_end_date };
      if (doTournamentDatesOverlap(tournament, other)) reasons.push(reason('DATE_CONFLICT', `Sua dupla já está inscrita em ${registration.tournament_name || 'outro torneio'} entre ${getTournamentEffectiveInterval(other).start} e ${getTournamentEffectiveInterval(other).end}. Cancele essa inscrição antes de escolher outro evento.`, { conflictingRegistrationId: registration.id, conflictingTournamentId: registration.tournament_id }));
    }
  }

  // Playthrough 4.6, itens 9/10/11 — a Proposta B (piso de descanso) era um
  // BLOQUEIO absoluto: um circuito profissional real tem torneios em
  // semanas consecutivas o tempo todo (Londres 01/02 → Los Angeles 05/02,
  // só 4 dias, é um calendário normal, não uma violação de agenda). A
  // própria justificativa original desta regra (comentário de
  // TOURNAMENT_REGISTRATION_RULES.restFloorDays, acima) já registrava que a
  // energia/fadiga natural NÃO cria barreira nenhuma sozinha (recuperação
  // de ~84 em 7 dias contra um custo de torneio de ~20) — por isso o piso
  // rígido foi inventado como barreira artificial por cima. Decisão nova:
  // descanso vira CONSEQUÊNCIA (energia/fadiga residual, o sistema físico
  // que já existe em PhysicalConditionManager.js — recuperação diária via
  // calculateDailyRecovery, sem nenhuma rebalanceada nesta fase), nunca
  // IMPEDIMENTO de inscrição. `findRestFloorConflict` continua calculando
  // o descanso restante (ainda útil como aviso), mas vira `warnings`, não
  // `reasons` — não conta mais para `allowed`. Sobreposição REAL de datas
  // (DATE_CONFLICT, acima) continua bloqueando normalmente — exclusividade
  // de agenda nunca foi a regra removida aqui.
  const restConflict = findRestFloorConflict({ player, partner, tournament, interval, registrations, tournaments, restFloorDays: rules.restFloorDays });
  if (restConflict) {
    const missing = rules.restFloorDays - restConflict.rest;
    warnings.push(reason(
      'REST_ADVISORY',
      `A dupla encerrou ${restConflict.registration.tournament_name || 'outro torneio'} em ${restConflict.end} há apenas ${restConflict.rest} dia(s) — espere energia e fadiga residuais nas primeiras rodadas (faltariam ${missing} dia(s) para a recuperação completa habitual).`,
      { restDays: restConflict.rest, requiredRestDays: rules.restFloorDays, previousTournamentId: restConflict.registration.tournament_id },
    ));
  }

  return { allowed: reasons.length === 0, reasons, warnings, registrationWindow: window, interval, entry };
}

export async function listTournamentRegistrations(profileId) {
  return localGame.entities.TournamentRegistration.filter({ profile_id: profileId });
}

export async function isPlayerRegisteredForTournament(profileId, tournamentId) {
  const rows = await localGame.entities.TournamentRegistration.filter({ profile_id: profileId, tournament_id: tournamentId, status: 'confirmed' });
  return rows?.[0] || null;
}

/**
 * Hotfix 15.6.2: fonte canônica ÚNICA para "qual CalendarEvent representa a
 * campanha real deste torneio para este jogador" — usada por todo consumidor
 * que precisa ler/decidir sobre um tournament_run a partir de (profileId,
 * tournamentId).
 *
 * Causa raiz do bug real (QA desktop): o seed de demonstração local
 * (src/local/localSeed.js, CalendarEvent 'cal-002') e uma inscrição real
 * (registerTournament) podem compartilhar o MESMO `related_id` quando o
 * jogador se inscreve exatamente no torneio que o seed também referencia —
 * duas linhas de CalendarEvent, um único `related_id`. Um `.find()` ingênuo
 * (sem preferência) pode pegar a linha de demonstração (sempre sem
 * `tournament_run`, `is_mandatory:false`, sem `metadata`) em vez da inscrição
 * real — fazendo o consumidor "esquecer" um sorteio que existe de verdade.
 * `Tournaments.jsx` (Ver chaves) nunca sofreu isso por acidente: seu
 * `activeRunEvents` já filtra por `metadata?.tournament_run` truthy ANTES de
 * indexar por `related_id` — como a linha seed nunca tem run (garantido pelo
 * guard `registration_id` de ensureTournamentDraw), ela já saía do
 * candidato. Esta função aplica a MESMA regra de preferência explicitamente,
 * para qualquer consumidor que precise de uma única linha: uma inscrição
 * real (`metadata.registration_id` presente) é sempre a fonte canônica;
 * nunca um evento ilustrativo sem inscrição.
 */
// Regra de preferência pura (sem I/O) — extraída para ser reutilizável tanto
// por quem tem acesso a `localGame` (consulta assíncrona) quanto por quem já
// possui um snapshot em memória das entidades da carreira (ex.:
// guardActiveMatchBeforeAdvance, que opera sobre `snapshot.entities`, não
// sobre uma nova query).
export function pickCanonicalTournamentEvent(events) {
  const list = Array.isArray(events) ? events : [];
  if (list.length <= 1) return list[0] || null;
  return list.find((event) => event.metadata?.registration_id && event.status === 'scheduled')
    || list.find((event) => event.metadata?.registration_id)
    || list.find((event) => event.status === 'scheduled')
    || list[0];
}

export async function resolveTournamentCampaignEvent(profileId, tournamentId) {
  if (!profileId || !tournamentId) return null;
  const events = await localGame.entities.CalendarEvent.filter({ profile_id: profileId, related_id: tournamentId, event_type: 'tournament' });
  if (!events || events.length === 0) return null;
  return pickCanonicalTournamentEvent(events);
}

const TERMINAL_TOURNAMENT_RUN_STATUSES = new Set(['eliminated', 'champion', 'finished']);

/**
 * Hotfix 15.5.2: presença numa campanha vale para o torneio inteiro, não por
 * rodada — uma vez confirmado o registro inicial, R16→QF→SF→F nunca exigem
 * nova confirmação manual enquanto o jogador seguir classificado. Fonte
 * canônica é `TournamentRegistration.status === 'confirmed'`; quando esse
 * registro está ausente (save legado anterior à v2, ou linha órfã) mas o
 * `CalendarEvent` já guarda um `tournament_run` ativo para este torneio, a
 * presença é derivada em memória a partir do próprio run — nunca exige
 * migração destrutiva nem recria o registro sozinha.
 */
export function isTournamentParticipationConfirmed({ registration = null, event = null, tournamentRun = null } = {}) {
  if (registration?.status === 'confirmed') return true;
  if (!event || event.event_type !== 'tournament' || event.status !== 'scheduled') return false;
  const run = tournamentRun || event.metadata?.tournament_run || null;
  if (!run || TERMINAL_TOURNAMENT_RUN_STATUSES.has(run.status)) return false;
  return true;
}

export async function registerTournament({ player, partner, tournament, teamRank = 0 }) {
  const id = deterministicRegistrationId(player.id, tournament.id);
  const existingById = await localGame.entities.TournamentRegistration.filter({ profile_id: player.id, tournament_id: tournament.id });
  const activeExisting = existingById.find(item => ACTIVE_REGISTRATION_STATUSES.has(item.status));
  if (activeExisting) return { success: true, idempotent: true, registration: activeExisting, profile: player, entry: { path: activeExisting.entry_path } };
  const [registrations, tournaments, activePartnership] = await Promise.all([
    listTournamentRegistrations(player.id), localGame.entities.Tournament.list('-start_date', 500), getActivePartnership(player.id),
  ]);
  const partnerRegistrations = partner?.id ? await localGame.entities.TournamentRegistration.filter({ partner_id: partner.id }) : [];
  const priorityWindowRemaining = Number(activePartnership?.priority_window_remaining) || 0;
  const validation = evaluateTournamentRegistration({ player, partner, tournament, currentDate: player.career_date, registrations: [...registrations, ...partnerRegistrations], tournaments, teamRank, priorityWindowRemaining, partnership: activePartnership });
  if (!validation.allowed) return { success: false, reasons: validation.reasons, warnings: validation.warnings, validation };
  // Fase 8.1, item 2 — cada inscrição USADA com a janela ativa desconta 1,
  // mesmo desenho da IA (WorldTourLifecycle.js: desconta a cada aparição
  // efetiva, não só ao vencer o qualifying de novo).
  if (validation.entry.path === ENTRY_PATHS.PRIORITY_WINDOW && activePartnership) {
    await localGame.entities.Partnership.update(activePartnership.id, { priority_window_remaining: Math.max(0, priorityWindowRemaining - 1) });
  }
  const qualifyingRequired = validation.entry.path === 'qualifying';
  const planned = getTournamentCampaignDates(tournament, { qualifyingRequired });
  const interval = { start: planned.start || validation.interval.start, end: planned.end || validation.interval.end };
  const fee = Math.max(0, Number(tournament.entry_fee) || 0);
  const registration = await localGame.entities.TournamentRegistration.upsert(id, {
    id, profile_id: player.id, player_id: player.id, partner_id: partner.id, tournament_id: tournament.id, tournament_name: tournament.name,
    status: 'confirmed', registered_at: player.career_date, cancelled_at: null, effective_start_date: interval.start, effective_end_date: interval.end,
    entry_path: validation.entry.path, entry_label: getEntryPathLabel(validation.entry.path), entry_fee_paid: fee,
  });
  // Fase 8.1, item 3 — consome a wildcard só quando ela foi de fato o
  // motivo da entrada (nunca no caminho `tournament.player_wildcard`,
  // que não é um recurso do jogador pra gastar).
  const usedWildcard = validation.entry.path === ENTRY_PATHS.WILDCARD && Number(player.wildcard_tokens) > 0;
  const profilePatch = {
    ...(fee ? { coins: Number(player.coins || 0) - fee } : {}),
    ...(usedWildcard ? { wildcard_tokens: Number(player.wildcard_tokens) - 1 } : {}),
  };
  const updatedProfile = Object.keys(profilePatch).length ? await localGame.entities.PlayerProfile.update(player.id, profilePatch) : player;
  await localGame.entities.CalendarEvent.upsert(`calendar-${id}`, {
    id: `calendar-${id}`, profile_id: player.id, event_type: 'tournament', title: tournament.name, start_date: interval.start, end_date: interval.end,
    related_id: tournament.id, related_name: tournament.name, status: 'scheduled', is_mandatory: true, requires_decision: true, decision_type: 'play_tournament',
    coin_cost: fee, metadata: {
      registration_id: id,
      partner_id: partner.id,
      entry_path: validation.entry.path,
      qualifying_required: qualifyingRequired,
      qualifying_status: qualifyingRequired ? 'pending' : 'not_required',
      team_rank: Number(teamRank || 0),
      registration_schema_version: 2,
      tournament_run_schema_version: 2,
      original_start_date: interval.start,
      planned_end_date: interval.end,
    },
  });
  await incrementMissionProgress(player.id, 'join_tournament');
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('padel:onboarding-refresh'));
  return { success: true, registration, profile: updatedProfile, entry: validation.entry, warnings: validation.warnings };
}

export async function cancelTournamentRegistration({ player, registration, tournament, currentDate }) {
  if (!registration || !ACTIVE_REGISTRATION_STATUSES.has(registration.status)) return { success: false, reason: reason('NOT_ACTIVE', 'A inscrição já não está ativa.') };
  const window = getTournamentRegistrationWindow(tournament);
  const date = normalizeGameDate(currentDate || player.career_date);
  if (window.closesAt && date > window.closesAt) return { success: false, reason: reason('CANCELLATION_CLOSED', 'O prazo para cancelamento já terminou.') };
  const refund = Math.round((Number(registration.entry_fee_paid) || 0) * TOURNAMENT_REGISTRATION_RULES.cancellationRefundRate);
  const updated = await localGame.entities.TournamentRegistration.update(registration.id, { status: 'cancelled', cancelled_at: date, refund_amount: refund });
  const events = await localGame.entities.CalendarEvent.filter({ profile_id: player.id, related_id: registration.tournament_id, status: 'scheduled' });
  await Promise.all(events.map(event => localGame.entities.CalendarEvent.update(event.id, { status: 'cancelled', metadata: { ...(event.metadata || {}), cancellation_reason: 'registration_cancelled' } })));
  const profile = refund ? await localGame.entities.PlayerProfile.update(player.id, { coins: Number(player.coins || 0) + refund }) : player;
  return { success: true, registration: updated, profile, refund };
}

export function validateTournamentRegistrations({ registrations = [], tournaments = [], players = [] }) {
  const issues = []; const seen = new Set(); const tournamentIds = new Set(tournaments.map(item => item.id)); const playerIds = new Set(players.map(item => item.id));
  for (const item of registrations) {
    const key = `${item.profile_id}:${item.tournament_id}:${item.status}`;
    if (seen.has(key) && ACTIVE_REGISTRATION_STATUSES.has(item.status)) issues.push(reason('DUPLICATE', 'Inscrição ativa duplicada.', { registrationId: item.id }));
    seen.add(key);
    if (!REGISTRATION_STATUSES.has(item.status)) issues.push(reason('INVALID_STATUS', 'Status de inscrição inválido.', { registrationId: item.id }));
    if (!tournamentIds.has(item.tournament_id)) issues.push(reason('MISSING_TOURNAMENT', 'Torneio da inscrição não existe.', { registrationId: item.id }));
    if (players.length && !playerIds.has(item.profile_id)) issues.push(reason('MISSING_PLAYER', 'Jogador da inscrição não existe.', { registrationId: item.id }));
  }
  const active = registrations.filter(item => ACTIVE_REGISTRATION_STATUSES.has(item.status));
  for (let i = 0; i < active.length; i += 1) for (let j = i + 1; j < active.length; j += 1) {
    const a = active[i]; const b = active[j];
    const shared = [a.profile_id, a.partner_id].filter(Boolean).some(id => id === b.profile_id || id === b.partner_id);
    if (shared && a.tournament_id !== b.tournament_id && doTournamentDatesOverlap(a, b)) issues.push(reason('DATE_CONFLICT', 'Atleta inscrito em torneios sobrepostos.', { registrationIds: [a.id, b.id] }));
  }
  return { valid: issues.length === 0, issues };
}

export function migrateTournamentRegistrations({ player = {}, tournaments = [], registrations = [], calendarEvents = [] }) {
  const byTournament = new Map(tournaments.map(item => [item.id, item])); const output = []; const seen = new Set();
  const candidates = [...registrations, ...calendarEvents.filter(event => event.event_type === 'tournament' && event.related_id).map(event => ({ id: `registration-${player.id}-${event.related_id}`, profile_id: player.id, player_id: player.id, partner_id: event.metadata?.partner_id || player.partner_id || null, tournament_id: event.related_id, tournament_name: event.related_name || event.title, status: event.status === 'cancelled' ? 'cancelled' : event.status === 'completed' ? 'completed' : 'confirmed', registered_at: event.created_date || player.career_date, entry_fee_paid: event.coin_cost || 0 }))];
  for (const raw of candidates) {
    if (!raw?.tournament_id || !raw?.profile_id) continue;
    const key = `${raw.profile_id}:${raw.tournament_id}`; if (seen.has(key)) continue; seen.add(key);
    const tournament = byTournament.get(raw.tournament_id) || {};
    const interval = getTournamentEffectiveInterval({ ...tournament, start_date: raw.effective_start_date || tournament.start_date, end_date: raw.effective_end_date || tournament.end_date });
    output.push({ ...raw, id: raw.id || deterministicRegistrationId(raw.profile_id, raw.tournament_id), status: REGISTRATION_STATUSES.has(raw.status) ? raw.status : 'confirmed', effective_start_date: raw.effective_start_date || interval.start, effective_end_date: raw.effective_end_date || interval.end, registration_schema_version: 2 });
  }
  return output;
}
