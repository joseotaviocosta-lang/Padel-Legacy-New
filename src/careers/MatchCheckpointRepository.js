import { GameStorage } from '../storage/GameStorage.js';

// M3 (docs/MOBILE_M3_LIVE_MATCH_LIFECYCLE.md) — uma partida ao vivo hoje só
// existe no state React de LiveMatch: se o Android suspender a WebView, matar
// o processo por pressão de memória, ou o jogador simplesmente trocar de app,
// a partida inteira desaparece sem deixar rastro.
//
// Decisão de arquitetura (Parte 4 do enunciado): o checkpoint fica num
// arquivo PRÓPRIO por carreira (`active-matches/<careerId>.json`), não dentro
// do save principal da carreira. Motivos:
//   - atomicidade/clareza: reaproveita o mesmo padrão seguro de escrita do
//     GameStorage (tmp file + rename + verificação de conteúdo) sem competir
//     pelo lock de escrita do save principal;
//   - custo: checkpoints são gravados com frequência bem maior que o save da
//     carreira (Parte 5 pede a cada game/set) — reescrever o save inteiro
//     (que pode ser grande) a cada game seria I/O desnecessário;
//   - isolamento: detectar/limpar um checkpoint nunca precisa ler nem
//     revalidar o save inteiro da carreira, e um checkpoint corrompido nunca
//     pode arriscar o save principal (Parte 12).
//
// NÃO usa localStorage (proibido pelo enunciado) — usa a mesma infraestrutura
// de arquivo (GameStorage → TauriStorage → $APPDATA) já validada em Android
// físico pelas fases M1/M2 para os saves de carreira.
const ACTIVE_MATCHES_DIRECTORY = 'active-matches';
export const CHECKPOINT_SCHEMA_VERSION = 1;

// Só usado como identidade própria do checkpoint (Parte 11) — a idempotência
// REAL de recompensas já existe e não depende disto: treino já deriva sua
// chave de `profile.id + career_date + matchState.seed`
// (game-core/matchFinalization.js#makeMatchFinalizationKey) e torneio já
// deriva da sua própria `match.id` estável do bracket
// (gameplay/worldTour/TournamentRunManager.js). Ambas continuam válidas após
// um recovery porque o checkpoint restaura o engine_state original (mesmo
// seed/mesmo id), sem recriar a partida do zero.
export function createCheckpointMatchId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `match-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

function checkpointPath(careerId) {
  return `${ACTIVE_MATCHES_DIRECTORY}/${careerId}.json`;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Valida a forma mínima de um checkpoint antes de confiar nele. Qualquer
 * falha aqui é tratada como corrupção (Parte 12) — nunca lançada para a UI,
 * sempre resolvida como "sem checkpoint válido".
 */
export function isValidCheckpointShape(data, careerId) {
  if (!isPlainObject(data)) return false;
  if (data.checkpoint_schema_version !== CHECKPOINT_SCHEMA_VERSION) return false;
  if (data.career_id !== careerId) return false;
  if (!['practice', 'tournament'].includes(data.type)) return false;
  if (typeof data.match_id !== 'string' || !data.match_id) return false;
  const engineState = data.engine_state;
  if (!isPlainObject(engineState)) return false;
  if (typeof engineState.pointNumber !== 'number') return false;
  if (!Array.isArray(engineState.narration)) return false;
  if (!isPlainObject(engineState.teams) || !Array.isArray(engineState.teams.A) || !Array.isArray(engineState.teams.B)) return false;
  if (engineState.finished === true) return false; // partida concluída não é "em andamento"
  return true;
}

export class MatchCheckpointRepository {
  constructor(storage = new GameStorage()) {
    this.storage = storage;
  }

  async initialize() {
    await this.storage.initialize();
    await this.storage.ensureDirectory(ACTIVE_MATCHES_DIRECTORY);
  }

  /**
   * Lê o checkpoint ativo de uma carreira, se existir e for válido. Nunca
   * lança para chamadores de UI — checkpoint corrompido/incompatível é
   * tratado como ausência (e removido do disco, best-effort) em vez de
   * quebrar a tela ou o save principal.
   */
  async read(careerId) {
    if (!careerId) return null;
    await this.initialize();
    let data;
    try {
      data = await this.storage.readJsonIfExists(checkpointPath(careerId), null);
    } catch (error) {
      console.warn('[MatchCheckpoint] falha ao ler checkpoint, tratando como corrompido.', { careerId, error });
      await this.clear(careerId).catch(() => {});
      return null;
    }
    if (!data) return null;
    if (!isValidCheckpointShape(data, careerId)) {
      console.warn('[MatchCheckpoint] checkpoint com formato inválido/incompatível, descartando.', { careerId, version: data?.checkpoint_schema_version });
      await this.clear(careerId).catch(() => {});
      return null;
    }
    return data;
  }

  /**
   * Grava/atualiza o checkpoint ativo de uma carreira. `save` (não `create`)
   * porque o mesmo arquivo é sobrescrito a cada checkpoint da mesma partida
   * — não existe histórico de checkpoints, só o mais recente.
   */
  async save(careerId, checkpoint) {
    if (!careerId) throw new Error('careerId é obrigatório para salvar um checkpoint de partida.');
    await this.initialize();
    const payload = {
      ...checkpoint,
      checkpoint_schema_version: CHECKPOINT_SCHEMA_VERSION,
      career_id: careerId,
      updated_at: new Date().toISOString(),
    };
    // Checkpoint não precisa (e não deve) do backup automático do save
    // principal — é descartável por natureza assim que a partida termina.
    return this.storage.writeJson(checkpointPath(careerId), payload, { backup: false, validate: false });
  }

  async clear(careerId) {
    if (!careerId) return false;
    await this.initialize();
    return this.storage.remove(checkpointPath(careerId));
  }

  async exists(careerId) {
    if (!careerId) return false;
    await this.initialize();
    return this.storage.exists(checkpointPath(careerId));
  }
}

let sharedRepository = null;
export function getMatchCheckpointRepository() {
  if (!sharedRepository) sharedRepository = new MatchCheckpointRepository();
  return sharedRepository;
}
