import { getCurrentTournamentMatch, getTournamentRunPhase } from '@/gameplay/worldTour/TournamentRunManager.js';

/**
 * Hotfix UX — guided flow de torneio (docs/TOURNAMENT_GUIDED_FLOW_HOTFIX.md).
 *
 * Fonte canônica de "qual é a próxima ação do jogador num torneio". Pura:
 * recebe dados já carregados por quem chama (Home, Calendário,
 * TournamentModal, sino) — nunca busca nada sozinha, nunca cria polling.
 * Reaproveita `getTournamentRunPhase` (já existente, já usado pelo próprio
 * TournamentModal) em vez de reimplementar o cálculo de fase da rodada.
 */
export const TOURNAMENT_NEXT_ACTION = Object.freeze({
  CONTINUE_MATCH: 'continue_match',
  INTERVIEW: 'interview',
  PLAY_MATCH: 'play_match',
  PREPARE_ROUND: 'prepare_round',
  ADVANCE_TO_ROUND: 'advance_to_round',
  WAIT: 'wait',
  TOURNAMENT_COMPLETE: 'tournament_complete',
  NONE: 'none',
});

/** Deep link canônico para abrir um torneio específico já em andamento. */
export function buildTournamentPlayRoute(tournamentId) {
  const query = new URLSearchParams({ tournament: String(tournamentId), mode: 'run' });
  return `/tournaments?${query.toString()}`;
}

/** Deep link canônico para uma entrevista específica, com retorno contextual. */
export function buildInterviewRoute({ interviewId, sourceId, returnTo }) {
  const query = new URLSearchParams({ tab: 'interviews' });
  if (interviewId) query.set('interview', interviewId);
  if (sourceId) query.set('source', sourceId);
  if (returnTo) query.set('returnTo', returnTo);
  return `/press?${query.toString()}`;
}

/**
 * @param {object} [input]
 * @param {string} [input.careerDate]
 * @param {{type: string, tournament_id?: string, tournament_name?: string}|null} [input.activeMatchCheckpoint] Checkpoint de partida interrompida (useActiveMatchCheckpoint).
 * @param {{tournamentId: string, tournamentName?: string, round?: string, destination: string}|null} [input.pendingInterview] Entrevista pós-jogo pendente e acionável (opcional, nunca obrigatória).
 * @param {{id: string, name?: string}|null} [input.tournament]
 * @param {object|null} [input.run] Tournament run (mesmo shape usado por getCurrentTournamentMatch/getTournamentRunPhase).
 */
export function getTournamentNextAction({
  careerDate,
  activeMatchCheckpoint = null,
  pendingInterview = null,
  tournament = null,
  run = null,
} = {}) {
  // 1. Partida ativa interrompida — prioridade absoluta, acima de qualquer
  // outra coisa (inclusive entrevista pendente).
  if (activeMatchCheckpoint?.type === 'tournament' && activeMatchCheckpoint.tournament_id) {
    return {
      type: TOURNAMENT_NEXT_ACTION.CONTINUE_MATCH,
      tournamentId: activeMatchCheckpoint.tournament_id,
      tournamentName: activeMatchCheckpoint.tournament_name || tournament?.name || null,
      round: null,
      label: 'Continuar partida',
      destination: buildTournamentPlayRoute(activeMatchCheckpoint.tournament_id),
    };
  }

  // 2. Entrevista pós-jogo pendente e acionável. É sempre opcional — nunca
  // bloqueia calendário/torneio (item 16 do hotfix); só é oferecida quando
  // realmente existe uma pendente.
  if (pendingInterview?.destination) {
    return {
      type: TOURNAMENT_NEXT_ACTION.INTERVIEW,
      tournamentId: pendingInterview.tournamentId || tournament?.id || null,
      tournamentName: pendingInterview.tournamentName || tournament?.name || null,
      round: pendingInterview.round || null,
      label: 'Dar entrevista',
      destination: pendingInterview.destination,
    };
  }

  if (!tournament?.id || !run) {
    return { type: TOURNAMENT_NEXT_ACTION.NONE, tournamentId: null, tournamentName: null, round: null, date: null, label: null, destination: null };
  }

  const phase = getTournamentRunPhase(run, careerDate);
  const currentMatch = getCurrentTournamentMatch(run);
  const destination = buildTournamentPlayRoute(tournament.id);
  const base = { tournamentId: tournament.id, tournamentName: tournament.name || null, round: currentMatch?.round || null, date: currentMatch?.date || null, destination };

  // 5. Torneio encerrado.
  if (['champion', 'eliminated', 'finished'].includes(phase)) {
    return { ...base, type: TOURNAMENT_NEXT_ACTION.TOURNAMENT_COMPLETE, label: 'Ver resultado' };
  }
  if (phase === 'playing') {
    return { ...base, type: TOURNAMENT_NEXT_ACTION.CONTINUE_MATCH, label: 'Continuar partida' };
  }
  // 3. Partida de torneio disponível hoje (ou pendência atrasada — mesma
  // ação: abrir o torneio para resolver, sem inventar um estado novo).
  if (phase === 'playable' || phase === 'missed') {
    return { ...base, type: TOURNAMENT_NEXT_ACTION.PLAY_MATCH, label: base.round ? `Jogar ${base.round}` : 'Jogar partida' };
  }
  if (phase === 'round_preparation') {
    return { ...base, type: TOURNAMENT_NEXT_ACTION.PREPARE_ROUND, label: 'Preparar rodada' };
  }
  // 4. Próxima rodada futura.
  if (phase === 'waiting') {
    return { ...base, type: TOURNAMENT_NEXT_ACTION.ADVANCE_TO_ROUND, label: base.date ? `Avançar até ${base.date}` : 'Aguardar próxima rodada' };
  }
  if (phase === 'pre_tournament') {
    return { ...base, type: TOURNAMENT_NEXT_ACTION.PREPARE_ROUND, label: 'Reunião pré-torneio' };
  }
  return { ...base, type: TOURNAMENT_NEXT_ACTION.WAIT, label: null };
}

/**
 * Mensagem acionável para o bloqueio de avanço de dia (item 10/11/28 do
 * hotfix) — construída a partir do MESMO `blockingEvent` que
 * `canAdvanceDay` já retorna, sem uma quarta lógica separada.
 */
export function describeCalendarBlock(blockingEvent) {
  if (!blockingEvent) return null;
  const isTournament = blockingEvent.event_type === 'tournament' && blockingEvent.related_id;
  if (!isTournament) {
    return {
      title: 'Decisão pendente',
      description: blockingEvent.title
        ? `Resolva "${blockingEvent.title}" antes de avançar o dia.`
        : 'Existe uma decisão pendente antes de avançar o dia.',
      actionLabel: null,
      destination: null,
    };
  }
  const run = blockingEvent.metadata?.tournament_run || null;
  const currentMatch = run ? getCurrentTournamentMatch(run) : null;
  const tournamentName = blockingEvent.title || 'o torneio';
  const roundLabel = currentMatch?.round || null;
  return {
    title: 'Partida de torneio pendente',
    description: roundLabel
      ? `Você precisa disputar ${roundLabel} de ${tournamentName} antes de avançar o dia.`
      : `Você tem um compromisso pendente em ${tournamentName} antes de avançar o dia.`,
    actionLabel: 'Ir para o torneio',
    destination: buildTournamentPlayRoute(blockingEvent.related_id),
  };
}
