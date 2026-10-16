// Hotfix 5.30-B — AUTORIDADE ÚNICA do "próximo evento" do jogador.
//
// Antes, três superfícies respondiam "qual é o próximo torneio?" cada uma
// com sua regra e sua cópia dos dados:
// - header (careerHeaderContext.js): o primeiro por data entre todos os
//   torneios;
// - Torneios (Tournaments.jsx): o primeiro por data com inscrição aberta;
// - Home (CareerHub.jsx): o primeiro por data, incluindo eventos em curso.
// O playtest físico pegou o header anunciando Londres Challenge enquanto
// Torneios e Home mostravam Roma Pré-Temporada, que vem antes.
//
// Regra (DATA + RELEVÂNCIA, nunca "dá pontos de ranking"):
//   1. evento em andamento (campanha com partida pendente);
//   2. evento já inscrito, o mais próximo;
//   3. evento com inscrição aberta, o mais próximo;
//   4. próximo evento futuro do calendário.
// Exibição/Pré-Temporada e torneios sem ranking entram como qualquer outro:
// têm data, inscrição e partidas reais.
// Ficam de fora: evento sem data, já encerrado (finalizado/campeão), já
// resolvido para o jogador (campanha encerrada, inscrição cancelada), com
// início já passado sem o jogador (o que começa HOJE ainda conta: "Hoje · X"),
// e evento cuja inscrição fechou antes de a carreira começar.
//
// Função PURA: recebe os dados já carregados, não lê storage.
import { getCurrentTournamentMatch } from '@/gameplay/worldTour/TournamentRunManager.js';
import { getTournamentRegistrationWindow, wasTournamentUnreachableAtCareerStart } from '@/lib/tournamentRegistration.js';

export const NEXT_EVENT_KINDS = Object.freeze({ ACTIVE: 'active', REGISTERED: 'registered', OPEN: 'open', UPCOMING: 'upcoming' });

const TERMINAL_RUN_STATUSES = new Set(['champion', 'eliminated', 'finished', 'withdrawn']);
const CLOSED_EVENT_STATUSES = new Set(['completed', 'missed', 'cancelled']);
const FINISHED_TOURNAMENT_STATUSES = new Set(['finalizado', 'encerrado', 'concluido', 'completed', 'finished', 'cancelado', 'cancelled']);

const byDate = (a, b) => String(a || '').localeCompare(String(b || ''));

function isTournamentFinished(tournament) {
  return FINISHED_TOURNAMENT_STATUSES.has(String(tournament?.status || '').toLowerCase()) || Boolean(tournament?.champion);
}

/** Torneio que ainda pode ser o "próximo evento" de alguém (data real, não encerrado, alcançável). */
export function isSelectableTournament(tournament) {
  return Boolean(tournament?.id && tournament?.start_date) && !isTournamentFinished(tournament) && !wasTournamentUnreachableAtCareerStart(tournament);
}

/** Mesma janela de `isRegistrationOpen` (calendarSystem), sem puxar o módulo de calendário inteiro. */
export function isTournamentRegistrationOpenOn(tournament, careerDate) {
  if (!careerDate || !tournament?.start_date) return false;
  const { opensAt, closesAt } = getTournamentRegistrationWindow(tournament);
  return Boolean(opensAt && closesAt) && careerDate >= opensAt && careerDate <= closesAt;
}

/** Torneio com inscrição aberta mais próximo (o "Próximo evento" de Torneios). */
export function selectNextOpenTournament(tournaments = [], careerDate) {
  if (!careerDate) return null;
  return (tournaments || [])
    .filter((item) => isSelectableTournament(item) && item.start_date >= careerDate && isTournamentRegistrationOpenOn(item, careerDate))
    .sort((a, b) => byDate(a.start_date, b.start_date))[0] || null;
}

