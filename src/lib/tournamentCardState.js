// Playthrough 5.20-C, item 1 — UM ESTADO PRINCIPAL POR CARD DE TORNEIO.
//
// O card mostrava ate cinco selos ao mesmo tempo (tier, "escolha estrategica",
// estado terminal, aviso de inscricao, caminho de entrada da analise do
// treinador). Medido em 360px: ~340px de altura e nenhuma hierarquia — o
// jogador tinha de ler tudo para descobrir o que podia fazer.
//
// Este modulo NAO recalcula estado: ele CLASSIFICA o que as autoridades ja
// decidiram (`getPlayerTournamentRegistrationState` e `getTournamentDrawState`)
// num unico estado visivel. Qualquer divergencia entre o selo e o jogo seria
// bug das autoridades, nunca uma segunda verdade nascida aqui.
import { TOURNAMENT_REGISTRATION_STATE } from '@/lib/tournamentRegistrationState.js';

export const TOURNAMENT_CARD_STATE = Object.freeze({
  OPEN: 'OPEN',
  REGISTERED: 'REGISTERED',
  AWAITING_DRAW: 'AWAITING_DRAW',
  DRAWN: 'DRAWN',
  PLAY_TODAY: 'PLAY_TODAY',
  ELIMINATED: 'ELIMINATED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  CLOSED: 'CLOSED',
  UNAVAILABLE: 'UNAVAILABLE',
});

// Rotulo, tom e se o estado pede acao do jogador. `actionable` existe para o
// card decidir o CTA sem reinterpretar o estado.
const PRESENTATION = Object.freeze({
  OPEN: { label: 'Inscrições abertas', tone: 'premium', actionable: true },
  REGISTERED: { label: 'Inscrito', tone: 'success', actionable: false },
  AWAITING_DRAW: { label: 'Aguardando sorteio', tone: 'info', actionable: false },
  DRAWN: { label: 'Chave definida', tone: 'info', actionable: true },
  PLAY_TODAY: { label: 'Jogar hoje', tone: 'premium', actionable: true },
  ELIMINATED: { label: 'Eliminado', tone: 'neutral', actionable: false },
  COMPLETED: { label: 'Concluído', tone: 'success', actionable: false },
  CANCELLED: { label: 'Cancelado', tone: 'danger', actionable: false },
  CLOSED: { label: 'Encerrado', tone: 'neutral', actionable: false },
  UNAVAILABLE: { label: 'Fora de alcance', tone: 'neutral', actionable: false },
});

const S = TOURNAMENT_REGISTRATION_STATE;

/**
 * Classifica o estado ja decidido pelas autoridades num unico estado de card.
 *
 * A ordem importa e e deliberada: o que e TERMINAL vence o que e situacional.
 * Um torneio cancelado nao e "inscricoes abertas" so porque a data ainda nao
 * passou, e um jogador eliminado nao volta a ser "inscrito" — esse foi o
 * defeito da 4.5C, em que "Encerrado" generico cobria cancelado e concluido.
 *
 * @param {object} input
 * @param {string} input.registrationState  de getPlayerTournamentRegistrationState
 * @param {boolean} input.cancelled         de isTournamentCancelled
 * @param {boolean} input.playableToday     partida do jogador marcada para hoje
 * @param {boolean} input.pendingResolution data passou, resolucao ainda nao rodou
 * @param {boolean} input.isPast            data de inicio ja passou
 */
export function resolveTournamentCardState({
  registrationState,
  cancelled = false,
  playableToday = false,
  pendingResolution = false,
  isPast = false,
} = {}) {
  if (cancelled || registrationState === S.CANCELLED) return TOURNAMENT_CARD_STATE.CANCELLED;
  if (registrationState === S.ELIMINATED) return TOURNAMENT_CARD_STATE.ELIMINATED;
  if (registrationState === S.COMPLETED) return TOURNAMENT_CARD_STATE.COMPLETED;
  // WITHDRAWN: o jogador saiu; para ele o evento esta encerrado.
  if (registrationState === S.WITHDRAWN) return TOURNAMENT_CARD_STATE.CLOSED;

  // Jogar hoje so vence sorteio/andamento — nunca um terminal acima.
  if (playableToday) return TOURNAMENT_CARD_STATE.PLAY_TODAY;
  if (registrationState === S.IN_PROGRESS || registrationState === S.DRAWN) {
    return TOURNAMENT_CARD_STATE.DRAWN;
  }
  if (registrationState === S.REGISTERED) {
    // Inscrito e com a janela fechada significa que so falta o sorteio.
    return isPast || pendingResolution
      ? TOURNAMENT_CARD_STATE.AWAITING_DRAW
      : TOURNAMENT_CARD_STATE.REGISTERED;
  }
  if (registrationState === S.REGISTRATION_OPEN) return TOURNAMENT_CARD_STATE.OPEN;
  if (registrationState === S.REGISTRATION_CLOSED) {
    return isPast ? TOURNAMENT_CARD_STATE.CLOSED : TOURNAMENT_CARD_STATE.UNAVAILABLE;
  }
  if (isPast || pendingResolution) return TOURNAMENT_CARD_STATE.CLOSED;
  return TOURNAMENT_CARD_STATE.UNAVAILABLE;
}

export function getTournamentCardPresentation(state) {
  return PRESENTATION[state] || PRESENTATION.UNAVAILABLE;
}

// Todo estado declarado tem apresentacao: sem isso um estado novo nasceria
// mudo no card, que foi exatamente como "Encerrado" acabou cobrindo casos
// distintos antes.
export const ALL_TOURNAMENT_CARD_STATES = Object.freeze(Object.values(TOURNAMENT_CARD_STATE));
