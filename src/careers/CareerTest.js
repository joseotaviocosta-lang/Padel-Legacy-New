import { CareerManager } from './CareerManager.js';

function isTestCareer(summary) {
  return String(summary.save_name).startsWith('Direita Controle Teste') || String(summary.save_name).startsWith('Esquerda Agressivo Teste');
}

async function configureTutorialChoices(manager, created, courtSide, playStyle) {
  const career = created.career;
  career.metadata.court_side = courtSide;
  career.metadata.play_style = playStyle;
  career.metadata.side_selected = true;
  career.metadata.style_selected = true;
  career.player = { ...career.player, court_side: courtSide, play_style: playStyle };
  return manager.saveCareer(created.summary.id, career);
}

export function setupCareerTest() {
  if (typeof window === 'undefined') return;

  window.PadelCareerTest = {
    async run() {
      const manager = new CareerManager();
      await manager.initialize();

      const a = await manager.createCareer({
        saveName: 'Direita Controle Teste',
        playerName: 'José Teste',
        courtSide: 'direita',
        playStyle: 'controle',
        careerType: 'normal',
      });
      const b = await manager.createCareer({
        saveName: 'Esquerda Agressivo Teste',
        playerName: 'José Teste',
        courtSide: 'esquerda',
        playStyle: 'agressivo',
        careerType: 'experiment',
      });
      await configureTutorialChoices(manager, a, 'direita', 'controle');
      await configureTutorialChoices(manager, b, 'esquerda', 'agressivo');

      const list = await manager.listCareers({ includeArchived: true });
      const loadedA = await manager.loadCareer(a.summary.id);
      const renamed = await manager.renameCareer(a.summary.id, 'Direita Controle Teste Renomeada');
      const duplicate = await manager.duplicateCareer(b.summary.id, { careerType: 'experiment' });
      const archived = await manager.archiveCareer(b.summary.id);
      const restored = await manager.restoreArchivedCareer(b.summary.id);
      const saved = await manager.saveCareer(a.summary.id, { ...loadedA, career_name: 'Direita Controle Teste Salva' });
      const independent = duplicate.career.career_id !== b.summary.id && duplicate.career.career_id !== a.summary.id;
      await manager.deleteCareer(duplicate.summary.id, { confirmed: true });
      await manager.deleteCareer(a.summary.id, { confirmed: true });
      await manager.deleteCareer(b.summary.id, { confirmed: true });

      return {
        success: true,
        created: [a.summary.id, b.summary.id],
        listCount: list.length,
        loaded: loadedA.career_id === a.summary.id,
        renamed: renamed.save_name === 'Direita Controle Teste Renomeada',
        duplicatedDistinctId: independent,
        archived: archived.archived === true,
        restored: restored.archived === false,
        saved: saved.career_name === 'Direita Controle Teste Salva',
      };
    },

    async persist() {
      const manager = new CareerManager();
      await manager.initialize();
      const first = await manager.createCareer({
        saveName: 'Direita Controle Teste',
        playerName: 'José Teste',
        courtSide: 'direita',
        playStyle: 'controle',
        careerType: 'normal',
      });
      const second = await manager.createCareer({
        saveName: 'Esquerda Agressivo Teste',
        playerName: 'José Teste',
        courtSide: 'esquerda',
        playStyle: 'agressivo',
        careerType: 'experiment',
      });
      await configureTutorialChoices(manager, first, 'direita', 'controle');
      await configureTutorialChoices(manager, second, 'esquerda', 'agressivo');
      return { firstId: first.summary.id, secondId: second.summary.id };
    },

    async checkPersist() {
      const manager = new CareerManager();
      await manager.initialize();
      const list = await manager.listCareers({ includeArchived: true });
      const testEntries = list.filter((item) => item.save_name.startsWith('Direita Controle Teste') || item.save_name.startsWith('Esquerda Agressivo Teste'));
      const distinctIds = new Set(testEntries.map((item) => item.id)).size === 2;
      const rightCareer = testEntries.find((item) => item.court_side === 'direita');
      const leftCareer = testEntries.find((item) => item.court_side === 'esquerda');
      if (!rightCareer || !leftCareer) {
        return { success: false, careersFound: testEntries.length, independent: false, distinctIds, rightCareerValid: Boolean(rightCareer), leftCareerValid: Boolean(leftCareer) };
      }
      const rightData = await manager.loadCareer(rightCareer.id);
      const leftData = await manager.loadCareer(leftCareer.id);
      const independent = rightData.career_id !== leftData.career_id && rightData.metadata.player_name === 'José Teste' && leftData.metadata.player_name === 'José Teste';
      return {
        success: true,
        careersFound: testEntries.length,
        independent,
        distinctIds,
        rightCareerValid: rightCareer.court_side === 'direita' && rightData.metadata.court_side === 'direita',
        leftCareerValid: leftCareer.court_side === 'esquerda' && leftData.metadata.court_side === 'esquerda',
      };
    },

    async cleanup() {
      const manager = new CareerManager();
      await manager.initialize();
      const list = await manager.listCareers({ includeArchived: true });
      const testEntries = list.filter((item) => item.save_name.startsWith('Direita Controle Teste') || item.save_name.startsWith('Esquerda Agressivo Teste'));
      for (const entry of testEntries) {
        await manager.deleteCareer(entry.id, { confirmed: true });
      }
      return { removed: testEntries.length };
    },

    async inspect() {
      const manager = new CareerManager();
      await manager.initialize();
      const index = await manager.repository.readIndex();
      const careers = await manager.listCareers({ includeArchived: true });
      const files = await manager.repository.listCareerIds();
      const orphaned = careers.map((item) => item.id).filter((id) => !files.includes(id));
      return {
        index,
        summary: careers,
        files,
        last_career_id: index.last_career_id,
        count_by_type: careers.reduce((acc, item) => {
          acc[item.career_type] = (acc[item.career_type] || 0) + 1;
          return acc;
        }, {}),
        archived_count: careers.filter((item) => item.archived).length,
        orphaned_entries: orphaned,
      };
    },
  };
}