function selectActiveCampaign(calendarEvents, careerDate) {
  const candidates = [];
  for (const event of calendarEvents || []) {
    if (!event || (event.event_type && event.event_type !== 'tournament')) continue;
    if (CLOSED_EVENT_STATUSES.has(String(event.status || '').toLowerCase())) continue;
    const run = event.metadata?.tournament_run;
    if (!run || TERMINAL_RUN_STATUSES.has(run.status)) continue;
    const match = getCurrentTournamentMatch(run);
    if (!match) continue;
    candidates.push({ event, run, match });
  }
  // Mais de uma campanha viva é anômalo; vence a partida de HOJE e, entre
  // iguais, a de data mais próxima — nunca "a primeira da lista".
  candidates.sort((a, b) => {
    const aToday = a.match.date === careerDate ? 0 : 1;
    const bToday = b.match.date === careerDate ? 0 : 1;
    return aToday - bToday || byDate(a.match.date, b.match.date);
  });
  return candidates[0] || null;
}

function selectRegisteredEvent(calendarEvents, careerDate, tournamentById) {
  return (calendarEvents || [])
    .filter((event) => event && (!event.event_type || event.event_type === 'tournament')
      && !CLOSED_EVENT_STATUSES.has(String(event.status || '').toLowerCase())
      // Inscrição real (registerTournament grava registration_id) ou campanha.
      // Só `status: 'scheduled'` não basta: o seed local traz um evento
      // ilustrativo ("Torneio (exemplo do calendário)") sem torneio por trás.
      && (event.metadata?.registration_id || event.metadata?.tournament_run)
      && !TERMINAL_RUN_STATUSES.has(event.metadata?.tournament_run?.status)
      && (event.end_date || event.start_date) >= careerDate)
    .map((event) => ({ event, tournament: tournamentById.get(event.related_id) || null, startDate: event.start_date }))
    .filter(({ tournament }) => !tournament || !isTournamentFinished(tournament))
    .sort((a, b) => byDate(a.startDate, b.startDate))[0] || null;
}

/**
 * O próximo evento competitivo relevante para o jogador.
 *
 * @param {object} input
 * @param {Array<object>} [input.tournaments] Torneios do calendário (qualquer ordem).
 * @param {Array<object>} [input.calendarEvents] CalendarEvents de torneio do jogador (inscrições/campanhas).
 * @param {string} input.careerDate Data atual da carreira (YYYY-MM-DD).
 * @returns {{kind:string, tournamentId:string|null, name:string, startDate:string|null, tournament:object|null, event:object|null, run:object|null, match:object|null}|null}
 */
export function selectNextRelevantEvent({ tournaments = [], calendarEvents = [], careerDate } = {}) {
  if (!careerDate) return null;
  const tournamentById = new Map((tournaments || []).filter((item) => item?.id).map((item) => [item.id, item]));

  const active = selectActiveCampaign(calendarEvents, careerDate);
  if (active) {
    const tournament = tournamentById.get(active.event.related_id) || null;
    return {
      kind: NEXT_EVENT_KINDS.ACTIVE,
      tournamentId: active.event.related_id || active.run.tournamentId || null,
      name: active.run.tournamentName || active.event.related_name || tournament?.name || 'Torneio',
      startDate: active.match.date || active.event.start_date || null,
      tournament, event: active.event, run: active.run, match: active.match,
    };
  }

  const registered = selectRegisteredEvent(calendarEvents, careerDate, tournamentById);
  if (registered) {
    const { event, tournament } = registered;
    return {
      kind: NEXT_EVENT_KINDS.REGISTERED,
      tournamentId: event.related_id || tournament?.id || null,
      name: event.related_name || tournament?.name || event.title || 'Torneio',
      startDate: tournament?.start_date || event.start_date || null,
      tournament, event, run: event.metadata?.tournament_run || null, match: null,
    };
  }

  const open = selectNextOpenTournament(tournaments, careerDate);
  if (open) {
    return { kind: NEXT_EVENT_KINDS.OPEN, tournamentId: open.id, name: open.name, startDate: open.start_date, tournament: open, event: null, run: null, match: null };
  }

  const upcoming = (tournaments || [])
    .filter((item) => isSelectableTournament(item) && item.start_date >= careerDate)
    .sort((a, b) => byDate(a.start_date, b.start_date))[0] || null;
  if (upcoming) {
    return { kind: NEXT_EVENT_KINDS.UPCOMING, tournamentId: upcoming.id, name: upcoming.name, startDate: upcoming.start_date, tournament: upcoming, event: null, run: null, match: null };
  }
  return null;
}
