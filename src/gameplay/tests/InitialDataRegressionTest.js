import { CareerManager } from '@/careers/CareerManager.js';
import { gameRepository } from '../services/runtime.js';
import { CareerEntityRepository } from '../repositories/CareerEntityRepository.js';
import { CORE_ENTITY_NAMES } from '../services/CareerInitialDataService.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

export async function runInitialDataRegressionTest() {
  const manager = new CareerManager();
  const entities = new CareerEntityRepository(gameRepository);
  let previousCareerId = null;
  let temporaryCareerId = null;

  const result = {
    success: false,
    careerCreated: false,
    playerCreated: false,
    initialDataPersisted: false,
    rankingReady: false,
    worldRankCollectionsReady: false,
    idempotent: false,
    freshReloadOk: false,
    cleanupOk: false,
    previousCareerRestored: false,
  };

  try {
    await manager.initialize();
    previousCareerId = await manager.getLastCareer();

    const created = await manager.createCareer({
      saveName: `Teste dados iniciais ${Date.now()}`,
      playerName: 'Jogador Dados Iniciais',
      courtSide: 'direita',
      playStyle: 'equilibrado',
      careerType: 'experiment',
    });
    temporaryCareerId = created.career.career_id;
    gameRepository.setActiveCareer(created.career);
    result.careerCreated = true;

    const player = await gameRepository.createPlayerProfile({
      sport_name: 'Teste Dados Iniciais',
      position: 'direita',
      play_style: 'Equilibrado',
      xp: 0,
      coins: 100,
    });
    result.playerCreated = Boolean(player?.id);

    const first = await gameRepository.getActiveCareer({ fresh: true });
    result.initialDataPersisted = CORE_ENTITY_NAMES.every((name) => Array.isArray(first?.entities?.[name]));
    result.rankingReady = first?.ranking?.status === 'ready';

    const [athletes, teams] = await Promise.all([
      entities.list('AthleteProfile', '-world_ranking_points', 500),
      entities.list('TeamRanking', '-ranking_points', 300),
    ]);
    result.worldRankCollectionsReady = Array.isArray(athletes) && Array.isArray(teams);

    const countsBefore = Object.fromEntries(
      CORE_ENTITY_NAMES.map((name) => [name, first.entities[name].length]),
    );
    const secondInitialization = await gameRepository.ensureInitialData();
    const second = await gameRepository.getActiveCareer({ fresh: true });
    const countsAfter = Object.fromEntries(
      CORE_ENTITY_NAMES.map((name) => [name, second.entities[name].length]),
    );

    result.idempotent = (
      secondInitialization.alreadyInitialized === true
      && JSON.stringify(countsBefore) === JSON.stringify(countsAfter)
    );
    result.freshReloadOk = second?.career_id === temporaryCareerId;

    assert(result.playerCreated, 'O jogador inicial não foi criado.');
    assert(result.initialDataPersisted, 'Nem todas as coleções básicas foram persistidas.');
    assert(result.rankingReady, 'O estado inicial do ranking não foi marcado como pronto.');
    assert(result.worldRankCollectionsReady, 'As coleções usadas pelo ranking não estão disponíveis.');
    assert(result.idempotent, 'A inicialização repetida duplicou ou substituiu dados.');
    assert(result.freshReloadOk, 'O save inicializado não pôde ser relido do disco.');

    result.success = true;
    return result;
  } finally {
    if (temporaryCareerId) {
      try {
        gameRepository.clearActiveCareer();
        await manager.deleteCareer(temporaryCareerId, { confirmed: true });
        result.cleanupOk = true;
      } catch (error) {
        console.error('[v0.3.1-initial-data-test] Falha ao limpar carreira temporária.', error);
      }
    }

    try {
      if (previousCareerId) {
        await manager.setLastCareer(previousCareerId);
        const previous = await manager.loadCareer(previousCareerId);
        gameRepository.setActiveCareer(previous);
      } else {
        await manager.clearLastCareer();
        gameRepository.clearActiveCareer();
      }
      result.previousCareerRestored = true;
    } catch (error) {
      console.error('[v0.3.1-initial-data-test] Falha ao restaurar carreira anterior.', error);
    }
  }
}

export function setupInitialDataRegressionTest() {
  if (typeof window !== 'undefined') {
    window.PadelInitialDataTest = { run: runInitialDataRegressionTest };
  }
}
