import { createMatch, playPoint } from '@/lib/matchEngine';
import { getCurrentTournamentMatch } from '@/gameplay/worldTour/TournamentRunManager.js';
import { buildTournamentMatchCheckpoint, buildTournamentRecoverySession } from './tournamentMatchLifecycle.js';

// Probe profundo mantido no chunk lazy do modal. Assim a proteção executa um
// próximo ponto em clone sem levar o Match Engine para o shell/calendário.
export function probeTournamentRecoverySession(session) {
  if (session?.status !== 'resumable') return session;
  try {
    playPoint(JSON.parse(JSON.stringify(session.engineState)));
    return session;
  } catch {
    const issues = [...new Set([...(session.issues || []), 'engine_transition'])];
    return {
      ...session,
      status: 'restart_required',
      engineState: null,
      issues,
      diagnostic: { ...(session.diagnostic || {}), code: 'tournament_match_checkpoint_invalid', issues },
    };
  }
}

/**
 * Reinicia somente a rodada atual. O matchId do bracket é deliberadamente
 * reutilizado: ele é a chave idempotente de resultado/recompensa; apenas o
 * checkpoint transitório e o engine_state ganham uma nova sessão.
 */
export function buildFreshTournamentRoundRecovery({ careerId, tournament, run, teamA, teamB, initialTacticId, coach, liveCoachSettings, now = new Date() }) {
  const nextRun = JSON.parse(JSON.stringify(run));
  const match = getCurrentTournamentMatch(nextRun);
  if (!careerId || !tournament?.id || !match?.id) throw new Error('Rodada de torneio indisponível para reinício.');
  nextRun.status = 'playing';
  nextRun.updatedAt = now.toISOString();
  match.status = 'playing';
  match.startedAt = now.toISOString();
  const engineState = createMatch(teamA, teamB, {
    seed: `${match.id}:restart:${now.toISOString()}`,
    initialTacticId,
    coach,
    liveCoachSettings,
  });
  const checkpoint = {
    ...buildTournamentMatchCheckpoint({ tournament, match, teamA, teamB, engineState }),
    career_id: careerId,
  };
  const session = probeTournamentRecoverySession(buildTournamentRecoverySession(checkpoint, {
    careerId,
    careerDate: match.date,
    tournament,
    run: nextRun,
    match,
    teamA,
    teamB,
  }));
  if (session.status !== 'resumable') throw new Error('A nova sessão da rodada não pôde ser validada.');
  return { run: nextRun, match, checkpoint, session };
}
