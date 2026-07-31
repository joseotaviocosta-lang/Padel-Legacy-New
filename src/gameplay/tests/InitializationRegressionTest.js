import { CareerManager } from '@/careers/CareerManager.js';
import { GameStorage } from '@/storage/GameStorage.js';
import { gameRepository } from '../services/runtime.js';
import { CareerEntityRepository } from '../repositories/CareerEntityRepository.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

/**
 * Teste real de regressão da inicialização v0.3.1.
 *
 * Cria uma carreira temporária no armazenamento Tauri, inicializa perfil e
 * coleções usadas pela tela inicial, força uma releitura do arquivo e remove
 * todos os dados temporários ao final. A carreira que estava ativa antes do
 * teste é restaurada.
 */
export async function runInitializationRegressionTest() {
  const manager = new CareerManager();
  const entities = new CareerEntityRepository(gameRepository);
  const storage = new GameStorage();
  let previousCareerId = null;
  let temporaryCareerId = null;

  const result = {
    success: false,
    careerCreated: false,
    playerCreated: false,
    optionalReadOk: false,
    initialCollectionsOk: false,
    writeQueueOk: false,
    freshReloadOk: false,
    cleanupOk: false,
    previousCareerRestored: false,
  };

  try {
    await manager.initialize();
    previousCareerId = await manager.getLastCareer();

    const missingMarker = { empty: true };
    const missing = await storage.readJsonIfExists(
      `temp/v031-missing-${Date.now()}.json`,
      missingMarker,
    );
    result.optionalReadOk = missing === missingMarker;

    const created = await manager.createCareer({
      saveName: `Teste inicialização ${Date.now()}`,
      playerName: 'Jogador Teste v0.3.1',
      courtSide: 'direita',
      playStyle: 'equilibrado',
      careerType: 'experiment',
    });

    temporaryCareerId = created.career.career_id;
    gameRepository.setActiveCareer(created.career);
    result.careerCreated = Boolean(temporaryCareerId);

    const player = await gameRepository.createPlayerProfile({
      name: 'Jogador Teste v0.3.1',
      sport_name: 'Teste v031',
      position: 'direita',
      play_style: 'Equilibrado',
      xp: 0,
      coins: 100,
    });
    result.playerCreated = Boolean(player?.id);

    const [athletes, teams, matches] = await Promise.all([
      entities.list('AthleteProfile', '-world_ranking_points', 5),
      entities.list('TeamRanking', '-ranking_points', 5),
      entities.list('Match', '-created_date', 5),
    ]);
    result.initialCollectionsOk = [athletes, teams, matches].every(Array.isArray);

    // Duas gravações concorrentes devem entrar na fila e preservar ambas.
    await Promise.all([
      gameRepository.updatePlayerProfile(player.id, { position: 'esquerda' }),
      gameRepository.mutateActiveCareer((career) => {
        career.world = { ...(career.world || {}), initialization_test: true };
        return true;
      }),
    ]);

    const reloaded = await gameRepository.getActiveCareer({ fresh: true });
    result.writeQueueOk = (
      reloaded?.player?.position === 'esquerda'
      && reloaded?.world?.initialization_test === true
    );
    result.freshReloadOk = reloaded?.career_id === temporaryCareerId;

    assert(result.optionalReadOk, 'Leitura opcional ainda lança erro para arquivo ausente.');
    assert(result.careerCreated, 'A carreira temporária não foi criada.');
    assert(result.playerCreated, 'O perfil inicial não foi criado.');
    assert(result.initialCollectionsOk, 'As coleções iniciais não retornaram arrays válidos.');
    assert(result.writeQueueOk, 'A fila de escrita perdeu uma atualização concorrente.');
    assert(result.freshReloadOk, 'A carreira não pôde ser relida do armazenamento.');

    result.success = true;
    return result;
  } finally {
    if (temporaryCareerId) {
      try {
        gameRepository.clearActiveCareer();
        await manager.deleteCareer(temporaryCareerId, { confirmed: true });
        result.cleanupOk = true;
      } catch (cleanupError) {
        console.error('[v0.3.1-test] Falha ao remover carreira temporária.', cleanupError);
      }
    }

    try {
      if (previousCareerId) {
        await manager.setLastCareer(previousCareerId);
        const previous = await manager.loadCareer(previousCareerId);
        gameRepository.setActiveCareer(previous);
        result.previousCareerRestored = true;
      } else {
        await manager.clearLastCareer();
        gameRepository.clearActiveCareer();
        result.previousCareerRestored = true;
      }
    } catch (restoreError) {
      console.error('[v0.3.1-test] Falha ao restaurar carreira anterior.', restoreError);
    }
  }
}

export function setupInitializationRegressionTest() {
  if (typeof window !== 'undefined') {
    window.PadelInitializationTest = {
      run: runInitializationRegressionTest,
    };
  }
}
