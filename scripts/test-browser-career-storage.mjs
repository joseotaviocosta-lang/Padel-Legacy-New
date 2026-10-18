import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { createServer } from 'vite';

const vite = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
});

try {
  const { GameStorage } = await vite.ssrLoadModule('/src/storage/GameStorage.js');
  const { BrowserStorage } = await vite.ssrLoadModule('/src/storage/BrowserStorage.js');
  const { TauriStorage } = await vite.ssrLoadModule('/src/storage/TauriStorage.js');
  const { CareerRepository } = await vite.ssrLoadModule('/src/careers/CareerRepository.js');
  const { CareerManager } = await vite.ssrLoadModule('/src/careers/CareerManager.js');

  const browserStorage = new GameStorage();
  assert.ok(browserStorage.storage instanceof BrowserStorage, 'Chrome deve selecionar BrowserStorage');
  await browserStorage.initialize();

  const firstManager = new CareerManager(new CareerRepository(browserStorage));
  const { career, summary } = await firstManager.createCareer({ playerName: 'Browser Regression' });
  const careerId = career.career_id;
  assert.ok(careerId, 'a criação deve gerar um id');

  let listed = await firstManager.listCareers();
  assert.ok(listed.some((entry) => entry.id === careerId), 'a carreira criada deve aparecer no índice/lista');
  assert.equal(summary.id, careerId);

  const changedCareer = structuredClone(career);
  changedCareer.metadata.player_name = 'Browser Persisted';
  await firstManager.saveCareer(careerId, changedCareer);

  const freshManager = new CareerManager(new CareerRepository(new GameStorage()));
  listed = await freshManager.listCareers();
  assert.ok(listed.some((entry) => entry.id === careerId), 'a carreira deve persistir após recriar o manager');

  const loaded = await freshManager.loadCareer(careerId);
  assert.equal(loaded.career_id, careerId);
  assert.equal(loaded.metadata.player_name, 'Browser Persisted', 'o último save deve carregar após reinicialização');

  const rawSave = await freshManager.repository.storage.readJson(`careers/${careerId}.json`);
  assert.equal(rawSave.career_id, careerId, 'o save mantém o formato JSON existente');

  const originalWindow = globalThis.window;
  try {
    globalThis.window = { __TAURI_INTERNALS__: {} };
    const nativeStorage = new GameStorage();
    assert.ok(nativeStorage.storage instanceof TauriStorage, 'o runtime Tauri deve continuar selecionando TauriStorage');
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }

  console.log('PASS — fallback de navegador, criação, listagem, save, reabertura e carregamento de carreira.');
  console.log('PASS — runtime Tauri continua selecionando TauriStorage.');
} finally {
  await vite.close();
}
