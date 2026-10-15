// Playthrough 4.9, Parte B — fonte canônica ÚNICA para "em que estado a
// inscrição/participação deste jogador está, para este torneio". Antes
// desta fase, cada tela decidia por conta própria se o jogador "estava
// inscrito" (Tournaments.jsx lia registeredTournaments + tournament_run;
// careerCommunications.js nem checava nada; a fabricação de
// getPlayerOpeningMatchFromCanonicalBracket completava a lacuna com um
// fallback textual). Esta função nunca infere por data/status do torneio
// sozinho — só por fatos persistidos: TournamentRegistration.status,
// a janela de inscrição (tournamentRegistration.js, já canônica) e o
// tournament_run (quando existe).
import { getTournamentRegistrationWindow, normalizeGameDate } from '@/lib/tournamentRegistration.js';

export const TOURNAMENT_REGISTRATION_STATE = Object.freeze({
  NOT_REGISTERED: 'NOT_REGISTERED',
  REGISTRATION_OPEN: 'REGISTRATION_OPEN',
  REGISTERED: 'REGISTERED',
  REGISTRATION_CLOSED: 'REGISTRATION_CLOSED',
  DRAWN: 'DRAWN',
  IN_PROGRESS: 'IN_PROGRESS',
  ELIMINATED: 'ELIMINATED',
  COMPLETED: 'COMPLETED',
  WITHDRAWN: 'WITHDRAWN',
  CANCELLED: 'CANCELLED',
});

const RUN_TERMINAL_ELIMINATED = new Set(['eliminated']);
const RUN_COMPLETED = new Set(['champion', 'finished']);
const RUN_IN_PROGRESS = new Set(['playing', 'between_rounds']);

// Pura — nenhum I/O. `registration` é a linha de TournamentRegistration
// (ou null/undefined se nunca existiu); `tournamentRun` é
// event.metadata?.tournament_run quando o chamador já o tem em mãos
// (nunca recalculado aqui). `drawn` é só um booleano factual
// (bracket_history existe? — o chamador decide como obter isso, tipicamente
// via getTournamentDrawState, nunca recalculado aqui de novo).
export function getPlayerTournamentRegistrationState({ tournament, registration = null, careerDate, tournamentRun = null, drawn = false } = {}) {
  const date = normalizeGameDate(careerDate);

  if (registration?.status === 'withdrawn') return TOURNAMENT_REGISTRATION_STATE.WITHDRAWN;
  if (registration?.status === 'cancelled') return TOURNAMENT_REGISTRATION_STATE.CANCELLED;
  if (registration?.status === 'completed') return TOURNAMENT_REGISTRATION_STATE.COMPLETED;
  if (registration?.status === 'missed') return TOURNAMENT_REGISTRATION_STATE.WITHDRAWN;

  const isActiveRegistration = registration?.status === 'confirmed' || registration?.status === 'pending';
  if (isActiveRegistration) {
    const runStatus = tournamentRun?.status || null;
    if (runStatus && RUN_TERMINAL_ELIMINATED.has(runStatus)) return TOURNAMENT_REGISTRATION_STATE.ELIMINATED;
    if (runStatus && RUN_COMPLETED.has(runStatus)) return TOURNAMENT_REGISTRATION_STATE.COMPLETED;
    if (runStatus && RUN_IN_PROGRESS.has(runStatus)) return TOURNAMENT_REGISTRATION_STATE.IN_PROGRESS;
    if (drawn) return TOURNAMENT_REGISTRATION_STATE.DRAWN;
    return TOURNAMENT_REGISTRATION_STATE.REGISTERED;
  }

  // Sem inscrição ativa — o estado vem só da janela canônica de inscrição
  // (tournamentRegistration.js), nunca recalculada de outra forma aqui.
  const window = getTournamentRegistrationWindow(tournament);
  if (!date || !window.closesAt) return TOURNAMENT_REGISTRATION_STATE.NOT_REGISTERED;
  if (window.opensAt && date < window.opensAt) return TOURNAMENT_REGISTRATION_STATE.NOT_REGISTERED;
  if (date > window.closesAt) return TOURNAMENT_REGISTRATION_STATE.REGISTRATION_CLOSED;
  return TOURNAMENT_REGISTRATION_STATE.REGISTRATION_OPEN;
}

// Estados em que o jogador tem participação confirmada de fato (usado por
// invariantes de UI: botão "Jogar", aparecer em draw_pair_ids, etc.).
export const REGISTERED_PARTICIPATION_STATES = new Set([
  TOURNAMENT_REGISTRATION_STATE.REGISTERED,
  TOURNAMENT_REGISTRATION_STATE.DRAWN,
  TOURNAMENT_REGISTRATION_STATE.IN_PROGRESS,
  TOURNAMENT_REGISTRATION_STATE.ELIMINATED,
  TOURNAMENT_REGISTRATION_STATE.COMPLETED,
]);

export function isPlayerParticipating(state) {
  return REGISTERED_PARTICIPATION_STATES.has(state);
}

// Invariante 5 (Parte B) — o botão "Inscrever" só pode existir enquanto
// isto for true.
export function canPlayerRegisterNow(state) {
  return state === TOURNAMENT_REGISTRATION_STATE.REGISTRATION_OPEN;
}

// Playthrough 4.9, Parte D — texto/tom do aviso de inscrição do card, numa
// função pura e testável (extraída de Tournaments.jsx pra não duplicar essa
// decisão em nenhuma outra tela — Parte C: "não recalcular... de maneiras
// diferentes em telas diferentes"). Nunca mais de um aviso por vez.
// `daysToDeadline` é `null` quando não há deadline conhecida.
export function buildRegistrationCardNotice(state, { daysToDeadline = null, isPast = false, drawHappened = false } = {}) {
  if (state === TOURNAMENT_REGISTRATION_STATE.REGISTERED) {
    return { tone: 'confirmed', code: 'CONFIRMED', label: 'Inscrição confirmada', message: null };
  }
  if (state === TOURNAMENT_REGISTRATION_STATE.REGISTRATION_OPEN) {
    if (daysToDeadline === 0) return { tone: 'warning', code: 'LAST_DAY', label: 'Último dia para se inscrever', message: null };
    if (daysToDeadline != null && daysToDeadline > 0 && daysToDeadline <= 2) {
      return { tone: 'warning', code: 'CLOSING_SOON', label: `Inscrições encerram em ${daysToDeadline} dia${daysToDeadline === 1 ? '' : 's'}`, message: null };
    }
    return null;
  }
  if (state === TOURNAMENT_REGISTRATION_STATE.REGISTRATION_CLOSED) {
    if (isPast || drawHappened) return { tone: 'neutral', code: 'NOT_PARTICIPANT', label: 'Não participante', message: 'Você não se inscreveu antes do fechamento.' };
    return { tone: 'neutral', code: 'REGISTRATION_CLOSED', label: 'Inscrições encerradas', message: null };
  }
  return null;
}
