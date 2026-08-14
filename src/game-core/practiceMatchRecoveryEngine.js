import { playPoint } from '@/lib/matchEngine';
import { inspectResumableTournamentEngineState } from './tournamentMatchRecoveryEngine.js';

// M3.2 (docs/MOBILE_M3_2_ANDROID_UX_STABILITY.md, Problema A): a partida
// treino nunca validava o engine_state restaurado antes de montar o
// LiveMatch — diferente do torneio, que já tinha probe (playPoint num clone)
// + LiveMatchRecoveryBoundary para nunca deixar um checkpoint incompatível
// derrubar a rota inteira (ver o comentário em LiveMatchRecoveryBoundary.jsx:
// "impede que o erro derrube a rota inteira e devolva o jogador
// silenciosamente à Home"). Isso é exatamente o sintoma relatado: "Continuar
// partida" abre e fecha sozinho sem avançar. `inspectResumableTournamentEngineState`
// já é genérica (só olha o formato do engine_state, nada específico de
// torneio) — reaproveitada aqui em vez de duplicar a checagem de campos.

/**
 * Valida e "sonda" um checkpoint de partida treino antes de confiar nele
 * para montar o LiveMatch. Nunca lança — status `restart_required` sinaliza
 * ao caller que o checkpoint deve ser descartado e uma partida nova oferecida.
 */
export function probePracticeRecoverySession(checkpoint) {
  if (!checkpoint?.engine_state) {
    return { status: 'orphaned', engineState: null, issues: ['missing'] };
  }
  const inspection = inspectResumableTournamentEngineState(checkpoint.engine_state, {});
  if (!inspection.valid) {
    return { status: 'restart_required', engineState: null, issues: inspection.issues };
  }
  try {
    playPoint(JSON.parse(JSON.stringify(checkpoint.engine_state)));
    return { status: 'resumable', engineState: checkpoint.engine_state, issues: [] };
  } catch {
    return { status: 'restart_required', engineState: null, issues: [...inspection.issues, 'engine_transition'] };
  }
}
