import { CareerManager } from './CareerManager.js';

export function setupCareerFlowTest() {
  if (typeof window === 'undefined') return;

  window.PadelCareerFlowTest = {
    async run() {
      const manager = new CareerManager();
      await manager.initialize();

      const careerA = await manager.createCareer({
        saveName: 'Fluxo de Carreira Teste A',
        playerName: 'Teste A',
        courtSide: 'direita',
        playStyle: 'controle',
        careerType: 'normal',
      });

      const careerB = await manager.createCareer({
        saveName: 'Fluxo de Carreira Teste B',
        playerName: 'Teste B',
        courtSide: 'esquerda',
        playStyle: 'agressivo',
        careerType: 'experiment',
      });

      const list = await manager.listCareers({ includeArchived: true });
      const loadedA = await manager.loadCareer(careerA.summary.id);
      const renamed = await manager.renameCareer(careerA.summary.id, 'Fluxo de Carreira Teste A Renomeado');
      const duplicated = await manager.duplicateCareer(careerB.summary.id, { careerType: 'experiment' });
      const archived = await manager.archiveCareer(careerB.summary.id);
      const restored = await manager.restoreArchivedCareer(careerB.summary.id);
      const saved = await manager.saveCareer(careerA.summary.id, { ...loadedA, career_name: 'Fluxo de Carreira Teste A Salva' });
      const duplicateDeleted = await manager.deleteCareer(duplicated.summary.id, { confirmed: true });
      const aDeleted = await manager.deleteCareer(careerA.summary.id, { confirmed: true });
      const bDeleted = await manager.deleteCareer(careerB.summary.id, { confirmed: true });

      return {
        success: true,
        listCount: list.length,
        loadedCareer: loadedA.career_id === careerA.summary.id,
        renamedCareer: renamed.save_name === 'Fluxo de Carreira Teste A Renomeado',
        duplicatedDistinctId: duplicated.summary.id !== careerB.summary.id,
        archivedCareer: archived.archived === true,
        restoredCareer: restored.archived === false,
        savedCareer: saved.career_name === 'Fluxo de Carreira Teste A Salva',
        cleanup: [duplicateDeleted, aDeleted, bDeleted],
      };
    },
  };
}
