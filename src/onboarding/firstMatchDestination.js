import { localGame } from '@/api/localGameClient.js';
import { getMatchCheckpointRepository } from '@/careers/MatchCheckpointRepository.js';
import { daysBetween, getPartnerBot } from '@/lib/career.js';
import { getCurrentTournamentMatch } from '@/gameplay/worldTour/TournamentRunManager.js';
import { getTournamentNextAction, buildTournamentPlayRoute, TOURNAMENT_NEXT_ACTION } from '@/lib/tournamentNextAction.js';
import { buildTournamentRecoverySession, shouldBlockCareerAdvanceForMatchRecovery } from '@/game-core/tournamentMatchLifecycle.js';

// Tutorial 4.0 (docs/TUTORIAL_4_0_OBJECTIVES_UNIFICATION.md, Parte 3): a
// etapa "first-match" tinha `route: '/matches'` fixo — sempre mandava para
// Partidas de treino, mesmo depois de o jogador se inscrever num torneio
// real que só começa dias depois. Este helper substitui esse valor estático
// por um destino que reflete o estado real da carreira, montado só a partir
// de funções já canônicas (getTournamentNextAction/buildTournamentPlayRoute/
// buildTournamentRecoverySession) — nenhum cálculo de estado de torneio é
// reimplementado aqui, só reunido.
//
// Autocontido de propósito: busca os poucos dados que precisa sozinho, para
// que qualquer consumidor (Home, Guia, Missões) chame com só
// `profile`+`careerId`, sem precisar já ter carregado torneio/checkpoint.
export async function resolveFirstMatchAction(profile, careerId) {
  const fallback = {
    to: '/tournaments',
    cta: 'Inscrever-se em um torneio',
    description: 'Escolha um torneio com inscrições abertas e confirme a vaga da dupla para disputar sua primeira partida oficial.',
  };
  if (!profile?.id) return fallback;

  const careerDate = profile.career_date;
  const [tournamentEvents, checkpoint] = await Promise.all([
    localGame.entities.CalendarEvent.filter({ profile_id: profile.id, status: 'scheduled', event_type: 'tournament' }).catch(() => []),
    careerId ? getMatchCheckpointRepository().read(careerId).catch(() => null) : Promise.resolve(null),
  ]);

  const activeTournamentEvent = (tournamentEvents || []).find((event) => event.metadata?.tournament_run) || null;
  if (!activeTournamentEvent) return fallback;

  const run = activeTournamentEvent.metadata?.tournament_run;
  const tournament = { id: activeTournamentEvent.related_id, name: run?.tournamentName || activeTournamentEvent.related_name };
  const match = getCurrentTournamentMatch(run);
  const destination = buildTournamentPlayRoute(tournament.id);
  const recoveryCta = { to: destination, cta: 'Continuar partida', description: 'Você tem uma partida de torneio interrompida. Continue de onde parou.' };

  if (checkpoint?.type === 'tournament') {
    const recoverySession = buildTournamentRecoverySession(checkpoint, {
      careerId,
      careerDate,
      tournament,
      run,
      match,
      teamA: [profile, getPartnerBot(profile)].filter(Boolean),
      teamB: match?.opponent || [],
    });
    if (shouldBlockCareerAdvanceForMatchRecovery(recoverySession)) return recoveryCta;
  }

  const action = getTournamentNextAction({ careerDate, tournament, run });

  if (action.type === TOURNAMENT_NEXT_ACTION.CONTINUE_MATCH) return recoveryCta;

  if (action.type === TOURNAMENT_NEXT_ACTION.ADVANCE_TO_ROUND) {
    const days = action.date ? daysBetween(careerDate, action.date) : null;
    return {
      to: destination,
      cta: 'Ver torneio',
      description: days != null && days > 0
        ? `Você está inscrito. Sua estreia em ${tournament.name || 'o torneio'} será em ${days} dia${days === 1 ? '' : 's'}. Até lá, treine, recupere energia e avance o calendário.`
        : `Você está inscrito em ${tournament.name || 'o torneio'}. Acompanhe a data da estreia no calendário.`,
    };
  }

  if ([TOURNAMENT_NEXT_ACTION.PLAY_MATCH, TOURNAMENT_NEXT_ACTION.PREPARE_ROUND].includes(action.type)) {
    return { to: destination, cta: 'Jogar primeira partida', description: 'Hoje é o dia da sua primeira partida oficial de torneio.' };
  }

  if (action.type === TOURNAMENT_NEXT_ACTION.TOURNAMENT_COMPLETE) {
    return { to: destination, cta: 'Ver torneio', description: `Acompanhe o resultado em ${tournament.name || 'o torneio'}.` };
  }

  return { to: destination, cta: 'Ver torneio', description: 'Acompanhe seu torneio inscrito.' };
}
