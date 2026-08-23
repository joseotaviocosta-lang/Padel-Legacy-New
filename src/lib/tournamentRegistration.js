import { localGame } from '@/api/localGameClient.js';
import { incrementMissionProgress } from '@/lib/padel.js';
import { buildAthleteEntryContext, evaluateTournamentEntry, getEntryPathLabel } from '@/gameplay/worldTour/EntryManager.js';
import { getTournamentCampaignDates } from '@/lib/tournamentSchedule.js';

export const TOURNAMENT_REGISTRATION_RULES = Object.freeze({
  defaultOpenDaysBeforeStart: 30,
  defaultCloseDaysBeforeStart: 1,
  allowSameDayRegistration: false,
  preventOverlappingEvents: true,
  cancellationRefundRate: 1,
});
const CAREER_START_DATE = '2026-01-01';
function addDays(value, amount) {
  const [year, month, day] = String(value).slice(0, 10).split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + Number(amount || 0)));
  return date.toISOString().slice(0, 10);
}

export const ACTIVE_REGISTRATION_STATUSES = new Set(['pending', 'confirmed']);
export const REGISTRATION_STATUSES = new Set(['pending', 'confirmed', 'cancelled', 'withdrawn', 'rejected', 'completed']);
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

export function deterministicRegistrationId(profileId, tournamentId) {
  const safe = value => String(value || '').replace(/[^a-zA-Z0-9_-]/g, '-');
  return `registration-${safe(profileId)}-${safe(tournamentId)}`;
}

export function isConfirmedRegistration(registration, profileId, tournamentId) {
  return Boolean(registration && registration.profile_id === profileId && registration.tournament_id === tournamentId && registration.status === 'confirmed');
}

function reason(code, message, details = {}) { return { code, message, ...details }; }

export function evaluateTournamentRegistration({ player, partner, tournament, currentDate, registrations = [], tournaments = [], teamRank = 0, rules = TOURNAMENT_REGISTRATION_RULES }) {
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
  const entry = evaluateTournamentEntry(tournament, buildAthleteEntryContext(player, teamRank, tournament));
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
  return { allowed: reasons.length === 0, reasons, warnings, registrationWindow: window, interval, entry };
}

export async function listTournamentRegistrations(profileId) {
  return localGame.entities.TournamentRegistration.filter({ profile_id: profileId });
}

export async function isPlayerRegisteredForTournament(profileId, tournamentId) {
  const rows = await localGame.entities.TournamentRegistration.filter({ profile_id: profileId, tournament_id: tournamentId, status: 'confirmed' });
  return rows?.[0] || null;
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
  const [registrations, tournaments] = await Promise.all([listTournamentRegistrations(player.id), localGame.entities.Tournament.list('-start_date', 500)]);
  const partnerRegistrations = partner?.id ? await localGame.entities.TournamentRegistration.filter({ partner_id: partner.id }) : [];
  const validation = evaluateTournamentRegistration({ player, partner, tournament, currentDate: player.career_date, registrations: [...registrations, ...partnerRegistrations], tournaments, teamRank });
  if (!validation.allowed) return { success: false, reasons: validation.reasons, warnings: validation.warnings, validation };
  const qualifyingRequired = validation.entry.path === 'qualifying';
  const planned = getTournamentCampaignDates(tournament, { qualifyingRequired });
  const interval = { start: planned.start || validation.interval.start, end: planned.end || validation.interval.end };
  const fee = Math.max(0, Number(tournament.entry_fee) || 0);
  const registration = await localGame.entities.TournamentRegistration.upsert(id, {
    id, profile_id: player.id, player_id: player.id, partner_id: partner.id, tournament_id: tournament.id, tournament_name: tournament.name,
    status: 'confirmed', registered_at: player.career_date, cancelled_at: null, effective_start_date: interval.start, effective_end_date: interval.end,
    entry_path: validation.entry.path, entry_label: getEntryPathLabel(validation.entry.path), entry_fee_paid: fee,
  });
  const updatedProfile = fee ? await localGame.entities.PlayerProfile.update(player.id, { coins: Number(player.coins || 0) - fee }) : player;
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
